import type { DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import type { CloseFailure, EventDataStore, EventStatusStore } from '../services/event-close.js';
import { paths } from './paths.js';
import type { Repositories } from './repositories/index.js';

/** `system/eventStatus` in Firestore (BE-29, D4). */
export function firestoreEventStatusStore(repos: Pick<Repositories, 'eventStatus'>): EventStatusStore {
  return {
    async get() {
      const doc = await repos.eventStatus.get();
      if (!doc) return undefined;
      return {
        status: doc.status,
        closedAt: doc.closedAt?.toDate() ?? null,
        // Only this store writes the record, so the stage is always a CloseStage.
        failure: doc.failure as CloseFailure | null,
      };
    },
    async set(record) {
      await repos.eventStatus.set({
        status: record.status,
        // The Firestore SDK stores a JS Date as a Timestamp.
        closedAt: record.closedAt as unknown as Timestamp | null,
        failure: record.failure,
      });
    },
  };
}

/**
 * Everything under `events/{eventId}` (BE-29). Deletes with Firestore's recursive delete,
 * then verifies by walking the tree again, including documents that only have subcollections.
 */
export function firestoreEventDataStore(db: Firestore, repos: Pick<Repositories, 'events'>): EventDataStore {
  return {
    async currentEventId() {
      const events = await repos.events.list();
      const latest = events.sort((a, b) => b.data.createdAt.toMillis() - a.data.createdAt.toMillis())[0];
      return latest?.id;
    },
    async csvUpToDate(eventId) {
      return (await repos.events.get(eventId))?.csvUpToDate === true;
    },
    async deleteAll(eventId) {
      await db.recursiveDelete(db.doc(paths.event(eventId)));
    },
    async countRemaining(eventId) {
      return countTree(db.doc(paths.event(eventId)));
    },
  };
}

async function countTree(ref: DocumentReference): Promise<number> {
  const [snapshot, collections] = await Promise.all([ref.get(), ref.listCollections()]);
  let count = snapshot.exists ? 1 : 0;
  for (const collection of collections) {
    for (const doc of await collection.listDocuments()) count += await countTree(doc);
  }
  return count;
}
