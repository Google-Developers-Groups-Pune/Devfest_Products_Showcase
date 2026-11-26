import type { Timestamp } from 'firebase-admin/firestore';
import type { WinnerRow, WinnersExportStore } from '../services/winners-export.js';
import type { Repositories } from './repositories/index.js';
import type { EventStatus } from './types.js';

/** The repositories the winners export reads. A narrow type, so tests can pass in-memory ones. */
export type WinnersRepos = Pick<Repositories, 'events' | 'sessions' | 'rounds' | 'result' | 'players' | 'candidates'>;

/**
 * Firestore-backed `WinnersExportStore` for one event day (BE-28).
 *
 * Winners are read from each round's `result/current`. A round counts once its result is
 * CONFIRMED, which also sets `roundNumber` and `confirmedAt` (BE-25). Discarded rounds are
 * skipped. The treasure title comes from the approved candidate.
 */
export function firestoreWinnersStore(repos: WinnersRepos, eventId: string): WinnersExportStore {
  return {
    async eventStatus(): Promise<EventStatus> {
      const event = await repos.events.get(eventId);
      if (!event) throw new Error('Event day not found');
      return event.status;
    },

    async listConfirmedWinners(): Promise<WinnerRow[]> {
      const sessions = await repos.sessions(eventId).list();
      const perSession = await Promise.all(
        sessions.map(async ({ id: sessionId }) => {
          const sessionRef = { eventId, sessionId };
          const rounds = await repos.rounds(sessionRef).list();
          const rows = await Promise.all(
            rounds.map(async ({ id: roundId, data: round }): Promise<WinnerRow | null> => {
              const result = await repos.result({ ...sessionRef, roundId }).get();
              if (result?.confirmation !== 'CONFIRMED' || result.winnerPlayerId === null) return null;
              if (result.roundNumber == null || result.confirmedAt == null) {
                // BE-25 sets both when it confirms. Without them the CSV would be wrong.
                throw new Error('A confirmed result has no round number or confirmation time');
              }
              const [player, candidate] = await Promise.all([
                repos.players(sessionRef).get(result.winnerPlayerId),
                repos.candidates(sessionRef).get(round.candidateId),
              ]);
              if (!player) throw new Error('The winner of a confirmed round was not found');
              const title = candidate?.visible.title;
              return {
                fullName: player.fullName,
                entranceId: player.entranceId,
                roundNumber: result.roundNumber,
                confirmedAt: result.confirmedAt.toDate(),
                winningScore: result.bestScore ?? 0,
                treasureTitle: typeof title === 'string' ? title : '',
                treasureId: round.candidateId,
              };
            }),
          );
          return rows.filter((row): row is WinnerRow => row !== null);
        }),
      );
      return perSession.flat();
    },

    async markExported(at: Date): Promise<void> {
      await repos.events.update(eventId, {
        // The Firestore SDK stores a JS Date as a Timestamp.
        csvExportedAt: at as unknown as Timestamp,
        csvUpToDate: true,
      });
    },
  };
}
