import type { AuditStore } from '../services/audit-log.js';
import type { Repositories } from './repositories/index.js';

/**
 * Firestore-backed `AuditStore` for one event day (BE-26). Reads the whole collection and
 * leaves sorting and paging to the service: an event day has a few hundred entries at most.
 */
export function firestoreAuditStore(repos: Pick<Repositories, 'auditEvents'>, eventId: string): AuditStore {
  return {
    async list() {
      const docs = await repos.auditEvents(eventId).list();
      return docs.map(({ id, data }) => ({
        id,
        at: data.at.toDate(),
        actor: data.actor,
        action: data.action,
        summary: data.summary,
        reason: data.reason,
        correlationId: data.correlationId,
      }));
    },
  };
}
