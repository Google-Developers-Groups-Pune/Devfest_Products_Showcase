import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import { bearerToken, requireJoinToken, requirePlayer, type AuthLocals } from '../../src/http/middleware/auth.js';
import { errorHandler } from '../../src/http/middleware/error-handler.js';
import { createTestAuth } from '../fixtures/auth.js';

function appWith(auth: ReturnType<typeof createTestAuth>) {
  const app = express();
  app.get('/player', requirePlayer(auth.playerAuth), (_req, res) => {
    res.json({ playerId: (res.locals as AuthLocals).player?.playerId });
  });
  app.get('/join', requireJoinToken(auth.playerAuth), (_req, res) => {
    res.json({ slotNumber: (res.locals as AuthLocals).join?.slotNumber });
  });
  app.use(errorHandler(pino({ level: 'silent' })));
  return app;
}

describe('bearerToken', () => {
  const tokenOf = (authorization?: string) =>
    bearerToken({ get: () => authorization } as unknown as Parameters<typeof bearerToken>[0]);

  it('reads "Bearer <token>" and ignores anything else', () => {
    expect(tokenOf('Bearer abc.def')).toBe('abc.def');
    expect(tokenOf('bearer abc')).toBe('abc');
    expect(tokenOf(undefined)).toBe('');
    expect(tokenOf('Basic abc')).toBe('');
    expect(tokenOf('Bearer a b')).toBe('');
  });
});

describe('requirePlayer and requireJoinToken', () => {
  it('requireJoinToken passes the slot on, and refuses with 401 JOIN_TOKEN_EXPIRED', async () => {
    const auth = createTestAuth(new FakeClock());
    const app = appWith(auth);
    const { token } = await auth.tokens.signJoin({ eventId: 'e1', sessionId: 's1', slotNumber: 4 });

    const ok = await request(app).get('/join').set('Authorization', `Bearer ${token}`);
    expect(ok.body).toEqual({ slotNumber: 4 });

    const bad = await request(app).get('/join');
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('JOIN_TOKEN_EXPIRED');
  });

  it('requirePlayer refuses with 401 UNAUTHENTICATED when there is no token', async () => {
    const app = appWith(createTestAuth(new FakeClock()));
    const res = await request(app).get('/player');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
