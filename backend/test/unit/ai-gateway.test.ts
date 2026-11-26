import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { agentsConfig, UNCONFIGURED_MODEL, type AgentsConfig } from '../../src/agents/config.js';
import { AgentError } from '../../src/agents/errors.js';
import { AiGateway, type ModelClient, type ModelRequest, type ModelResponse } from '../../src/agents/gateway.js';
import { loadEnv } from '../../src/config/env.js';

const SCHEMA = z.object({ score: z.number().int().min(0).max(100), feedback: z.string() });

const CONFIG: AgentsConfig = {
  treasure: { model: 'm-text', temperature: 0.9, timeoutMs: 1000, maxRetries: 2 },
  image: { model: 'm-image', temperature: 0.8, timeoutMs: 1000, maxRetries: 2 },
  filter: { model: 'm-fast', temperature: 0, timeoutMs: 1000, maxRetries: 2 },
  guard: { model: 'm-fast', temperature: 0.2, timeoutMs: 50, maxRetries: 2 },
  emoji: { model: 'm-fast', temperature: 0.8, timeoutMs: 1000, maxRetries: 0 },
};

type Step = ModelResponse | Error | 'hang';

/** Plays back one step per call and records each request. */
function scriptedClient(steps: Step[]) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    generateJson(request) {
      requests.push(request);
      const step = steps.shift() ?? new Error('no more steps');
      if (step === 'hang') return new Promise<ModelResponse>(() => undefined);
      return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
    },
  };
  return { client, requests };
}

function gateway(client: ModelClient, sleeps: number[] = []) {
  let tick = 0;
  return new AiGateway({
    client,
    config: CONFIG,
    logger: pino({ level: 'silent' }),
    now: () => (tick += 7),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    backoffMs: 100,
  });
}

const CALL = {
  agent: 'guard' as const,
  systemInstruction: 'You are the judge.',
  userParts: ['Barnaby, take a vacation!'],
  schema: SCHEMA,
};

