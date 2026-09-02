/**
 * Which plan a Stripe price is.
 *
 * This map is the thing being sold. A price pointing at the wrong tier hands
 * somebody five areas for £29; a price pointing at nothing locks a paying
 * subscriber out of a search they are paying for. Both are worth a test.
 */
import { describe, expect, it } from 'vitest'
import { areaLimitForPrice, PLAN_LIST, PLANS, tierForPrice } from '@/lib/plans'

const IDS = {
  starter: 'price_starter',
  investor: 'price_investor',
  portfolio: 'price_portfolio',
}

describe('the tiers themselves', () => {
  it('rise in both price and areas together', () => {
    // A tier that cost more and gave less would be a pricing mistake nobody
    // would catch by reading three constants.
    for (let i = 1; i < PLAN_LIST.length; i += 1) {
      expect(PLAN_LIST[i]!.monthlyPrice).toBeGreaterThan(PLAN_LIST[i - 1]!.monthlyPrice)
      expect(PLAN_LIST[i]!.areas).toBeGreaterThan(PLAN_LIST[i - 1]!.areas)
    }
  })

  it('marks exactly one as the common choice', () => {
    expect(PLAN_LIST.filter((plan) => plan.recommended)).toHaveLength(1)
  })
})

describe('mapping a price to a tier', () => {
  it('matches by id', () => {
    expect(tierForPrice(IDS.starter, IDS)).toBe('starter')
    expect(tierForPrice(IDS.investor, IDS)).toBe('investor')
    expect(tierForPrice(IDS.portfolio, IDS)).toBe('portfolio')
  })

  it('gives each tier the areas it advertises', () => {
    expect(areaLimitForPrice(IDS.starter, IDS)).toBe(PLANS.starter.areas)
    expect(areaLimitForPrice(IDS.investor, IDS)).toBe(PLANS.investor.areas)
    expect(areaLimitForPrice(IDS.portfolio, IDS)).toBe(PLANS.portfolio.areas)
  })

  it('does not match on amount, only on id', () => {
    // The point of mapping by id: re-pricing Investor to £99 must not turn it
    // into Portfolio, and nothing here can even see an amount.
    expect(tierForPrice('price_something_else', IDS)).toBeNull()
  })

  it('floors an unknown price at one area rather than none', () => {
    // A price we do not recognise is far likelier to be a legacy one than an
    // attack, and the failure that matters is a paying subscriber locked out
    // of their own search.
    expect(areaLimitForPrice('price_legacy', IDS)).toBe(1)
    expect(areaLimitForPrice(null, IDS)).toBe(1)
  })

  it('does not match a tier whose price is not configured', () => {
    // An empty environment variable must match nothing. Matching an unset id
    // against a null price would give every subscription the top tier.
    const partial = { starter: 'price_starter', investor: '', portfolio: '' }
    expect(tierForPrice('', partial)).toBeNull()
    expect(areaLimitForPrice('', partial)).toBe(1)
  })
})
