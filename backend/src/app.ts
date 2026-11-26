import cors from 'cors';
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import type { AgentHealthService } from './agents/health.js';
import type { Clock } from './core/clock.js';
import { CORRELATION_HEADER, correlationId } from './http/middleware/correlation-id.js';
import { errorHandler, notFound } from './http/middleware/error-handler.js';
import { controllerRouter } from './http/routes/controller/index.js';
import { displayRouter } from './http/routes/display/index.js';
import { healthRouter } from './http/routes/health.js';
import { playerRouter } from './http/routes/player/index.js';

export interface AppDeps {
  clock: Clock;
  logger: Logger;
  /** Browser origins allowed to call the API (the Flutter app's origin). Empty = none. */
  corsOrigins: string[];
  /** Agent health probes for API 18 (BE-14). */
  agentHealth: AgentHealthService;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Lets req.ip use X-Forwarded-For from one proxy hop. Before relying on req.ip
  // for per-IP rate limits (BE-12), confirm the hop count on Cloud Run (BE-38).
  app.set('trust proxy', 1);

  app.use(correlationId());
  // The Flutter app is served from a different origin than the API.
  app.use(
    cors({
      origin: deps.corsOrigins.length > 0 ? deps.corsOrigins : false,
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', CORRELATION_HEADER],
      exposedHeaders: [CORRELATION_HEADER, 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '32kb' }));

  app.use(healthRouter());
  app.use('/api/controller', controllerRouter({ agentHealth: deps.agentHealth }));
  app.use('/api/player', playerRouter());
  app.use('/api/display', displayRouter());

  app.use(notFound());
  app.use(errorHandler(deps.logger));
  return app;
}
