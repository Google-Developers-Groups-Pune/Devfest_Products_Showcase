import { afterAll, beforeAll, expect, it } from 'vitest';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { entranceIdDocId } from '../../src/data/ids.js';
import { DocumentNotFoundError, DuplicateDocumentError } from '../../src/data/repositories/index.js';
import { closeEmulatorFirestore, describeWithEmulator, emulatorFirestore, seedRound } from '../fixtures/firestore.js';

let db: Firestore;

// The emulator is much slower than real Firestore when many writes hit one
// document at once, so these tests get extra time on slower laptops.
describeWithEmulator('Firestore repositories (emulator)', { timeout: 30_000 }, () => {
  beforeAll(() => {
    db = emulatorFirestore();
  });

  afterAll(async () => {
    await closeEmulatorFirestore();
  });

  it('50 concurrent prompts get 50 unique sequence numbers, 1 to 50', async () => {
    const { repos, round } = await seedRound(db);
    const prompts = repos.prompts(round);

    const created = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        prompts.create({ playerId: `p${i % 5}`, idempotencyKey: `key-${i}`, rawText: `prompt ${i}` }),
      ),
    );

    const sequences = created.map((c) => c.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect((await repos.rounds(round).get(round.roundId))?.promptCounter).toBe(50);
    expect(await prompts.list()).toHaveLength(50);
  });

  it('a duplicate prompt fails and does not use up a sequence number', async () => {
    const { repos, round } = await seedRound(db);
    const prompts = repos.prompts(round);

    const first = await prompts.create({ playerId: 'p1', idempotencyKey: 'same', rawText: 'hello' });
    await expect(prompts.create({ playerId: 'p1', idempotencyKey: 'same', rawText: 'hello' })).rejects.toBeInstanceOf(
      DuplicateDocumentError,
    );

    expect(first.sequence).toBe(1);
    expect((await repos.rounds(round).get(round.roundId))?.promptCounter).toBe(1);
    expect(await prompts.get(first.promptId)).toMatchObject({ sequence: 1, status: 'RECEIVED', playerId: 'p1' });
  });

  it('stores the server receipt time from the injected clock', async () => {
    const { repos, round, clock } = await seedRound(db);
    const created = await repos.prompts(round).create({ playerId: 'p1', idempotencyKey: 'k', rawText: 'x' });
    const stored = await repos.prompts(round).get(created.promptId);
    expect(stored?.receivedAt.toDate().toISOString()).toBe(clock.now().toISOString());
  });

  it('refuses a prompt for a round that does not exist', async () => {
    const { repos, round } = await seedRound(db);
    await expect(
      repos.prompts({ ...round, roundId: 'missing' }).create({ playerId: 'p1', idempotencyKey: 'k', rawText: 'x' }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it('an entrance ID can be reserved once, ignoring case and spaces', async () => {
    const { repos, session } = await seedRound(db);
    const entranceIds = repos.entranceIds(session.eventId);

    await entranceIds.reserve({ entranceId: 'DF/2026-07', sessionId: session.sessionId, playerId: 'p1' });
    await expect(
      entranceIds.reserve({ entranceId: '  df/2026-07 ', sessionId: session.sessionId, playerId: 'p2' }),
    ).rejects.toBeInstanceOf(DuplicateDocumentError);

    expect(entranceIds.ref('df/2026-07').id).toBe(entranceIdDocId('DF/2026-07'));
    expect(await entranceIds.get('df/2026-07')).toEqual({
      entranceId: 'DF/2026-07',
      sessionId: session.sessionId,
      playerId: 'p1',
      status: 'RESERVED',
    });

    await entranceIds.markUsed('DF/2026-07');
    expect((await entranceIds.get('DF/2026-07'))?.status).toBe('USED');
  });

  it('only one of 10 players racing for the same entrance ID wins', async () => {
    const { repos, session } = await seedRound(db);
    const entranceIds = repos.entranceIds(session.eventId);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        entranceIds.reserve({ entranceId: 'RACE-1', sessionId: session.sessionId, playerId: `p${i}` }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(9);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(DuplicateDocumentError);
  });

  it('create() refuses to overwrite and the single docs read back', async () => {
    const { repos, round, clock } = await seedRound(db);
    const event = { status: 'OPEN' as const, createdAt: Timestamp.fromDate(clock.now()), closedAt: null, controllerId: 'x' };
    await expect(repos.events.create(round.eventId, event)).rejects.toBeInstanceOf(DuplicateDocumentError);

    await repos.result(round).set({
      roundId: round.roundId,
      ranking: [],
      winnerPlayerId: null,
      bestScore: null,
      decidingPromptId: null,
      tieBreak: null,
      confirmation: 'PROVISIONAL',
    });
    expect((await repos.result(round).get())?.confirmation).toBe('PROVISIONAL');
    expect(repos.result(round).ref.path).toBe(
      `events/${round.eventId}/sessions/${round.sessionId}/rounds/${round.roundId}/result/current`,
    );
  });
});
