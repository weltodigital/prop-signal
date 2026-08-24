import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  movement,
  netMonthlyCashflow,
  quality,
  rank,
  risks,
  SCORE_VERSION,
  type AreaContext,
  type Enrichment,
} from '@/lib/pipeline/scoring'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'
import type { PropertyEvent } from '@/lib/pipeline/events'

const NOW = new Date('2026-06-07T22:00:00.000Z')

function listing(overrides: Record<string, unknown> = {}): Listing {
  return normaliseListing({
    address: '12 Example Street',
    postcode: 'M14 5TP',
    price: 200_000,
    bedrooms: 3,
    type_standardised: 'Terraced house',
    lists: ['reduced-properties'],
    ...overrides,
  })
}

function enrichment(overrides: Partial<Enrichment> = {}): Enrichment {
  return { estimatedValue: 220_000, estimatedRent: 1_100, areaDemandRating: 60, ...overrides }
}

function area(overrides: Partial<AreaContext> = {}): AreaContext {
  return {
    soldPricePerSqFt: 300,
    localGrossYieldPercent: 6,
    floodRisk: 'Very Low',
    leaseholdShare: 0.2,
    ...overrides,
  }
}

function event(overrides: Partial<PropertyEvent> = {}): PropertyEvent {
  return {
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

describe('quality', () => {
  it('stamps the version on every score', () => {
    expect(quality(listing(), enrichment(), area()).version).toBe(SCORE_VERSION)
  })

  it('gives a factor for every input, so the breakdown is complete', () => {
    const score = quality(listing(), enrichment(), area())
    expect(score.factors.map((f) => f.label)).toEqual([
      'Monthly cashflow',
      'Price against nearby sales',
      'Yield against the area',
      'Local demand',
      'Room to add value',
    ])
  })

  it('scores what is left each month, not the gross yield', () => {
    // £150,000 at 25% down is a £112,500 loan. At 5.5% interest only that is
    // £515 a month, against £1,100 rent less 20% costs.
    const clears = quality(listing({ price: 150_000 }), enrichment({ estimatedRent: 1_100 }), area())
    const loses = quality(listing({ price: 400_000 }), enrichment({ estimatedRent: 1_100 }), area())

    expect(clears.score).toBeGreaterThan(loses.score)
    expect(loses.factors.find((f) => f.label === 'Monthly cashflow')?.points).toBe(0)
  })

  it('scores nothing for a property that does not wash its face', () => {
    // The failure the old gross yield hid: a 4.4% gross yield reads as
    // unremarkable and loses money every month at 5.5% borrowing.
    expect(netMonthlyCashflow(300_000, 1_100)).toBeLessThan(0)

    const score = quality(listing({ price: 300_000 }), enrichment({ estimatedRent: 1_100 }), area())
    const cashflow = score.factors.find((f) => f.label === 'Monthly cashflow')

    expect(cashflow?.points).toBe(0)
    expect(cashflow?.detail).toContain('Loses')
  })

  it('prices against what sold nearby, not against the asking price', () => {
    // 600 sq ft at £300 locally is £180,000. Asking £150,000 is under it.
    const under = quality(listing({ price: 150_000, sqf: 600 }), enrichment(), area({ soldPricePerSqFt: 300 }))
    const over = quality(listing({ price: 240_000, sqf: 600 }), enrichment(), area({ soldPricePerSqFt: 300 }))

    const underFactor = under.factors.find((f) => f.label === 'Price against nearby sales')
    const overFactor = over.factors.find((f) => f.label === 'Price against nearby sales')

    expect(underFactor?.points).toBeGreaterThan(0)
    expect(overFactor?.points).toBe(0)
    expect(overFactor?.detail).toContain('above')
  })

  it('says which figure is missing rather than assuming one', () => {
    const score = quality(listing(), { estimatedValue: null, estimatedRent: null, areaDemandRating: null }, area())
    const cashflow = score.factors.find((f) => f.label === 'Monthly cashflow')

    expect(cashflow?.points).toBe(0)
    expect(cashflow?.detail).toBe('No rent estimate held')

    const noArea = quality(listing({ sqf: 600 }), enrichment(), {
      soldPricePerSqFt: null,
      localGrossYieldPercent: null,
      floodRisk: null,
      leaseholdShare: null,
    })
    expect(noArea.factors.find((f) => f.label === 'Price against nearby sales')?.detail).toBe(
      'No local sold prices held',
    )
    expect(noArea.factors.find((f) => f.label === 'Yield against the area')?.detail).toBe(
      'No local yield benchmark held',
    )
  })

  it('measures the yield against the area rather than against a fixed band', () => {
    const strong = quality(listing({ price: 150_000 }), enrichment({ estimatedRent: 1_100 }), area({ localGrossYieldPercent: 6 }))
    const ordinary = quality(listing({ price: 150_000 }), enrichment({ estimatedRent: 1_100 }), area({ localGrossYieldPercent: 12 }))

    const strongFactor = strong.factors.find((f) => f.label === 'Yield against the area')
    const ordinaryFactor = ordinary.factors.find((f) => f.label === 'Yield against the area')

    expect(strongFactor?.points).toBeGreaterThan(ordinaryFactor?.points ?? 0)
  })

  it('states the figure behind every factor so it can be argued with', () => {
    for (const factor of quality(listing(), enrichment(), area()).factors) {
      expect(factor.detail.length).toBeGreaterThan(0)
    }
  })

  it('credits a property on a list that implies work', () => {
    const needsWork = quality(listing({ lists: ['unmodernised-properties'] }), enrichment(), area())
    const plain = quality(listing({ lists: ['high-yield-properties'] }), enrichment(), area())

    expect(needsWork.score).toBeGreaterThan(plain.score)
  })

  it('cannot exceed the sum of its weights', () => {
    const ceiling = Object.values(DEFAULT_WEIGHTS.quality).reduce((a, b) => a + b, 0)
    const best = quality(listing({ price: 50_000, lists: ['unmodernised-properties', 'repossessed-properties'] }), {
      estimatedValue: 500_000,
      estimatedRent: 3_000,
      areaDemandRating: 100,
    })

    expect(best.score).toBeLessThanOrEqual(ceiling)
  })
})

describe('movement', () => {
  it('scores zero when nothing has happened', () => {
    const score = movement([], NOW)
    expect(score.score).toBe(0)
    expect(score.factors).toEqual([])
  })

  it('scores a deeper reduction above a shallower one', () => {
    const deep = movement([event({ magnitude: -18 })], NOW)
    const shallow = movement([event({ magnitude: -6 })], NOW)

    expect(deep.score).toBeGreaterThan(shallow.score)
  })

  it('counts repeated reductions in the label', () => {
    const twice = movement([event({ magnitude: -8 }), event({ magnitude: -12 })], NOW)
    expect(twice.factors[0]?.label).toBe('Reduced 2 times')
  })

  it('scores a return to market on its own', () => {
    const returned = movement([event({ type: 'returned_to_market', magnitude: null })], NOW)
    expect(returned.factors.some((f) => f.label === 'Back on the market')).toBe(true)
    expect(returned.score).toBeGreaterThan(0)
  })

  it('decays with age, so this week beats last month', () => {
    const fresh = movement([event({ observedAt: NOW })], NOW)
    const old = movement([event({ observedAt: new Date(NOW.getTime() - 30 * 86_400_000) })], NOW)

    expect(fresh.score).toBeGreaterThan(old.score)
  })
})

describe('ranking', () => {
  it('lets a mediocre property that just dropped 12% outrank a good static one', () => {
    // The premise of the whole product, asserted. The mover is worse on every
    // quality measure — 4.8% yield, barely under the estimate, weak demand —
    // and still leads, because it moved and the other one did not.
    const mover = {
      candidate: 'mover',
      quality: quality(listing({ price: 200_000 }), { estimatedValue: 205_000, estimatedRent: 800, areaDemandRating: 40 }),
      movement: movement([event({ magnitude: -12, observedAt: NOW })], NOW),
    }

    const stayer = {
      candidate: 'stayer',
      quality: quality(listing({ price: 180_000 }), { estimatedValue: 195_000, estimatedRent: 900, areaDemandRating: 60 }),
      movement: movement([], NOW),
    }

    expect(mover.quality.score).toBeLessThan(stayer.quality.score)
    expect(rank([stayer, mover])[0]?.candidate).toBe('mover')
  })

  it('still lets an exceptional property beat a small move, which is the honest limit of that', () => {
    // Movement is not a trump card. A property clearing £284 a month on a yield
    // a third above the area beats one that shaved 12% off an asking price it
    // cannot let profitably. If this stops being true the weights have gone
    // wrong, not this test.
    const mover = {
      candidate: 'mover',
      quality: quality(
        listing({ price: 200_000 }),
        { estimatedValue: 205_000, estimatedRent: 800, areaDemandRating: 40 },
        area(),
      ),
      movement: movement([event({ magnitude: -12, observedAt: NOW })], NOW),
    }

    const exceptional = {
      candidate: 'exceptional',
      quality: quality(
        listing({ price: 150_000 }),
        { estimatedValue: 190_000, estimatedRent: 1_000, areaDemandRating: 70 },
        area(),
      ),
      movement: movement([], NOW),
    }

    expect(rank([mover, exceptional])[0]?.candidate).toBe('exceptional')
  })

  it('gives movement and quality the same ceiling, so neither can dominate by construction', () => {
    const qualityCeiling = Object.values(DEFAULT_WEIGHTS.quality).reduce((a, b) => a + b, 0)
    const movementCeiling = Object.values(DEFAULT_WEIGHTS.movement).reduce((a, b) => a + b, 0)

    expect(movementCeiling).toBe(qualityCeiling)
  })

  it('adds the two scores rather than blending them', () => {
    const entry = {
      candidate: 'x',
      quality: quality(listing(), enrichment()),
      movement: movement([event()], NOW),
    }

    const [ranked] = rank([entry])
    expect(ranked?.total).toBeCloseTo(entry.quality.score + entry.movement.score, 1)
  })

  it('breaks a tie in favour of the one that moved', () => {
    const still = { candidate: 'still', quality: { score: 60, factors: [], version: 'v1' }, movement: { score: 0, factors: [], version: 'v1' } }
    const moved = { candidate: 'moved', quality: { score: 20, factors: [], version: 'v1' }, movement: { score: 40, factors: [], version: 'v1' } }

    expect(rank([still, moved])[0]?.candidate).toBe('moved')
  })

  it('orders descending', () => {
    const entries = [10, 90, 50].map((score) => ({
      candidate: score,
      quality: { score, factors: [], version: 'v1' },
      movement: { score: 0, factors: [], version: 'v1' },
    }))

    expect(rank(entries).map((e) => e.candidate)).toEqual([90, 50, 10])
  })
})

describe('no LLM in this path', () => {
  it('produces the same score for the same input every time', () => {
    const a = quality(listing(), enrichment())
    const b = quality(listing(), enrichment())

    expect(a).toEqual(b)
  })
})

describe('risks, which are stated rather than scored', () => {
  it('flags a property that cannot legally be let', () => {
    const found = risks(area(), { rating: 'F', score: 30 })

    expect(found).toHaveLength(1)
    expect(found[0]?.label).toBe('EPC F')
    expect(found[0]?.detail).toContain('Cannot be let')
  })

  it('warns about a rating that passes today and would not under the C minimum', () => {
    expect(risks(area(), { rating: 'D', score: 60 })[0]?.detail).toContain('C minimum')
  })

  it('says nothing about a good rating', () => {
    expect(risks(area(), { rating: 'B', score: 85 })).toEqual([])
  })

  it('flags flood risk above low, and not at or below it', () => {
    expect(risks(area({ floodRisk: 'High' }), null)).toHaveLength(1)
    expect(risks(area({ floodRisk: 'Very Low' }), null)).toEqual([])
    expect(risks(area({ floodRisk: 'Low' }), null)).toEqual([])
  })

  it('warns that a leasehold area hides costs this product cannot see', () => {
    const found = risks(area({ leaseholdShare: 0.9 }), null)

    expect(found[0]?.label).toBe('Leasehold area')
    expect(found[0]?.detail).toContain('service charge')
  })

  it('holds its tongue when nothing is known', () => {
    expect(risks({ soldPricePerSqFt: null, localGrossYieldPercent: null, floodRisk: null, leaseholdShare: null }, null)).toEqual([])
  })
})
