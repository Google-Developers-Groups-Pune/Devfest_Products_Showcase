import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import type { PlayerDoc, SessionDoc } from '../../src/data/types.js';
import { createTestAuth } from '../fixtures/auth.js';

async function setup(phase: SessionDoc['phase'] = 'PLAYING') {
  const clock = new FakeClock();
  const auth = createTestAuth(clock);
  const now = Timestamp.fromDate(clock.now());
  auth.players.sessions.set('e1/s1', {
    capacity: 5,
    phase,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    controllerId: 'ctl_1',
  });
  const issued = await auth.tokens.signPlayer({ eventId: 'e1', sessionId: 's1', playerId: 'p1' });
  const player: PlayerDoc = {
    sessionId: 's1',
    fullName: 'Test Player',
    firstName: 'Test',
    entranceId: 'T-1',
    slotNumber: 1,
    state: 'LOBBY',
    connection: 'CONNECTED',
    activeTokenId: issued.tokenId,
  };
  auth.players.players.set('e1/s1/p1', player);
  return { auth, clock, token: issued.token, player };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'OK',
    (error: { status?: number; code?: string }) => `${error.status} ${error.code}`,
  );

describe('PlayerAuthService.authenticate', () => {
  it('accepts the active token', async () => {
    const { auth, token } = await setup();
    await expect(auth.playerAuth.authenticate(token)).resolves.toMatchObject({ playerId: 'p1', sessionId: 's1' });
  });

  it('401 TOKEN_SUPERSEDED after the player rejoins elsewhere', async () => {
    const { auth, token, player } = await setup();
    player.activeTokenId = 'a-newer-token-id';
    expect(await codeOf(auth.playerAuth.authenticate(token))).toBe('401 TOKEN_SUPERSEDED');
  });

  it('401 SESSION_CLOSED once the session is closed', async () => {
    const { auth, token } = await setup('CLOSED');
    expect(await codeOf(auth.playerAuth.authenticate(token))).toBe('401 SESSION_CLOSED');
  });

  it('401 UNAUTHENTICATED for junk, a controller token, or a missing player', async () => {
    const { auth, token } = await setup();
    const controllerToken = (await auth.tokens.signController('ctl_1')).token;
    expect(await codeOf(auth.playerAuth.authenticate(''))).toBe('401 UNAUTHENTICATED');
    expect(await codeOf(auth.playerAuth.authenticate('junk'))).toBe('401 UNAUTHENTICATED');
    expect(await codeOf(auth.playerAuth.authenticate(controllerToken))).toBe('401 UNAUTHENTICATED');
    auth.players.players.clear();
    expect(await codeOf(auth.playerAuth.authenticate(token))).toBe('401 UNAUTHENTICATED');
  });
});

describe('PlayerAuthService.authenticateJoin', () => {
  it('accepts a fresh join token and refuses it after 5 minutes', async () => {
    const { auth, clock } = await setup();
    const { token } = await auth.tokens.signJoin({ eventId: 'e1', sessionId: 's1', slotNumber: 2 });
    await expect(auth.playerAuth.authenticateJoin(token)).resolves.toMatchObject({ slotNumber: 2 });
    clock.advance(5 * 60 * 1000);
    expect(await codeOf(auth.playerAuth.authenticateJoin(token))).toBe('401 JOIN_TOKEN_EXPIRED');
  });

  it('refuses a player token as a join token', async () => {
    const { auth, token } = await setup();
    expect(await codeOf(auth.playerAuth.authenticateJoin(token))).toBe('401 JOIN_TOKEN_EXPIRED');
  });
});
