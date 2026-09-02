/**
 * Why a property is in front of you.
 *
 * The score says which to look at first. It cannot say why you are looking at
 * all — it is the conclusion with the reasoning discarded — and "why" is the
 * question somebody scanning a list is actually asking.
 *
 * These lines are rebuilt from the factors the score was made of, so the card
 * and the breakdown on the property page are the same arithmetic said twice
 * and cannot disagree.
 */
import { describe, expect, it } from 'vitest'
import { reasonsFor } from '@/lib/reasons'
import type { PublishedDeal, ScoreFactor } from '@/lib/deals'

function factor(label: string, points: number, available: number, detail: string): ScoreFactor {
  return { label, points, available, detail }
}

function deal(overrides: Partial<PublishedDeal> = {}): PublishedDeal {
  return {
    winningStrategy: 'btl',
    changedSinceSeen: false,
    headline: 'New to your area',
    qualityFactors: [],
    movementFactors: [],
    ...overrides,
  } as unknown as PublishedDeal
}

describe('what earns a line', () => {
  it('states the discount against nearby sales', () => {
    const reasons = reasonsFor(
      deal({
        qualityFactors: [
          factor('Price against nearby sales', 27, 30, '18.3% below what nearby homes sold for per square foot'),
        ],
      }),
    )

    expect(reasons).toContain('18% below nearby sold prices per sq ft')
  })

  it('states the return in the money it was measured in', () => {
    const reasons = reasonsFor(
      deal({
        qualityFactors: [
          factor('Monthly cashflow', 36, 40, "£312 a month clear, better than 78% of this week's candidates"),
        ],
      }),
    )

    // The percentile belongs in the breakdown. On a card it is noise.
    expect(reasons[0]).toBe('£312 a month clear as a buy to let')
    expect(reasons[0]).not.toContain('better than')
  })

  it('leaves out a factor that scored poorly, however loudly it is labelled', () => {
    // A property barely above nothing on comparables is not "below nearby
    // sold prices" in any sense worth printing.
    const reasons = reasonsFor(
      deal({
        qualityFactors: [factor('Price against nearby sales', 2, 30, '1.4% below what nearby homes sold for per square foot')],
      }),
    )

    expect(reasons).toEqual([])
  })

  it('leaves out a factor with no data behind it', () => {
    const reasons = reasonsFor(
      deal({ qualityFactors: [factor('Price against nearby sales', 0, 0, 'No local sold prices held')] }),
    )

    expect(reasons).toEqual([])
  })

  it('never opens on the seller having moved', () => {
    // Movement is a reason to look sooner, never a reason to look. A list that
    // led with the reduction would say this is a product about distressed
    // sellers, which is exactly what it is not.
    const reasons = reasonsFor(
      deal({
        qualityFactors: [factor('Price against nearby sales', 28, 30, '20% below what nearby homes sold for per square foot')],
        movementFactors: [factor('Reduced 3 times', 34, 35, '18.0% below its peak asking price, over 3 reductions')],
      }),
    )

    expect(reasons[0]).toBe('20% below nearby sold prices per sq ft')
    expect(reasons[1]).toBe('Reduced 3 times, 18% off its peak')
  })

  it('says a fall-through plainly, because it is the most actionable thing there is', () => {
    const reasons = reasonsFor(
      deal({
        movementFactors: [factor('Back on the market', 25, 25, 'Returned after coming off, which usually means a fall-through')],
      }),
    )

    expect(reasons).toEqual(['Back on the market after a fall-through'])
  })

  it('does not give recency a line of its own', () => {
    // "Moved 5 days ago" sharpens another reason; alone it says nothing about
    // whether the property is worth anything.
    const reasons = reasonsFor(
      deal({ movementFactors: [factor('Recency', 15, 15, 'Moved 5 days ago')] }),
    )

    expect(reasons).toEqual([])
  })

  it('stops at three, because a glance is not a report', () => {
    const reasons = reasonsFor(
      deal({
        qualityFactors: [
          factor('Monthly cashflow', 40, 40, '£500 a month clear'),
          factor('Price against nearby sales', 30, 30, '25% below what nearby homes sold for per square foot'),
          factor('Local demand', 15, 15, 'Area demand rated 80 out of 100'),
          factor('Room to add value', 15, 15, 'Also on needs work and auction, which you did not ask for'),
        ],
        movementFactors: [factor('Back on the market', 25, 25, 'Returned after coming off')],
      }),
    )

    expect(reasons).toHaveLength(3)
  })

  it('names the strategy the property was actually ranked under', () => {
    const reasons = reasonsFor(
      deal({
        winningStrategy: 'hmo',
        qualityFactors: [factor('Monthly cashflow as an HMO', 38, 40, '£840 a month clear')],
      }),
    )

    expect(reasons[0]).toBe('£840 a month clear as an HMO')
  })
})
