import type { JoinClaims, PlayerClaims, TokenService } from '../auth/tokens.js';
import { AppError } from '../core/errors.js';
import type { PlayerAuthStore } from './auth-stores.js';

/** Player and join token checks (BE-05). Tokens are issued by BE-10 and BE-11. */
export class PlayerAuthService {
  constructor(
    private readonly store: PlayerAuthStore,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Checks a player token: 401 `UNAUTHENTICATED` if invalid or the player is gone,
   * `SESSION_CLOSED` once the session is closed, `TOKEN_SUPERSEDED` if the player
   * rejoined elsewhere (the token is not `player.activeTokenId`).
   */
  async authenticate(token: string): Promise<PlayerClaims> {
    const claims = await this.tokens.verifyPlayer(token).catch(() => {
      throw new AppError(401, 'UNAUTHENTICATED', 'Please join again.');
    });
    const session = await this.store.getSession(claims.eventId, claims.sessionId);
    if (session === undefined) throw new AppError(401, 'UNAUTHENTICATED', 'Please join again.');
    if (session.phase === 'CLOSED') throw new AppError(401, 'SESSION_CLOSED', 'This game has finished.');
    const player = await this.store.getPlayer(claims.eventId, claims.sessionId, claims.playerId);
    if (player === undefined) throw new AppError(401, 'UNAUTHENTICATED', 'Please join again.');
    if (player.activeTokenId !== claims.tokenId) {
      throw new AppError(401, 'TOKEN_SUPERSEDED', 'You joined on another device.');
    }
    return claims;
  }

  /** Checks a 5-minute join token. Any problem is 401 `JOIN_TOKEN_EXPIRED` (API 21). */
  async authenticateJoin(token: string): Promise<JoinClaims> {
    return this.tokens.verifyJoin(token).catch(() => {
      throw new AppError(401, 'JOIN_TOKEN_EXPIRED', 'Your code has expired. Please enter it again.');
    });
  }
}
