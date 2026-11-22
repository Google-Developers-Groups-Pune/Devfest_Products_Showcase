/**
 * Game replay server (BE-02).
 *
 * Plays the scripted game in `game.yaml` over Socket.IO on the same port the Flutter mock build
 * uses for REST (4010). The hydrate calls (API 5, 23, 27) are answered from the game state built
 * from the steps sent so far, so loading the app and reconnecting always match the socket events.
 * Every other REST request goes to a Prism mock of `openapi.yaml` on an internal port.
 *
 * Before playing, the script is checked: every step must match `asyncapi.yaml`, and the whole game
 * is simulated with every hydrate response checked against `openapi.yaml`. A bad script fails fast.
 *
 *   npm run mock:game                      # play the game, session opens after 10 s
 *   npm run mock:game -- --start-delay 30  # more time to open the app first
 *   npm run replay:validate                # only check game.yaml
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { deflateSync } from 'node:zlib';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { Server, type Socket } from 'socket.io';
import { parse } from 'yaml';
import { GameState } from './state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = join(HERE, '..', '..');
const OPENAPI = join(CONTRACT, 'openapi', 'openapi.yaml');
const ASYNCAPI = join(CONTRACT, 'openapi', 'asyncapi.yaml');
const GAME = join(HERE, 'game.yaml');
const PRISM = join(CONTRACT, 'node_modules', '.bin', 'prism');

/** asyncapi channels the script may target, and the namespace each one lives on. */
const CHANNEL_NAMESPACE = {
  controller: '/controller',
  player: '/player',
  playerPrivate: '/player',
  display: '/display',
} as const;
type Channel = keyof typeof CHANNEL_NAMESPACE;

/**
 * Every phone in the mock plays slot 1: Prism's join and rejoin examples return slot 1, and
 * there is no real token to tell phones apart. Private events for other slots go to rooms
 * nobody is in, exactly as they would for other people's phones.
 */
const MOCK_PHONE_SLOT = 1;

/**
 * Codes the mock refuses with, as a 401 on the hydrate calls and as `connect_error` on sockets.
 * They must be the ones in asyncapi.yaml `x-connect-error-codes`; validation checks this.
 * Test hook: a token equal to one of these codes is refused with that code.
 */
const CONTROLLER_REFUSALS = ['UNAUTHENTICATED'] as const;
const PLAYER_REFUSALS = ['UNAUTHENTICATED', 'TOKEN_SUPERSEDED', 'SESSION_CLOSED'] as const;
type Refusal = (typeof PLAYER_REFUSALS)[number];
const REFUSAL_MESSAGES: Record<Refusal, string> = {
  UNAUTHENTICATED: 'Your sign-in is not valid. Please start again.',
  TOKEN_SUPERSEDED: 'You joined on another device.',
  SESSION_CLOSED: 'This game has ended.',
};

/** Hydrate routes answered from the game state, and the openapi schema each one returns. */
const HYDRATE = {
  '/api/controller/sessions/active': 'ControllerDashboard',
  '/api/player/me': 'PlayerView',
  '/api/display/state': 'DisplayState',
} as const;
type HydratePath = keyof typeof HYDRATE;

interface Step {
  at: number;
  event: string;
  to: Channel[];
  slot?: number;
  /** prompt:* steps only: the text the player typed, which API 23 returns in `prompts`. */
  promptText?: string;
  payload: unknown;
}

interface Game {
  timerSync?: { from: number; to: number; every: number; payload: unknown };
  steps: Step[];
}

// ------------------------------------------------------------------ script

function loadGame(): Game {
  const game = parse(readFileSync(GAME, 'utf8')) as Game;
  if (!Array.isArray(game?.steps) || game.steps.length === 0) throw new Error('game.yaml has no steps');
  return game;
}

/** Steps in the order they are sent: by time, then by position in the file. */
function inSendOrder(steps: Step[]): Step[] {
  return steps
    .map((step, i) => ({ step, i }))
    .sort((a, b) => a.step.at - b.step.at || a.i - b.i)
    .map(({ step }) => step);
}

/** Replaces `{{now}}` and `{{t+N}}` in every string of a payload. */
function resolveTimes(value: unknown, start: number, now: number): unknown {
  if (typeof value === 'string') {
    if (value === '{{now}}') return new Date(now).toISOString();
    const m = /^\{\{t\+(\d+(?:\.\d+)?)\}\}$/.exec(value);
    return m ? new Date(start + Number(m[1]) * 1000).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTimes(v, start, now));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTimes(v, start, now)]));
  }
  return value;
}

