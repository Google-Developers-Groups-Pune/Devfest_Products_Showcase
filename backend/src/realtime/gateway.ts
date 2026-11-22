import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

/** Socket.IO namespaces from the shared contract. Sockets are server-to-client only. */
export const NAMESPACES = ['/controller', '/player', '/display'] as const;

export interface RealtimeOptions {
  corsOrigins: string[];
}

/**
 * Attaches Socket.IO to the HTTP server and registers the namespaces.
 * Handshake auth, rooms and the typed emit service are BE-07.
 */
export function createRealtimeGateway(httpServer: HttpServer, options: RealtimeOptions): Server {
  const io = new Server(httpServer, {
    cors: { origin: options.corsOrigins.length > 0 ? options.corsOrigins : false },
  });
  for (const name of NAMESPACES) {
    io.of(name);
  }
  return io;
}
