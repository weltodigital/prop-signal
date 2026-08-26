/**
 * Who gets on the list.
 *
 * The rule this product now holds to: a property is on the list because it is
 * a good deal, and it stays there until the subscriber removes it. Events say
 * what has changed since they last looked. They do not decide who appears.
 *
 * This file used to assert the opposite, and the difference is the product.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUALIFICATION,
  qualifies,
  selectionSize,
  thinReason,
  LIST_CEILING,
  type PriorImpression,
  type StoredEvent,
} from '@/lib/pipeline/qualification'

const NOW = new Date('2026-08-26T00:00:00.000Z')
const FLOOR = DEFAULT_QUALIFICATION.qualityFloor

function event(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: 'e1',
    type: 'price_reduced',
    observedAt: NOW,
    previousValue: null,
    currentValue: null,
    magnitude: -12,
    isMaterial: true,
    dedupeKey: 'k',
    ...overrides,
  }
}

function shownAt(date: string, qualifyingEventId: string | null = null): PriorImpression {
  return { shownAt: new Date(date), qualifyingEventId }
}

describe('a deal is on the list because it is a good deal', () => {
  it('takes a property that has never moved, if the quality is there', () => {
    // The case the old rule handled badly: listed yesterday, nothing has
    // happened to it, and it is an excellent buy.
    const verdict = qualifies({ events: [], impressions: [], qualityScore: 90, removed: false })

    expect(verdict.qualifies).toBe(true)
    expect(verdict).toMatchObject({ reason: 'new' })
  })

  it('keeps it there next week, with nothing new having happened', () => {
    // The whole point. A sourcing product that hides its best deal because you
    // already saw it is not sourcing.
    const verdict = qualifies({
      events: [],
      impressions: [shownAt('2026-08-01')],
      qualityScore: 90,
      removed: false,
    })

    expect(verdict.qualifies).toBe(true)
    expect(verdict).toMatchObject({ reason: 'standing', changedSinceSeen: false })
  })

  it('refuses a property that does not stack, however hard the seller moved', () => {
    // Movement is a bonus, not a way in. A 20% cut on something that loses
    // money every month is still something that loses money every month.
    const verdict = qualifies({
      events: [event({ magnitude: -20 })],
      impressions: [],
      qualityScore: FLOOR - 1,
      removed: false,
    })

    expect(verdict.qualifies).toBe(false)
    expect(verdict).toMatchObject({ reason: 'below_quality_floor' })
  })

  it('takes it at exactly the floor', () => {
    expect(qualifies({ events: [], impressions: [], qualityScore: FLOOR, removed: false }).qualifies).toBe(true)
  })
})

describe('the subscriber decides what leaves', () => {
  it('drops a property they removed, however well it scores', () => {
    const verdict = qualifies({ events: [], impressions: [], qualityScore: 100, removed: true })

    expect(verdict.qualifies).toBe(false)
    expect(verdict).toMatchObject({ reason: 'removed' })
  })

  it('checks removal before the score, so the reason is theirs and not ours', () => {
    const verdict = qualifies({ events: [], impressions: [], qualityScore: 0, removed: true })
    expect(verdict).toMatchObject({ reason: 'removed' })
  })
})

describe('events say what changed, not who appears', () => {
  it('marks a property whose event landed since it was last shown', () => {
    const verdict = qualifies({
      events: [event({ observedAt: new Date('2026-08-20') })],
      impressions: [shownAt('2026-08-01')],
      qualityScore: 80,
      removed: false,
    })

    expect(verdict).toMatchObject({ qualifies: true, reason: 'standing', changedSinceSeen: true })
  })

  it('does not mark one whose only event predates the last time they saw it', () => {
    const verdict = qualifies({
      events: [event({ observedAt: new Date('2026-07-01') })],
      impressions: [shownAt('2026-08-01')],
      qualityScore: 80,
      removed: false,
    })

    expect(verdict).toMatchObject({ qualifies: true, changedSinceSeen: false })
  })

  it('leads with the strongest material event either way', () => {
    const verdict = qualifies({
      events: [event({ id: 'small', magnitude: -6 }), event({ id: 'big', magnitude: -18 })],
      impressions: [],
      qualityScore: 80,
      removed: false,
    })

    expect(verdict.qualifies && verdict.event?.id).toBe('big')
  })

  it('ignores an immaterial event when choosing the headline', () => {
    const verdict = qualifies({
      events: [event({ id: 'trim', magnitude: -0.2, isMaterial: false })],
      impressions: [],
      qualityScore: 80,
      removed: false,
    })

    expect(verdict.qualifies && verdict.event).toBeNull()
  })
})

describe('how many are published', () => {
  it('caps one run rather than enforcing a weekly quota', () => {
    expect(selectionSize(3)).toBe(3)
    expect(selectionSize(100)).toBe(LIST_CEILING)
  })

  it('explains a short list rather than padding it', () => {
    expect(thinReason(0)).toMatch(/rather than pad/i)
    expect(thinReason(1)).toMatch(/do not stack/i)
    expect(thinReason(5)).toBeNull()
  })
})
