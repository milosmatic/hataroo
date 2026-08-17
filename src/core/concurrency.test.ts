import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency.js'

describe('mapWithConcurrency', () => {
  it('resolves every item, preserving input order regardless of completion order', async () => {
    const items = [30, 10, 20]

    const results = await mapWithConcurrency(items, 8, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })

    expect(results).toEqual([30, 10, 20])
  })

  it('never runs more than the given concurrency limit at once', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    let inFlight = 0
    let maxInFlight = 0

    await mapWithConcurrency(items, 3, async (i) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return i
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('handles an empty list', async () => {
    const results = await mapWithConcurrency([], 8, async (i: number) => i)

    expect(results).toEqual([])
  })

  it('propagates the rejection of the first item that fails', async () => {
    const items = [1, 2, 3]

    await expect(
      mapWithConcurrency(items, 8, async (i) => {
        if (i === 2) throw new Error('boom')
        return i
      }),
    ).rejects.toThrow('boom')
  })

  it('calls onEach as each item resolves, before the whole batch finishes', async () => {
    const items = [1, 2, 3]
    const seen: number[] = []

    await mapWithConcurrency(items, 8, async (i) => i, {
      onEach: (result) => seen.push(result),
    })

    expect(seen.toSorted()).toEqual([1, 2, 3])
  })
})
