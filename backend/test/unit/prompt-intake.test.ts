import type { RequestHandler } from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeAgents } from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { AppError } from '../../src/core/errors.js';
import {
  assertCanSubmit,
  MAX_PROMPT_CHARS,
  PromptIntakeService,
  type IntakeResult,
  type PlayerRef,
  type PromptIntakeStore,
  type QueuedPrompt,
} from '../../src/services/prompt-intake.js';

const START = new Date('2026-12-05T10:00:00.000Z');
const END = new Date('2026-12-05T10:01:30.000Z');
const ROUND = { roundStartedAt: START, roundEndAt: END };
const at = (offsetMs: number) => new Date(END.getTime() + offsetMs);

describe('assertCanSubmit', () => {
  it('accepts at roundEndAt minus 1 ms, and refuses exactly at roundEndAt (QE)', () => {
    expect(() => assertCanSubmit('PLAYING', 'PLAYING', ROUND, at(-1))).not.toThrow();
    expect(() => assertCanSubmit('PLAYING', 'PLAYING', ROUND, at(0))).toThrow(
      expect.objectContaining({ code: 'ROUND_EXPIRED', status: 409 }),
    );
  });

  it('accepts a prompt received before the end even if the round end already ran', () => {
    expect(() => assertCanSubmit('RESULT_PENDING', 'RESULT_PENDING', ROUND, at(-1))).not.toThrow();
    expect(() => assertCanSubmit('RESULT_PENDING', 'RESULT_PENDING', ROUND, at(1))).toThrow(
      expect.objectContaining({ code: 'ROUND_EXPIRED' }),
    );
  });

  it.each<[string, Parameters<typeof assertCanSubmit>, string]>([
    ['a round that has not started', ['PLAYING', 'PLAYING', { roundStartedAt: null, roundEndAt: null }, at(-1)], 'ROUND_NOT_PLAYING'],
    ['a READY session', ['READY', 'LOBBY', ROUND, at(-1)], 'ROUND_NOT_PLAYING'],
    ['a discarded session', ['DISCARDED', 'RESULT_PENDING', ROUND, at(-1)], 'ROUND_NOT_PLAYING'],
    ['a prompt received before the round started', ['PLAYING', 'PLAYING', ROUND, new Date(START.getTime() - 1)], 'ROUND_NOT_PLAYING'],
    ['a player locked at 100', ['PLAYING', 'LOCKED_100', ROUND, at(-1)], 'PLAYER_LOCKED'],
    ['a missing player', ['PLAYING', undefined, ROUND, at(-1)], 'ROUND_NOT_PLAYING'],
  ])('refuses %s', (_case, args, code) => {
    expect(() => assertCanSubmit(...args)).toThrow(expect.objectContaining({ code }));
  });
});

/** In-memory store: creates once per key, like the Firestore one. */
class MemoryIntakeStore implements PromptIntakeStore {
  readonly prompts = new Map<string, { text: string; receivedAt: Date; sequence: number }>();
  refuseWith: AppError | null = null;

  create(player: PlayerRef, prompt: { idempotencyKey: string; text: string; receivedAt: Date }): Promise<IntakeResult> {
    const promptId = `${player.playerId}:${prompt.idempotencyKey}`;
    const stored = this.prompts.get(promptId);
    if (stored) {
      return Promise.resolve({
        created: false,
        roundId: 'rnd_1',
        receipt: { promptId, status: 'SCORED', sequence: stored.sequence, receivedAt: stored.receivedAt.toISOString() },
      });
    }
    if (this.refuseWith) return Promise.reject(this.refuseWith);
    const sequence = this.prompts.size + 1;
    this.prompts.set(promptId, { text: prompt.text, receivedAt: prompt.receivedAt, sequence });
    return Promise.resolve({
      created: true,
      roundId: 'rnd_1',
      receipt: { promptId, status: 'RECEIVED', sequence, receivedAt: prompt.receivedAt.toISOString() },
    });
  }
}

const PLAYER: PlayerRef = { eventId: 'evt_1', sessionId: 'ses_1', playerId: 'ply_1' };
const KEY = '3f1c2a9e-8b4d-4c1e-9a7f-2d5e6b8c0a11';

let store: MemoryIntakeStore;
let queued: QueuedPrompt[];
let intake: PromptIntakeService;

beforeEach(() => {
  store = new MemoryIntakeStore();
  queued = [];
  intake = new PromptIntakeService(store, { enqueue: (p) => queued.push(p) });
});

