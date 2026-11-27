import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { UNCONFIGURED_MODEL } from '../../src/agents/config.js';
import { AgentError } from '../../src/agents/errors.js';
import { createFakeAgents, FakeFilterAgent } from '../../src/agents/fakes/index.js';
import {
  DEFAULT_IMAGE_STYLE,
  GeminiImageAgent,
  imageAgentSettings,
  type ImageModelClient,
  type ImageRequest,
} from '../../src/agents/image-agent.js';
import { loadEnv } from '../../src/config/env.js';
import { FakeClock } from '../../src/core/clock.js';
import { createLogger } from '../../src/core/logger.js';
import {
  compressImage,
  MAX_IMAGE_BYTES,
  MemoryImageStore,
  SIGNED_URL_TTL_SECONDS,
  TREASURE_IMAGE_SIZE,
  treasureImagePath,
  TreasureImageService,
} from '../../src/services/treasure-image.js';

/** A noisy PNG: random pixels compress badly, so it is a fair test of the size limit. */
async function noisyPng(width = 2048, height = 1536): Promise<Uint8Array> {
  const pixels = randomBytes(width * height * 3);
  return new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer());
}

type Step = 'ok' | 'empty' | 'hang' | number;

/** Plays back one step per call: an image, an empty image, a hang, or an HTTP status error. */
function imageClient(steps: Step[]) {
  const requests: ImageRequest[] = [];
  const client: ImageModelClient = {
    generateImage(request) {
      requests.push(request);
      const step = steps.shift() ?? 500;
      if (step === 'ok') return Promise.resolve({ bytes: Uint8Array.from([1, 2, 3]), mimeType: 'image/png' });
      if (step === 'empty') return Promise.resolve({ bytes: new Uint8Array(), mimeType: 'image/png' });
      if (step === 'hang') return new Promise(() => undefined);
      return Promise.reject(Object.assign(new Error(`HTTP ${step}`), { status: step }));
    },
  };
  return { client, requests };
}

function agent(steps: Step[], over: { fallbackModel?: string | undefined; logStream?: Writable } = {}) {
  const { client, requests } = imageClient(steps);
  const sleeps: number[] = [];
  const imageAgent = new GeminiImageAgent({
    client,
    model: 'img-main',
    fallbackModel: 'fallbackModel' in over ? over.fallbackModel : 'img-backup',
    timeoutMs: 30,
    logger: over.logStream ? createLogger('debug', over.logStream) : pino({ level: 'silent' }),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    backoffMs: 10,
  });
  return { imageAgent, requests, sleeps };
}

