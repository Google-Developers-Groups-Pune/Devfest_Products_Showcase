import { hashPassword } from '../../src/auth/passwords.js';
import { TokenService } from '../../src/auth/tokens.js';
import type { Clock } from '../../src/core/clock.js';
import type { ControllerDoc, PlayerDoc, SessionDoc } from '../../src/data/types.js';
import type { ControllerAuthStore, PlayerAuthStore } from '../../src/services/auth-stores.js';
import { ControllerAuthService } from '../../src/services/controller-auth.js';
import { PlayerAuthService } from '../../src/services/player-auth.js';

/** Test-only signing secret. Never used outside tests. */
export const TEST_JWT_SECRET = 'test-secret-for-unit-tests-only-0123456789';

export class InMemoryControllerStore implements ControllerAuthStore {
  readonly docs = new Map<string, ControllerDoc>();

  async add(id: string, username: string, password: string): Promise<void> {
    this.docs.set(id, { username, passwordHash: await hashPassword(password), activeTokenId: null });
  }

  async findByUsername(username: string) {
    for (const [id, doc] of this.docs) if (doc.username === username) return { id, doc };
    return undefined;
  }

  async get(id: string) {
    return this.docs.get(id);
  }

  async replaceActiveToken(id: string, tokenId: string) {
    const doc = this.docs.get(id);
    if (doc === undefined) throw new Error('controller not found');
    const previous = doc.activeTokenId;
    doc.activeTokenId = tokenId;
    return previous;
  }

  async clearActiveToken(id: string, tokenId: string) {
    const doc = this.docs.get(id);
    if (doc?.activeTokenId === tokenId) doc.activeTokenId = null;
  }
}

export class InMemoryPlayerStore implements PlayerAuthStore {
  readonly sessions = new Map<string, SessionDoc>();
  readonly players = new Map<string, PlayerDoc>();

  async getSession(eventId: string, sessionId: string) {
    return this.sessions.get(`${eventId}/${sessionId}`);
  }

  async getPlayer(eventId: string, sessionId: string, playerId: string) {
    return this.players.get(`${eventId}/${sessionId}/${playerId}`);
  }
}

/** Records the realtime hook calls so tests can check them. */
export function recordingHooks() {
  const calls = { signedInElsewhere: [] as string[], loggedOut: [] as string[] };
  return {
    calls,
    hooks: {
      signedInElsewhere: (tokenId: string) => void calls.signedInElsewhere.push(tokenId),
      loggedOut: (tokenId: string) => void calls.loggedOut.push(tokenId),
    },
  };
}

/** Auth services wired to in-memory stores. */
export function createTestAuth(clock: Clock) {
  const tokens = new TokenService(TEST_JWT_SECRET, clock);
  const controllers = new InMemoryControllerStore();
  const players = new InMemoryPlayerStore();
  const { calls, hooks } = recordingHooks();
  return {
    tokens,
    controllers,
    players,
    hookCalls: calls,
    controllerAuth: new ControllerAuthService(controllers, tokens, hooks),
    playerAuth: new PlayerAuthService(players, tokens),
  };
}
