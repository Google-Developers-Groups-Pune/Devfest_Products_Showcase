import type { Firestore } from 'firebase-admin/firestore';
import type { Clock } from '../../core/clock.js';
import { paths, type RoundRef, type SessionRef } from '../paths.js';
import type {
  AgentErrorDoc,
  AuditEventDoc,
  CandidateDoc,
  ControllerDoc,
  EventDoc,
  EventStatusDoc,
  PlayerDoc,
  ReactionDoc,
  ResultDoc,
  RoundDoc,
  ScoreDoc,
  SessionDoc,
  SlotDoc,
} from '../types.js';
import { collectionRepository, singleDocRepository } from './collection.js';
import { entranceIdRepository } from './entrance-ids.js';
import { promptRepository } from './prompts.js';

export { DocumentNotFoundError, DuplicateDocumentError } from './errors.js';
export type { CollectionRepository, SingleDocRepository } from './collection.js';
export type { CreatedPrompt, NewPrompt } from './prompts.js';
export type { EntranceIdReservation } from './entrance-ids.js';

/**
 * All typed repositories. Nested ones take the parent IDs, for example
 * `repos.players({ eventId, sessionId }).get(playerId)`.
 */
export function createRepositories(db: Firestore, clock: Clock) {
  return {
    db,
    controllers: collectionRepository<ControllerDoc>(db, 'controller', paths.controllers()),
    eventStatus: singleDocRepository<EventStatusDoc>(db, paths.eventStatus()),
    events: collectionRepository<EventDoc>(db, 'event', paths.events()),
    entranceIds: (eventId: string) => entranceIdRepository(db, eventId),
    auditEvents: (eventId: string) => collectionRepository<AuditEventDoc>(db, 'auditEvent', paths.auditEvents(eventId)),
    sessions: (eventId: string) => collectionRepository<SessionDoc>(db, 'session', paths.sessions(eventId)),
    slots: (s: SessionRef) => collectionRepository<SlotDoc>(db, 'slot', paths.slots(s)),
    players: (s: SessionRef) => collectionRepository<PlayerDoc>(db, 'player', paths.players(s)),
    candidates: (s: SessionRef) => collectionRepository<CandidateDoc>(db, 'candidate', paths.candidates(s)),
    rounds: (s: SessionRef) => collectionRepository<RoundDoc>(db, 'round', paths.rounds(s)),
    prompts: (r: RoundRef) => promptRepository(db, clock, r),
    scores: (r: RoundRef) => collectionRepository<ScoreDoc>(db, 'score', paths.scores(r)),
    reactions: (r: RoundRef) => collectionRepository<ReactionDoc>(db, 'reaction', paths.reactions(r)),
    agentErrors: (r: RoundRef) => collectionRepository<AgentErrorDoc>(db, 'agentError', paths.agentErrors(r)),
    result: (r: RoundRef) => singleDocRepository<ResultDoc>(db, paths.result(r)),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
