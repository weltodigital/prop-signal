import { describe, expect, it } from 'vitest'
import {
  CONDITION_LISTS,
  cumulativeReduction,
  DEFAULT_WEIGHTS,
  factorsHeld,
  isCapped,
  isExcluded,
  measureQuality,
  MIN_QUALITY_FACTORS,
  movement,
  percentile,
  qualityScores,
  rank,
  RISK_CAPPED_TOTAL,
  risks,
  SCORE_VERSION,
  type AreaContext,
  type EnergyCertificate,
  type Enrichment,
  type Score,
} from '@/lib/pipeline/scoring'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'
import { EMPTY_ASSUMPTIONS, type InvestmentStrategy, type StrategyAssumptions } from '@/lib/strategies'
import { EMPTY_STRATEGY_AREA, type StrategyAreaContext } from '@/lib/pipeline/strategy-return'
import type { PropertyEvent } from '@/lib/pipeline/events'

const NOW = new Date('2026-06-07T22:00:00.000Z')

function listing(overrides: Record<string, unknown> = {}): Listing {
  return normaliseListing({
    address: '12 Example Street',
    postcode: 'M14 5TP',
    price: 200_000,
    bedrooms: 3,
    type_standardised: 'Terraced house',
    sqf: 800,
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
    previousValue: { price: 200_000 },
    currentValue: { price: 176_000 },
    magnitude: -12,
    isMaterial: true,
    dedupeKey: 'k',
    ...overrides,
  }
}

/** Scores one property as its own cohort, which is what most cases need. */
function scoreOne(
  l: Listing = listing(),
  e: Enrichment = enrichment(),
  a: AreaContext = area(),
  sourcingLists: string[] = [],
  strategy: InvestmentStrategy = 'btl',
  strategyArea: StrategyAreaContext = EMPTY_STRATEGY_AREA,
  assumptions: StrategyAssumptions = EMPTY_ASSUMPTIONS,
): Score {
  const measurement = measureQuality(strategy, l, e, a, sourcingLists, strategyArea, assumptions)
  const score = qualityScores([measurement], DEFAULT_WEIGHTS)[0]
  if (!score) throw new Error('no score')
  return score
}

function pointsFor(score: Score, label: string): number {
  return score.factors.find((f) => f.label === label)?.points ?? 0
}

function availableFor(score: Score, label: string): number {
  return score.factors.find((f) => f.label === label)?.available ?? 0
}

describe('percentile', () => {
  it('puts the best at the top and the worst at the bottom', () => {
    const cohort = [10, 20, 30, 40]
    expect(percentile(40, cohort)).toBe(1)
    expect(percentile(10, cohort)).toBe(0)
  })

  it('gives tied values the same place', () => {
    const cohort = [10, 10, 10, 10]
    expect(percentile(10, cohort)).toBe(0.5)
  })

  it('returns the middle for a cohort of one, not the top', () => {
    // Being the only property with a rent estimate is not an achievement.
    expect(percentile(500, [500])).toBe(0.5)
  })
})

describe('quality', () => {
  it('stamps the version on every score', () => {
    expect(scoreOne().version).toBe(SCORE_VERSION)
  })

  it('scores cashflow against the rest of the run, not an absolute scale', () => {
    // The same property is worth most of the factor in a weak field and none of
    // it in a strong one. An absolute band could not do both.
    const cheap = listing({ price: 120_000 })
    const middling = listing({ price: 200_000 })
    const dear = listing({ price: 400_000 })

    const scores = qualityScores(
      [cheap, middling, dear].map((l) => measureQuality('btl', l, enrichment(), area())),
      DEFAULT_WEIGHTS,
    )

    expect(pointsFor(scores[0]!, 'Monthly cashflow')).toBe(DEFAULT_WEIGHTS.quality.strategyReturn)
    expect(pointsFor(scores[1]!, 'Monthly cashflow')).toBeGreaterThan(0)
    expect(pointsFor(scores[2]!, 'Monthly cashflow')).toBe(0)
  })

  it('will not give a loss-making property the whole factor for ranking best', () => {
    // Everything in this run loses money. The least bad is still a loss.
    const dear = [500_000, 600_000, 700_000].map((price) =>
      measureQuality('btl', listing({ price }), enrichment({ estimatedRent: 900 }), area()),
    )
    const scores = qualityScores(dear, DEFAULT_WEIGHTS)

    expect(pointsFor(scores[0]!, 'Monthly cashflow')).toBeLessThanOrEqual(
      DEFAULT_WEIGHTS.quality.strategyReturn / 2,
    )
  })

  it('normalises over the factors held, so a missing one does not penalise', () => {
    // A flat with no floor area cannot be compared on price per square foot.
    // It competes on the three factors it does have rather than carrying a zero.
    const withArea = scoreOne(listing({ sqf: 800 }))
    const withoutArea = scoreOne(listing({ sqf: null }))

    expect(availableFor(withArea, 'Price against nearby sales')).toBe(DEFAULT_WEIGHTS.quality.comparables)
    expect(availableFor(withoutArea, 'Price against nearby sales')).toBe(0)
    expect(factorsHeld(withoutArea)).toBe(3)
    expect(withoutArea.score).toBeGreaterThan(0)
  })

  it('counts how many factors are held, so a property short of data can be dropped', () => {
    const bare = scoreOne(listing({ sqf: null }), enrichment({ estimatedRent: null, areaDemandRating: null }))
    expect(factorsHeld(bare)).toBeLessThan(MIN_QUALITY_FACTORS)
  })

  it('scores a factor with no data at zero available rather than zero points', () => {
    const noRent = scoreOne(listing(), enrichment({ estimatedRent: null }))
    expect(availableFor(noRent, 'Monthly cashflow')).toBe(0)
    expect(noRent.factors.find((f) => f.label === 'Monthly cashflow')?.detail).toMatch(/no rent estimate/i)
  })
})

describe('room to add value', () => {
  it('is worth nothing for a list the subscriber already asked for', () => {
    // Every property an unmodernised-only subscriber sees is unmodernised, so
    // being unmodernised cannot separate one from another.
    const l = listing({ lists: ['unmodernised-properties'] })
    const asked = scoreOne(l, enrichment(), area(), ['unmodernised-properties'])
    const notAsked = scoreOne(l, enrichment(), area(), ['reduced-properties'])

    expect(pointsFor(asked, 'Room to add value')).toBe(0)
    expect(pointsFor(notAsked, 'Room to add value')).toBeGreaterThan(0)
  })

  it('still rewards a list they did not ask for', () => {
    const l = listing({ lists: ['unmodernised-properties', 'auction-properties'] })
    const score = scoreOne(l, enrichment(), area(), ['unmodernised-properties'])
    expect(pointsFor(score, 'Room to add value')).toBeGreaterThan(0)
  })

  it('is not held at all when they asked for every value-add list', () => {
    // The factor carries no information for that subscriber, so it is
    // normalised out rather than scored zero for everyone.
    const score = scoreOne(listing(), enrichment(), area(), [...CONDITION_LISTS])
    expect(availableFor(score, 'Room to add value')).toBe(0)
  })
})

describe('cumulativeReduction', () => {
  it('adds the cuts up rather than taking the largest', () => {
    // Three cuts of 5% is a seller talked down three times.
    const stepped = [
      event({ previousValue: { price: 200_000 }, currentValue: { price: 190_000 }, magnitude: -5 }),
      event({ previousValue: { price: 190_000 }, currentValue: { price: 180_500 }, magnitude: -5 }),
      event({ previousValue: { price: 180_500 }, currentValue: { price: 171_475 }, magnitude: -5 }),
    ]
    expect(cumulativeReduction(stepped)).toBeCloseTo(14.26, 1)
  })

  it('beats a single deeper cut on the movement score', () => {
    const stepped = [
      event({ observedAt: NOW, previousValue: { price: 200_000 }, currentValue: { price: 190_000 } }),
      event({ observedAt: NOW, previousValue: { price: 190_000 }, currentValue: { price: 180_500 } }),
      event({ observedAt: NOW, previousValue: { price: 180_500 }, currentValue: { price: 171_475 } }),
    ]
    const single = [event({ previousValue: { price: 200_000 }, currentValue: { price: 176_000 } })]

    // 14.26% cumulative against a single 12% cut.
    expect(movement(stepped, NOW).score).toBeGreaterThan(movement(single, NOW).score)
  })

  it('reads the latest price, not the lowest, when a property was raised again', () => {
    const events = [
      event({ observedAt: new Date('2026-01-01'), previousValue: { price: 200_000 }, currentValue: { price: 150_000 } }),
      event({ observedAt: new Date('2026-05-01'), previousValue: { price: 190_000 }, currentValue: { price: 180_000 } }),
    ]
    // Peak 200,000, latest 180,000 — not the 150,000 it briefly touched.
    expect(cumulativeReduction(events)).toBeCloseTo(10, 1)
  })

  it('is null where nothing was reduced', () => {
    expect(cumulativeReduction([])).toBeNull()
    expect(cumulativeReduction([event({ type: 'returned_to_market' })])).toBeNull()
  })
})

describe('movement', () => {
  it('gives a days-on-market crossing no recency', () => {
    // The calendar moved, not the property. Same reasoning that excludes
    // first_seen: ageing past 90 days is not news about the seller.
    const crossing = movement([event({ type: 'days_on_market_crossed', magnitude: 180 })], NOW)

    expect(crossing.factors.some((f) => f.label === 'Slow to sell')).toBe(true)
    expect(crossing.factors.some((f) => f.label === 'Recency')).toBe(false)
  })

  it('gives a reduction recency', () => {
    const reduced = movement([event()], NOW)
    expect(reduced.factors.find((f) => f.label === 'Recency')?.points).toBe(DEFAULT_WEIGHTS.movement.recency)
  })

  it('scores nothing for a property that has not moved', () => {
    expect(movement([], NOW).score).toBe(0)
    expect(movement([event({ type: 'first_seen' })], NOW).score).toBe(0)
  })

  it('shares a ceiling with quality, so neither dominates', () => {
    const everything = movement(
      [
        event({ previousValue: { price: 200_000 }, currentValue: { price: 150_000 } }),
        event({ type: 'returned_to_market' }),
        event({ type: 'days_on_market_crossed', magnitude: 400 }),
      ],
      NOW,
    )
    expect(everything.score).toBe(100)
  })
})

describe('risks', () => {
  const epcG: EnergyCertificate = { rating: 'G', score: 12 }

  it('caps a property nobody can let', () => {
    const found = risks(listing(), area(), epcG, ['reduced-properties'])
    expect(isCapped(found)).toBe(true)
  })

  it('only notes it for a subscriber who came for the refurbishment', () => {
    // An unmodernised or auction buyer is looking for exactly this stock.
    const found = risks(listing(), area(), epcG, ['unmodernised-properties'])
    expect(isCapped(found)).toBe(false)
    expect(found.some((r) => r.severity === 'note' && r.label === 'EPC G')).toBe(true)
  })

  it('excludes a property on a high flood risk', () => {
    expect(isExcluded(risks(listing(), area({ floodRisk: 'High' }), null))).toBe(true)
  })

  it('only notes a middling flood risk', () => {
    const found = risks(listing(), area({ floodRisk: 'Medium' }), null)
    expect(isExcluded(found)).toBe(false)
    expect(found.some((r) => r.severity === 'note')).toBe(true)
  })

  it('says nothing about a low flood risk', () => {
    expect(risks(listing(), area({ floodRisk: 'Very Low' }), null)).toHaveLength(0)
  })

  it('treats a short lease as a cost, not as room to add value', () => {
    const l = listing({ lists: ['short-lease-properties'] })
    const found = risks(l, area(), null)

    expect(found.some((r) => r.label === 'Short lease')).toBe(true)
    expect(pointsFor(scoreOne(l), 'Room to add value')).toBe(0)
  })

  it('no longer flags a leasehold-heavy area', () => {
    // In central Birmingham it fired on everything, which is not information.
    expect(risks(listing(), area({ leaseholdShare: 0.95 }), null)).toHaveLength(0)
  })
})

describe('rank', () => {
  const strong: Score = { score: 90, factors: [], version: SCORE_VERSION }
  const weak: Score = { score: 10, factors: [], version: SCORE_VERSION }
  const still: Score = { score: 0, factors: [], version: SCORE_VERSION }
  const moved: Score = { score: 40, factors: [], version: SCORE_VERSION }

  it('adds the two scores into a total out of 200', () => {
    const [top] = rank([{ candidate: 'a', quality: strong, movement: moved }])
    expect(top?.total).toBe(130)
  })

  it('breaks a tie towards the one that moved', () => {
    const ordered = rank([
      { candidate: 'static', quality: { score: 80, factors: [], version: SCORE_VERSION }, movement: still },
      { candidate: 'mover', quality: { score: 40, factors: [], version: SCORE_VERSION }, movement: moved },
    ])
    expect(ordered[0]?.candidate).toBe('mover')
  })

  it('holds a capped property below the ceiling', () => {
    const capping = [{ label: 'EPC G', detail: '', severity: 'cap' as const }]
    const [only] = rank([{ candidate: 'a', quality: strong, movement: { ...moved, score: 90 }, risks: capping }])

    expect(only?.total).toBe(RISK_CAPPED_TOTAL)
    expect(only?.cappedBy).toBe('EPC G')
  })

  it('leaves a capped property alone when it was never going to reach the cap', () => {
    const capping = [{ label: 'EPC G', detail: '', severity: 'cap' as const }]
    const [only] = rank([{ candidate: 'a', quality: weak, movement: still, risks: capping }])

    expect(only?.total).toBe(10)
    expect(only?.cappedBy).toBeNull()
  })
})
