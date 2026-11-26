import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { createTestAuth } from '../fixtures/auth.js';

const PASSWORD = 'correct horse battery staple';

async function setup() {
  const clock = new FakeClock('2026-12-05T08:00:00.000Z');
  const auth = createTestAuth(clock);
  await auth.controllers.add('ctl_1', 'controller', PASSWORD);
  const app = createApp({ clock, logger: pino({ level: 'silent' }), corsOrigins: [], controllerAuth: auth.controllerAuth });
  const login = (password = PASSWORD, username = 'controller') =>
    request(app).post('/api/controller/auth/login').send({ username, password });
  return { app, auth, clock, login };
}

describe('POST /api/controller/auth/login', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns a 12-hour token and the account', async () => {
    const res = await ctx.login();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      token: expect.any(String),
      expiresAt: '2026-12-05T20:00:00.000Z',
      controller: { id: 'ctl_1', username: 'controller' },
    });
  });

  it('refuses a wrong password and an unknown username the same way', async () => {
    const wrongPassword = await ctx.login('wrong password');
    const unknownUser = await ctx.login(PASSWORD, 'someone');
    for (const res of [wrongPassword, unknownUser]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });

  it('refuses a missing or wrong-shaped body with 400', async () => {
    for (const body of [{}, { username: 'controller' }, { username: '', password: 'x' }, { username: 1, password: 2 }]) {
      const res = await request(ctx.app).post('/api/controller/auth/login').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    }
  });

  it('allows 5 tries per minute, then 429 TOO_MANY_ATTEMPTS', async () => {
    for (let i = 0; i < 5; i += 1) expect((await ctx.login('wrong')).status).toBe(401);
    const sixth = await ctx.login();
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('a new login ends the previous one and kicks its socket (D29)', async () => {
    const first = await ctx.login();
    const second = await ctx.login();
    expect(second.status).toBe(200);

    const old = await request(ctx.app).get('/api/controller/auth/me').set('Authorization', `Bearer ${first.body.token}`);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('UNAUTHENTICATED');

    const firstTokenId = (await ctx.auth.tokens.verifyController(first.body.token)).tokenId;
    expect(ctx.auth.hookCalls.signedInElsewhere).toEqual([firstTokenId]);

    const current = await request(ctx.app).get('/api/controller/auth/me').set('Authorization', `Bearer ${second.body.token}`);
    expect(current.status).toBe(200);
  });

  it('does not send a kick on the first login', async () => {
    await ctx.login();
    expect(ctx.auth.hookCalls.signedInElsewhere).toEqual([]);
  });
});

describe('GET /api/controller/auth/me and POST /auth/logout', () => {
  it('me returns the account for a valid token', async () => {
    const { app, login } = await setup();
    const { token } = (await login()).body;
    const res = await request(app).get('/api/controller/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ controller: { id: 'ctl_1', username: 'controller' } });
  });

  it('logout returns 204, revokes the token and drops its socket', async () => {
    const { app, auth, login } = await setup();
    const { token } = (await login()).body;
    const out = await request(app).post('/api/controller/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(204);
    expect(auth.hookCalls.loggedOut).toHaveLength(1);

    const after = await request(app).get('/api/controller/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('a token stops working after 12 hours', async () => {
    const { app, clock, login } = await setup();
    const { token } = (await login()).body;
    clock.advance(12 * 60 * 60 * 1000);
    const res = await request(app).get('/api/controller/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('QE check: every Controller route needs a Controller token', () => {
  // Today's routes plus examples of later ones (BE-08 onwards). Unknown paths are 401 too.
  const routes: Array<['get' | 'post' | 'patch', string]> = [
    ['get', '/api/controller/auth/me'],
    ['post', '/api/controller/auth/logout'],
    ['post', '/api/controller/sessions'],
    ['get', '/api/controller/sessions/active'],
    ['post', '/api/controller/event/close'],
    ['get', '/api/controller/event/status'],
    ['get', '/api/controller/anything-else'],
  ];

  it.each(routes)('%s %s is 401 with no token, a junk token or a player token', async (method, path) => {
    const { app, auth } = await setup();
    const playerToken = (await auth.tokens.signPlayer({ eventId: 'e1', sessionId: 's1', playerId: 'p1' })).token;
    const joinToken = (await auth.tokens.signJoin({ eventId: 'e1', sessionId: 's1', slotNumber: 1 })).token;

    for (const header of [undefined, 'Bearer junk', `Bearer ${playerToken}`, `Bearer ${joinToken}`, 'Basic abc']) {
      const req = request(app)[method](path);
      const res = await (header === undefined ? req : req.set('Authorization', header));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});