// ------------------------------------------------------------------ validation

/** Checks the script against asyncapi.yaml and openapi.yaml. Returns a list of problems; empty means valid. */
function validateGame(game: Game): string[] {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
  addFormats.default(ajv);
  // Both documents get URIs in the same folder, so asyncapi's `./openapi.yaml#/...` refs resolve.
  ajv.addSchema(parse(readFileSync(OPENAPI, 'utf8')) as object, 'file:///contract/openapi.yaml');
  const asyncapi = parse(readFileSync(ASYNCAPI, 'utf8')) as {
    channels: Record<string, { messages: Record<string, { $ref: string }>; 'x-connect-error-codes'?: string[] }>;
    components: { messages: Record<string, { name: string }> };
  };
  ajv.addSchema(asyncapi, 'file:///contract/asyncapi.yaml');

  const problems: string[] = [];

  // The codes the mock refuses with are the documented ones.
  for (const [channel, codes] of [['controller', CONTROLLER_REFUSALS], ['player', PLAYER_REFUSALS]] as const) {
    const documented = asyncapi.channels[channel]?.['x-connect-error-codes'] ?? [];
    for (const code of codes) {
      if (!documented.includes(code)) problems.push(`mock refuses ${channel} with ${code}, not in asyncapi.yaml x-connect-error-codes`);
    }
  }

  /** The asyncapi message key for an event on a channel, e.g. player:joined on display. */
  const messageKey = (channel: string, event: string): string | undefined => {
    for (const ref of Object.values(asyncapi.channels[channel]?.messages ?? {})) {
      const key = ref.$ref.split('/').pop() as string;
      if (asyncapi.components.messages[key]?.name === event) return key;
    }
    return undefined;
  };

  const sample = Date.parse('2026-12-05T10:00:00.000Z');
  const check = (where: string, channels: string[], event: string, payload: unknown) => {
    for (const channel of channels) {
      if (!(channel in CHANNEL_NAMESPACE)) {
        problems.push(`${where}: unknown channel "${channel}"`);
        continue;
      }
      const key = messageKey(channel, event);
      if (!key) {
        problems.push(`${where}: ${event} is not sent on channel "${channel}" in asyncapi.yaml`);
        continue;
      }
      const validate = ajv.getSchema(`file:///contract/asyncapi.yaml#/components/messages/${key}/payload`);
      if (!validate) {
        problems.push(`${where}: no payload schema for ${key}`);
      } else if (!validate(resolveTimes(payload, sample, sample))) {
        problems.push(`${where}: ${event} payload for "${channel}": ${ajv.errorsText(validate.errors)}`);
      }
    }
  };

  const describe = (step: Step) => `step ${game.steps.indexOf(step) + 1} (t+${step.at}s ${step.event})`;
  for (const step of game.steps) {
    const where = describe(step);
    if (typeof step.at !== 'number' || step.at < 0) problems.push(`${where}: "at" must be a number >= 0`);
    if (!Array.isArray(step.to) || step.to.length === 0) problems.push(`${where}: "to" must list channels`);
    if (step.to?.includes('playerPrivate') && !Number.isInteger(step.slot)) {
      problems.push(`${where}: playerPrivate needs "slot"`);
    }
    if (step.event.startsWith('prompt:') && typeof step.promptText !== 'string') {
      problems.push(`${where}: prompt events need "promptText", which API 23 returns`);
    }
    check(where, step.to ?? [], step.event, step.payload);
  }
  if (game.timerSync) check('timerSync', ['controller', 'player', 'display'], 'timer:sync', game.timerSync.payload);
  if (problems.length) return problems;

  // Play the whole game and check every hydrate response after every step.
  const ordered = inSendOrder(game.steps);
  let state: GameState;
  try {
    state = new GameState(ordered, MOCK_PHONE_SLOT);
  } catch (err) {
    return [(err as Error).message];
  }
  const views = Object.fromEntries(
    Object.entries(HYDRATE).map(([path, schema]) => [
      path,
      ajv.getSchema(`file:///contract/openapi.yaml#/components/schemas/${schema}`),
    ]),
  ) as Record<HydratePath, ReturnType<typeof ajv.getSchema>>;
  const checkViews = (where: string, now: string) => {
    for (const path of Object.keys(HYDRATE) as HydratePath[]) {
      const answer = hydrate(state, path, now);
      if (answer.status !== 200) continue;
      const validate = views[path];
      if (!validate) problems.push(`no schema ${HYDRATE[path]} in openapi.yaml`);
      else if (!validate(answer.body)) problems.push(`${where}: GET ${path}: ${ajv.errorsText(validate.errors)}`);
    }
  };

  checkViews('before the game', new Date(sample).toISOString());
  let revealed = false;
  for (const step of ordered) {
    const now = sample + step.at * 1000;
    const payload = resolveTimes(step.payload, sample, now) as Record<string, unknown>;
    if (step.event === 'session:opened') revealed = false;
    if (step.event === 'players:revealed') revealed = true;
    if (step.event === 'player:connection' && !revealed && payload.label !== null) {
      problems.push(`${describe(step)}: label must be null before players:revealed (D16)`);
    }
    state.apply({ ...step, payload }, new Date(now).toISOString());
    checkViews(describe(step), new Date(now).toISOString());
  }
  return problems;
}

