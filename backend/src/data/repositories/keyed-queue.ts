/**
 * Runs tasks that share a key one after another, in the order they were
 * called. Tasks with different keys still run in parallel.
 */
export type KeyedQueue = <T>(key: string, task: () => Promise<T>) => Promise<T>;

export function createKeyedQueue(): KeyedQueue {
  const tails = new Map<string, Promise<void>>();

  return (key, task) => {
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