describe('PromptIntakeService.submit', () => {
  const submit = (idempotencyKey: string | undefined, text: unknown) =>
    intake.submit(PLAYER, { idempotencyKey, text, receivedAt: at(-1000) });

  it('stores the trimmed text, then queues it for scoring', async () => {
    const result = await submit(KEY, '   Barnaby, take a vacation!  ');
    expect(result.created).toBe(true);
    expect([...store.prompts.values()][0]?.text).toBe('Barnaby, take a vacation!');
    expect(queued).toEqual([{ ...PLAYER, roundId: 'rnd_1', promptId: result.receipt.promptId }]);
  });

  it('returns the stored prompt for a repeated key, and never queues it again', async () => {
    await submit(KEY, 'first');
    const repeat = await submit(KEY, 'first');
    expect(repeat.created).toBe(false);
    expect(repeat.receipt.status).toBe('SCORED');
    expect(queued).toHaveLength(1);
  });

  it('lets a player have several prompts in flight', async () => {
    await submit('key-1', 'one');
    await submit('key-2', 'two');
    expect(queued).toHaveLength(2);
  });

  it('accepts exactly 200 characters after trimming', async () => {
    await expect(submit(KEY, `  ${'a'.repeat(MAX_PROMPT_CHARS)}  `)).resolves.toMatchObject({ created: true });
  });

  it.each<[string, string | undefined, unknown, number, string]>([
    ['no Idempotency-Key', undefined, 'hi', 400, 'IDEMPOTENCY_KEY_REQUIRED'],
    ['a blank Idempotency-Key', '   ', 'hi', 400, 'IDEMPOTENCY_KEY_REQUIRED'],
    ['an unreadable Idempotency-Key', 'not a key!', 'hi', 400, 'BAD_REQUEST'],
    ['text that is not a string', KEY, 42, 400, 'BAD_REQUEST'],
    ['no text', KEY, undefined, 422, 'PROMPT_EMPTY'],
    ['only spaces', KEY, '    ', 422, 'PROMPT_EMPTY'],
    ['201 characters', KEY, 'a'.repeat(MAX_PROMPT_CHARS + 1), 422, 'PROMPT_TOO_LONG'],
  ])('refuses %s, storing nothing', async (_case, key, text, status, code) => {
    await expect(submit(key, text)).rejects.toMatchObject({ status, code });
    expect(store.prompts.size).toBe(0);
    expect(queued).toEqual([]);
  });

  it('queues nothing when the store refuses', async () => {
    store.refuseWith = new AppError(409, 'ROUND_EXPIRED', 'Time is up.');
    await expect(submit(KEY, 'late')).rejects.toMatchObject({ code: 'ROUND_EXPIRED' });
    expect(queued).toEqual([]);
  });
});

describe('POST /api/player/prompts', () => {
  let clock: FakeClock;

  /** Stands in for BE-05 requirePlayer: takes 500 ms, like a Firestore read, then sets the player. */
  const slowRequirePlayer = (): RequestHandler => (req, res, next) => {
    if (req.get('Authorization') !== 'Bearer good') {
      next(new AppError(401, 'UNAUTHENTICATED', 'Please join again.'));
      return;
    }
    clock.advance(500);
    res.locals.player = { ...PLAYER, tokenId: 'tok_1' };
    next();
  };

  function app() {
    clock = new FakeClock(at(-200));
    return createApp({
      clock,
      logger: pino({ level: 'silent' }),
      corsOrigins: [],
      agentHealth: new AgentHealthService(createFakeAgents(), clock),
      prompts: { intake, requirePlayer: slowRequirePlayer() },
    });
  }

  const post = (server: ReturnType<typeof app>, body: object, key = KEY) =>
    request(server).post('/api/player/prompts').set('Authorization', 'Bearer good').set('Idempotency-Key', key).send(body);

  it('202 for a new prompt, 200 for the same key again, with the PromptReceipt shape', async () => {
    const server = app();
    const first = await post(server, { text: 'Barnaby, take a vacation!' });
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ promptId: 'ply_1:' + KEY, status: 'RECEIVED', sequence: 1, receivedAt: at(-200).toISOString() });
    const again = await post(server, { text: 'Barnaby, take a vacation!' });
    expect(again.status).toBe(200);
    expect(again.body.sequence).toBe(1);
  });

  it('takes receivedAt before the token check, so its delay cannot push a prompt past the end', async () => {
    const res = await post(app(), { text: 'just in time' });
    // The token check took 500 ms and crossed roundEndAt; the receipt time is still before it.
    expect(res.body.receivedAt).toBe(at(-200).toISOString());
    expect(clock.now().getTime()).toBeGreaterThan(END.getTime());
  });

  it('takes the player from the token only, never from the body', async () => {
    const res = await post(app(), { text: 'hi', playerId: 'ply_9', score: 100 });
    expect(res.body.promptId.startsWith('ply_1:')).toBe(true);
  });

  it('refuses without a token, with the shared error body', async () => {
    const res = await request(app()).post('/api/player/prompts').set('Idempotency-Key', KEY).send({ text: 'hi' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses a missing Idempotency-Key with 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const res = await request(app()).post('/api/player/prompts').set('Authorization', 'Bearer good').send({ text: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});
