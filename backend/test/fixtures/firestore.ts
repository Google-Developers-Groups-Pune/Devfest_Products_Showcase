import { randomUUID } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { describe } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import type { RoundRef, SessionRef } from '../../src/data/paths.js';
import { createRepositories, type Repositories } from '../../src/data/repositories/index.js';

/**
 * Shared Firestore emulator fixtures (BE-03). Use them in test/integration.
 * Tests run only under `npm run test:emulator`, which sets
 * FIRESTORE_EMULATOR_HOST. Plain `npm test` skips them.
 */
export const emulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
export const describeWithEmulator = emulatorRunning ? describe : describe.skip;

/** The demo project used by `npm run test:emulator`. Never a real project. */
const PROJECT_ID = 'demo-prompt-heist';

export function emulatorFirestore(): Firestore {
  // The emulator needs no Google credentials. This stops a slow lookup of
  // the cloud metadata server (the MetadataLookupWarning) on laptops.
  process.env.METADATA_SERVER_DETECTION ??= 'none';
  const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  return getFirestore(app);
}

export async function closeEmulatorFirestore(): Promise<void> {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

export interface SeededRound {
  repos: Repositories;
  clock: FakeClock;
  session: SessionRef;
  round: RoundRef;
}

/**
 * Seeds a fresh event, session and round under new random IDs, so tests
 * never share data and need no cleanup between them.
 */
export async function seedRound(db: Firestore): Promise<SeededRound> {
  const clock = new FakeClock();
  const repos = createRepositories(db, clock);
  const now = Timestamp.fromDate(clock.now());
  const eventId = `test-${randomUUID()}`;
  const session = { eventId, sessionId: 'session-1' };
  const round = { ...session, roundId: 'round-1' };

  await repos.events.create(eventId, { status: 'OPEN', createdAt: now, closedAt: null, controllerId: 'ctl_1' });
  await repos.sessions(eventId).create(session.sessionId, {
    capacity: 5,
    phase: 'PLAYING',
    createdAt: now,
    startedAt: now,
    endedAt: null,
    controllerId: 'ctl_1',
  });
  await repos.rounds(session).create(round.roundId, {
    sessionId: session.sessionId,
    candidateId: 'candidate-1',
    roundDurationSeconds: 120,
    roundStartedAt: now,
    roundEndAt: null,
    replacesRoundId: null,
    promptCounter: 0,
  });

  return { repos, clock, session, round };
}
