import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import { MAX_TIMER_STEP_MS, RoundTimer, type TimedRound } from '../../src/jobs/round-timer.js';

const START = '2026-12-05T10:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;

let clock: FakeClock;
let ended: TimedRound[];
let onEnd: (round: TimedRound) => Promise<void>;
let timer: RoundTimer;

/** Moves the injected clock and the timers forward together. */
async function advance(ms: number, step = 1000) {
  for (let done = 0; done < ms; done += step) {
    const by = Math.min(step, ms - done);
    clock.advance(by);
    await vi.advanceTimersByTimeAsync(by);
  }
}

const round = (endsInMs: number, roundId = 'rnd_1'): TimedRound => ({
  sessionId: 'ses_1',
  roundId,
  roundEndAt: new Date(clock.now().getTime() + endsInMs),
});

beforeEach(() => {
  vi.useFakeTimers();
  clock = new FakeClock(START);
  ended = [];
  onEnd = (r) => {
    ended.push(r);
    return Promise.resolve();
  };
  timer = new RoundTimer(clock, (r) => onEnd(r), pino({ level: 'silent' }));
});

afterEach(() => {
  timer.cancelAll();
  vi.useRealTimers();
});

describe('RoundTimer', () => {
  it('ends the round at roundEndAt, not before', async () => {
    timer.arm(round(90_000));
    await advance(89_000);
    expect(ended).toHaveLength(0);
    await advance(1000);
    expect(ended.map((r) => r.roundId)).toEqual(['rnd_1']);
    expect(timer.isArmed('rnd_1')).toBe(false);
  });

  it('ends at once when roundEndAt has already passed (restart after the end)', async () => {
    timer.arm(round(-5000));
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).toHaveLength(1);
  });

  it('arms a 40-day round in steps of at most one day, and still ends on time', async () => {
    const delays: number[] = [];
    const real = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      return real(fn, ms);
    }) as typeof setTimeout);

    timer.arm(round(40 * DAY));
    await advance(40 * DAY - 1000, DAY / 4);
    expect(ended).toHaveLength(0);
    await advance(1000);
    expect(ended).toHaveLength(1);
    expect(Math.max(...delays)).toBeLessThanOrEqual(MAX_TIMER_STEP_MS);
    spy.mockRestore();
  });

  it('replaces the timer when the same round is armed again', async () => {
    timer.arm(round(10_000));
    timer.arm(round(20_000));
    await advance(30_000);
    expect(ended).toHaveLength(1);
  });

  it('does nothing once cancelled', async () => {
    timer.arm(round(10_000));
    timer.cancel('rnd_1');
    await advance(20_000);
    expect(ended).toHaveLength(0);
  });

  it('keeps retrying until ending the round succeeds', async () => {
    let failures = 2;
    onEnd = (r) => {
      if (failures-- > 0) return Promise.reject(new Error('Firestore unavailable'));
      ended.push(r);
      return Promise.resolve();
    };
    timer.arm(round(1000));
    await advance(1000);
    expect(ended).toHaveLength(0);
    await advance(4000);
    expect(ended).toHaveLength(1);
    expect(timer.isArmed('rnd_1')).toBe(false);
  });

  it('stops retrying when cancelled', async () => {
    onEnd = () => Promise.reject(new Error('down'));
    timer.arm(round(1000));
    await advance(1000);
    timer.cancel('rnd_1');
    await advance(10_000);
    expect(timer.isArmed('rnd_1')).toBe(false);
  });
});
