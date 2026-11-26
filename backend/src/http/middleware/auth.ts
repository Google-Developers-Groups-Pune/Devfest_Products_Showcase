import type { Request, RequestHandler } from 'express';
import type { JoinClaims, PlayerClaims } from '../../auth/tokens.js';
import type { ControllerAuthService, SignedInController } from '../../services/controller-auth.js';
import type { PlayerAuthService } from '../../services/player-auth.js';

/** The token from `Authorization: Bearer <token>`, or '' if there is none. */
export function bearerToken(req: Request): string {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? '';
}

/** Who is calling, set by the middleware below. Read with `res.locals`. */
export interface AuthLocals {
  controller?: SignedInController;
  player?: PlayerClaims;
  join?: JoinClaims;
}

export function requireController(auth: ControllerAuthService): RequestHandler {
  return async (req, res, next) => {
    (res.locals as AuthLocals).controller = await auth.authenticate(bearerToken(req));
    next();
  };
}

export function requirePlayer(auth: PlayerAuthService): RequestHandler {
  return async (req, res, next) => {
    (res.locals as AuthLocals).player = await auth.authenticate(bearerToken(req));
    next();
  };
}

export function requireJoinToken(auth: PlayerAuthService): RequestHandler {
  return async (req, res, next) => {
    (res.locals as AuthLocals).join = await auth.authenticateJoin(bearerToken(req));
    next();
  };
}
