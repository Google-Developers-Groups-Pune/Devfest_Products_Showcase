import { Router, type Request, type RequestHandler } from 'express';
import type { EventCloseService } from '../../../services/event-close.js';
import type { StartRoundService } from '../../../services/start-round.js';
import { requireEventWritable } from './event.js';

/**
 * API 10 · `POST /api/controller/sessions/:id/start` (BE-20). No request body.
 * Refused with 409 EVENT_CLOSING_FAILED while closing the event has failed (BE-29).
 */
export function startRoundRouter(rounds: StartRoundService, events?: EventCloseService): Router {
  const router = Router();
  const guards: RequestHandler[] = events ? [requireEventWritable(events)] : [];
  router.post('/sessions/:id/start', ...guards, async (req: Request<{ id: string }>, res) => {
    res.json(await rounds.start(req.params.id));
  });
  return router;
}
