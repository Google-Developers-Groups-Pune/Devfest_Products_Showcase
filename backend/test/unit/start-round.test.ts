import { pino } from 'pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createFakeAgents } from '../../src/agents/fakes/index.js';
import { AgentHealthService } from '../../src/agents/health.js';
import { createApp } from '../../src/app.js';
import { FakeClock } from '../../src/core/clock.js';
import { AppError } from '../../src/core/errors.js';
import type { SessionPhase } from '../../src/domain/state-machines/index.js';
import type { TimedRound } from '../../src/jobs/round-timer.js';
import type { RealtimeEmitter } from '../../src/realtime/emitter.js';
import {
  ROUND_IMAGE_URL_TTL_SECONDS,
  StartRoundService,
  type RoundStore,
  type StartRoundContext,
} from '../../src/services/start-round.js';

const START = '2026-12-05T10:00:00.000Z';

/** In-memory RoundStore with one session, recording every write in order. */
class MemoryRoundStore implements RoundStore {
  phase: SessionPhase = 'READY';
  ctx: Omit<StartRoundContext, 'phase'> = {
    capacity: 5,
    playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    round: { roundId: 'rnd_1', durationSeconds: 90, candidateId: 'cnd_1' },
    treasure: {
      approved: true,
      title: 'The Golden Mango',
      visibleBackstory: 'Barnaby is underpaid in shrimp.',
      visibleLockObjective: 'Convince Barnaby.',
    },
    confirmedCount: 2,
  };
  roundEndAt: Date | null = null;
  /** The duration as stored when the transaction runs; can differ from what loadStart saw. */
  storedDurationSeconds = 90;
  readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  loadStart(sessionId: string) {
    return Promise.resolve(sessionId === 'ses_1' ? { phase: this.phase, ...this.ctx } : undefined);
  }

  commitStart(_sessionId: string, _roundId: string, startedAt: Date) {
    if (this.phase !== 'READY') return Promise.reject(new AppError(409, 'INVALID_PHASE', 'Not ready'));
    this.phase = 'PLAYING';
    const durationSeconds = this.storedDurationSeconds;
    this.roundEndAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    this.log.push('commitStart');
    return Promise.resolve({ roundEndAt: this.roundEndAt, durationSeconds });
  }

  listRunning(): Promise<TimedRound[]> {
    return Promise.resolve(
      this.phase === 'PLAYING' && this.roundEndAt ? [{ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: this.roundEndAt }] : [],
    );
  }

  commitEnd() {
    if (this.phase !== 'PLAYING') return Promise.resolve(false);
    this.phase = 'RESULT_PENDING';
    this.log.push('commitEnd');
    return Promise.resolve(true);
  }
}

let clock: FakeClock;
let log: string[];
let store: MemoryRoundStore;
let emitted: { event: string; payload: Record<string, unknown> }[];
let connected: Set<string>;
let agentsUp: boolean;
let signFails: boolean;
let timerSync: { start: Mock<(round: TimedRound) => void>; stop: Mock<(roundId: string) => void> };
let services: StartRoundService[];

function service(): StartRoundService {
  const emit = {
    toAll: (_sessionId: string, event: string, payload: Record<string, unknown>) => {
      log.push(`emit ${event}`);
      emitted.push({ event, payload });
    },
  } as unknown as RealtimeEmitter;
  const s = new StartRoundService({
    store,
    images: {
      signedUrl: (_s, candidateId, ttl) =>
        signFails ? Promise.reject(new Error('sign failed')) : Promise.resolve(`https://img/${candidateId}?ttl=${ttl}`),
    },
    agentHealth: { check: () => Promise.resolve({ checkedAt: START, allHealthy: agentsUp, agents: {} as never }) },
    isPlayerConnected: (id) => connected.has(id),
    emit,
    timerSync,
    clock,
    logger: pino({ level: 'silent' }),
  });
  services.push(s);
  return s;
}

/** Moves the injected clock and the timers forward together. */
async function advance(ms: number) {
  for (let done = 0; done < ms; done += 1000) {
    clock.advance(1000);
    await vi.advanceTimersByTimeAsync(1000);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = new FakeClock(START);
  log = [];
  store = new MemoryRoundStore(log);
  emitted = [];
  connected = new Set(['p1', 'p2', 'p3', 'p4', 'p5']);
  agentsUp = true;
  signFails = false;
  timerSync = { start: vi.fn<(round: TimedRound) => void>(), stop: vi.fn<(roundId: string) => void>() };
  services = [];
});

