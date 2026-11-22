/**
 * Single source of server time. Inject it everywhere time matters
 * (receipt timestamps, roundEndAt, token expiry) so tests can control it
 * instead of sleeping.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Deterministic clock for tests. */
export class FakeClock implements Clock {
  private epochMs: number;

  constructor(start: Date | string = '2026-12-05T10:00:00.000Z') {
    this.epochMs = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.epochMs);
  }

  advance(ms: number): void {
    this.epochMs += ms;
  }

  set(time: Date | string): void {
    this.epochMs = new Date(time).getTime();
  }
}
