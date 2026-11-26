import { AppError } from '../../src/core/errors.js';
import type { Connection } from '../../src/realtime/events.js';
import type {
  ControllerIdentity,
  PlayerConnectionInfo,
  PlayerConnectionStore,
  PlayerIdentity,
  SocketAuthenticator,
} from '../../src/realtime/ports.js';

const refuse = (code: string) => new AppError(401, code, `Refused: ${code}`);

/**
 * Token table standing in for BE-05 / BE-11 until they land. Tokens are opaque strings
 * registered by the test. `supersede` mimics a rejoin: the old token is no longer the
 * player's active token.
 */
export class FakeSocketAuthenticator implements SocketAuthenticator {
  private readonly controllers = new Map<string, ControllerIdentity>();
  private readonly players = new Map<string, PlayerIdentity>();
  private readonly superseded = new Set<string>();
  private readonly closedSessions = new Set<string>();
  failWith: Error | null = null;

  addController(token: string, identity: ControllerIdentity): void {
    this.controllers.set(token, identity);
  }

  addPlayer(token: string, identity: PlayerIdentity): void {
    this.players.set(token, identity);
  }

  supersede(token: string): void {
    this.superseded.add(token);
  }

  closeSession(sessionId: string): void {
    this.closedSessions.add(sessionId);
  }

  authenticateController(token: string): Promise<ControllerIdentity> {
    if (this.failWith) return Promise.reject(this.failWith);
    const identity = this.controllers.get(token);
    return identity ? Promise.resolve(identity) : Promise.reject(refuse('UNAUTHENTICATED'));
  }

  authenticatePlayer(token: string): Promise<PlayerIdentity> {
    if (this.failWith) return Promise.reject(this.failWith);
    const identity = this.players.get(token);
    if (!identity) return Promise.reject(refuse('UNAUTHENTICATED'));
    if (this.closedSessions.has(identity.sessionId)) return Promise.reject(refuse('SESSION_CLOSED'));
    if (this.superseded.has(token)) return Promise.reject(refuse('TOKEN_SUPERSEDED'));
    return Promise.resolve(identity);
  }
}

/** Player data standing in for BE-03 / BE-12. Records every change it is asked to store. */
export class FakePlayerConnectionStore implements PlayerConnectionStore {
  readonly players = new Map<string, PlayerConnectionInfo>();
  readonly recorded: { playerId: string; connection: Connection }[] = [];

  add(playerId: string, info: PlayerConnectionInfo): void {
    this.players.set(playerId, info);
  }

  recordConnection(playerId: string, connection: Connection): Promise<PlayerConnectionInfo | null> {
    this.recorded.push({ playerId, connection });
    return Promise.resolve(this.players.get(playerId) ?? null);
  }
}
