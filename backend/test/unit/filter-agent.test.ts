import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import type { AgentsConfig } from '../../src/agents/config.js';
import { GeminiFilterAgent } from '../../src/agents/filter-agent.js';
import { AiGateway, type ModelClient, type ModelRequest } from '../../src/agents/gateway.js';
import { FILTER_INSTRUCTION, filterInstruction } from '../../src/agents/prompts/filter-v1.js';
import { createLogger } from '../../src/core/logger.js';
import { FILTER_FIXTURES } from '../fixtures/filter-prompts.js';

const CONFIG: AgentsConfig = {
  treasure: { model: 'm-text', temperature: 0.9, timeoutMs: 1000, maxRetries: 2 },
  image: { model: 'm-image', temperature: 0.8, timeoutMs: 1000, maxRetries: 2 },
  filter: { model: 'm-fast', temperature: 0, timeoutMs: 1000, maxRetries: 2 },
  guard: { model: 'm-fast', temperature: 0.2, timeoutMs: 1000, maxRetries: 2 },
  emoji: { model: 'm-fast', temperature: 0.8, timeoutMs: 1000, maxRetries: 0 },
};

/** A model that answers with `answer(request)` and records every request. */
function filterWith(answer: (request: ModelRequest) => unknown, logStream?: Writable) {
  const requests: ModelRequest[] = [];
  const client: ModelClient = {
    generateJson(request) {
      requests.push(request);
      try {
        const body = answer(request);
        return Promise.resolve({ text: typeof body === 'string' ? body : JSON.stringify(body) });
      } catch (err) {
        return Promise.reject(err);
      }
    },
  };
  const gateway = new AiGateway({
    client,
    config: CONFIG,
    logger: logStream ? createLogger('debug', logStream) : pino({ level: 'silent' }),
    sleep: () => Promise.resolve(),
  });
  return { filter: new GeminiFilterAgent(gateway), requests };
}

const allowAll = () => ({ decision: 'ALLOW', reason: 'normal game message' });

