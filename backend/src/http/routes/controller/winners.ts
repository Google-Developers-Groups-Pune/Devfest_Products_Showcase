import { Router } from 'express';
import type { WinnersExportService } from '../../../services/winners-export.js';

/** API 15 · `GET /api/controller/winners/export` (BE-28). */
export function winnersRouter(winners: WinnersExportService): Router {
  const router = Router();
  router.get('/winners/export', async (_req, res) => {
    const file = await winners.export();
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      // Quoted, as in the API contract.
      .set('Content-Disposition', `attachment; filename="${file.filename}"`)
      // Holds names and entrance IDs: never keep a copy in a browser or proxy cache.
      .set('Cache-Control', 'no-store')
      .send(file.csv);
  });
  return router;
}