describe('GeminiImageAgent', () => {
  it('puts the style prefix before the prompt', async () => {
    const { imageAgent, requests } = agent(['ok']);
    const image = await imageAgent.generate('  a golden mango in a cage ');
    expect(image).toMatchObject({ model: 'img-main', mimeType: 'image/png' });
    expect(requests[0]?.prompt).toBe(`${DEFAULT_IMAGE_STYLE} a golden mango in a cage`);
  });

  it('retries the main model twice with backoff, then uses the fallback', async () => {
    const { imageAgent, requests, sleeps } = agent([503, 503, 503, 'ok']);
    const image = await imageAgent.generate('mango');
    expect(requests.map((r) => r.model)).toEqual(['img-main', 'img-main', 'img-main', 'img-backup']);
    expect(sleeps).toEqual([10, 20]);
    expect(image.model).toBe('img-backup');
  });

  it('treats an empty image and a timeout as retryable, and aborts the timed-out call', async () => {
    const { imageAgent, requests } = agent(['empty', 'hang', 'ok']);
    await expect(imageAgent.generate('mango')).resolves.toMatchObject({ model: 'img-main' });
    expect(requests[1]?.signal.aborted).toBe(true);
  });

  it('goes straight to the fallback on a permanent error such as a bad model ID', async () => {
    const { imageAgent, requests } = agent([404, 'ok']);
    await expect(imageAgent.generate('mango')).resolves.toMatchObject({ model: 'img-backup' });
    expect(requests.map((r) => r.model)).toEqual(['img-main', 'img-backup']);
  });

  it('fails with a retryable error when every try fails, so the Controller can retry', async () => {
    const { imageAgent, requests } = agent([500, 500, 500, 500]);
    await expect(imageAgent.generate('mango')).rejects.toMatchObject({
      agent: 'image',
      code: 'MODEL_ERROR',
      retryable: true,
    });
    expect(requests).toHaveLength(4);
  });

  it('has no fallback try when no fallback model is set', async () => {
    const { imageAgent, requests } = agent([500, 500, 500], { fallbackModel: undefined });
    await expect(imageAgent.generate('mango')).rejects.toBeInstanceOf(AgentError);
    expect(requests).toHaveLength(3);
  });

  it('logs model and outcome per try, never the prompt', async () => {
    const lines: string[] = [];
    const logStream = new Writable({
      write(chunk, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { imageAgent } = agent([500, 'ok'], { logStream });
    await imageAgent.generate('a secret flamingo plan');
    const raw = lines.join('');
    expect(raw).toContain('img-main');
    expect(raw).toContain('MODEL_ERROR');
    expect(raw).not.toContain('flamingo');
  });

  it('pings only by checking a model is configured', async () => {
    await expect(agent([]).imageAgent.ping()).resolves.toBeUndefined();
    const { client } = imageClient([]);
    const unconfigured = new GeminiImageAgent({ client, model: UNCONFIGURED_MODEL, logger: pino({ level: 'silent' }) });
    await expect(unconfigured.ping()).rejects.toBeInstanceOf(AgentError);
  });

  it('reads model IDs and style from env', () => {
    expect(imageAgentSettings(loadEnv({ IMAGE_MODEL: 'a', IMAGE_MODEL_FALLBACK: 'b' }))).toEqual({
      model: 'a',
      fallbackModel: 'b',
      stylePrefix: DEFAULT_IMAGE_STYLE,
    });
    expect(imageAgentSettings(loadEnv({ IMAGE_STYLE_PREFIX: 'Pixel art:' })).stylePrefix).toBe('Pixel art:');
  });

  it('the default style rules out text, real people and brands', () => {
    expect(DEFAULT_IMAGE_STYLE).toMatch(/No text/);
    expect(DEFAULT_IMAGE_STYLE).toMatch(/No logos or real brands/);
    expect(DEFAULT_IMAGE_STYLE).toMatch(/No real people/);
  });
});

describe('compressImage', () => {
  it('makes a large noisy image a 1024x768 JPEG under 400 KB', async () => {
    const input = await noisyPng();
    expect(input.length).toBeGreaterThan(MAX_IMAGE_BYTES);
    const out = await compressImage(input);
    expect(out.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', ...TREASURE_IMAGE_SIZE });
  }, 20_000);

  it('fails if even the lowest quality is too big', async () => {
    await expect(compressImage(await noisyPng(512, 384), TREASURE_IMAGE_SIZE, 1_000)).rejects.toThrow('under 1000 bytes');
  }, 20_000);
});

describe('treasureImagePath', () => {
  it('builds the private bucket path and refuses unsafe IDs', () => {
    expect(treasureImagePath('evt_1', 'cnd_1')).toBe('events/evt_1/treasures/cnd_1.jpg');
    expect(() => treasureImagePath('evt_1', '../x')).toThrow();
  });
});

describe('TreasureImageService', () => {
  function service(filter = new FakeFilterAgent()) {
    const clock = new FakeClock('2026-12-05T10:00:00.000Z');
    const store = new MemoryImageStore(clock);
    const agents = createFakeAgents();
    return { svc: new TreasureImageService({ images: agents.image, filter, store }), store, agents, filter };
  }

  it('generates, compresses, filters and stores a ready image', async () => {
    const { svc, store, agents, filter } = service();
    const result = await svc.create({ eventId: 'evt_1', candidateId: 'cnd_1', prompt: 'a mango' });
    expect(result).toMatchObject({ status: 'READY', path: 'events/evt_1/treasures/cnd_1.jpg', model: 'fake' });
    expect(agents.image.lastPrompt).toBe('a mango');
    expect(filter.calls).toBe(1);
    const saved = store.files.get('events/evt_1/treasures/cnd_1.jpg');
    expect(saved?.contentType).toBe('image/jpeg');
    expect((await sharp(saved?.bytes).metadata()).width).toBe(TREASURE_IMAGE_SIZE.width);
  });

  it('does not store a blocked image', async () => {
    const filter = new FakeFilterAgent();
    filter.checkImage = () => Promise.resolve({ decision: 'BLOCK', reason: 'shows a logo' });
    const { svc, store } = service(filter);
    await expect(svc.create({ eventId: 'evt_1', candidateId: 'cnd_1', prompt: 'x' })).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'shows a logo',
      failedClosed: false,
    });
    expect(store.files.size).toBe(0);
  });

  it('passes a generation failure on, so BE-19 can report stage IMAGE', async () => {
    const { svc, agents } = service();
    agents.image.failNextWith(new AgentError('image', 'TIMEOUT', true, 'slow'));
    await expect(svc.create({ eventId: 'evt_1', candidateId: 'cnd_1', prompt: 'x' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('signs 15-minute review and 4-hour published URLs, and refuses bad lifetimes', async () => {
    const { svc } = service();
    const { path } = (await svc.create({ eventId: 'evt_1', candidateId: 'cnd_1', prompt: 'x' })) as { path: string };
    await expect(svc.signImageUrl(path, SIGNED_URL_TTL_SECONDS.review)).resolves.toContain(
      encodeURIComponent('2026-12-05T10:15:00.000Z'),
    );
    await expect(svc.signImageUrl(path, SIGNED_URL_TTL_SECONDS.published)).resolves.toContain(
      encodeURIComponent('2026-12-05T14:00:00.000Z'),
    );
    await expect(svc.signImageUrl(path, 0)).rejects.toThrow();
    await expect(svc.signImageUrl(path, 8 * 24 * 3600)).rejects.toThrow();
  });
});

describe('MemoryImageStore as the event file store (BE-29)', () => {
  it('deletes and counts only that event’s files', async () => {
    const store = new MemoryImageStore(new FakeClock());
    await store.save('events/evt_1/treasures/a.jpg', Uint8Array.from([1]), 'image/jpeg');
    await store.save('events/evt_1/treasures/b.jpg', Uint8Array.from([1]), 'image/jpeg');
    await store.save('events/evt_10/treasures/c.jpg', Uint8Array.from([1]), 'image/jpeg');
    await expect(store.countRemaining('evt_1')).resolves.toBe(2);
    await store.deleteAll('evt_1');
    await expect(store.countRemaining('evt_1')).resolves.toBe(0);
    await expect(store.countRemaining('evt_10')).resolves.toBe(1);
  });
});
