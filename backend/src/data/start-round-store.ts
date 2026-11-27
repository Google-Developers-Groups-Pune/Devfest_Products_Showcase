import { Timestamp } from 'firebase-admin/firestore';
import { AppError } from '../core/errors.js';
import { playerMachine, sessionMachine } from '../domain/state-machines/index.js';
import type { TimedRound } from '../jobs/round-timer.js';
import type { RoundStore, StartRoundContext } from '../services/start-round.js';
import type { SessionRef } from './paths.js';
import type { Repositories } from './repositories/index.js';
import type { RoundDoc } from './types.js';

/** The repositories this store uses. A narrow type, so tests can pass their own. */
export type RoundStoreRepos = Pick<Repositories, 'db' | 'sessions' | 'rounds' | 'candidates' | 'players' | 'result'>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The session's most recently started round. One per session (D5), but never pick an older one. */
export function latestStarted<T extends { data: RoundDoc }>(rounds: T[]): T | undefined {
  return rounds
    .filter(({ data }) => data.roundStartedAt !== null && data.roundEndAt !== null)
    .sort((a, b) => b.data.roundStartedAt!.toMillis() - a.data.roundStartedAt!.toMillis())[0];
}

/** Firestore-backed `RoundStore` for one event day (BE-20). */
export function firestoreRoundStore(repos: RoundStoreRepos, eventId: string): RoundStore {
  const sessionRef = (sessionId: string): SessionRef => ({ eventId, sessionId });

  /** Confirmed rounds of the whole day (D35), counted the same way as the live monitor (BE-26). */
  async function confirmedCount(): Promise<number> {
    const sessions = await repos.sessions(eventId).list();
    const counts = await Promise.all(
      sessions.map(async ({ id: sessionId }) => {
        const rounds = await repos.rounds(sessionRef(sessionId)).list();
        const results = await Promise.all(rounds.map(({ id }) => repos.result({ eventId, sessionId, roundId: id }).get()));
        return results.filter((result) => result?.confirmation === 'CONFIRMED').length;
      }),
    );
    return counts.reduce((sum, count) => sum + count, 0);
  }

  return {
    async loadStart(sessionId): Promise<StartRoundContext | undefined> {
      const ref = sessionRef(sessionId);
      const session = await repos.sessions(eventId).get(sessionId);
      if (!session) return undefined;

      const [rounds, players, confirmed] = await Promise.all([
        repos.rounds(ref).list(),
        repos.players(ref).list(),
        confirmedCount(),
      ]);
      // One round per session (D5): the one not started yet.
      const round = rounds.find(({ data }) => data.roundStartedAt === null);
      const candidate = round ? await repos.candidates(ref).get(round.data.candidateId) : undefined;

      return {
        phase: session.phase,
        capacity: session.capacity,
        playerIds: players.map(({ id }) => id),
        round: round
          ? { roundId: round.id, durationSeconds: round.data.roundDurationSeconds, candidateId: round.data.candidateId }
          : null,
        // The rubric is never read here: only the player-visible fields. The field names of
        // `visible` are set by BE-16/BE-19, so both the agent's and the contract's names are read.
        treasure: candidate
          ? {
              approved: candidate.approval === 'APPROVED' && candidate.contentCheck === 'ALLOWED',
              title: text(candidate.visible.title),
              visibleBackstory: text(candidate.visible.visibleBackstory ?? candidate.visible.backstory),
              visibleLockObjective: text(candidate.visible.visibleLockObjective ?? candidate.visible.lockObjective),
            }
          : null,
        confirmedCount: confirmed,
      };
    },

    async commitStart(sessionId, roundId, startedAt) {
      const ref = sessionRef(sessionId);
      const sessionDoc = repos.sessions(eventId).ref(sessionId);
      const roundDoc = repos.rounds(ref).ref(roundId);
      const playersCollection = repos.players(ref).collection;

      return repos.db.runTransaction(async (tx) => {
        const [session, round, players] = await Promise.all([tx.get(sessionDoc), tx.get(roundDoc), tx.get(playersCollection)]);
        const phase = session.data()?.phase;
        const roundData = round.data();
        if (!phase || !sessionMachine.can(phase, 'START_ROUND') || !roundData || roundData.roundStartedAt !== null) {
          throw new AppError(409, 'INVALID_PHASE', 'The round can only start when the session is ready.');
        }
        const durationSeconds = roundData.roundDurationSeconds;
        const roundEndAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        const at = Timestamp.fromDate(startedAt);
        tx.update(sessionDoc, { phase: sessionMachine.transition(phase, 'START_ROUND'), startedAt: at });
        tx.update(roundDoc, { roundStartedAt: at, roundEndAt: Timestamp.fromDate(roundEndAt) });
        for (const player of players.docs) {
          const state = player.data().state;
          if (playerMachine.can(state, 'ROUND_STARTED')) {
            tx.update(player.ref, { state: playerMachine.transition(state, 'ROUND_STARTED') });
          }
        }
        return { roundEndAt, durationSeconds };
      });
    },

    async listRunning(): Promise<TimedRound[]> {
      const playing = await repos.sessions(eventId).collection.where('phase', '==', 'PLAYING').get();
      const running = await Promise.all(
        playing.docs.map(async ({ id: sessionId }) => {
          const started = latestStarted(await repos.rounds(sessionRef(sessionId)).list());
          const roundEndAt = started?.data.roundEndAt;
          return started && roundEndAt ? { sessionId, roundId: started.id, roundEndAt: roundEndAt.toDate() } : undefined;
        }),
      );
      return running.filter((round): round is TimedRound => round !== undefined);
    },

    async commitEnd(sessionId) {
      const sessionDoc = repos.sessions(eventId).ref(sessionId);
      const playersCollection = repos.players(sessionRef(sessionId)).collection;

      return repos.db.runTransaction(async (tx) => {
        const [session, players] = await Promise.all([tx.get(sessionDoc), tx.get(playersCollection)]);
        const phase = session.data()?.phase;
        if (!phase || !sessionMachine.can(phase, 'ROUND_TIMER_ENDED')) return false;
        tx.update(sessionDoc, { phase: sessionMachine.transition(phase, 'ROUND_TIMER_ENDED') });
        for (const player of players.docs) {
          const state = player.data().state;
          if (playerMachine.can(state, 'ROUND_ENDED')) {
            tx.update(player.ref, { state: playerMachine.transition(state, 'ROUND_ENDED') });
          }
        }
        return true;
      });
    },
  };
}
