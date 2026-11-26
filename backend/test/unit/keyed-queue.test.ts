import { describe, expect, it } from 'vitest';
import { createKeyedQueue } from '../../src/data/repositories/keyed-queue.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('createKeyedQueue', () => {
  it('runs tasks with the same key one at a time, in call order', async () => {
    const queue = createKeyedQueue();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;

    await Promise.all(
      [1, 2, 3].map((n) =>
        queue('round-1', async () => {
          running += 1;
          maxRunning = Math.max(maxRunning, running);
          log.push(`start ${n}`);
          await tick();
          log.push(`end ${n}`);
          running -= 1;
        }),
      ),
    );

    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
  });

  it('keeps going after a task fails, and passes the error to that caller only', async () => {
    const queue = createKeyedQueue();
    const failed = queue('k', () => Promise.reject(new Error('boom')));
    const next = queue('k', async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('runs different keys in parallel', async () => {
    const queue = createKeyedQueue();
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await tick();
      running -= 1;
    };

    await Promise.all([queue('a', task), queue('b', task)]);
    expect(maxRunning).toBe(2);
  });
});
