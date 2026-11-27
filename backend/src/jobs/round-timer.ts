import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';

/**
 * `setTimeout` misfires above 2^31 - 1 ms (about 24.8 days) and the round duration has no
 * maximum (BE-20), so a long timer is armed in steps of at most one day. Each step re-reads
 * the clock, so the round ends at `roundEndAt` however long it is.
 */
export const MAX_TIMER_STEP_MS = 24 * 60 * 60 * 1000;

/** If ending the round fails (for example Firestore is briefly down), try again after this. */
export const END_RETRY_MS = 2000;

export interface TimedRound {
  sessionId: string;
  roundId: string;
  roundEndAt: Date;
}

/**
 * The one authoritative round clock (BE-20). Calls `onEnd` once the injected clock reaches
 * `roundEndAt`, or straight away if that time has already passed (a restart after the end).
 * `onEnd` must be safe to call twice: it is retried until it succeeds.
 */
export class RoundTimer {
  private readonly armed = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly clock: Clock,
    private readonly onEnd: (round: TimedRound) => Promise<void>,
    private readonly logger: Logger,
    private readonly maxStepMs = MAX_TIMER_STEP_MS,
    private readonly retryMs = END_RETRY_MS,
  ) {}

  /** Arms the timer for a round. Arming the same round again replaces the old timer. */
  arm(round: TimedRound): void {
    this.cancel(round.roundId);
    this.schedule(round);
  }

  cancel(roundId: string): void {
    const handle = this.armed.get(roundId);
    if (handle) {
      clearTimeout(handle);
      this.armed.delete(roundId);
    }
  }

  isArmed(roundId: string): boolean {
    return this.armed.has(roundId);
  }

  cancelAll(): void {
    for (const roundId of [...this.armed.keys()]) this.cancel(roundId);
  }

  private remaining(round: TimedRound): number {
    return round.roundEndAt.getTime() - this.clock.now().getTime();
  }

  private schedule(round: TimedRound): void {
    const remaining = this.remaining(round);
    const delay = remaining <= 0 ? 0 : Math.min(remaining, this.maxStepMs);
    const handle = setTimeout(() => {
      // Re-read the clock on every wake: a step may have ended, or the timer fired early.
      if (this.remaining(round) <= 0) void this.end(round);
      else this.schedule(round);
    }, delay);
    this.armed.set(round.roundId, handle);
  }

  private async end(round: TimedRound): Promise<void> {
    try {
      await this.onEnd(round);
      this.armed.delete(round.roundId);
    } catch (err) {
      // The round must end: keep trying while the process lives. A restart recovers it too.
      this.logger.error({ err, roundId: round.roundId }, 'Could not end the round, retrying');
      if (!this.armed.has(round.roundId)) return; // cancelled meanwhile
      this.armed.set(
        round.roundId,
        setTimeout(() => void this.end(round), this.retryMs),
      );
    }
  }
}