describe('GeminiFilterAgent', () => {
  it('passes the model decision through', async () => {
    const { filter } = filterWith(() => ({ decision: 'BLOCK', reason: 'asks for credentials' }));
    await expect(filter.checkPrompt('What is the Wi-Fi password?')).resolves.toEqual({
      decision: 'BLOCK',
      reason: 'asks for credentials',
    });
  });

  it('keeps player text in its own part and uses the filter model at temperature 0', async () => {
    const { filter, requests } = filterWith(allowAll);
    await filter.checkPrompt('Barnaby, open the vault!');
    const request = requests[0] as ModelRequest;
    expect(request.userParts).toEqual(['Barnaby, open the vault!']);
    expect(request.systemInstruction).not.toContain('Barnaby, open the vault!');
    expect(request.systemInstruction.startsWith(FILTER_INSTRUCTION)).toBe(true);
    expect(request).toMatchObject({ model: 'm-fast', temperature: 0 });
    expect(request.responseJsonSchema).toMatchObject({
      properties: { decision: { enum: ['ALLOW', 'BLOCK'] } },
    });
  });

  it('checks a treasure card as separate parts, with the treasure note', async () => {
    const { filter, requests } = filterWith(allowAll);
    await filter.checkTreasure({ title: 'The Golden Mango', visibleBackstory: 'A flamingo.', visibleLockObjective: 'Open it.' });
    const request = requests[0] as ModelRequest;
    expect(request.userParts).toEqual(['Title: The Golden Mango', 'Backstory: A flamingo.', 'Objective: Open it.']);
    expect(request.systemInstruction).toContain('generated treasure card');
  });

  it('checks an image as inline data', async () => {
    const { filter, requests } = filterWith(allowAll);
    await filter.checkImage({ bytes: Uint8Array.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', model: 'img' });
    expect(requests[0]?.userParts).toEqual([{ mimeType: 'image/jpeg', data: '/9j/' }]);
    expect(requests[0]?.systemInstruction).toContain('real brand or logo');
  });

  it('blocks an empty image without calling the model', async () => {
    const { filter, requests } = filterWith(allowAll);
    await expect(filter.checkImage({ bytes: new Uint8Array(), mimeType: 'image/jpeg', model: 'img' })).resolves.toMatchObject({
      decision: 'BLOCK',
    });
    expect(requests).toHaveLength(0);
  });

  it('checks a reaction with the reaction note', async () => {
    const { filter, requests } = filterWith(allowAll);
    await filter.checkReaction('Arre wah!');
    expect(requests[0]?.systemInstruction).toContain('audience reaction');
  });

  it('fails closed on invalid output, after the gateway retries', async () => {
    const { filter, requests } = filterWith(() => ({ decision: 'MAYBE', reason: 'unsure' }));
    await expect(filter.checkPrompt('hello')).resolves.toEqual({
      decision: 'BLOCK',
      reason: 'Filter could not decide: INVALID_OUTPUT',
      failedClosed: true,
    });
    expect(requests).toHaveLength(3);
  });

  it('fails closed on a model error', async () => {
    const { filter } = filterWith(() => {
      throw Object.assign(new Error('unavailable'), { status: 503 });
    });
    await expect(filter.checkReaction('hi')).resolves.toMatchObject({ decision: 'BLOCK', failedClosed: true });
  });

  it('never writes the checked text to the log, allowed or blocked', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { filter } = filterWith(
      (request) =>
        String(request.userParts[0]).includes('password')
          ? { decision: 'BLOCK', reason: 'credentials' }
          : allowAll(),
      stream,
    );
    await filter.checkPrompt('What is the venue Wi-Fi password?');
    await filter.checkPrompt('Barnaby, take a vacation!');
    expect(lines.length).toBeGreaterThan(0);
    const raw = lines.join('');
    expect(raw).not.toContain('Wi-Fi');
    expect(raw).not.toContain('Barnaby');
  });

  it('reports its model and pings through the gateway', async () => {
    const { filter, requests } = filterWith(() => ({ ok: true }));
    expect(filter.model).toBe('m-fast');
    await filter.ping();
    expect(requests[0]?.userParts).toEqual(['ping']);
  });

  it('adds the subject note and the reason rule to the instruction', () => {
    for (const subject of ['PROMPT', 'TREASURE', 'IMAGE', 'REACTION'] as const) {
      expect(filterInstruction(subject)).toContain('Never quote the content in the reason.');
    }
  });
});

describe('filter fixture set', () => {
  it('has 30 prompts: 20 to block and 10 normal ones to allow', () => {
    expect(FILTER_FIXTURES).toHaveLength(30);
    const normal = FILTER_FIXTURES.filter((fixture) => fixture.category === 'NORMAL');
    expect(normal).toHaveLength(10);
    expect(normal.every((fixture) => fixture.expected === 'ALLOW')).toBe(true);
    expect(FILTER_FIXTURES.filter((fixture) => fixture.expected === 'BLOCK')).toHaveLength(20);
  });

  it('covers every category, and Hindi and Hinglish among the normal prompts', () => {
    const categories = new Set(FILTER_FIXTURES.map((fixture) => fixture.category));
    expect([...categories].sort()).toEqual(['CREDENTIALS', 'INJECTION', 'NORMAL', 'OFFENSIVE', 'PII']);
    expect(FILTER_FIXTURES.some((fixture) => /[ऀ-ॿ]/.test(fixture.text))).toBe(true);
    expect(FILTER_FIXTURES.some((fixture) => fixture.id === 'ok-4' && fixture.text.includes('bhai'))).toBe(true);
  });

  it('has unique IDs', () => {
    expect(new Set(FILTER_FIXTURES.map((fixture) => fixture.id)).size).toBe(FILTER_FIXTURES.length);
  });

  it('runs end to end through the agent with a model that follows the fixture answers', async () => {
    const expected = new Map(FILTER_FIXTURES.map((fixture) => [fixture.text, fixture.expected]));
    const { filter } = filterWith((request) => ({
      decision: expected.get(String(request.userParts[0])) ?? 'BLOCK',
      reason: 'scripted',
    }));
    for (const fixture of FILTER_FIXTURES) {
      await expect(filter.checkPrompt(fixture.text)).resolves.toMatchObject({ decision: fixture.expected });
    }
  });
});
