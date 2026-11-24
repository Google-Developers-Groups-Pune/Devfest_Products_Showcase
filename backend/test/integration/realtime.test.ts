import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pino } from 'pino';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import { AppError } from '../../src/core/errors.js';
import { createRealtimeGateway, type RealtimeGateway } from '../../src/realtime/gateway.js';
import { FakePlayerConnectionStore, FakeSocketAuthenticator } from '../fixtures/realtime.js';

interface Received {
  event: string;
  payload: unknown;
}

interface Client {
  socket: Socket;
  received: Received[];
}

interface ConnectError extends Error {
  data?: { error: { code: string; message: string; correlationId: string } };
}

let httpServer: HttpServer;
let baseUrl: string;
let gateway: RealtimeGateway;
let auth: FakeSocketAuthenticator;
let store: FakePlayerConnectionStore;
let sockets: Socket[];
let fenceCount: number;
let clock: FakeClock;

const SESSION = 'ses_1';

beforeEach(async () => {
  auth = new FakeSocketAuthenticator();
  store = new FakePlayerConnectionStore();
  sockets = [];
  fenceCount = 0;
  clock = new FakeClock();
  httpServer = createServer();
  gateway = createRealtimeGateway(httpServer, {
    corsOrigins: [],
    authenticator: auth,
    connectionStore: store,
    clock,
    logger: pino({ level: 'silent' }),
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.disconnect();
  await gateway.close();
});

/** One client per device: no shared connection between them. */
function open(namespace: string, token?: string): Socket {
  const socket = connect(`${baseUrl}${namespace}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(token === undefined ? {} : { auth: { token } }),
  });
  sockets.push(socket);
  return socket;
}

async function client(namespace: string, token?: string): Promise<Client> {
  const socket = open(namespace, token);
  const received: Received[] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, received };
}

function refused(namespace: string, token?: string): Promise<ConnectError> {
  const socket = open(namespace, token);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('expected the handshake to be refused')));
    socket.once('connect_error', resolve);
  });
}

function nextEvent(c: Client, event: string): Promise<unknown> {
  return new Promise((resolve) => c.socket.once(event, resolve));
}

/** The next `player:connection` with this slot and connection, ignoring any other. */
function nextConnection(c: Client, slotNumber: number, connection: 'CONNECTED' | 'DISCONNECTED'): Promise<unknown> {
  return new Promise((resolve) => {
    const check = (payload: { slotNumber: number; connection: string }) => {
      if (payload.slotNumber !== slotNumber || payload.connection !== connection) return;
      c.socket.off('player:connection', check);
      resolve(payload);
    };
    c.socket.on('player:connection', check);
  });
}

/**
 * Sends a marker event to the given clients and waits until each has it. Events on one socket
 * arrive in order, so anything a client has not received by then was never sent to it.
 */
async function fence(clients: { controller?: Client; display?: Client; players?: Client[] }, sessionId = SESSION) {
  const roundId = `fence_${++fenceCount}`;
  const arrived = [clients.controller, clients.display, ...(clients.players ?? [])]
    .filter((c): c is Client => c !== undefined)
    .map(
      (c) =>
        new Promise<void>((resolve) => {
          const check = (payload: { roundId?: string }) => {
            if (payload.roundId === roundId) {
              c.socket.off('round:ended', check);
              resolve();
            }
          };
          c.socket.on('round:ended', check);
        }),
    );
  gateway.emit.toAll(sessionId, 'round:ended', { roundId, endedAt: '2026-12-05T10:01:30.000Z' });
  await Promise.all(arrived);
}

const events = (c: Client) => c.received.map((r) => r.event).filter((e) => e !== 'round:ended' && e !== 'player:connection');

function addPlayer(token: string, playerId: string, slotNumber: 1 | 2 | 3 | 4 | 5, sessionId = SESSION) {
  auth.addPlayer(token, { playerId, sessionId, tokenId: `tok_${token}` });
  store.add(playerId, { slotNumber, label: `Player ${slotNumber}`, revealed: false, inActiveSession: true });
}

/** A Controller token valid for 12 hours from the fake clock, unless `expiresInMs` says otherwise. */
function addController(token: string, tokenId: string, expiresInMs = 12 * 60 * 60 * 1000) {
  auth.addController(token, {
    controllerId: 'ctl_1',
    tokenId,
    expiresAt: new Date(clock.now().getTime() + expiresInMs),
  });
}

describe('handshake', () => {
  it('lets /display connect with no token', async () => {
    const display = await client('/display');
    expect(display.socket.connected).toBe(true);
  });

  it('refuses /controller with no token, with the REST error body', async () => {
    const err = await refused('/controller');
    expect(err.message).toBe('UNAUTHENTICATED');
    expect(err.data?.error.code).toBe('UNAUTHENTICATED');
    expect(err.data?.error.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a valid Controller token', async () => {
    addController('ctl-token', 'ctok_1');
    const controller = await client('/controller', 'ctl-token');
    expect(controller.socket.connected).toBe(true);
  });

  it.each([
    ['an unknown token', 'nope', 'UNAUTHENTICATED'],
    ['a superseded token', 'old', 'TOKEN_SUPERSEDED'],
    ['a closed session', 'closed', 'SESSION_CLOSED'],
  ])('refuses a player with %s', async (_case, token, code) => {
    addPlayer('old', 'ply_1', 1);
    auth.supersede('old');
    addPlayer('closed', 'ply_2', 2, 'ses_closed');
    auth.closeSession('ses_closed');

    const err = await refused('/player', token);
    expect(err.message).toBe(code);
    expect(err.data?.error.code).toBe(code);
  });

  it('refuses the default namespace: only /controller, /player and /display are served', async () => {
    expect((await refused('/')).message).toBe('NOT_FOUND');
  });

  it('refuses with INTERNAL, and no details, when the token check itself fails', async () => {
    auth.failWith = new Error('Firestore unavailable: secret detail');
    const err = await refused('/player', 'anything');
    expect(err.message).toBe('INTERNAL');
    expect(JSON.stringify(err.data)).not.toContain('Firestore');
  });

  it('never passes on a code that is not documented for the namespace', async () => {
    auth.failWith = new AppError(401, 'TOKEN_SUPERSEDED', 'x');
    const err = await refused('/controller', 'anything');
    expect(err.message).toBe('INTERNAL');
  });
});

describe('audiences', () => {
  it('QE: with 6 clients, player A never receives player B’s score', async () => {
    const tokens = ['a', 'b', 'c', 'd', 'e'] as const;
    tokens.forEach((t, i) => addPlayer(t, `ply_${t}`, (i + 1) as 1 | 2 | 3 | 4 | 5));
    const players = await Promise.all(tokens.map((t) => client('/player', t)));
    const display = await client('/display');
    const [a, b] = players as [Client, Client];

    gateway.emit.toPlayer('ply_a', 'prompt:scored', { promptId: 'prm_a', score: 45, feedback: 'ok', bestScore: 45 });
    gateway.emit.toPlayer('ply_b', 'prompt:scored', { promptId: 'prm_b', score: 90, feedback: 'ok', bestScore: 90 });
    gateway.emit.toPlayer('ply_b', 'prompt:blocked', { promptId: 'prm_b2', message: 'blocked' });
    gateway.emit.toPlayer('ply_b', 'prompt:failed', { promptId: 'prm_b3', message: 'failed', canRetry: true });
    await fence({ display, players });

    expect(a.received.filter((r) => r.event.startsWith('prompt:')).map((r) => r.payload)).toEqual([
      { promptId: 'prm_a', score: 45, feedback: 'ok', bestScore: 45 },
    ]);
    expect(b.received.filter((r) => r.event.startsWith('prompt:')).map((r) => (r.payload as { promptId: string }).promptId)).toEqual([
      'prm_b',
      'prm_b2',
      'prm_b3',
    ]);
    for (const other of players.slice(2)) expect(events(other)).toEqual([]);
    expect(events(display)).toEqual([]);
  });

  it('sends each audience only its own events', async () => {
    addPlayer('a', 'ply_a', 1);
    addController('ctl', 'ctok_1');
    const player = await client('/player', 'a');
    const display = await client('/display');
    const controller = await client('/controller', 'ctl');

    gateway.emit.toController('treasure:ready', {
      candidateId: 'cnd_1', title: 't', backstory: 'b', lockObjective: 'o', imageUrl: 'https://x',
      filterPassed: true, rubric: { version: 'v1', scoringCriteria: ['secret'] },
    });
    gateway.emit.toDisplay('feed:update', {
      roundId: 'rnd_1', sequence: 1, slotNumber: 1, label: 'Isha', shape: 'BLUE_CIRCLE', text: 'hi',
      score: 50, bestScore: 50, reaction: null, expression: 'NEUTRAL',
    });
    gateway.emit.toPlayers(SESSION, 'player:joined', { joinedCount: 1, capacity: 5 });
    await fence({ controller, display, players: [player] });

    expect(events(controller)).toEqual(['treasure:ready']);
    expect(events(display)).toEqual(['feed:update']);
    expect(events(player)).toEqual(['player:joined']);
  });

  it('keeps a finished group’s phones out of the next session', async () => {
    addPlayer('old', 'ply_old', 1, 'ses_0');
    addPlayer('new', 'ply_new', 1, SESSION);
    const oldPhone = await client('/player', 'old');
    const newPhone = await client('/player', 'new');

    gateway.emit.toAll(SESSION, 'phase:changed', {
      sessionId: SESSION, phase: 'JOINING', previousPhase: 'SETUP', at: '2026-12-05T10:00:00.000Z',
    });
    gateway.emit.toPlayers(SESSION, 'player:joined', { joinedCount: 1, capacity: 5 });
    await fence({ players: [newPhone] });
    await fence({ players: [oldPhone] }, 'ses_0');

    expect(events(newPhone)).toEqual(['phase:changed', 'player:joined']);
    expect(events(oldPhone)).toEqual([]);
  });
});

describe('clients are read-only', () => {
  it.each(['/display', '/player', '/controller'])('ignores anything a client sends on %s', async (namespace) => {
    addPlayer('a', 'ply_a', 1);
    addController('ctl', 'ctok_1');
    const token = namespace === '/player' ? 'a' : namespace === '/controller' ? 'ctl' : undefined;
    const sender = await client(namespace, token);
    const watcher = await client('/display');

    sender.socket.emit('feed:update', { text: 'injected' });
    await expect(sender.socket.timeout(300).emitWithAck('prompt:submit', { text: 'x' })).rejects.toThrow();
    await fence({ display: watcher });

    expect(sender.socket.connected).toBe(true);
    expect(events(watcher)).toEqual([]);
  });
});

describe('kicks and superseded tokens', () => {
  it('sends player:kicked to the old phone only, disconnects it, and refuses its token after', async () => {
    addPlayer('old', 'ply_1', 1);
    const oldPhone = await client('/player', 'old');
    const kicked = nextEvent(oldPhone, 'player:kicked');
    const closed = nextEvent(oldPhone, 'disconnect');

    // What BE-12 does on rejoin: the old token stops being active, a new one is issued.
    auth.supersede('old');
    auth.addPlayer('new', { playerId: 'ply_1', sessionId: SESSION, tokenId: 'tok_new' });
    const newPhone = await client('/player', 'new');
    gateway.emit.kickPlayer('tok_old', 'player:kicked', { reason: 'REJOINED_ON_ANOTHER_DEVICE' });

    expect(await kicked).toEqual({ reason: 'REJOINED_ON_ANOTHER_DEVICE' });
    expect(await closed).toBe('io server disconnect');
    await fence({ players: [newPhone] });
    expect(newPhone.socket.connected).toBe(true);
    expect(events(newPhone)).toEqual([]);
    expect((await refused('/player', 'old')).message).toBe('TOKEN_SUPERSEDED');
  });

  it('sends controller:kicked to the replaced Controller socket and disconnects it (D29)', async () => {
    addController('first', 'ctok_1');
    addController('second', 'ctok_2');
    const first = await client('/controller', 'first');
    const second = await client('/controller', 'second');
    const kicked = nextEvent(first, 'controller:kicked');
    const closed = nextEvent(first, 'disconnect');

    gateway.emit.kickController('ctok_1', 'controller:kicked', { reason: 'SIGNED_IN_ELSEWHERE' });

    expect(await kicked).toEqual({ reason: 'SIGNED_IN_ELSEWHERE' });
    expect(await closed).toBe('io server disconnect');
    await fence({ controller: second });
    expect(second.socket.connected).toBe(true);
    expect(events(second)).toEqual([]);
  });
});

describe('Controller token end', () => {
  it('disconnects the Controller socket when its token expires', async () => {
    addController('short', 'ctok_short', 50);
    const controller = await client('/controller', 'short');
    expect(await nextEvent(controller, 'disconnect')).toBe('io server disconnect');
  });

  it('disconnects the Controller socket on logout, with no event', async () => {
    addController('ctl', 'ctok_1');
    const controller = await client('/controller', 'ctl');
    const closed = nextEvent(controller, 'disconnect');
    gateway.emit.disconnectController('ctok_1');
    expect(await closed).toBe('io server disconnect');
    expect(controller.received).toEqual([]);
  });
});

describe('player:connection', () => {
  async function watchers() {
    addController('ctl', 'ctok_1');
    return { controller: await client('/controller', 'ctl'), display: await client('/display') };
  }

  it('sends CONNECTED and DISCONNECTED to all, with no name before players:revealed (D16)', async () => {
    addPlayer('a', 'ply_a', 2);
    addPlayer('b', 'ply_b', 3);
    const { controller, display } = await watchers();
    const other = await client('/player', 'b');

    const connected = nextConnection(display, 2, 'CONNECTED');
    const phone = await client('/player', 'a');
    expect(await connected).toEqual({ slotNumber: 2, label: null, connection: 'CONNECTED' });
    expect(gateway.isPlayerConnected('ply_a')).toBe(true);

    const seen = [controller, display, other].map((c) => nextConnection(c, 2, 'DISCONNECTED'));
    phone.socket.disconnect();
    for (const payload of await Promise.all(seen)) {
      expect(payload).toEqual({ slotNumber: 2, label: null, connection: 'DISCONNECTED' });
    }
    expect(gateway.isPlayerConnected('ply_a')).toBe(false);
    expect(store.recorded.filter((r) => r.playerId === 'ply_a').map((r) => r.connection)).toEqual([
      'CONNECTED',
      'DISCONNECTED',
    ]);
  });

  it('sends the label once names are revealed', async () => {
    addPlayer('a', 'ply_a', 1);
    store.add('ply_a', { slotNumber: 1, label: 'Priya', revealed: true, inActiveSession: true });
    const { display } = await watchers();

    const connected = nextEvent(display, 'player:connection');
    await client('/player', 'a');
    expect(await connected).toEqual({ slotNumber: 1, label: 'Priya', connection: 'CONNECTED' });
  });

  it('says nothing when a finished group’s phone disconnects after Next group', async () => {
    addPlayer('old', 'ply_old', 2, 'ses_0');
    const { controller, display } = await watchers();
    const oldPhone = await client('/player', 'old');
    await vi.waitFor(() => expect(store.recorded).toHaveLength(1));
    store.add('ply_old', { slotNumber: 2, label: 'Old', revealed: true, inActiveSession: false });

    oldPhone.socket.disconnect();
    await vi.waitFor(() => expect(store.recorded.map((r) => r.connection)).toEqual(['CONNECTED', 'DISCONNECTED']));
    await fence({ controller, display });
    expect(display.received.filter((r) => r.event === 'player:connection')).toHaveLength(1);
    expect(controller.received.filter((r) => r.event === 'player:connection')).toHaveLength(1);
  });

  it('says nothing while a second socket for the same player is still open', async () => {
    addPlayer('a', 'ply_a', 1);
    const { display } = await watchers();
    const connected = nextEvent(display, 'player:connection');
    const tab1 = await client('/player', 'a');
    await connected;
    const tab2 = await client('/player', 'a');

    tab1.socket.disconnect();
    await vi.waitFor(() => expect(gateway.io.of('/player').sockets.size).toBe(1));
    await fence({ display });
    expect(display.received.filter((r) => r.event === 'player:connection')).toHaveLength(1);
    expect(gateway.isPlayerConnected('ply_a')).toBe(true);

    const disconnected = nextEvent(display, 'player:connection');
    tab2.socket.disconnect();
    expect(await disconnected).toEqual({ slotNumber: 1, label: null, connection: 'DISCONNECTED' });
    expect(store.recorded.map((r) => r.connection)).toEqual(['CONNECTED', 'DISCONNECTED']);
  });
});
