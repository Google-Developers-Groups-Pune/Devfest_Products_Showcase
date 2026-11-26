import { Router } from 'express';
import type { AgentHealthService } from '../../../agents/health.js';
import { agentHealthRouter } from './agent-health.js';

export interface ControllerRouterDeps {
  agentHealth: AgentHealthService;
}

/**
 * /api/controller — Controller dashboard APIs 1–19 and 28–30.
 * Every route except POST /auth/login requires a Controller token (BE-05).
 * Mount the routes below after the BE-05 token check.
 */
export function controllerRouter(deps: ControllerRouterDeps): Router {
  const router = Router();
  router.use(agentHealthRouter(deps.agentHealth));
  return router;
}
