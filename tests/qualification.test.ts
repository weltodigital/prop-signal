import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUALIFICATION,
  describeEvent,
  qualifies,
  selectionSize,
  strongestMaterialEvent,
  thinReason,
  WEEKLY_TARGET,
  type PriorImpression,
  type StoredEvent,
} from '@/lib/pipeline/qualification'

const WEEK_1 = new Date('2026-06-01T22:00:00.000Z')
const WEEK_2 = new Date('2026-06-08T22:00:00.000Z')
const WEEK_3 = new Date('2026-06-15T22:00:00.000Z')

function event(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: `event-${Math.random().toString(36).slice(2, 8)}`,
    type: 'price_reduced',
    observedAt: WEEK_2,
    previousValue: { price: 250_000 },
    currentValue: { price: 220_000 },
    magnitude: -12,
    isMaterial: true,
    dedupeKey: 'price:250000:220000',
    ...overrides,
  }
}

function impression(overrides: Partial<PriorImpression> = {}): PriorImpression {
  return { shownAt: WEEK_1, qualifyingEventId: null, ...overrides }
}

describe('a property the user has never been shown', () => {
  it('qualifies when it scores above the threshold', () => {
    const verdict = qualifies({ events: [event()], impressions: [], totalScore: 60 })

    expect(verdict.qualifies).toBe(true)
    expect(verdict).toMatchObject({ reason: 'unseen' })
  })

  it('does not qualify when it scores below it', () => {
    const verdict = qualifies({ events: [event()], impressions: [], totalScore: 10 })

    expect(verdict.qualifies).toBe(false)
    expect(verdict).toMatchObject({ reason: 'below_threshold' })
  })

  it('has a threshold above zero, so a property with nothing behind it is not padding', () => {
    expect(DEFAULT_QUALIFICATION.scoreThreshold).toBeGreaterThan(0)
  })
})

describe('a property the user has already been shown', () => {
  it('does not come back on the strength of the event it was shown for', () => {
    const shown = event({ id: 'event-1', observedAt: WEEK_1 })
    const verdict = qualifies({
      events: [shown],
      impressions: [impression({ shownAt: WEEK_1, qualifyingEventId: 'event-1' })],
      totalScore: 90,
    })

    expect(verdict.qualifies).toBe(false)
    expect(verdict).toMatchObject({ reason: 'no_new_event' })
  })

  it('comes back when a new material event fires after it was last shown', () => {
    const old = event({ id: 'event-1', observedAt: WEEK_1 })
    const fresh = event({ id: 'event-2', observedAt: WEEK_2, dedupeKey: 'price:220000:200000' })

    const verdict = qualifies({
      events: [old, fresh],
      impressions: [impression({ shownAt: WEEK_1, qualifyingEventId: 'event-1' })],
      totalScore: 90,
    })

    expect(verdict.qualifies).toBe(true)
    expect(verdict).toMatchObject({ reason: 'new_material_event' })
    if (verdict.qualifies && verdict.reason === 'new_material_event') {
      expect(verdict.event.id).toBe('event-2')
    }
  })

  it('does not come back on an event that fired before it was last shown', () => {
    const stale = event({ id: 'event-2', observedAt: WEEK_1 })
    const verdict = qualifies({
      events: [stale],
      impressions: [impression({ shownAt: WEEK_2, qualifyingEventId: 'event-1' })],
      totalScore: 90,
    })

    expect(verdict.qualifies).toBe(false)
  })

  it('does not come back on an immaterial event, however recent', () => {
    const trivial = event({ id: 'event-2', observedAt: WEEK_3, isMaterial: false })
    const verdict = qualifies({
      events: [trivial],
      impressions: [impression({ shownAt: WEEK_2, qualifyingEventId: 'event-1' })],
      totalScore: 90,
    })

    expect(verdict.qualifies).toBe(false)
    expect(verdict).toMatchObject({ reason: 'no_new_event' })
  })

  it('ignores the score once it has been shown before — the event is the reason', () => {
    const fresh = event({ id: 'event-2', observedAt: WEEK_3 })
    const verdict = qualifies({
      events: [fresh],
      impressions: [impression({ shownAt: WEEK_2, qualifyingEventId: 'event-1' })],
      totalScore: 1,
    })

    expect(verdict.qualifies).toBe(true)
  })

  it('never uses the same event twice even if it fired after the last impression', () => {
    // Guards the case where a run repeats: the event id is already spent.
    const reused = event({ id: 'event-2', observedAt: WEEK_3 })
    const verdict = qualifies({
      events: [reused],
      impressions: [
        impression({ shownAt: WEEK_1, qualifyingEventId: 'event-1' }),
        impression({ shownAt: WEEK_2, qualifyingEventId: 'event-2' }),
      ],
      totalScore: 90,
    })

    expect(verdict.qualifies).toBe(false)
  })
})

describe('which event to lead with', () => {
  it('prefers a return to market over a reduction', () => {
    const chosen = strongestMaterialEvent([
      event({ id: 'a', type: 'price_reduced', magnitude: -20 }),
      event({ id: 'b', type: 'returned_to_market', magnitude: null }),
    ])

    expect(chosen?.id).toBe('b')
  })

  it('prefers a reduction over a days-on-market crossing', () => {
    const chosen = strongestMaterialEvent([
      event({ id: 'a', type: 'days_on_market_crossed', magnitude: 365 }),
      event({ id: 'b', type: 'price_reduced', magnitude: -6 }),
    ])

    expect(chosen?.id).toBe('b')
  })

  it('prefers the bigger move within a type', () => {
    const chosen = strongestMaterialEvent([
      event({ id: 'a', type: 'price_reduced', magnitude: -6 }),
      event({ id: 'b', type: 'price_reduced', magnitude: -18 }),
    ])

    expect(chosen?.id).toBe('b')
  })

  it('ignores events that are not material', () => {
    expect(strongestMaterialEvent([event({ isMaterial: false })])).toBeNull()
  })
})

describe('the headline', () => {
  it.each([
    ['returned_to_market', null, 'Back on the market'],
    ['price_reduced', -12.4, 'Reduced 12%'],
    ['price_reduced', -6.25, 'Reduced 6.3%'],
    ['days_on_market_crossed', 140, '140 days unsold'],
    ['first_seen', null, 'New to your area'],
  ] as const)('describes %s as %s', (type, magnitude, expected) => {
    expect(describeEvent(event({ type, magnitude }))).toBe(expected)
  })

  it('has something to say when there is no event at all', () => {
    expect(describeEvent(null)).toBe('New to your area')
  })
})

describe('thin weeks', () => {
  it('publishes five in an ordinary week', () => {
    expect(selectionSize(20, 'weekly')).toBe(WEEKLY_TARGET)
  })

  it('publishes fewer rather than padding', () => {
    expect(selectionSize(2, 'weekly')).toBe(2)
    expect(selectionSize(0, 'weekly')).toBe(0)
  })

  it('lets the opening backfill be longer than five', () => {
    expect(selectionSize(40, 'backfill')).toBeGreaterThan(WEEKLY_TARGET)
  })

  it('says so when the week was thin', () => {
    expect(thinReason(2, 'weekly')).toContain('Only 2')
    expect(thinReason(0, 'weekly')).toContain('Nothing in your area')
  })

  it('says nothing when the week was full, or when it was the backfill', () => {
    expect(thinReason(5, 'weekly')).toBeNull()
    expect(thinReason(3, 'backfill')).toBeNull()
  })
})
