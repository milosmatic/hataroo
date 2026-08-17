export interface MapWithConcurrencyOptions<T, R> {
  /** Called with each item's result as soon as it resolves, before the whole batch finishes. */
  onEach?: (result: R, item: T, index: number) => void
}

/**
 * Maps `items` through `fn`, running at most `limit` calls concurrently.
 * Results preserve input order regardless of completion order.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options: MapWithConcurrencyOptions<T, R> = {},
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      const item = items[index] as T
      const result = await fn(item, index)
      results[index] = result
      options.onEach?.(result, item, index)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)

  return results
}
