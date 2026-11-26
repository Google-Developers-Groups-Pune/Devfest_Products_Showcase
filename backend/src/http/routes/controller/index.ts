import { Router } from 'express';
import type { AgentHealthService } from '../../../agents/health.js';
import type { AuditLogService } from '../../../services/audit-log.js';
import type { EventCloseService } from '../../../services/event-close.js';
import type { RoundMonitorService } from '../../../services/round-monitor.js';
import type { WinnersExportService } from '../../../services/winners-export.js';
import { agentHealthRouter } from './agent-health.js';
import { eventRouter } from './event.js';
import { auditLogRouter, roundMonitorRouter } from './monitor.js';
import { winnersRouter } from './winners.js';

export interface ControllerRouterDeps {
  agentHealth: AgentHealthService;
  /** API 15 (BE-28). Mounted only when given: the server does not connect to Firestore yet. */
  winners?: WinnersExportService | undefined;
  /** API 11 (BE-26). Mounted only when given, like `winners`. */
  monitor?: RoundMonitorService | undefined;
  /** API 19 (BE-26). Mounted only when given, like `winners`. */
  audit?: AuditLogService | undefined;
  /** APIs 16 and 17 (BE-29). Mounted only when given, like `winners`. */
  events?: EventCloseService | undefined;
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
  if (deps.monitor) router.use(roundMonitorRouter(deps.monitor));
  if (deps.audit) router.use(auditLogRouter(deps.audit));
  if (deps.events) router.use(eventRouter(deps.events));
  return router;
}
