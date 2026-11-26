import { createServer } from 'node:http';
import { createApp } from './app.js';
import { TokenService } from './auth/tokens.js';
import { corsOrigins, loadEnv } from './config/env.js';
import { systemClock } from './core/clock.js';
import { createLogger } from './core/logger.js';
import { createFirestore } from './data/firestore.js';
import { createRepositories } from './data/repositories/index.js';
import { createRealtimeGateway } from './realtime/gateway.js';
import type { PlayerConnectionStore, SocketAuthenticator } from './realtime/ports.js';
import { firestoreControllerAuthStore, firestorePlayerAuthStore } from './services/auth-stores.js';
import { ControllerAuthService } from './services/controller-auth.js';
import { PlayerAuthService } from './services/player-auth.js';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const origins = corsOrigins(env);

if (env.JWT_SECRET === undefined) {
  throw new Error('JWT_SECRET is not set. See .env.example.');
}
const repos = createRepositories(createFirestore(env), systemClock);
const tokens = new TokenService(env.JWT_SECRET, systemClock);

// These hooks use `realtime`, created further down. They only run on a login or logout
// request, which can only arrive after the server is listening.
const controllerAuth = new ControllerAuthService(firestoreControllerAuthStore(repos), tokens, {
  signedInElsewhere: (oldTokenId) =>
    realtime.emit.kickController(oldTokenId, 'controller:kicked', { reason: 'SIGNED_IN_ELSEWHERE' }),
  loggedOut: (tokenId) => realtime.emit.disconnectController(tokenId),
});
const playerAuth = new PlayerAuthService(firestorePlayerAuthStore(repos), tokens);

const app = createApp({ clock: systemClock, logger, corsOrigins: origins, controllerAuth });
const httpServer = createServer(app);

const authenticator: SocketAuthenticator = {
  authenticateController: async (token) => {
    const { controllerId, tokenId, expiresAt } = await controllerAuth.authenticate(token);
    return { controllerId, tokenId, expiresAt };
  },
  authenticatePlayer: async (token) => {
    const { playerId, sessionId, tokenId } = await playerAuth.authenticate(token);
    return { playerId, sessionId, tokenId };
  },
};
// Until BE-12 lands, connection changes are not stored.
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
