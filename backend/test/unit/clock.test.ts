import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/core/clock.js';

describe('FakeClock', () => {
  it('starts at the given time and advances on demand', () => {
    const clock = new FakeClock('2026-12-05T10:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-12-05T10:00:00.000Z');
    clock.advance(1_500);
    expect(clock.now().toISOString()).toBe('2026-12-05T10:00:01.500Z');
    clock.set('2026-12-05T11:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-12-05T11:00:00.000Z');
  });
});
