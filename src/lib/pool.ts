/**
 * Bounded concurrency pool — run async work with at most `limit` in flight.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const n = items.length;
  if (n === 0) return [];
  const results = new Array<R>(n);
  let next = 0;
  const workers = Math.max(1, Math.min(limit, n));

  async function run() {
    for (;;) {
      const i = next++;
      if (i >= n) return;
      results[i] = await worker(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}
