import { describe, expect, it } from 'vitest'
import { diffListing, eventsFromPriceHistory } from '@/lib/pipeline/events'
import { asPriceHistory, normaliseListing } from '@/lib/pipeline/listing'
import { movement } from '@/lib/pipeline/scoring'
import { describeEvent, strongestMaterialEvent } from '@/lib/pipeline/qualification'

const LEARNED_AT = new Date('2026-08-24T12:00:00.000Z')

/** The shape a real /sourced-properties result carries, confirmed 2026-08-24. */
function realListing(overrides: Record<string, unknown> = {}) {
  return normaliseListing({
    id: 'O14909526',
    address: 'Little Lever Street, Northern Quarter',
    precise_address: 'APARTMENT 504, FAIRBAIRN BUILDING 55, HENRY STREET, MANCHESTER',
    postcode: 'M1 1AR',
    price: 100_000,
    bedrooms: 0,
    sqf: 226,
    type: 'Studio',
    type_standardised: 'Flat',
    days_on_market: 702,
    days_since_price_change: 44,
    reduced_by: 31.740614334471,
    sstc: 0,
    lat: 53.483549,
    lng: -2.23141,
    url: 'https://propertydata.co.uk/outbound/otm/14909526',
    price_history: [
      { date: '2024-05-20', price: 146_500 },
      { date: '2024-09-21', price: 125_000 },
      { date: '2026-07-11', price: 100_000 },
    ],
    ...overrides,
  })
}

describe('reading a real sourced property', () => {
  it('reads every field the live payload carries', () => {
    const listing = realListing()

    expect(listing.key).toBe('pd:O14909526')
    expect(listing.price).toBe(100_000)
    expect(listing.bedrooms).toBe(0) // A studio. Zero is a value, not a gap.
    expect(listing.internalAreaSqFt).toBe(226)
    expect(listing.propertyType).toBe('Flat')
    expect(listing.daysOnMarket).toBe(702)
    expect(listing.daysSincePriceChange).toBe(44)
    expect(listing.reducedByPercent).toBeCloseTo(31.74, 2)
    expect(listing.preciseAddress).toContain('FAIRBAIRN')
    expect(listing.priceHistory).toHaveLength(3)
  })

  it('sorts price history oldest first and drops unreadable entries', () => {
    const history = asPriceHistory([
      { date: '2026-07-11', price: 100_000 },
      { date: 'not a date', price: 1 },
      { date: '2024-05-20', price: 146_500 },
      { date: '2024-09-21', price: null },
    ])

    expect(history).toEqual([
      { date: '2024-05-20', price: 146_500 },
      { date: '2026-07-11', price: 100_000 },
    ])
  })

  it('returns nothing for a payload with no history', () => {
    expect(asPriceHistory(undefined)).toEqual([])
    expect(asPriceHistory('nonsense')).toEqual([])
  })
})

