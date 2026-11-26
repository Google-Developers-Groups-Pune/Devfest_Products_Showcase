import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Clock } from '../../core/clock.js';
import { promptIdFor } from '../ids.js';
import { paths, type RoundRef } from '../paths.js';
import type { PromptDoc, RoundDoc } from '../types.js';
import { collectionRepository } from './collection.js';
import { DocumentNotFoundError, DuplicateDocumentError } from './errors.js';
import { createKeyedQueue } from './keyed-queue.js';

/**
 * Prompt creates for the same round take turns inside this process.
 * Many transactions fighting over one round counter time out, and the
 * backend is a single instance (decision D1), so a queue here keeps the
 * counter fast. The Firestore transaction still guarantees correctness.
 */
const perRound = createKeyedQueue();

export interface NewPrompt {
  playerId: string;
  idempotencyKey: string;
  rawText: string;
}

export interface CreatedPrompt {
  promptId: string;
  sequence: number;
  receivedAt: Timestamp;
}

/** Prompts for one round. */
export function promptRepository(db: Firestore, clock: Clock, round: RoundRef) {
  const prompts = collectionRepository<PromptDoc>(db, 'prompt', paths.prompts(round));
  const rounds = collectionRepository<RoundDoc>(db, 'round', paths.rounds(round));

  return {
    ...prompts,

    /**
     * Saves a new prompt and gives it the next sequence number from the
     * round counter, both in one transaction. The receipt time is taken
     * once, from the server clock, before the transaction starts.
     * Throws DuplicateDocumentError if this player already sent this
     * idempotency key, and DocumentNotFoundError if the round is missing.
     */
    async create(input: NewPrompt): Promise<CreatedPrompt> {
      const promptId = promptIdFor(input.playerId, input.idempotencyKey);
      const receivedAt = Timestamp.fromDate(clock.now());
      const roundRef = rounds.ref(round.roundId);
      const promptRef = prompts.ref(promptId);

      const allocate = () =>
        db.runTransaction(async (tx) => {
          const roundSnap = await tx.get(roundRef);
          const promptSnap = await tx.get(promptRef);
          const roundDoc = roundSnap.data();
          if (roundDoc === undefined) throw new DocumentNotFoundError('round');
          if (promptSnap.exists) throw new DuplicateDocumentError('prompt', promptId);

          const next = roundDoc.promptCounter + 1;
          tx.update(roundRef, { promptCounter: next });
          tx.create(promptRef, {
            roundId: round.roundId,
            playerId: input.playerId,
            idempotencyKey: input.idempotencyKey,
            receivedAt,
            sequence: next,
            rawText: input.rawText,
            status: 'RECEIVED',
            filterDecision: null,
            displayText: null,
          });
          return next;
        });

      const sequence = await perRound(roundRef.path, allocate);

      return { promptId, sequence, receivedAt };
    },
  };
}
