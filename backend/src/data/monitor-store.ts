import type { MonitorSnapshot, MonitorStore } from '../services/round-monitor.js';
import type { RoundRef, SessionRef } from './paths.js';
import type { Repositories } from './repositories/index.js';
import type { RoundDoc } from './types.js';

/** The repositories the monitor reads. A narrow type, so tests can pass in-memory ones. */
export type MonitorRepos = Pick<
  Repositories,
  'sessions' | 'rounds' | 'result' | 'prompts' | 'scores' | 'reactions' | 'players' | 'agentErrors'
>;

/**
 * Firestore-backed `MonitorStore` for one event day (BE-26). API 11 is addressed by round ID
 * only, so the round is found by looking through the day's sessions (a few dozen at most).
 */
export function firestoreMonitorStore(repos: MonitorRepos, eventId: string): MonitorStore {
  async function findRound(roundId: string): Promise<{ ref: RoundRef; round: RoundDoc } | undefined> {
    const sessions = await repos.sessions(eventId).list();
    const found = await Promise.all(
      sessions.map(async ({ id: sessionId }) => {
        const round = await repos.rounds({ eventId, sessionId }).get(roundId);
        return round ? { ref: { eventId, sessionId, roundId }, round } : undefined;
      }),
    );
    return found.find((entry) => entry !== undefined);
  }

  /** Confirmed rounds of the whole day. A live round shows as the next number (D35). */
  async function confirmedCount(): Promise<number> {
    const sessions = await repos.sessions(eventId).list();
    const counts = await Promise.all(
      sessions.map(async ({ id: sessionId }) => {
        const sessionRef: SessionRef = { eventId, sessionId };
        const rounds = await repos.rounds(sessionRef).list();
        const results = await Promise.all(rounds.map(({ id }) => repos.result({ ...sessionRef, roundId: id }).get()));
        return results.filter((result) => result?.confirmation === 'CONFIRMED').length;
      }),
    );
    return counts.reduce((sum, count) => sum + count, 0);
  }

  return {
    async load(roundId): Promise<MonitorSnapshot | undefined> {
      const found = await findRound(roundId);
      if (!found) return undefined;
      const { ref, round } = found;
      const sessionRef: SessionRef = { eventId: ref.eventId, sessionId: ref.sessionId };

      const [result, prompts, scores, reactions, players, errors] = await Promise.all([
        repos.result(ref).get(),
        repos.prompts(ref).list(),
        repos.scores(ref).list(),
        repos.reactions(ref).list(),
        repos.players(sessionRef).list(),
        repos.agentErrors(ref).list(),
      ]);
      const roundNumber =
        result?.confirmation === 'CONFIRMED' && result.roundNumber != null
          ? result.roundNumber
          : (await confirmedCount()) + 1;

      return {
        round: { roundId, roundNumber, roundEndAt: round.roundEndAt?.toDate() ?? null },
        prompts: prompts.map(({ id, data }) => ({
          promptId: id,
          sequence: data.sequence,
          playerId: data.playerId,
          filterDecision: data.filterDecision,
          // Blocked or unchecked text never leaves this function (D50).
          text: data.filterDecision === 'ALLOWED' ? (data.displayText ?? data.rawText) : null,
        })),
        scores: scores.map(({ data }) => ({ promptId: data.promptId, score: data.score })),
        reactions: reactions
          .filter(({ data }) => data.displaySafe)
          .map(({ data }) => ({ promptId: data.promptId, reaction: data.reaction })),
        // TODO(BE-11/BE-13): use the public label with the collision rule once it is stored.
        players: players.map(({ id, data }) => ({ playerId: id, slotNumber: data.slotNumber, label: data.firstName })),
        errors: errors.map(({ data }) => ({ at: data.at.toDate(), agent: data.agent, code: data.code })),
      };
    },
  };
}
