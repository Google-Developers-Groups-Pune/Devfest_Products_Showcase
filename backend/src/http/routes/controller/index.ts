import { Router } from 'express';
import type { AgentHealthService } from '../../../agents/health.js';
import type { WinnersExportService } from '../../../services/winners-export.js';
import { agentHealthRouter } from './agent-health.js';
import { winnersRouter } from './winners.js';

export interface ControllerRouterDeps {
  agentHealth: AgentHealthService;
  /** API 15 (BE-28). Mounted only when given: the server does not connect to Firestore yet. */
  winners?: WinnersExportService | undefined;
}

/**
 * /api/controller — Controller dashboard APIs 1–19 and 28–30.
 * Every route except POST /auth/login requires a Controller token (BE-05).
 * Mount the routes below after the BE-05 token check.
 */
export function controllerRouter(deps: ControllerRouterDeps): Router {
  const router = Router();
  router.use(agentHealthRouter(deps.agentHealth));
  if (deps.winners) router.use(winnersRouter(deps.winners));
  return router;
}
