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
  selectForPublication,
  thinReason,
  NEW_PER_RUN,
  OPENING_LIST,
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
  const listOf = (standing: number, fresh: number) => [
    ...Array.from({ length: standing }, (_, i) => ({ entry: `standing-${i}`, standing: true })),
    ...Array.from({ length: fresh }, (_, i) => ({ entry: `new-${i}`, standing: false })),
  ]

  it('does not cap the list, only what joins it', () => {
    // Forty already on the list and ten new ones this week. All forty stay,
    // because a good deal does not stop being one when a better one turns up.
    const published = selectForPublication(listOf(40, 10))

    expect(published.filter((id) => id.startsWith('standing-'))).toHaveLength(40)
    expect(published.filter((id) => id.startsWith('new-'))).toHaveLength(NEW_PER_RUN)
    expect(published).toHaveLength(40 + NEW_PER_RUN)
  })

  it('takes the best of the new ones, because the caller ranked them', () => {
    const published = selectForPublication(listOf(0, 10))
    expect(published).toEqual(['new-0', 'new-1', 'new-2', 'new-3', 'new-4'])
  })

  it('adds fewer when fewer qualify', () => {
    expect(selectForPublication(listOf(3, 2))).toHaveLength(5)
  })

  it('keeps the opening list to five, where everything is new', () => {
    const published = selectForPublication(listOf(0, 40), 'backfill')
    expect(published).toHaveLength(OPENING_LIST)
    expect(OPENING_LIST).toBe(5)
  })
})

describe('a thin week', () => {
  it('is about what arrived, not how long the list is', () => {
    // Fourteen deals on the list and nothing new. Not a thin week.
    expect(thinReason(0, 14)).toMatch(/already on your list is still there/i)
    expect(thinReason(5, 20)).toBeNull()
  })

  it('says so plainly when there is nothing at all', () => {
    expect(thinReason(0, 0)).toMatch(/rather than pad/i)
  })

  it('counts the new ones when there are only one or two', () => {
    expect(thinReason(1, 8)).toMatch(/1 new property/i)
    expect(thinReason(2, 8)).toMatch(/2 new properties/i)
  })
})
