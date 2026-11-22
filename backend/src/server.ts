import { createServer } from 'node:http';
import { createApp } from './app.js';
import { corsOrigins, loadEnv } from './config/env.js';
import { systemClock } from './core/clock.js';
import { createLogger } from './core/logger.js';
import { createRealtimeGateway } from './realtime/gateway.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const origins = corsOrigins(env);

const app = createApp({ clock: systemClock, logger, corsOrigins: origins });
const httpServer = createServer(app);
const io = createRealtimeGateway(httpServer, { corsOrigins: origins });

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Prompt Heist backend listening');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  // Closes Socket.IO and the HTTP server.
  void io.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
