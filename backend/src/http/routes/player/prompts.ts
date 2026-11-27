import { Router, type RequestHandler } from 'express';
import type { Clock } from '../../../core/clock.js';
import { AppError } from '../../../core/errors.js';
import type { PlayerRef, PromptIntakeService } from '../../../services/prompt-intake.js';

export interface PromptsRouterDeps {
  intake: PromptIntakeService;
  clock: Clock;
  /** BE-05 `requirePlayer`: checks the token and sets `res.locals.player`. */
  requirePlayer: RequestHandler;
}

interface PromptLocals {
  receivedAt?: Date;
  player?: PlayerRef;
}

/**
 * API 24 · `POST /api/player/prompts` (BE-21). 202 for a new prompt, 200 for a repeated
 * `Idempotency-Key`. The player comes from the token only.
 */
export function promptsRouter(deps: PromptsRouterDeps): Router {
  const router = Router();
  // First thing, before the token check reads Firestore: a prompt sent just before
  // roundEndAt must not miss it because of server work (BE-21).
  const stampReceivedAt: RequestHandler = (_req, res, next) => {
    (res.locals as PromptLocals).receivedAt = deps.clock.now();
    next();
  };
  router.post('/prompts', stampReceivedAt, deps.requirePlayer, async (req, res) => {
    const { receivedAt, player } = res.locals as PromptLocals;
    if (!receivedAt || !player) throw new AppError(401, 'UNAUTHENTICATED', 'Please join again.');
    const body = req.body as { text?: unknown } | undefined;
    const result = await deps.intake.submit(
      { eventId: player.eventId, sessionId: player.sessionId, playerId: player.playerId },
      { idempotencyKey: req.get('Idempotency-Key'), text: body?.text, receivedAt },
    );
    res.status(result.created ? 202 : 200).json(result.receipt);
  });
  return router;
}
