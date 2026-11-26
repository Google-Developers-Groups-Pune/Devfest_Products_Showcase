import type { Firestore } from 'firebase-admin/firestore';
import { entranceIdDocId } from '../ids.js';
import { paths } from '../paths.js';
import type { EntranceIdDoc } from '../types.js';
import { collectionRepository } from './collection.js';

export interface EntranceIdReservation {
  /** As the player typed it. Matching ignores case and outer spaces. */
  entranceId: string;
  sessionId: string;
  playerId: string;
}

/** Entrance IDs for one event day. Each ID can be held by one player only. */
export function entranceIdRepository(db: Firestore, eventId: string) {
  const repo = collectionRepository<EntranceIdDoc>(db, 'entranceId', paths.entranceIds(eventId));

  return {
    ref: (entranceId: string) => repo.ref(entranceIdDocId(entranceId)),

    get: (entranceId: string) => repo.get(entranceIdDocId(entranceId)),

    /**
     * Reserves an entrance ID with an atomic create. Throws
     * DuplicateDocumentError if anyone already holds it, even when two
     * players try at the same moment. No read first, so racing players
     * never wait on each other's locks: Firestore lets exactly one create win.
     */
    async reserve(input: EntranceIdReservation): Promise<void> {
      await repo.create(entranceIdDocId(input.entranceId), { ...input, status: 'RESERVED' });
    },

    markUsed: (entranceId: string) => repo.update(entranceIdDocId(entranceId), { status: 'USED' }),
  };
}