// ------------------------------------------------------------------ hydrate and auth

function hydrate(state: GameState, path: HydratePath, now: string): { status: number; body: unknown } {
  if (path === '/api/display/state') return { status: 200, body: state.display(now) };
  if (path === '/api/controller/sessions/active') return { status: 200, body: state.controller(now) };
  const answer = state.player(now);
  return answer.status === 200 ? answer : { status: 401, body: answer.code };
}

let correlationCounter = 0;
const nextCorrelationId = () => `replay-${++correlationCounter}`;

const errorBody = (code: Refusal, correlationId: string) => ({
  error: { code, message: REFUSAL_MESSAGES[code], correlationId },
});

function controllerRefusal(token: string): Refusal | undefined {
  return !token || token === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : undefined;
}

function playerRefusal(token: string, state: GameState): Refusal | undefined {
  if (!token) return 'UNAUTHENTICATED';
  if ((PLAYER_REFUSALS as readonly string[]).includes(token)) return token as Refusal;
  return state.phoneInSession() ? undefined : 'SESSION_CLOSED';
}

function bearerToken(req: IncomingMessage): string {
  return /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
}

function socketToken(socket: Socket): string {
  const token = socket.handshake.auth.token;
  return typeof token === 'string' ? token : '';
}

/** A Socket.IO handshake refusal: the client's `connect_error` gets `err.message` and `err.data`. */
function refusal(code: Refusal): Error {
  return Object.assign(new Error(code), { data: errorBody(code, nextCorrelationId()) });
}

// ------------------------------------------------------------------ placeholder treasure image

/** A small generated PNG, so `imageUrl` in the script loads with no network. */
function treasurePng(width = 640, height = 400): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const inside = Math.hypot((x - width / 2) / 1.15, y - height / 2) < height * 0.3;
      raw[i] = inside ? 251 : 66; // Google yellow on Google blue
      raw[i + 1] = inside ? 188 : 133;
      raw[i + 2] = inside ? 5 : 244;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ Prism

