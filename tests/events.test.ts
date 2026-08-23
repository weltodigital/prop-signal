import { describe, expect, it } from 'vitest'
import {
  crossedMark,
  DEFAULT_THRESHOLDS,
  diffListing,
  disappearanceEvent,
  type PreviousObservation,
} from '@/lib/pipeline/events'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'

const OBSERVED = new Date('2026-06-07T22:00:00.000Z')
const LAST_WEEK = new Date('2026-05-31T22:00:00.000Z')

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    ...normaliseListing({
      address: '12 Example Street',
      postcode: 'M14 5TP',
      price: 250_000,
      bedrooms: 3,
      type_standardised: 'Terraced house',
      url: 'https://www.rightmove.co.uk/properties/1',
      days_on_market: 30,
    }),
    ...overrides,
  }
}

function previous(overrides: Partial<PreviousObservation> = {}): PreviousObservation {
  return { price: 250_000, state: 'listed', daysOnMarket: 23, lastObservedAt: LAST_WEEK, ...overrides }
}

describe('the first sighting', () => {
  it('writes first_seen and nothing else', () => {
    const events = diffListing(listing(), null, OBSERVED)

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('first_seen')
    expect(events[0]?.observedAt).toBe(OBSERVED)
    expect(events[0]?.previousValue).toBeNull()
  })

  it('is material, because the user has never been shown it', () => {
    expect(diffListing(listing(), null, OBSERVED)[0]?.isMaterial).toBe(true)
  })

  it('does not call a first sighting a price change', () => {
    const events = diffListing(listing({ price: 100_000 }), null, OBSERVED)
    expect(events.some((event) => event.type.startsWith('price_'))).toBe(false)
  })
})

describe('price movement', () => {
  it('records a reduction with a signed percentage', () => {
    const events = diffListing(listing({ price: 220_000 }), previous({ price: 250_000 }), OBSERVED)
    const reduction = events.find((event) => event.type === 'price_reduced')

    expect(reduction).toBeDefined()
    expect(reduction?.magnitude).toBe(-12)
    expect(reduction?.previousValue).toEqual({ price: 250_000 })
    expect(reduction?.currentValue).toEqual({ price: 220_000 })
  })

  it('treats a 12% drop as material', () => {
    const events = diffListing(listing({ price: 220_000 }), previous({ price: 250_000 }), OBSERVED)
    expect(events.find((e) => e.type === 'price_reduced')?.isMaterial).toBe(true)
  })

  it('records a trivial reduction but does not call it material', () => {
    // £500 off £250,000. Part of the history, not a reason to interrupt anyone.
    const events = diffListing(listing({ price: 249_500 }), previous({ price: 250_000 }), OBSERVED)
    const reduction = events.find((e) => e.type === 'price_reduced')

    expect(reduction).toBeDefined()
    expect(reduction?.isMaterial).toBe(false)
  })

  it('holds the material line exactly at the configured percentage', () => {
    const atThreshold = diffListing(listing({ price: 237_500 }), previous({ price: 250_000 }), OBSERVED)
    const justUnder = diffListing(listing({ price: 237_600 }), previous({ price: 250_000 }), OBSERVED)

    expect(DEFAULT_THRESHOLDS.materialReductionPercent).toBe(5)
    expect(atThreshold.find((e) => e.type === 'price_reduced')?.isMaterial).toBe(true)
    expect(justUnder.find((e) => e.type === 'price_reduced')?.isMaterial).toBe(false)
  })

  it('never treats a price rise as material', () => {
    const events = diffListing(listing({ price: 300_000 }), previous({ price: 250_000 }), OBSERVED)
    const increase = events.find((e) => e.type === 'price_increased')

    expect(increase?.magnitude).toBe(20)
    expect(increase?.isMaterial).toBe(false)
  })

  it('gives the same move the same key however many runs observe it', () => {
    const first = diffListing(listing({ price: 220_000 }), previous({ price: 250_000 }), OBSERVED)
    const second = diffListing(listing({ price: 220_000 }), previous({ price: 250_000 }), new Date('2026-06-14T22:00:00Z'))

    expect(first[0]?.dedupeKey).toBe(second[0]?.dedupeKey)
  })

  it('writes nothing when the price has not moved', () => {
    expect(diffListing(listing({ price: 250_000 }), previous({ price: 250_000 }), OBSERVED)).toEqual([])
  })

  it('says nothing about price when one side is unknown', () => {
    expect(diffListing(listing({ price: null }), previous({ price: 250_000 }), OBSERVED)).toEqual([])
    expect(diffListing(listing({ price: 250_000 }), previous({ price: null }), OBSERVED)).toEqual([])
  })
})

