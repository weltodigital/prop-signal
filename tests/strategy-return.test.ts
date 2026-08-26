/**
 * The one number each strategy is judged on.
 *
 * What matters here is that a strategy refuses to produce a figure it cannot
 * stand behind. Every `value: null` in this file is a property that will be
 * normalised out of the score rather than ranked on a guess.
 */
import { describe, expect, it } from 'vitest'
import { strategyReturn, EMPTY_STRATEGY_AREA } from '@/lib/pipeline/strategy-return'
import { EMPTY_ASSUMPTIONS, COSTS_PERCENT_OF_RENT, type StrategyAssumptions } from '@/lib/strategies'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'

function listing(overrides: Record<string, unknown> = {}): Listing {
  return normaliseListing({
    address: '12 Example Street',
    postcode: 'M14 5TP',
    price: 200_000,
    bedrooms: 4,
    type_standardised: 'Terraced house',
    sqf: 1_000,
    ...overrides,
  })
}

function assumptions(overrides: Partial<StrategyAssumptions> = {}): StrategyAssumptions {
  return { ...EMPTY_ASSUMPTIONS, ...overrides }
}

describe('buy to let', () => {
  it('is monthly cashflow on a single-household rent', () => {
    const result = strategyReturn('btl', listing(), 1_100, EMPTY_STRATEGY_AREA, assumptions())
    expect(result.value).not.toBeNull()
    expect(result.detail).toMatch(/a month/)
  })

  it('refuses to score without a rent estimate', () => {
    const result = strategyReturn('btl', listing(), null, EMPTY_STRATEGY_AREA, assumptions())
    expect(result.value).toBeNull()
    expect(result.detail).toMatch(/no rent estimate/i)
  })

  it('marks a loss so it cannot take the whole factor', () => {
    const result = strategyReturn('btl', listing({ price: 600_000 }), 900, EMPTY_STRATEGY_AREA, assumptions())
    expect(result.belowWater).toBe(true)
  })
})

describe('HMO', () => {
  const area = { ...EMPTY_STRATEGY_AREA, hmoRoomRatePerMonth: 550 }

  it('beats the same house as a single let, on the same asking price', () => {
    // Four rooms at £550 is £2,200 against a £1,100 single let. Even with the
    // higher running costs that is the point of the strategy.
    const asHmo = strategyReturn('hmo', listing(), 1_100, area, assumptions())
    const asBtl = strategyReturn('btl', listing(), 1_100, area, assumptions())

    expect(asHmo.value).toBeGreaterThan(asBtl.value!)
  })

  it('carries the higher running costs', () => {
    expect(COSTS_PERCENT_OF_RENT.hmo).toBeGreaterThan(COSTS_PERCENT_OF_RENT.btl)
    expect(strategyReturn('hmo', listing(), 1_100, area, assumptions()).detail).toContain(
      `${COSTS_PERCENT_OF_RENT.hmo}% of rent in costs`,
    )
  })

  it('will not score a house too small to be one', () => {
    const result = strategyReturn('hmo', listing({ bedrooms: 2 }), 1_100, area, assumptions())
    expect(result.value).toBeNull()
    expect(result.detail).toMatch(/too few/i)
  })

  it('refuses to score without a local room rate', () => {
    const result = strategyReturn('hmo', listing(), 1_100, EMPTY_STRATEGY_AREA, assumptions())
    expect(result.value).toBeNull()
    expect(result.detail).toMatch(/no local room rate/i)
  })
})

describe('BRRR', () => {
  const area = { ...EMPTY_STRATEGY_AREA, developmentGdvPerSqFt: 320 }

  it('scores how much money comes back out, not monthly cashflow', () => {
    const result = strategyReturn('brrr', listing(), 1_100, area, assumptions({ refurbCostPerSqFt: 60 }))
    expect(result.value).not.toBeNull()
    expect(result.detail).toMatch(/back out|over/i)
  })

  it('rewards a bigger gap between what it costs and what it is worth', () => {
    const cheapWorks = strategyReturn('brrr', listing(), 1_100, area, assumptions({ refurbCostPerSqFt: 40 }))
    const dearWorks = strategyReturn('brrr', listing(), 1_100, area, assumptions({ refurbCostPerSqFt: 120 }))

    expect(cheapWorks.value).toBeGreaterThan(dearWorks.value!)
  })

  it('refuses to score without the subscriber own refurb figure', () => {
    // This product does not hold a refurb cost and will not derive one. No
    // figure means no score, not an assumed average.
    const result = strategyReturn('brrr', listing(), 1_100, area, assumptions())
    expect(result.value).toBeNull()
    expect(result.detail).toMatch(/refurb cost/i)
  })

  it('refuses to score without a floor area', () => {
    const result = strategyReturn(
      'brrr',
      listing({ sqf: null }),
      1_100,
      area,
      assumptions({ refurbCostPerSqFt: 60 }),
    )
    expect(result.value).toBeNull()
    expect(result.detail).toMatch(/floor area/i)
  })
})

describe('every strategy', () => {
  it('refuses to score a property with no asking price', () => {
    for (const strategy of ['btl', 'hmo', 'brrr'] as const) {
      const result = strategyReturn(
        strategy,
        listing({ price: null }),
        1_100,
        { hmoRoomRatePerMonth: 550, developmentGdvPerSqFt: 320 },
        assumptions({ refurbCostPerSqFt: 60 }),
      )
      expect(result.value, strategy).toBeNull()
    }
  })
})
