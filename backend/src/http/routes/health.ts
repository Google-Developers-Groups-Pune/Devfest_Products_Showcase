import { Router } from 'express';

/**
 * Liveness probe (BE-01). Not `/healthz`: Cloud Run reserves some paths ending in `z`.
 * Agent health is API 18, owned by BE-14.
 */
export function healthRouter(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  return router;
}