describe('availability', () => {
  it('records a return to market as material', () => {
    const events = diffListing(listing({ state: 'listed' }), previous({ state: 'sstc' }), OBSERVED)
    const returned = events.find((e) => e.type === 'returned_to_market')

    expect(returned).toBeDefined()
    expect(returned?.isMaterial).toBe(true)
  })

  it('records a withdrawn property coming back as a return to market', () => {
    const events = diffListing(listing({ state: 'listed' }), previous({ state: 'withdrawn' }), OBSERVED)
    expect(events.some((e) => e.type === 'returned_to_market')).toBe(true)
  })

  it('records going under offer, but not as a reason to show it', () => {
    const events = diffListing(listing({ state: 'sstc' }), previous({ state: 'listed' }), OBSERVED)
    const sstc = events.find((e) => e.type === 'marked_sstc')

    expect(sstc).toBeDefined()
    expect(sstc?.isMaterial).toBe(false)
  })

  it('says nothing when the state has not changed', () => {
    expect(diffListing(listing({ state: 'sstc' }), previous({ state: 'sstc' }), OBSERVED)).toEqual([])
  })
})

describe('time on the market', () => {
  it('finds the highest mark a day count has passed', () => {
    const marks = DEFAULT_THRESHOLDS.daysOnMarketMarks

    expect(crossedMark(null, marks)).toBeNull()
    expect(crossedMark(30, marks)).toBeNull()
    expect(crossedMark(60, marks)).toBe(60)
    expect(crossedMark(140, marks)).toBe(120)
    expect(crossedMark(400, marks)).toBe(365)
  })

  it('fires when a mark is crossed, and calls it material', () => {
    const events = diffListing(listing({ daysOnMarket: 62 }), previous({ daysOnMarket: 55 }), OBSERVED)
    const crossing = events.find((e) => e.type === 'days_on_market_crossed')

    expect(crossing?.magnitude).toBe(60)
    expect(crossing?.isMaterial).toBe(true)
  })

  it('does not fire again while sitting between two marks', () => {
    const events = diffListing(listing({ daysOnMarket: 88 }), previous({ daysOnMarket: 70 }), OBSERVED)
    expect(events.some((e) => e.type === 'days_on_market_crossed')).toBe(false)
  })

  it('fires once per mark, so a slow property is not shown every week', () => {
    const sixty = diffListing(listing({ daysOnMarket: 61 }), previous({ daysOnMarket: 55 }), OBSERVED)
    const ninety = diffListing(listing({ daysOnMarket: 91 }), previous({ daysOnMarket: 85 }), OBSERVED)

    expect(sixty[0]?.dedupeKey).toBe('dom:60')
    expect(ninety[0]?.dedupeKey).toBe('dom:90')
    expect(sixty[0]?.dedupeKey).not.toBe(ninety[0]?.dedupeKey)
  })
})

describe('several things at once', () => {
  it('records a reduction and a mark crossing from the same run', () => {
    const events = diffListing(
      listing({ price: 210_000, daysOnMarket: 125 }),
      previous({ price: 250_000, daysOnMarket: 100 }),
      OBSERVED,
    )

    expect(events.map((e) => e.type).sort()).toEqual(['days_on_market_crossed', 'price_reduced'])
  })
})

describe('disappearance', () => {
  it('is recorded, and is not a reason to show anything', () => {
    const event = disappearanceEvent(previous(), OBSERVED)

    expect(event.type).toBe('no_longer_listed')
    expect(event.isMaterial).toBe(false)
    expect(event.currentValue).toBeNull()
    expect(event.previousValue).toEqual({ state: 'listed', price: 250_000 })
  })
})
