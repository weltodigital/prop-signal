/**
 * The homepage's figures have to survive being added up.
 *
 * Somebody deciding whether to spend £29 a month on investment analysis will
 * check the arithmetic on the one example they are shown — it is the only
 * evidence on the page that the product can count. This pins what that example
 * prints, so a change to the weights, the standard finance or the band
 * thresholds fails here rather than silently on the landing page.
 */
import { describe, expect, it } from 'vitest'
import { EXAMPLE, EXAMPLE_SCORE, exampleBand, exampleEvents } from '@/lib/marketing-example'

describe('the homepage example property', () => {
  it('states a cashflow that follows from the price and the rent', () => {
    // £140,000 at 25% down is a £105,000 interest-only loan at 5.5%, so £481 a
    // month, and 20% of £1,000 of rent is £200. £1,000 less £681 is £319.
    expect(EXAMPLE.cashflow).toBe('£319')
    expect(EXAMPLE.grossYield).toBe('8.6% gross on the asking price')
    expect(EXAMPLE.perSqFt).toBe('£226 per sq ft')
    expect(EXAMPLE.reduction).toBe('12.5%')
    expect(EXAMPLE.discount).toBe('12.0%')
  })

  it('scores the factors the way the pipeline weights them', () => {
    expect(EXAMPLE_SCORE.cashflow).toBe('35.2')
    expect(EXAMPLE_SCORE.comparables).toBe('14.4')
    expect(EXAMPLE_SCORE.demand).toBe('12.0')
  })

  it('reconciles the breakdown with the score printed above it', () => {
    const lines = [EXAMPLE_SCORE.cashflow, EXAMPLE_SCORE.comparables, EXAMPLE_SCORE.demand]
    const summed = lines.reduce((total, line) => total + Number(line), 0)

    // The lines add to the earned total exactly, which is the claim the page
    // makes in words.
    expect(summed.toFixed(1)).toBe(EXAMPLE_SCORE.earned)

    // And the score above them is that total over the points that were
    // available, not the raw sum. Room to add value offers none, so 85.
    expect(EXAMPLE_SCORE.available).toBe('85')
    expect(((summed / 85) * 100).toFixed(1)).toBe(EXAMPLE_SCORE.quality)
  })

  it('earns the band the deal card claims for it', () => {
    expect(exampleBand()).toBe('Strong')
  })

  it('dates its history relative to now, so the page cannot go stale', () => {
    const now = new Date()
    const events = exampleEvents(now)
    const newest = Math.max(...events.map((event) => event.observedAt.getTime()))
    const oldest = Math.min(...events.map((event) => event.observedAt.getTime()))
    const daysAgo = (time: number) => (now.getTime() - time) / 86_400_000

    expect(EXAMPLE.lastMoved).toContain('45 days ago')
    expect(daysAgo(newest)).toBeCloseTo(45, 5)
    // Nothing in the example history is more than two years back, whenever the
    // page is rendered. A hard-coded year could not promise that.
    expect(daysAgo(oldest)).toBeLessThan(730)
  })
})
