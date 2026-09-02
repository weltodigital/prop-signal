/**
 * Which run cycle a moment belongs to.
 *
 * The weekly batch fires repeatedly through Sunday night and Monday morning,
 * and each invocation skips profiles already attempted since the cycle opened.
 * That skip is what makes the repeats drain a queue rather than re-source
 * everybody's area — and re-sourcing everybody costs real credits, so the
 * boundary has to be exact.
 */
import { describe, expect, it } from 'vitest'
import { cycleStart } from '@/lib/pipeline/run'

const iso = (d: Date) => d.toISOString()

describe('the cycle opens at Sunday 22:00 UTC', () => {
  it('takes the current Sunday once the run has fired', () => {
    // Sunday 2026-09-06, 22:30 — half an hour into the run.
    expect(iso(cycleStart(new Date('2026-09-06T22:30:00Z')))).toBe('2026-09-06T22:00:00.000Z')
  })

  it('holds through Monday morning, when the later invocations fire', () => {
    for (const at of ['2026-09-07T00:30:00Z', '2026-09-07T03:00:00Z', '2026-09-07T05:30:00Z']) {
      expect(iso(cycleStart(new Date(at))), at).toBe('2026-09-06T22:00:00.000Z')
    }
  })

  it('still holds late in the week, so nothing re-runs before the next Sunday', () => {
    // Saturday. A profile run on Sunday must still count as done.
    expect(iso(cycleStart(new Date('2026-09-12T18:00:00Z')))).toBe('2026-09-06T22:00:00.000Z')
  })

  it('winds back a week on Sunday before the run has fired', () => {
    // Sunday teatime: this week's run has not happened, so the cycle is still
    // the last one. Reading it as the new cycle would let a profile already
    // run last week be run again, which is a week's credits for nothing.
    expect(iso(cycleStart(new Date('2026-09-06T17:00:00Z')))).toBe('2026-08-30T22:00:00.000Z')
  })

  it('rolls over exactly on the hour', () => {
    expect(iso(cycleStart(new Date('2026-09-06T21:59:59Z')))).toBe('2026-08-30T22:00:00.000Z')
    expect(iso(cycleStart(new Date('2026-09-06T22:00:00Z')))).toBe('2026-09-06T22:00:00.000Z')
  })
})
