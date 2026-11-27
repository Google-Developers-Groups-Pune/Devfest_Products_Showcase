import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { CONTROLLER_TOKEN_TTL_SECONDS, InvalidTokenError, JOIN_TOKEN_TTL_SECONDS, TokenService } from '../../src/auth/tokens.js';
import { FakeClock } from '../../src/core/clock.js';
import { TEST_JWT_SECRET } from '../fixtures/auth.js';

const setup = () => {
  const clock = new FakeClock('2026-12-05T08:00:00.000Z');
  return { clock, tokens: new TokenService(TEST_JWT_SECRET, clock) };
};

describe('TokenService', () => {
  it('refuses a secret shorter than 32 characters', () => {
    expect(() => new TokenService('short', new FakeClock())).toThrow();
  });

  it('controller tokens last 12 hours', async () => {
    const { clock, tokens } = setup();
    const issued = await tokens.signController('ctl_1');
    expect(issued.expiresAt.toISOString()).toBe('2026-12-05T20:00:00.000Z');

    const claims = await tokens.verifyController(issued.token);
    expect(claims).toEqual({ controllerId: 'ctl_1', tokenId: issued.tokenId, expiresAt: issued.expiresAt });

    clock.advance(CONTROLLER_TOKEN_TTL_SECONDS * 1000 - 1000);
    await expect(tokens.verifyController(issued.token)).resolves.toBeDefined();
    clock.advance(1000);
    await expect(tokens.verifyController(issued.token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('join tokens last 5 minutes and carry the slot', async () => {
    const { clock, tokens } = setup();
    const issued = await tokens.signJoin({ eventId: 'e1', sessionId: 's1', slotNumber: 3 });
    await expect(tokens.verifyJoin(issued.token)).resolves.toMatchObject({ eventId: 'e1', sessionId: 's1', slotNumber: 3 });
    clock.advance(JOIN_TOKEN_TTL_SECONDS * 1000);
    await expect(tokens.verifyJoin(issued.token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('player tokens have no expiry', async () => {
    const { clock, tokens } = setup();
    const issued = await tokens.signPlayer({ eventId: 'e1', sessionId: 's1', playerId: 'p1' });
    clock.advance(7 * 24 * 60 * 60 * 1000);
    await expect(tokens.verifyPlayer(issued.token)).resolves.toEqual({
      eventId: 'e1',
      sessionId: 's1',
      playerId: 'p1',
      tokenId: issued.tokenId,
    });
  });

  it('gives every token a new token ID', async () => {
    const { tokens } = setup();
    const a = await tokens.signController('ctl_1');
    const b = await tokens.signController('ctl_1');
    expect(a.tokenId).not.toBe(b.tokenId);
  });

  it('never accepts one token type as another', async () => {
    const { tokens } = setup();
    const player = (await tokens.signPlayer({ eventId: 'e1', sessionId: 's1', playerId: 'p1' })).token;
    const join = (await tokens.signJoin({ eventId: 'e1', sessionId: 's1', slotNumber: 1 })).token;
    const controller = (await tokens.signController('ctl_1')).token;

    await expect(tokens.verifyController(player)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyController(join)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyPlayer(controller)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyPlayer(join)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyJoin(controller)).rejects.toBeInstanceOf(InvalidTokenError);
    await expect(tokens.verifyJoin(player)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('refuses tokens signed with another secret, changed, empty or junk', async () => {
    const { clock, tokens } = setup();
    const other = new TokenService('another-secret-that-is-long-enough-000000', clock);
    const foreign = (await other.signController('ctl_1')).token;
    const good = (await tokens.signController('ctl_1')).token;
    const [header, , signature] = good.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'ctl_2' })).toString('base64url');

    for (const bad of [foreign, `${header}.${forgedPayload}.${signature}`, '', 'not-a-token']) {
      await expect(tokens.verifyController(bad)).rejects.toBeInstanceOf(InvalidTokenError);
    }
  });

  it('refuses a controller token with no expiry', async () => {
    const { tokens } = setup();
    const noExpiry = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('prompt-heist')
      .setAudience('controller')
      .setSubject('ctl_1')
      .setJti('t1')
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
    await expect(tokens.verifyController(noExpiry)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('refuses the "none" algorithm', async () => {
    const { tokens } = setup();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none' })}.${encode({ iss: 'prompt-heist', aud: 'controller', sub: 'ctl_1', jti: 't', exp: 9999999999 })}.`;
    await expect(tokens.verifyController(unsigned)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