async function startPrism(port: number): Promise<() => void> {
  const child = spawn(PRISM, ['mock', '--host', '127.0.0.1', '--port', String(port), OPENAPI], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
  const stop = () => child.kill();
  process.once('exit', stop); // never leave Prism running behind us

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Prism exited:\n${stderr}`);
    const up = await new Promise<boolean>((resolve) => {
      const r = request({ host: '127.0.0.1', port, path: '/health' }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      r.on('error', () => resolve(false));
      r.end();
    });
    if (up) return stop;
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error(`Prism did not start on port ${port}:\n${stderr}`);
}

// ------------------------------------------------------------------ main

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '4010' },
    'prism-port': { type: 'string', default: '4011' },
    'start-delay': { type: 'string', default: '10' },
    'validate-only': { type: 'boolean', default: false },
  },
});

const game = loadGame();
const problems = validateGame(game);
if (problems.length) {
  console.error(`game.yaml is not valid:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`game.yaml: ${game.steps.length} steps match asyncapi.yaml; hydrate responses match openapi.yaml at every step`);
if (values['validate-only']) process.exit(0);

const port = Number(values.port);
const prismPort = Number(values['prism-port']);
const stopPrism = await startPrism(prismPort);
const png = treasurePng();
const ordered = inSendOrder(game.steps);
const state = new GameState(ordered, MOCK_PHONE_SLOT);

/** Answers a hydrate call from the game state, with the same headers Prism would send. */
function answerHydrate(req: IncomingMessage, res: ServerResponse, path: HydratePath): void {
  const correlationId = nextCorrelationId();
  const refused =
    path === '/api/controller/sessions/active'
      ? controllerRefusal(bearerToken(req))
      : path === '/api/player/me'
        ? playerRefusal(bearerToken(req), state)
        : undefined;
  const answer = refused ? { status: 401, body: refused } : hydrate(state, path, new Date().toISOString());
  const body = answer.status === 401 ? errorBody(answer.body as Refusal, correlationId) : answer.body;
  const origin = req.headers.origin;
  res
    .writeHead(answer.status, {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      'Access-Control-Allow-Origin': origin ?? '*',
      ...(origin ? { 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
      'Access-Control-Expose-Headers': 'X-Correlation-Id',
    })
    .end(JSON.stringify(body));
  console.log(`  GET ${path} → ${answer.status}${answer.status === 401 ? ` ${String(answer.body)}` : ''}`);
}

const http = createServer((req, res) => {
  const path = (req.url ?? '').split('?')[0] ?? '';
  if (req.method === 'GET' && path === '/mock/treasure.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*' }).end(png);
    return;
  }
  // Hydrate calls follow the game. A `Prefer` header asks Prism for a specific example instead.
  if (req.method === 'GET' && path in HYDRATE && !req.headers.prefer) {
    answerHydrate(req, res, path as HydratePath);
    return;
  }
  // Everything else is the REST contract: forward to Prism unchanged (Prism also answers CORS).
  const upstream = request(
    { host: '127.0.0.1', port: prismPort, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'INTERNAL', message: 'Prism mock is not reachable.', correlationId: 'replay' } }));
  });
  req.pipe(upstream);
});

const io = new Server(http, { cors: { origin: true, credentials: true } });
io.of('/controller').use((socket, next) => {
  const code = controllerRefusal(socketToken(socket));
  next(code ? refusal(code) : undefined);
});
io.of('/player').use((socket, next) => {
  const code = playerRefusal(socketToken(socket), state);
  if (code) {
    next(refusal(code));
    return;
  }
  void socket.join(`slot:${MOCK_PHONE_SLOT}`);
  next();
});
for (const ns of ['/controller', '/player', '/display']) {
  io.of(ns).on('connection', () => console.log(`  client connected to ${ns}`));
}

function send(channel: Channel, event: string, payload: unknown, slot?: number): void {
  const ns = io.of(CHANNEL_NAMESPACE[channel]);
  if (channel === 'playerPrivate') ns.to(`slot:${slot}`).emit(event, payload);
  else ns.emit(event, payload);
}

await new Promise<void>((resolve) => http.listen(port, resolve));
const startDelay = Number(values['start-delay']);
console.log(`Replay server on http://localhost:${port} (Socket.IO + REST via Prism on ${prismPort}).`);
console.log(`Game starts in ${startDelay}s and lasts ${Math.max(...game.steps.map((s) => s.at))}s. Ctrl+C to stop.`);

const start = Date.now() + startDelay * 1000;
const timers: NodeJS.Timeout[] = [];
for (const step of ordered) {
  timers.push(
    setTimeout(() => {
      const now = Date.now();
      const payload = resolveTimes(step.payload, start, now);
      // State first, so a client that hydrates on this event already sees it.
      state.apply({ ...step, payload }, new Date(now).toISOString());
      for (const channel of step.to) send(channel, step.event, payload, step.slot);
      const who = step.to.map((c) => (c === 'playerPrivate' ? `player ${step.slot} only` : c)).join(', ');
      console.log(`[t+${String(step.at).padStart(3)}s] ${step.event.padEnd(19)} → ${who}`);
    }, start + step.at * 1000 - Date.now()),
  );
}
const ts = game.timerSync;
if (ts) {
  for (let at = ts.from; at <= ts.to; at += ts.every) {
    timers.push(
      setTimeout(() => {
        const payload = resolveTimes(ts.payload, start, Date.now());
        for (const channel of ['controller', 'player', 'display'] as const) send(channel, 'timer:sync', payload);
      }, start + at * 1000 - Date.now()),
    );
  }
}

const shutdown = () => {
  timers.forEach(clearTimeout);
  void io.close();
  http.close();
  stopPrism();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