const ok = (body: unknown, modelVersion = 'm-fast-001'): ModelResponse => ({ text: JSON.stringify(body), modelVersion });
const withStatus = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('AiGateway.generateStructured', () => {
  it('returns validated data with model, version, latency and attempts', async () => {
    const { client } = scriptedClient([ok({ score: 80, feedback: 'Nice' })]);
    const result = await gateway(client).generateStructured(CALL);
    expect(result).toEqual({
      data: { score: 80, feedback: 'Nice' },
      model: 'm-fast',
      modelVersion: 'm-fast-001',
      latencyMs: 7,
      attempts: 1,
    });
  });

  it('keeps player text in its own part, apart from the system instruction', async () => {
    const { client, requests } = scriptedClient([ok({ score: 1, feedback: 'x' })]);
    await gateway(client).generateStructured(CALL);
    const request = requests[0] as ModelRequest;
    expect(request.systemInstruction).toBe('You are the judge.');
    expect(request.systemInstruction).not.toContain('Barnaby');
    expect(request.userParts).toEqual(['Barnaby, take a vacation!']);
  });

  it('sends the per-agent model and temperature, and a JSON schema for structured output', async () => {
    const { client, requests } = scriptedClient([ok({ score: 1, feedback: 'x' })]);
    await gateway(client).generateStructured(CALL);
    const request = requests[0] as ModelRequest;
    expect(request.model).toBe('m-fast');
    expect(request.temperature).toBe(0.2);
    expect(request.responseJsonSchema).toMatchObject({
      type: 'object',
      properties: { score: { type: 'integer', minimum: 0, maximum: 100 }, feedback: { type: 'string' } },
    });
  });

  it('retries invalid JSON, then succeeds', async () => {
    const { client, requests } = scriptedClient([{ text: 'not json' }, ok({ score: 5, feedback: 'ok' })]);
    const result = await gateway(client).generateStructured(CALL);
    expect(result.attempts).toBe(2);
    expect(requests).toHaveLength(2);
  });

  it('treats an out-of-range value as retryable invalid output', async () => {
    const bad = ok({ score: 140, feedback: 'too high' });
    const { client } = scriptedClient([bad, bad, bad]);
    const error = await gateway(client).generateStructured(CALL).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentError);
    expect(error).toMatchObject({ agent: 'guard', code: 'INVALID_OUTPUT', retryable: true });
    expect((error as Error).message).toContain('score');
    expect((error as Error).message).not.toContain('140');
  });

  it('stops after maxRetries and backs off exponentially', async () => {
    const sleeps: number[] = [];
    const { client, requests } = scriptedClient([withStatus(503), withStatus(503), withStatus(503), ok({})]);
    const error = await gateway(client, sleeps).generateStructured(CALL).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'MODEL_ERROR', retryable: true });
    expect(requests).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('retries 429 and 408', async () => {
    const { client } = scriptedClient([withStatus(429), withStatus(408), ok({ score: 1, feedback: 'x' })]);
    const result = await gateway(client).generateStructured(CALL);
    expect(result.attempts).toBe(3);
  });

  it('does not retry other client errors, such as a bad model ID', async () => {
    const { client, requests } = scriptedClient([withStatus(404), ok({ score: 1, feedback: 'x' })]);
    const error = await gateway(client).generateStructured(CALL).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'MODEL_ERROR', retryable: false });
    expect(requests).toHaveLength(1);
  });

  it('times out a call that never answers and aborts it', async () => {
    const { client, requests } = scriptedClient(['hang', 'hang', 'hang']);
    const error = await gateway(client).generateStructured(CALL).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'TIMEOUT', retryable: true });
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.signal.aborted)).toBe(true);
  });

  it('honours a per-call maxRetries override', async () => {
    const { client, requests } = scriptedClient([withStatus(500), ok({ score: 1, feedback: 'x' })]);
    await expect(gateway(client).generateStructured({ ...CALL, maxRetries: 0 })).rejects.toMatchObject({
      code: 'MODEL_ERROR',
    });
    expect(requests).toHaveLength(1);
  });

  it('uses the agent config: emoji gets no retries', async () => {
    const { client, requests } = scriptedClient([withStatus(500), ok({ score: 1, feedback: 'x' })]);
    await expect(gateway(client).generateStructured({ ...CALL, agent: 'emoji' })).rejects.toBeInstanceOf(AgentError);
    expect(requests).toHaveLength(1);
  });
});

describe('AiGateway.ping', () => {
  it('passes when the model answers {"ok": true}', async () => {
    const { client, requests } = scriptedClient([ok({ ok: true })]);
    await expect(gateway(client).ping('filter')).resolves.toBeUndefined();
    expect(requests[0]?.model).toBe('m-fast');
  });

  it('fails without retrying', async () => {
    const { client, requests } = scriptedClient([withStatus(500), ok({ ok: true })]);
    await expect(gateway(client).ping('treasure')).rejects.toBeInstanceOf(AgentError);
    expect(requests).toHaveLength(1);
  });
});

describe('agentsConfig', () => {
  it('reads model IDs from env: fast model for filter, guard, emoji; text model for treasure', () => {
    const config = agentsConfig(
      loadEnv({ MODEL_TEXT: 'text-model', MODEL_GUARD: 'fast-model', IMAGE_MODEL: 'image-model' }),
    );
    expect(config.treasure.model).toBe('text-model');
    expect(config.image.model).toBe('image-model');
    expect([config.filter.model, config.guard.model, config.emoji.model]).toEqual([
      'fast-model',
      'fast-model',
      'fast-model',
    ]);
  });

  it('uses the defaults from STORIES.md: image 45 s with 2 retries, emoji 2 s', () => {
    const config = agentsConfig(loadEnv({}));
    expect(config.image).toMatchObject({ timeoutMs: 45_000, maxRetries: 2 });
    expect(config.emoji.timeoutMs).toBe(2_000);
    expect(config.guard.model).toBe(UNCONFIGURED_MODEL);
  });
});
