import { Router } from 'express';
import { parseLimit, type AuditLogService } from '../../../services/audit-log.js';
import type { RoundMonitorService } from '../../../services/round-monitor.js';

/** API 11 · `GET /api/controller/rounds/:id/monitor` (BE-26). */
export function roundMonitorRouter(monitor: RoundMonitorService): Router {
  const router = Router();
  router.get('/rounds/:id/monitor', async (req, res) => {
    res.json(await monitor.view(req.params.id));
  });
  return router;
}

/** API 19 · `GET /api/controller/audit-logs?limit=50&cursor=` (BE-26). */
export function auditLogRouter(audit: AuditLogService): Router {
  const router = Router();
  router.get('/audit-logs', async (req, res) => {
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor !== '' ? req.query.cursor : undefined;
    res.json(await audit.page({ limit: parseLimit(req.query.limit), cursor }));
  });
  return router;
}
