import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { createTestAuth } from '../fixtures/auth.js';

const APP_ORIGIN = 'http://localhost:5000';
const clock = new FakeClock();
const app = createApp({
  clock,
  controllerAuth: createTestAuth(clock).controllerAuth,
  logger: pino({ level: 'silent' }),
  corsOrigins: [APP_ORIGIN],
});
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

describe('GET /health', () => {
  it('returns 200 with a correlation ID', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-correlation-id']).toMatch(SAFE_ID);
  });
});

describe('correlation ID', () => {
  it('echoes a safe caller-supplied ID', async () => {
    const res = await request(app).get('/health').set('X-Correlation-Id', 'abc-12345');
    expect(res.headers['x-correlation-id']).toBe('abc-12345');
  });

  it('replaces an unsafe caller-supplied ID', async () => {
    const res = await request(app).get('/health').set('X-Correlation-Id', 'bad id {"injected": true}');
    expect(res.headers['x-correlation-id']).not.toContain('bad');
    expect(res.headers['x-correlation-id']).toMatch(SAFE_ID);
  });

  it('is still in context after the JSON body is parsed', async () => {
    const res = await request(app).post('/api/player/does-not-exist').send({ text: 'hello' });
    expect(res.body.error.correlationId).toBe(res.headers['x-correlation-id']);
  });
});

describe('error envelope', () => {
  it('is returned for unknown routes', async () => {
    const res = await request(app).get('/api/player/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Not found.',
        correlationId: res.headers['x-correlation-id'],
      },
    });
  });

  it('is returned for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/player/prompts')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.error.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('is returned for an oversized body', async () => {
    const res = await request(app).post('/api/player/prompts').send({ text: 'x'.repeat(40_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allows the app origin, with the headers the contract uses', async () => {
    const res = await request(app)
      .options('/api/player/prompts')
      .set('Origin', APP_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type,idempotency-key');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(APP_ORIGIN);
    expect(res.headers['access-control-allow-headers']).toContain('Idempotency-Key');
  });

  it('exposes X-Correlation-Id to the browser', async () => {
    const res = await request(app).get('/health').set('Origin', APP_ORIGIN);
    expect(res.headers['access-control-expose-headers']).toContain('X-Correlation-Id');
  });

  it('does not allow other origins', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
