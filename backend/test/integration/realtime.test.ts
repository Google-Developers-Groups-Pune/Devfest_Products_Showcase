import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRealtimeGateway, NAMESPACES } from '../../src/realtime/gateway.js';

let httpServer: HttpServer;
let baseUrl: string;
let io: ReturnType<typeof createRealtimeGateway>;

beforeAll(async () => {
  httpServer = createServer();
  io = createRealtimeGateway(httpServer, { corsOrigins: [] });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await io.close();
});

describe('realtime gateway', () => {
  it.each(NAMESPACES)('accepts connections on %s', async (namespace) => {
    const socket: Socket = connect(`${baseUrl}${namespace}`, { transports: ['websocket'], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });
      expect(socket.connected).toBe(true);
    } finally {
      socket.disconnect();
    }
  });
});