describe('events derived from price history', () => {
  it('turns each step into a dated event', () => {
    const events = eventsFromPriceHistory(realListing().priceHistory, LEARNED_AT)

    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('price_reduced')
    expect(events[0]?.observedAt.toISOString().slice(0, 10)).toBe('2024-09-21')
    expect(events[1]?.observedAt.toISOString().slice(0, 10)).toBe('2026-07-11')
  })

  it('dates each event when the change happened, and records when we found out', () => {
    const [first] = eventsFromPriceHistory(realListing().priceHistory, LEARNED_AT)

    expect(first?.observedAt.getTime()).toBeLessThan(LEARNED_AT.getTime())
    expect(first?.currentValue).toMatchObject({ source: 'price_history', learned_at: LEARNED_AT.toISOString() })
  })

  it('computes the size of each step, not the total', () => {
    const [first, second] = eventsFromPriceHistory(realListing().priceHistory, LEARNED_AT)

    expect(first?.magnitude).toBeCloseTo(-14.68, 1) // 146,500 -> 125,000
    expect(second?.magnitude).toBeCloseTo(-20, 1) // 125,000 -> 100,000
  })

  it('keys on the prices, so a step we later observe ourselves is one event', () => {
    const fromHistory = eventsFromPriceHistory(
      [
        { date: '2026-07-11', price: 125_000 },
        { date: '2026-07-18', price: 100_000 },
      ],
      LEARNED_AT,
    )

    const fromLiveDiff = diffListing(
      realListing({ price: 100_000 }),
      { price: 125_000, state: 'listed', daysOnMarket: 700, lastObservedAt: LEARNED_AT },
      LEARNED_AT,
    )

    expect(fromHistory[0]?.dedupeKey).toBe(fromLiveDiff.find((e) => e.type === 'price_reduced')?.dedupeKey)
  })

  it('ignores a step where the price did not move', () => {
    const flat = eventsFromPriceHistory(
      [
        { date: '2026-01-01', price: 100_000 },
        { date: '2026-02-01', price: 100_000 },
      ],
      LEARNED_AT,
    )

    expect(flat).toEqual([])
  })

  it('records a rise, and does not call it material', () => {
    const [rise] = eventsFromPriceHistory(
      [
        { date: '2026-01-01', price: 100_000 },
        { date: '2026-02-01', price: 130_000 },
      ],
      LEARNED_AT,
    )

    expect(rise?.type).toBe('price_increased')
    expect(rise?.isMaterial).toBe(false)
  })
})

describe('the opening backfill', () => {
  it('knows the property was reduced twice the first time it ever sees it', () => {
    const events = diffListing(realListing(), null, LEARNED_AT)

    expect(events.map((e) => e.type)).toEqual([
      'first_seen',
      'price_reduced',
      'price_reduced',
      'days_on_market_crossed',
    ])
  })

  it('dates the days-on-market crossing by working backwards from the day count', () => {
    // 702 days on the market means it passed 365 some 337 days ago. Stamping it
    // with today would make every stale listing on a backfill read as fresh.
    const crossing = diffListing(realListing(), null, LEARNED_AT).find(
      (e) => e.type === 'days_on_market_crossed',
    )

    expect(crossing?.magnitude).toBe(365)
    const daysAgo = (LEARNED_AT.getTime() - (crossing?.observedAt.getTime() ?? 0)) / 86_400_000
    expect(Math.round(daysAgo)).toBe(337)
    expect(crossing?.currentValue).toMatchObject({ source: 'days_on_market', days_on_market: 702 })
  })

  it('says nothing about staleness for a property that has not passed a mark', () => {
    const fresh = diffListing(realListing({ days_on_market: 12, price_history: [] }), null, LEARNED_AT)
    expect(fresh.map((e) => e.type)).toEqual(['first_seen'])
  })

  it('leads with what actually moved rather than "new to your area"', () => {
    const events = diffListing(realListing(), null, LEARNED_AT).map((e, i) => ({ ...e, id: `e${i}` }))
    const lead = strongestMaterialEvent(events)

    expect(describeEvent(lead)).toBe('Reduced 20%')
  })

  it('treats a two-year-old reduction as the old news it is', () => {
    const events = diffListing(realListing(), null, LEARNED_AT)
    const old = movement(events, LEARNED_AT)

    const fresh = movement(
      diffListing(
        realListing({ price_history: [{ date: '2026-08-20', price: 125_000 }, { date: '2026-08-23', price: 100_000 }] }),
        null,
        LEARNED_AT,
      ),
      LEARNED_AT,
    )

    // Same reduction, different age. Recency is what separates them.
    expect(fresh.score).toBeGreaterThan(old.score)
  })

  it('says nothing about price for a property with no history', () => {
    const events = diffListing(realListing({ price_history: [] }), null, LEARNED_AT)
    expect(events.some((e) => e.type.startsWith('price_'))).toBe(false)
  })

  it('does not let being found count as the property having moved', () => {
    // first_seen is dated when we looked. If it fed the recency score, every
    // property on a backfill would score full marks for being discovered.
    const justFound = movement(
      diffListing(realListing({ days_on_market: 3, price_history: [] }), null, LEARNED_AT),
      LEARNED_AT,
    )

    expect(justFound.score).toBe(0)
    expect(justFound.factors).toEqual([])
  })
})
