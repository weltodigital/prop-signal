import { describe, expect, it } from 'vitest'
import { TokenBucket } from '@/lib/propertydata/rate-limiter'

/** A controllable clock, so the tests do not actually wait. */
function harness(capacity: number, windowMs = 10_000) {
  let time = 0
  const waits: number[] = []

  const bucket = new TokenBucket(
    capacity,
    windowMs,
    () => time,
    async (ms) => {
      waits.push(ms)
      time += ms
    },
  )

  return { bucket, waits, advance: (ms: number) => (time += ms), time: () => time }
}

describe('TokenBucket', () => {
  it('lets a full bucket through without waiting', async () => {
    const { bucket, waits } = harness(4)

    for (let i = 0; i < 4; i += 1) await bucket.take()

    expect(waits).toEqual([])
  })

  it('makes the caller wait once the bucket is empty', async () => {
    const { bucket, waits } = harness(4)

    for (let i = 0; i < 5; i += 1) await bucket.take()

    expect(waits.length).toBeGreaterThan(0)
  })

  it('holds a run to the plan limit over the window', async () => {
    // Four per ten seconds is the slowest plan. Twelve requests must take at
    // least two further windows.
    const { bucket, time } = harness(4)

    for (let i = 0; i < 12; i += 1) await bucket.take()

    expect(time()).toBeGreaterThanOrEqual(20_000)
  })

  it('refills as time passes', async () => {
    const { bucket, advance } = harness(4)

    for (let i = 0; i < 4; i += 1) await bucket.take()
    expect(bucket.available()).toBeLessThan(1)

    advance(10_000)
    expect(bucket.available()).toBeCloseTo(4, 5)
  })

  it('never holds more than its capacity', async () => {
    const { bucket, advance } = harness(4)

    advance(600_000)
    expect(bucket.available()).toBe(4)
  })

  it('refuses a capacity of zero rather than deadlocking', () => {
    expect(() => new TokenBucket(0, 10_000)).toThrow()
  })
})
