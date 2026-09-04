/**
 * Splitting one sourcing call into the calls the API will take.
 *
 * The rule this file holds: searching every list must not narrow anybody's
 * radius, and must not multiply anybody's bill. Those pull against each other —
 * three of the eight lists refuse a wide search, and one call carries every
 * list it is given — and the tiers are how both are kept.
 */
import { describe, expect, it } from 'vitest'
import {
  mergeTierListings,
  planSourcingTiers,
  RESULTS_PER_CREDIT,
  type ListRadius,
} from '@/lib/pipeline/sourcing-tiers'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'

/** The eight enabled lists and the caps PropertyData enforce on them. */
const LISTS: ListRadius[] = [
  { id: 'reduced-properties', maxRadiusMiles: 40 },
  { id: 'repossessed-properties', maxRadiusMiles: 40 },
  { id: 'high-yield-properties', maxRadiusMiles: 40 },
  { id: 'auction-properties', maxRadiusMiles: 40 },
  { id: 'short-lease-properties', maxRadiusMiles: 40 },
  { id: 'unmodernised-properties', maxRadiusMiles: 30 },
  { id: 'slow-to-sell-properties', maxRadiusMiles: 30 },
  { id: 'large-plot', maxRadiusMiles: 20 },
]

const total = (tiers: Array<{ results: number }>) => tiers.reduce((n, t) => n + t.results, 0)

describe('planning the calls', () => {
  it('is one call when every list will go as wide as asked', () => {
    // The common case: ten miles is inside every cap, so nothing is split and
    // this costs exactly what one call always cost.
    const tiers = planSourcingTiers(LISTS, 10, 100)

    expect(tiers).toHaveLength(1)
    expect(tiers[0]!.radius).toBe(10)
    expect(tiers[0]!.lists).toHaveLength(8)
    expect(tiers[0]!.results).toBe(100)
  })

  it('never clamps the radius to the narrowest list', () => {
    // The failure this exists to prevent. Asking for all eight at forty and
    // clamping to the smallest cap would search everybody at twenty miles,
    // which narrows the pool that searching every list exists to widen.
    const tiers = planSourcingTiers(LISTS, 40, 100)

    expect(tiers.map((tier) => tier.radius)).toEqual([40, 30, 20])
    expect(tiers[0]!.lists).toContain('reduced-properties')
    expect(tiers[0]!.radius).toBe(40)
  })

  it('searches every list, at the widest radius that list accepts', () => {
    const tiers = planSourcingTiers(LISTS, 100, 500)

    expect(tiers.flatMap((tier) => tier.lists).sort()).toEqual(LISTS.map((l) => l.id).sort())

    for (const tier of tiers) {
      for (const id of tier.lists) {
        const cap = LISTS.find((list) => list.id === id)!.maxRadiusMiles
        expect(tier.radius).toBe(Math.min(100, cap))
      }
    }
  })

  it('shares one page between the tiers rather than buying one each', () => {
    // The whole cost argument. Three calls at a full page each would triple the
    // bill, and on a backfill that is 150 credits of sourcing against a 150
    // credit ceiling — nothing left for enrichment.
    for (const pageSize of [100, 200, 500]) {
      expect(total(planSourcingTiers(LISTS, 40, pageSize))).toBe(pageSize)
    }
  })

  it('gives the widest tier the largest share, because it carries the most lists', () => {
    const [widest, middle, narrowest] = planSourcingTiers(LISTS, 40, 100)

    expect(widest!.results).toBeGreaterThan(middle!.results)
    expect(middle!.results).toBeGreaterThan(narrowest!.results)
  })

  it('asks in whole credits, because a part of one is charged as a whole one', () => {
    for (const tier of planSourcingTiers(LISTS, 40, 100)) {
      expect(tier.results % RESULTS_PER_CREDIT).toBe(0)
      expect(tier.results).toBeGreaterThanOrEqual(RESULTS_PER_CREDIT)
    }
  })

  it('leaves every tier something even when the page will barely stretch', () => {
    // A tier planned at nothing is a call that returns nothing, which is worse
    // than a small one: the list it carries would simply never be searched.
    const tiers = planSourcingTiers(LISTS, 40, 10)

    expect(tiers).toHaveLength(3)
    expect(tiers.every((tier) => tier.results >= RESULTS_PER_CREDIT)).toBe(true)
  })

  it('plans nothing at all when there is nothing to search', () => {
    expect(planSourcingTiers([], 40, 100)).toEqual([])
  })
})

describe('merging what the tiers returned', () => {
  function listing(id: string, lists: string[]): Listing {
    return normaliseListing({
      id,
      address: '12 Example Street',
      postcode: 'M14 5TP',
      price: 200_000,
      bedrooms: 3,
      sqf: 800,
      lists,
    })
  }

  it('unions the situations a property was found in', () => {
    // The same house comes back from the forty-mile tier as reduced and from
    // the thirty-mile one as unmodernised. Overwriting would make the card say
    // less than the run knows, and the card is where this answer now lives.
    const merged = mergeTierListings([
      [listing('a', ['reduced-properties'])],
      [listing('a', ['unmodernised-properties'])],
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]!.lists).toEqual(['reduced-properties', 'unmodernised-properties'])
  })

  it('counts a property found twice once', () => {
    const merged = mergeTierListings([
      [listing('a', ['reduced-properties']), listing('b', ['reduced-properties'])],
      [listing('a', ['large-plot'])],
    ])

    expect(merged.map((l) => l.key)).toHaveLength(2)
  })

  it('does not repeat a list a property was on in both tiers', () => {
    const merged = mergeTierListings([
      [listing('a', ['reduced-properties'])],
      [listing('a', ['reduced-properties'])],
    ])

    expect(merged[0]!.lists).toEqual(['reduced-properties'])
  })

  it('is empty for calls that returned nothing', () => {
    expect(mergeTierListings([[], []])).toEqual([])
  })
})
