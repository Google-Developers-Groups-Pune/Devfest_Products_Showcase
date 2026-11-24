import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';
import type { RealtimeEmitter } from '../../src/realtime/emitter.js';
import { TimerSyncService } from '../../src/realtime/timer-sync.js';

const START = '2026-12-05T10:00:00.000Z';
const END = new Date('2026-12-05T10:00:10.000Z');

let clock: FakeClock;
let toAll: ReturnType<typeof vi.fn>;
let timer: TimerSyncService;

/** Moves the injected clock and the interval timer forward together, 1 ms at a time. */
function advance(ms: number) {
  for (let i = 0; i < ms; i++) {
    clock.advance(1);
    vi.advanceTimersByTime(1);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = new FakeClock(START);
  toAll = vi.fn();
  timer = new TimerSyncService({ toAll } as unknown as RealtimeEmitter, clock);
});

afterEach(() => {
  timer.stopAll();
  vi.useRealTimers();
});

describe('TimerSyncService', () => {
  it('sends timer:sync to all every 3 seconds with the server time', () => {
    timer.start({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: END });
    advance(2999);
    expect(toAll).not.toHaveBeenCalled();

    advance(1);
    advance(3000);
    expect(toAll.mock.calls).toEqual([
      ['ses_1', 'timer:sync', { roundId: 'rnd_1', roundEndAt: END.toISOString(), serverNow: '2026-12-05T10:00:03.000Z' }],
      ['ses_1', 'timer:sync', { roundId: 'rnd_1', roundEndAt: END.toISOString(), serverNow: '2026-12-05T10:00:06.000Z' }],
    ]);
  });

  it('stops by itself at roundEndAt', () => {
    timer.start({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: END });
    advance(30_000);
    expect(toAll).toHaveBeenCalledTimes(3); // 3 s, 6 s, 9 s
    expect(timer.isRunning('rnd_1')).toBe(false);
  });

  it('stops when asked', () => {
    timer.start({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: END });
    advance(3000);
    timer.stop('rnd_1');
    advance(6000);
    expect(toAll).toHaveBeenCalledTimes(1);
  });

  it('restarts instead of ticking twice when started again for the same round', () => {
    timer.start({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: END });
    timer.start({ sessionId: 'ses_1', roundId: 'rnd_1', roundEndAt: END });
    advance(3000);
    expect(toAll).toHaveBeenCalledTimes(1);
  });
});
