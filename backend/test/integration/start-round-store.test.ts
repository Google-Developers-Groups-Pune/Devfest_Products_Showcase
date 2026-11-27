import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { firestoreRoundStore } from '../../src/data/start-round-store.js';
import type { PlayerDoc } from '../../src/data/types.js';
import { closeEmulatorFirestore, describeWithEmulator, emulatorFirestore, seedRound } from '../fixtures/firestore.js';

let db: Firestore;

/** A READY session with a not-yet-started round, an approved treasure and five LOBBY players. */
async function seedReadySession() {
  const seeded = await seedRound(db);
  const { repos, session, round } = seeded;
  const now = Timestamp.fromDate(seeded.clock.now());
  await repos.sessions(session.eventId).update(session.sessionId, { phase: 'READY', startedAt: null });
  await repos.rounds(session).update(round.roundId, { roundStartedAt: null, roundEndAt: null, roundDurationSeconds: 90 });
  await repos.candidates(session).create('candidate-1', {
    visible: { title: 'The Golden Mango', visibleBackstory: 'Barnaby is underpaid.', visibleLockObjective: 'Convince Barnaby.' },
    rubric: { version: 'v1', scoringCriteria: ['a', 'b', 'c'] },
    contentCheck: 'ALLOWED',
    approval: 'APPROVED',
    model: 'fake',
    createdAt: now,
  });
  for (let slot = 1; slot <= 5; slot++) {
    const player: PlayerDoc = {
      sessionId: session.sessionId,
      fullName: `Player ${slot}`,
      firstName: `P${slot}`,
      entranceId: `DF-${slot}`,
      slotNumber: slot,
      state: 'LOBBY',
      connection: 'CONNECTED',
      activeTokenId: null,
    };
    await repos.players(session).create(`ply_${slot}`, player);
  }
  return { ...seeded, store: firestoreRoundStore(repos, session.eventId) };
}

describeWithEmulator('firestoreRoundStore (emulator)', { timeout: 30_000 }, () => {
  beforeAll(() => {
    db = emulatorFirestore();
  });

  afterAll(async () => {
    await closeEmulatorFirestore();
  });

  it('loads what API 10 checks, without the rubric', async () => {
    const { store, session } = await seedReadySession();
    const ctx = await store.loadStart(session.sessionId);
    expect(ctx).toEqual({
      phase: 'READY',
      capacity: 5,
      playerIds: ['ply_1', 'ply_2', 'ply_3', 'ply_4', 'ply_5'],
      round: { roundId: 'round-1', durationSeconds: 90, candidateId: 'candidate-1' },
      treasure: {
        approved: true,
        title: 'The Golden Mango',
        visibleBackstory: 'Barnaby is underpaid.',
        visibleLockObjective: 'Convince Barnaby.',
      },
      confirmedCount: 0,
    });
    expect(JSON.stringify(ctx)).not.toContain('scoringCriteria');
    expect(await store.loadStart('nope')).toBeUndefined();
  });

  it('starts in one transaction: PLAYING, players PLAYING, round times stored', async () => {
    const { store, repos, session, round, clock } = await seedReadySession();
    const startedAt = clock.now();
    const roundEndAt = new Date(startedAt.getTime() + 90_000);
    expect(await store.commitStart(session.sessionId, round.roundId, startedAt)).toEqual({ roundEndAt, durationSeconds: 90 });

    expect((await repos.sessions(session.eventId).get(session.sessionId))?.phase).toBe('PLAYING');
    const stored = await repos.rounds(session).get(round.roundId);
    expect(stored?.roundStartedAt?.toDate()).toEqual(startedAt);
    expect(stored?.roundEndAt?.toDate()).toEqual(roundEndAt);
    const players = await repos.players(session).list();
    expect(players.map((p) => p.data.state)).toEqual(Array(5).fill('PLAYING'));
    expect(await store.listRunning()).toEqual([{ sessionId: session.sessionId, roundId: round.roundId, roundEndAt }]);
  });

  it('reads the duration inside the transaction: a change just before the start is used', async () => {
    const { store, repos, session, round, clock } = await seedReadySession();
    await store.loadStart(session.sessionId); // saw 90
    await repos.rounds(session).update(round.roundId, { roundDurationSeconds: 120 }); // API 6
    const { roundEndAt, durationSeconds } = await store.commitStart(session.sessionId, round.roundId, clock.now());
    expect(durationSeconds).toBe(120);
    expect(roundEndAt).toEqual(new Date(clock.now().getTime() + 120_000));
  });

  it('lets only one of two concurrent starts succeed', async () => {
    const { store, session, round, clock } = await seedReadySession();
    const results = await Promise.allSettled([
      store.commitStart(session.sessionId, round.roundId, clock.now()),
      store.commitStart(session.sessionId, round.roundId, clock.now()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'INVALID_PHASE' } });
  });

  it('ends once: RESULT_PENDING, players RESULT_PENDING, a second end changes nothing', async () => {
    const { store, repos, session, round, clock } = await seedReadySession();
    await store.commitStart(session.sessionId, round.roundId, clock.now());
    await repos.players(session).update('ply_2', { state: 'LOCKED_100' });

    expect(await store.commitEnd(session.sessionId, round.roundId)).toBe(true);
    expect(await store.commitEnd(session.sessionId, round.roundId)).toBe(false);
    expect((await repos.sessions(session.eventId).get(session.sessionId))?.phase).toBe('RESULT_PENDING');
    const players = await repos.players(session).list();
    expect(players.map((p) => p.data.state)).toEqual(Array(5).fill('RESULT_PENDING'));
    expect(await store.listRunning()).toEqual([]);
  });
});
