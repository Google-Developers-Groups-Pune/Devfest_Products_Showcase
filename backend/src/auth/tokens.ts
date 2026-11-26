import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../core/clock.js';

/** Controller token lifetime: 12 hours (docs/STORIES.md). */
export const CONTROLLER_TOKEN_TTL_SECONDS = 12 * 60 * 60;
/** Join token lifetime: 5 minutes (docs/STORIES.md). */
export const JOIN_TOKEN_TTL_SECONDS = 5 * 60;

const ISSUER = 'prompt-heist';
const ALGORITHM = 'HS256';

/** The three token types. Each is its own JWT audience, so one can never pass as another. */
export type TokenType = 'controller' | 'join' | 'player';

export interface ControllerClaims {
  controllerId: string;
  tokenId: string;
  expiresAt: Date;
}

export interface JoinClaims {
  eventId: string;
  sessionId: string;
  slotNumber: number;
  tokenId: string;
  expiresAt: Date;
}

/** Player tokens have no expiry: they end when the session closes or the player rejoins elsewhere. */
export interface PlayerClaims {
  eventId: string;
  sessionId: string;
  playerId: string;
  tokenId: string;
}

export interface IssuedToken {
  token: string;
  tokenId: string;
}

export interface IssuedExpiringToken extends IssuedToken {
  expiresAt: Date;
}

/** Any token problem: bad signature, wrong type, expired, missing fields. Never says which. */
export class InvalidTokenError extends Error {
  constructor() {
    super('Invalid token');
    this.name = 'InvalidTokenError';
  }
}

const asString = (value: unknown): string => {
  if (typeof value !== 'string' || value === '') throw new InvalidTokenError();
  return value;
};

/**
 * Signs and checks all tokens with one server secret (JWT_SECRET, from Secret Manager).
 * Times come from the injected Clock, so tests can move time forward.
 */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly clock: Clock,
  ) {
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }

  async signController(controllerId: string): Promise<IssuedExpiringToken> {
    return this.signExpiring('controller', controllerId, {}, CONTROLLER_TOKEN_TTL_SECONDS);
  }

  async signJoin(claims: { eventId: string; sessionId: string; slotNumber: number }): Promise<IssuedExpiringToken> {
    const { eventId, sessionId, slotNumber } = claims;
    return this.signExpiring('join', sessionId, { eid: eventId, slot: slotNumber }, JOIN_TOKEN_TTL_SECONDS);
  }

  async signPlayer(claims: { eventId: string; sessionId: string; playerId: string }): Promise<IssuedToken> {
    const tokenId = randomUUID();
    const token = await this.builder('player', claims.playerId, tokenId, { eid: claims.eventId, sid: claims.sessionId })
      .sign(this.key);
    return { token, tokenId };
  }

  async verifyController(token: string): Promise<ControllerClaims> {
    const payload = await this.verify(token, 'controller');
    return { controllerId: asString(payload.sub), tokenId: asString(payload.jti), expiresAt: expiry(payload.exp) };
  }

  async verifyJoin(token: string): Promise<JoinClaims> {
    const payload = await this.verify(token, 'join');
    const slot = payload['slot'];
    if (typeof slot !== 'number' || !Number.isInteger(slot)) throw new InvalidTokenError();
    return {
      eventId: asString(payload['eid']),
      sessionId: asString(payload.sub),
      slotNumber: slot,
      tokenId: asString(payload.jti),
      expiresAt: expiry(payload.exp),
    };
  }

  async verifyPlayer(token: string): Promise<PlayerClaims> {
    const payload = await this.verify(token, 'player');
    return {
      eventId: asString(payload['eid']),
      sessionId: asString(payload['sid']),
      playerId: asString(payload.sub),
      tokenId: asString(payload.jti),
    };
  }

  private builder(type: TokenType, subject: string, tokenId: string, extra: Record<string, unknown>): SignJWT {
    return new SignJWT(extra)
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuer(ISSUER)
      .setAudience(type)
      .setSubject(subject)
      .setJti(tokenId)
      .setIssuedAt(this.nowSeconds());
  }

  private async signExpiring(
    type: TokenType,
    subject: string,
    extra: Record<string, unknown>,
    ttlSeconds: number,
  ): Promise<IssuedExpiringToken> {
    const tokenId = randomUUID();
    const exp = this.nowSeconds() + ttlSeconds;
    const token = await this.builder(type, subject, tokenId, extra).setExpirationTime(exp).sign(this.key);
    return { token, tokenId, expiresAt: new Date(exp * 1000) };
  }

  private async verify(token: string, type: TokenType) {
    if (token === '') throw new InvalidTokenError();
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        audience: type,
        currentDate: this.clock.now(),
        // Expiring types must carry an expiry; a token without one is refused.
        ...(type === 'player' ? {} : { requiredClaims: ['exp'] }),
      });
      return payload;
    } catch {
      throw new InvalidTokenError();
    }
  }

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1000);
  }
}

function expiry(exp: number | undefined): Date {
  if (exp === undefined) throw new InvalidTokenError();
  return new Date(exp * 1000);
}
