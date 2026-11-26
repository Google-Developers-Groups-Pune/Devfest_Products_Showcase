import { Router, type RequestHandler } from 'express';
import type { EventCloseService } from '../../../services/event-close.js';

/** API 16 · `POST /api/controller/event/close` and API 17 · `GET /api/controller/event/status` (BE-29). */
export function eventRouter(events: EventCloseService): Router {
  const router = Router();
  router.post('/event/close', async (req, res) => {
    const body = req.body as { confirmation?: unknown } | undefined;
    const { status } = await events.close(body?.confirmation);
    res.status(202).json({ status });
  });
  router.get('/event/status', async (_req, res) => {
    res.json(await events.status());
  });
  return router;
}

/**
 * Refuses a Controller game action while closing has failed, and after closing (D44).
 * Mount it on APIs 4, 6–10, 13, 14 and 28–30 as their stories land.
 */
export function requireEventWritable(events: EventCloseService): RequestHandler {
  return async (_req, _res, next) => {
    await events.assertWritable();
    next();
  };
}
