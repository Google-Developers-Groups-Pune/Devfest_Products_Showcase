import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { Logger } from 'pino';
import { Server, type Namespace, type Socket } from 'socket.io';
import type { Clock } from '../core/clock.js';
import { AppError, type ErrorEnvelope } from '../core/errors.js';
import { RealtimeEmitter, rooms } from './emitter.js';
import type { ControllerIdentity, PlayerConnectionStore, PlayerIdentity, SocketAuthenticator } from './ports.js';
import { PresenceTracker } from './presence.js';
import { TimerSyncService } from './timer-sync.js';

/** Socket.IO namespaces from the shared contract. Sockets are server-to-client only. */
export const NAMESPACES = ['/controller', '/player', '/display'] as const;

/** Handshake refusal codes per namespace: asyncapi.yaml `x-connect-error-codes`. */
export const CONNECT_ERROR_CODES = {
  '/controller': ['UNAUTHENTICATED'],
  '/player': ['UNAUTHENTICATED', 'TOKEN_SUPERSEDED', 'SESSION_CLOSED'],
} as const;

/** Sent when the token check itself fails (for example Firestore is down). The client retries. */
export const HANDSHAKE_INTERNAL_ERROR = 'INTERNAL';

// Clients never send anything, so packets stay tiny. The handshake token is the largest.
const MAX_PACKET_BYTES = 16 * 1024;
// A phone that drops without closing the socket is marked DISCONNECTED within about 20 seconds.
// The Socket.IO defaults (25 s + 20 s) would take up to 45 seconds.
const PING_INTERVAL_MS = 10_000;
const PING_TIMEOUT_MS = 10_000;

export interface RealtimeOptions {
  corsOrigins: string[];
  authenticator: SocketAuthenticator;
  connectionStore: PlayerConnectionStore;
  clock: Clock;
  logger: Logger;
}

export interface RealtimeGateway {
  io: Server;
  /** Typed emit service. All other stories send socket events through this. */
  emit: RealtimeEmitter;
  /** `timer:sync` every 3 seconds while PLAYING. */
  timerSync: TimerSyncService;
  /** True while the player has at least one open socket. */
  isPlayerConnected(playerId: string): boolean;
  close(): Promise<void>;
}

interface SocketData {
  controller?: ControllerIdentity;
  player?: PlayerIdentity;
}

/**
 * Attaches Socket.IO to the HTTP server (BE-07):
 * - `/controller` and `/player` check `auth.token` at handshake and refuse with the
 *   documented `connect_error`. `/display` needs no token and never refuses.
 * - Nothing a client sends is acted on, on any namespace. All writes are REST.
 * - Each player joins their session room, their private room and their token room.
 */
export function createRealtimeGateway(httpServer: HttpServer, options: RealtimeOptions): RealtimeGateway {
  const { authenticator, logger } = options;
  const io = new Server(httpServer, {
    cors: { origin: options.corsOrigins.length > 0 ? options.corsOrigins : false },
    maxHttpBufferSize: MAX_PACKET_BYTES,
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
  });

  const controller = io.of('/controller');
  const player = io.of('/player');
  const display = io.of('/display');

  const emit = new RealtimeEmitter({ controller, player, display });
  const timerSync = new TimerSyncService(emit, options.clock);
  const presence = new PresenceTracker(options.connectionStore, emit, logger);

  for (const ns of [controller, player, display]) ignoreClientEvents(ns, logger);
  // Only the three namespaces above are served. Socket.IO always creates `/`, so refuse it.
  io.of('/').use((_socket, next) => next(new Error('NOT_FOUND')));

  controller.use(handshake('/controller', logger, async (socket, token) => {
    socket.data.controller = await authenticator.authenticateController(token);
  }));
  controller.on('connection', (socket: Socket<object, object, object, SocketData>) => {
    const identity = socket.data.controller;
    if (!identity) return;
    void socket.join(rooms.token(identity.tokenId));
    // Controller events carry the rubric, full names and entrance IDs: stop them when the token expires.
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, identity.expiresAt.getTime() - options.clock.now().getTime()),
    );
    socket.on('disconnect', () => clearTimeout(expiry));
  });

  player.use(handshake('/player', logger, async (socket, token) => {
    socket.data.player = await authenticator.authenticatePlayer(token);
  }));
  player.on('connection', (socket: Socket<object, object, object, SocketData>) => {
    const identity = socket.data.player;
    if (!identity) return;
    void socket.join([rooms.session(identity.sessionId), rooms.player(identity.playerId), rooms.token(identity.tokenId)]);
    presence.connected(identity, socket.id);
    socket.on('disconnect', () => presence.disconnected(identity, socket.id));
  });

  return {
    io,
    emit,
    timerSync,
    isPlayerConnected: (playerId) => presence.isConnected(playerId),
    async close() {
      timerSync.stopAll();
      await io.close();
      await presence.idle();
    },
  };
}

/** Drops every event a client sends. Nothing on any namespace reads client input. */
function ignoreClientEvents(ns: Namespace, logger: Logger): void {
  ns.on('connection', (socket) => {
    socket.use(() => {
      // Not calling next() drops the packet. No handler runs and no ack is sent.
      logger.debug({ namespace: ns.name }, 'Ignored an event sent by a client');
    });
  });
}

type Authenticate = (socket: Socket<object, object, object, SocketData>, token: string) => Promise<void>;

function handshake(namespace: keyof typeof CONNECT_ERROR_CODES, logger: Logger, authenticate: Authenticate) {
  const allowed: readonly string[] = CONNECT_ERROR_CODES[namespace];
  return (socket: Socket<object, object, object, SocketData>, next: (err?: Error) => void): void => {
    const raw: unknown = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    const token = typeof raw === 'string' ? raw : '';
    authenticate(socket, token).then(
      () => next(),
      (err: unknown) => {
        const correlationId = randomUUID();
        if (err instanceof AppError && allowed.includes(err.code)) {
          next(refusal(err.code, err.message, correlationId));
          return;
        }
        logger.error({ err, namespace, correlationId }, 'Socket handshake check failed');
        next(refusal(HANDSHAKE_INTERNAL_ERROR, 'Something went wrong. Please try again.', correlationId));
      },
    );
  };
}

/**
 * The client's `connect_error` gets `err.message` = the code and `err.data` = the REST error
 * body (asyncapi.yaml).
 */
function refusal(code: string, message: string, correlationId: string): Error {
  const data: ErrorEnvelope = { error: { code, message, correlationId } };
  return Object.assign(new Error(code), { data });
}
