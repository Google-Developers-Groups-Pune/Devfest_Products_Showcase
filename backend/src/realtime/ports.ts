import type { Connection, SlotNumber } from './events.js';

/**
 * What the realtime gateway needs from other stories. It codes against these interfaces;
 * the real versions come from BE-05 / BE-11 (token checks) and BE-03 / BE-12 (player data).
 * Tests use the fakes in test/fixtures/realtime.ts.
 */

export interface ControllerIdentity {
  controllerId: string;
  /** Token ID. Used to reach this exact socket when a new login replaces it (D29) or on logout. */
  tokenId: string;
  /** When the token expires (12 hours). The socket is disconnected then. */
  expiresAt: Date;
}

export interface PlayerIdentity {
  playerId: string;
  sessionId: string;
  /** Token ID, checked against `player.activeTokenId`. Used to kick this socket on rejoin. */
  tokenId: string;
}

/**
 * Checks the token sent in the handshake as `auth.token`. The same checks as the REST
 * middleware `requireController` / `requirePlayer` (BE-05).
 *
 * To refuse, throw an `AppError` with status 401 and one of the codes in the namespace's
 * `x-connect-error-codes` in asyncapi.yaml:
 * - Controller: `UNAUTHENTICATED` (missing, invalid, expired, revoked, or ended by a newer login).
 * - Player: `UNAUTHENTICATED` (missing, invalid or expired), `TOKEN_SUPERSEDED` (the token is not
 *   `player.activeTokenId`: the player rejoined elsewhere), `SESSION_CLOSED`.
 *
 * `token` is '' when the client sent none.
 */
export interface SocketAuthenticator {
  authenticateController(token: string): Promise<ControllerIdentity>;
  authenticatePlayer(token: string): Promise<PlayerIdentity>;
}

/** What `player:connection` needs about the player. */
export interface PlayerConnectionInfo {
  slotNumber: SlotNumber;
  label: string;
  /** True once `players:revealed` has been sent. Before that the label is never sent (D16). */
  revealed: boolean;
  /**
   * True if the player's session is the one open now. A finished group's phone closing after
   * Next group must not mark the new group's slot as disconnected, so nothing is emitted then.
   */
  inActiveSession: boolean;
}

/**
 * Stores each player's connection, so the hydrate calls and the Controller slot states
 * show it (BE-12). Called once each time a player goes from no sockets to one, and from
 * one to none.
 */
export interface PlayerConnectionStore {
  /** Persists the change. Returns null if the player no longer exists (nothing is emitted). */
  recordConnection(playerId: string, connection: Connection): Promise<PlayerConnectionInfo | null>;
}
