import { createServer } from 'node:http';
import { createApp } from './app.js';
import { corsOrigins, loadEnv } from './config/env.js';
import { systemClock } from './core/clock.js';
import { AppError } from './core/errors.js';
import { createLogger } from './core/logger.js';
import { createRealtimeGateway } from './realtime/gateway.js';
import type { PlayerConnectionStore, SocketAuthenticator } from './realtime/ports.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const origins = corsOrigins(env);

const app = createApp({ clock: systemClock, logger, corsOrigins: origins });
const httpServer = createServer(app);

// Until BE-05 (token checks) and BE-12 (connection state) land, every /controller and /player
// handshake is refused. No tokens can be issued yet anyway. /display works.
const notSignedIn = (): Promise<never> =>
  Promise.reject(new AppError(401, 'UNAUTHENTICATED', 'Your sign-in is not valid. Please start again.'));
const authenticator: SocketAuthenticator = {
  authenticateController: notSignedIn,
  authenticatePlayer: notSignedIn,
};
const connectionStore: PlayerConnectionStore = { recordConnection: () => Promise.resolve(null) };

const realtime = createRealtimeGateway(httpServer, {
  corsOrigins: origins,
  authenticator,
  connectionStore,
  clock: systemClock,
  logger,
});

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Prompt Heist backend listening');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  // Stops timers and closes Socket.IO and the HTTP server.
  void realtime.close().finally(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
