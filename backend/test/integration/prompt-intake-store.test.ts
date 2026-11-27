import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { firestorePromptIntakeStore } from '../../src/data/prompt-intake-store.js';
import type { PlayerDoc } from '../../src/data/types.js';
import type { PlayerRef } from '../../src/services/prompt-intake.js';
import { closeEmulatorFirestore, describeWithEmulator, emulatorFirestore, seedRound } from '../fixtures/firestore.js';

let db: Firestore;

const START = new Date('2026-12-05T10:00:00.000Z');
const END = new Date('2026-12-05T10:01:30.000Z');
const at = (offsetMs: number) => new Date(END.getTime() + offsetMs);

/** A PLAYING session whose round runs from START to END, with five PLAYING players. */
async function seedPlayingRound() {
  const seeded = await seedRound(db);
  const { repos, session, round } = seeded;
  await repos.rounds(session).update(round.roundId, {
    roundStartedAt: Timestamp.fromDate(START),
    roundEndAt: Timestamp.fromDate(END),
  });
  for (let slot = 1; slot <= 5; slot++) {
    const player: PlayerDoc = {
      sessionId: session.sessionId,
      fullName: `Player ${slot}`,
      firstName: `P${slot}`,
      entranceId: `DF-${slot}`,
      slotNumber: slot,
      state: 'PLAYING',
      connection: 'CONNECTED',
      activeTokenId: null,
    };
    await repos.players(session).create(`ply_${slot}`, player);
  }
  const player = (slot: number): PlayerRef => ({ eventId: session.eventId, sessionId: session.sessionId, playerId: `ply_${slot}` });
  return { ...seeded, store: firestorePromptIntakeStore(repos), player };
}

describeWithEmulator('firestorePromptIntakeStore (emulator)', { timeout: 60_000 }, () => {
  beforeAll(() => {
    db = emulatorFirestore();
  });

  afterAll(async () => {
    await closeEmulatorFirestore();
  });

  it('QE: accepts at roundEndAt minus 1 ms, refuses exactly at roundEndAt', async () => {
    const { store, player } = await seedPlayingRound();
    await expect(store.create(player(1), { idempotencyKey: 'k1', text: 'in time', receivedAt: at(-1) })).resolves.toMatchObject({
      created: true,
      receipt: { status: 'RECEIVED', sequence: 1, receivedAt: at(-1).toISOString() },
    });
    await expect(store.create(player(1), { idempotencyKey: 'k2', text: 'too late', receivedAt: at(0) })).rejects.toMatchObject({
      code: 'ROUND_EXPIRED',
    });
  });

  it('QE: 100 concurrent submissions get 100 unique sequence numbers', async () => {
    const { store, player } = await seedPlayingRound();
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        store.create(player((i % 5) + 1), { idempotencyKey: `key-${i}`, text: `prompt ${i}`, receivedAt: at(-5000) }),
      ),
    );
    const sequences = results.map((r) => r.receipt.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it('returns the stored prompt for a repeated key, with no new sequence number', async () => {
    const { store, repos, round, player } = await seedPlayingRound();
    const first = await store.create(player(1), { idempotencyKey: 'same', text: 'hello', receivedAt: at(-3000) });
    await repos.prompts(round).update(first.receipt.promptId, { status: 'SCORED' });

    // Even after the round has ended, a retry gets the stored answer.
    const again = await store.create(player(1), { idempotencyKey: 'same', text: 'hello', receivedAt: at(5000) });
    expect(again).toEqual({ created: false, roundId: round.roundId, receipt: { ...first.receipt, status: 'SCORED' } });
    expect((await repos.rounds(round).get(round.roundId))?.promptCounter).toBe(1);
  });

  it('refuses a locked player, and a session that is not playing, storing nothing', async () => {
    const { store, repos, session, round, player } = await seedPlayingRound();
    await repos.players(session).update('ply_2', { state: 'LOCKED_100' });
    await expect(store.create(player(2), { idempotencyKey: 'a', text: 'x', receivedAt: at(-1000) })).rejects.toMatchObject({
      code: 'PLAYER_LOCKED',
    });
    await repos.sessions(session.eventId).update(session.sessionId, { phase: 'DISCARDED' });
    await expect(store.create(player(1), { idempotencyKey: 'b', text: 'x', receivedAt: at(-1000) })).rejects.toMatchObject({
      code: 'ROUND_NOT_PLAYING',
    });
    expect(await repos.prompts(round).list()).toEqual([]);
    expect((await repos.rounds(round).get(round.roundId))?.promptCounter).toBe(0);
  });

  it('accepts a prompt received before the end even when the round end has already run', async () => {
    const { store, repos, session, player } = await seedPlayingRound();
    await repos.sessions(session.eventId).update(session.sessionId, { phase: 'RESULT_PENDING' });
    await repos.players(session).update('ply_1', { state: 'RESULT_PENDING' });
    await expect(store.create(player(1), { idempotencyKey: 'late-commit', text: 'x', receivedAt: at(-1) })).resolves.toMatchObject({
      created: true,
    });
  });

  it('refuses when no round has started', async () => {
    const { store, repos, session, round, player } = await seedPlayingRound();
    await repos.rounds(session).update(round.roundId, { roundStartedAt: null, roundEndAt: null });
    await expect(store.create(player(1), { idempotencyKey: 'c', text: 'x', receivedAt: at(-1000) })).rejects.toMatchObject({
      code: 'ROUND_NOT_PLAYING',
    });
  });
});
