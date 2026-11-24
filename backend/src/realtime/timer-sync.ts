import type { Clock } from '../core/clock.js';
import type { RealtimeEmitter } from './emitter.js';

export const TIMER_SYNC_INTERVAL_MS = 3000;

export interface TimerSyncRound {
  sessionId: string;
  roundId: string;
  roundEndAt: Date;
}

/**
 * Sends `timer:sync` to all audiences every 3 seconds while a round is PLAYING.
 *
 * BE-20 calls `start` when the round starts, and again on process start for a round
 * still running. BE-24 calls `stop` when the round ends. Ticks also stop by themselves
 * once the clock reaches `roundEndAt`, so a missed `stop` never sends a timer past the end.
 */
export class TimerSyncService {
  private readonly running = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly emitter: RealtimeEmitter,
    private readonly clock: Clock,
    private readonly intervalMs = TIMER_SYNC_INTERVAL_MS,
  ) {}

  /** Starts ticking for the round. Calling it again for the same round restarts it. */
  start(round: TimerSyncRound): void {
    this.stop(round.roundId);
    const roundEndAt = round.roundEndAt.toISOString();
    const handle = setInterval(() => {
      const now = this.clock.now();
      if (now.getTime() >= round.roundEndAt.getTime()) {
        this.stop(round.roundId);
        return;
      }
      this.emitter.toAll(round.sessionId, 'timer:sync', {
        roundId: round.roundId,
        roundEndAt,
        serverNow: now.toISOString(),
      });
    }, this.intervalMs);
    this.running.set(round.roundId, handle);
  }

  stop(roundId: string): void {
    const handle = this.running.get(roundId);
    if (handle) {
      clearInterval(handle);
      this.running.delete(roundId);
    }
  }

  isRunning(roundId: string): boolean {
    return this.running.has(roundId);
  }

  stopAll(): void {
    for (const roundId of [...this.running.keys()]) this.stop(roundId);
  }
}