afterEach(() => {
  for (const s of services) s.stop();
  vi.useRealTimers();
});

describe('StartRoundService.start (API 10)', () => {
  it('sets roundEndAt = now + duration, stores it before emitting, and returns the round', async () => {
    const result = await service().start('ses_1');

    expect(result).toEqual({
      round: {
        roundId: 'rnd_1',
        roundNumber: 3,
        durationSeconds: 90,
        startedAt: START,
        roundEndAt: '2026-12-05T10:01:30.000Z',
        serverNow: START,
      },
    });
    expect(store.phase).toBe('PLAYING');
    expect(log).toEqual(['commitStart', 'emit phase:changed', 'emit round:started']);
  });

  it('sends phase:changed, then round:started with the card and a 4-hour image URL, never the rubric', async () => {
    await service().start('ses_1');
    expect(emitted[0]).toEqual({
      event: 'phase:changed',
      payload: { sessionId: 'ses_1', phase: 'PLAYING', previousPhase: 'READY', at: START },
    });
    expect(emitted[1]?.payload).toMatchObject({
      roundId: 'rnd_1',
      roundNumber: 3,
      treasure: {
        treasureId: 'cnd_1',
        title: 'The Golden Mango',
        backstory: 'Barnaby is underpaid in shrimp.',
        lockObjective: 'Convince Barnaby.',
        imageUrl: `https://img/cnd_1?ttl=${ROUND_IMAGE_URL_TTL_SECONDS}`,
      },
    });
    expect(ROUND_IMAGE_URL_TTL_SECONDS).toBe(4 * 60 * 60);
    expect(JSON.stringify(emitted)).not.toMatch(/rubric|scoringCriteria/i);
  });

  it('uses the duration stored at the moment of the start, even if it changed just before', async () => {
    store.storedDurationSeconds = 120; // API 6 changed it after loadStart read 90
    const { round } = await service().start('ses_1');
    expect(round).toMatchObject({ durationSeconds: 120, roundEndAt: '2026-12-05T10:02:00.000Z' });
    expect(emitted[1]?.payload).toMatchObject({ durationSeconds: 120, roundEndAt: '2026-12-05T10:02:00.000Z' });
  });

  it('shows confirmedCount + 1 as the round number (D35)', async () => {
    store.ctx.confirmedCount = 0;
    expect((await service().start('ses_1')).round.roundNumber).toBe(1);
  });

  it('starts timer:sync for the round', async () => {
    await service().start('ses_1');
    expect(timerSync.start).toHaveBeenCalledWith({
      sessionId: 'ses_1',
      roundId: 'rnd_1',
      roundEndAt: new Date('2026-12-05T10:01:30.000Z'),
    });
  });

  it.each<[string, () => void, number, string]>([
    ['an unknown session', () => undefined, 404, 'NOT_FOUND'],
    ['a session that is not READY', () => (store.phase = 'TREASURE_REVIEW'), 409, 'INVALID_PHASE'],
    ['no approved treasure', () => (store.ctx.treasure = { ...store.ctx.treasure!, approved: false }), 409, 'TREASURE_NOT_APPROVED'],
    ['no round', () => (store.ctx.round = null), 409, 'TREASURE_NOT_APPROVED'],
    ['a treasure with no title', () => (store.ctx.treasure = { ...store.ctx.treasure!, title: '' }), 409, 'TREASURE_NOT_APPROVED'],
    ['a missing player', () => (store.ctx.playerIds = ['p1', 'p2', 'p3', 'p4']), 409, 'PLAYERS_NOT_READY'],
    ['a disconnected player', () => connected.delete('p3'), 409, 'PLAYERS_NOT_READY'],
    ['an agent down', () => (agentsUp = false), 503, 'AGENTS_UNAVAILABLE'],
  ])('refuses %s, changing nothing', async (_case, setup, status, code) => {
    setup();
    const sessionId = code === 'NOT_FOUND' ? 'ses_x' : 'ses_1';
    await expect(service().start(sessionId)).rejects.toMatchObject({ status, code });
    expect(log).toEqual([]);
    expect(timerSync.start).not.toHaveBeenCalled();
  });

  it('changes nothing if the image URL cannot be signed', async () => {
    signFails = true;
    await expect(service().start('ses_1')).rejects.toThrow('sign failed');
    expect(store.phase).toBe('READY');
    expect(log).toEqual([]);
  });

  it('lets only one of two starts succeed', async () => {
    const s = service();
    const results = await Promise.allSettled([s.start('ses_1'), s.start('ses_1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'INVALID_PHASE' } });
    expect(emitted.filter((e) => e.event === 'round:started')).toHaveLength(1);
  });
});

describe('round end', () => {
  it('ends the round at roundEndAt: round:ended, then phase RESULT_PENDING', async () => {
    await service().start('ses_1');
    emitted = [];
    await advance(89_000);
    expect(emitted).toEqual([]);
    await advance(1000);
    expect(store.phase).toBe('RESULT_PENDING');
    expect(emitted).toEqual([
      { event: 'round:ended', payload: { roundId: 'rnd_1', endedAt: '2026-12-05T10:01:30.000Z' } },
      {
        event: 'phase:changed',
        payload: { sessionId: 'ses_1', phase: 'RESULT_PENDING', previousPhase: 'PLAYING', at: '2026-12-05T10:01:30.000Z' },
      },
    ]);
    expect(timerSync.stop).toHaveBeenCalledWith('rnd_1');
  });

  it('QE: the instance is killed 30 seconds in; the new one ends the round on time', async () => {
    const first = service();
    await first.start('ses_1');
    await advance(30_000);
    first.stop(); // the process dies: its timers are gone

    const second = service();
    expect(await second.recoverTimers()).toBe(1);
    emitted = [];
    await advance(59_000);
    expect(store.phase).toBe('PLAYING');
    await advance(1000);
    expect(store.phase).toBe('RESULT_PENDING');
    expect(emitted[0]).toEqual({ event: 'round:ended', payload: { roundId: 'rnd_1', endedAt: '2026-12-05T10:01:30.000Z' } });
  });

  it('ends the round at once on restart if roundEndAt has already passed', async () => {
    const first = service();
    await first.start('ses_1');
    first.stop();
    clock.advance(5 * 60 * 1000); // down for five minutes

    await service().recoverTimers();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.phase).toBe('RESULT_PENDING');
  });

  it('does not emit twice if the round has already ended', async () => {
    const s = service();
    await s.start('ses_1');
    await advance(90_000);
    emitted = [];
    s.timer.arm({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: new Date(START) });
    await vi.advanceTimersByTimeAsync(0);
    expect(emitted).toEqual([]);
  });
});

describe('POST /api/controller/sessions/:id/start', () => {
  function app(rounds: StartRoundService) {
    vi.useRealTimers();
    return createApp({
      clock,
      logger: pino({ level: 'silent' }),
      corsOrigins: [],
      agentHealth: new AgentHealthService(createFakeAgents(), clock),
      rounds,
    });
  }

  it('returns 200 with the round', async () => {
    const res = await request(app(service())).post('/api/controller/sessions/ses_1/start');
    expect(res.status).toBe(200);
    expect(res.body.round).toMatchObject({ roundId: 'rnd_1', roundNumber: 3, durationSeconds: 90 });
  });

  it('returns the shared error body when refused', async () => {
    connected.delete('p1');
    const res = await request(app(service())).post('/api/controller/sessions/ses_1/start');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PLAYERS_NOT_READY' });
    expect(res.body.error.correlationId).toEqual(expect.any(String));
  });
});

describe('latestStarted', () => {
  it('picks the most recently started round, ignoring rounds that never started', async () => {
    const { latestStarted } = await import('../../src/data/start-round-store.js');
    const { Timestamp } = await import('firebase-admin/firestore');
    const round = (id: string, startedMs: number | null) => ({
      id,
      data: {
        sessionId: 'ses_1',
        candidateId: 'cnd_1',
        roundDurationSeconds: 90,
        roundStartedAt: startedMs === null ? null : Timestamp.fromMillis(startedMs),
        roundEndAt: startedMs === null ? null : Timestamp.fromMillis(startedMs + 90_000),
        replacesRoundId: null,
        promptCounter: 0,
      },
    });
    expect(latestStarted([round('old', 1000), round('new', 5000), round('unstarted', null)])?.id).toBe('new');
    expect(latestStarted([round('unstarted', null)])).toBeUndefined();
  });
});
