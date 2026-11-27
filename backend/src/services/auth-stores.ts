import type { Repositories } from '../data/repositories/index.js';
import type { ControllerDoc, PlayerDoc, SessionDoc } from '../data/types.js';

/** What controller sign-in needs from storage. Tests use an in-memory version. */
export interface ControllerAuthStore {
  findByUsername(username: string): Promise<{ id: string; doc: ControllerDoc } | undefined>;
  get(controllerId: string): Promise<ControllerDoc | undefined>;
  /** Makes `tokenId` the only valid token. Returns the token ID it replaced, if any. */
  replaceActiveToken(controllerId: string, tokenId: string): Promise<string | null>;
  /** Clears the active token, but only if it is still `tokenId`. */
  clearActiveToken(controllerId: string, tokenId: string): Promise<void>;
}

/** What player token checks need from storage. */
export interface PlayerAuthStore {
  getSession(eventId: string, sessionId: string): Promise<SessionDoc | undefined>;
  getPlayer(eventId: string, sessionId: string, playerId: string): Promise<PlayerDoc | undefined>;
}

export function firestoreControllerAuthStore(repos: Repositories): ControllerAuthStore {
  const controllers = repos.controllers;
  return {
    async findByUsername(username) {
      const snapshot = await controllers.collection.where('username', '==', username).limit(1).get();
      const doc = snapshot.docs[0];
      return doc === undefined ? undefined : { id: doc.id, doc: doc.data() };
    },
    get: (controllerId) => controllers.get(controllerId),
    replaceActiveToken(controllerId, tokenId) {
      const ref = controllers.ref(controllerId);
      return repos.db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current === undefined) throw new Error('controller not found');
        tx.update(ref, { activeTokenId: tokenId });
        return current.activeTokenId;
      });
    },
    async clearActiveToken(controllerId, tokenId) {
      const ref = controllers.ref(controllerId);
      await repos.db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.activeTokenId === tokenId) tx.update(ref, { activeTokenId: null });
      });
    },
  };
}

export function firestorePlayerAuthStore(repos: Repositories): PlayerAuthStore {
  return {
    getSession: (eventId, sessionId) => repos.sessions(eventId).get(sessionId),
    getPlayer: (eventId, sessionId, playerId) => repos.players({ eventId, sessionId }).get(playerId),
  };
}
