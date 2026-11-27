import { AppError } from '../core/errors.js';
import { assertCanSubmit, type IntakeResult, type PromptIntakeStore } from '../services/prompt-intake.js';
import { promptIdFor } from './ids.js';
import type { SessionRef } from './paths.js';
import { DuplicateDocumentError, type Repositories } from './repositories/index.js';

/** The repositories this store uses. A narrow type, so tests can pass their own. */
export type PromptIntakeRepos = Pick<Repositories, 'sessions' | 'rounds' | 'players' | 'prompts'>;

/** Firestore-backed `PromptIntakeStore` (BE-21), on top of the BE-03 prompt repository. */
export function firestorePromptIntakeStore(repos: PromptIntakeRepos): PromptIntakeStore {
  return {
    async create(player, prompt): Promise<IntakeResult> {
      const sessionRef: SessionRef = { eventId: player.eventId, sessionId: player.sessionId };
      // One round per session (D5): the one that has started, the latest if there were ever two.
      const round = (await repos.rounds(sessionRef).list())
        .filter(({ data }) => data.roundStartedAt !== null)
        .sort((a, b) => b.data.roundStartedAt!.toMillis() - a.data.roundStartedAt!.toMillis())[0];
      if (!round) throw new AppError(409, 'ROUND_NOT_PLAYING', 'The round is not running.');

      const prompts = repos.prompts({ ...sessionRef, roundId: round.id });
      const sessionDoc = repos.sessions(player.eventId).ref(player.sessionId);
      const playerDoc = repos.players(sessionRef).ref(player.playerId);

      try {
        const created = await prompts.create({
          playerId: player.playerId,
          idempotencyKey: prompt.idempotencyKey,
          rawText: prompt.text,
          receivedAt: prompt.receivedAt,
          // Same transaction as the sequence number, so a check cannot go stale before the write.
          check: async (tx, roundDoc) => {
            const [session, playerSnap] = await Promise.all([tx.get(sessionDoc), tx.get(playerDoc)]);
            assertCanSubmit(
              session.data()?.phase,
              playerSnap.data()?.state,
              { roundStartedAt: roundDoc.roundStartedAt?.toDate() ?? null, roundEndAt: roundDoc.roundEndAt?.toDate() ?? null },
              prompt.receivedAt,
            );
          },
        });
        return {
          created: true,
          roundId: round.id,
          receipt: {
            promptId: created.promptId,
            status: 'RECEIVED',
            sequence: created.sequence,
            receivedAt: created.receivedAt.toDate().toISOString(),
          },
        };
      } catch (err) {
        if (!(err instanceof DuplicateDocumentError)) throw err;
        // A retry with the same key: answer with what is stored, whatever has happened since.
        const promptId = promptIdFor(player.playerId, prompt.idempotencyKey);
        const stored = await prompts.get(promptId);
        if (!stored) throw err;
        return {
          created: false,
          roundId: round.id,
          receipt: {
            promptId,
            status: stored.status,
            sequence: stored.sequence,
            receivedAt: stored.receivedAt.toDate().toISOString(),
          },
        };
      }
    },
  };
}
