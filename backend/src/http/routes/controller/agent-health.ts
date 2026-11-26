import { Router } from 'express';
import type { AgentHealthService } from '../../../agents/health.js';

/** API 18 · `GET /api/controller/health/agents` (BE-14). Cached for 60 seconds by the service. */
export function agentHealthRouter(health: AgentHealthService): Router {
  const router = Router();
  router.get('/health/agents', async (_req, res) => {
    res.json(await health.check());
  });
  return router;
}
