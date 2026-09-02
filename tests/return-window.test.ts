/**
 * The cohort a strategy return is ranked against.
 *
 * The rule this file exists to hold: a property's score is a fact about the
 * property. Until the window existed it was partly a fact about whoever else
 * happened to come back in the same run, which meant a standing list could drop
 * a deal for a reason that had nothing to do with it — and meant no two scores
 * were comparable, in a product that is collecting completion figures.
 */
import { describe, expect, it } from 'vitest'
import { areaKeyFor } from '@/lib/pipeline/return-window'
import { measureQuality, qualityScores, type AreaContext, type Enrichment } from '@/lib/pipeline/scoring'
import { normaliseListing } from '@/lib/pipeline/listing'

const AREA: AreaContext = {
  soldPricePerSqFt: 300,
  localGrossYieldPercent: 6,
  floodRisk: 'Very Low',
  leaseholdShare: 0.1,
}

function enrichment(rent: number): Enrichment {
  return { estimatedValue: 260_000, estimatedRent: rent, areaDemandRating: 65, soldPricePerSqFt: null }
}

function listing(price: number) {
  return normaliseListing({
    id: `pd-${price}`,
    sqf: 900,
    address: '12 Example Street',
    postcode: 'M14 5TP',
    price,
    bedrooms: 3,
    type_standardised: 'Terraced house',
    lists: ['reduced-properties'],
    days_on_market: 30,
  })
}

/** The return factor's points, which is the only thing the window moves. */
function returnPoints(score: { factors: Array<{ label: string; points: number }> }): number {
  return score.factors.find((factor) => factor.label.startsWith('Monthly cashflow'))?.points ?? 0
}

/** A window of n values spread either side of the value under test. */
function windowOf(count: number, from: number, to: number): number[] {
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1))
}

describe('the area key', () => {
  it('is the outward code, however the postcode was typed', () => {
    expect(areaKeyFor('M14 5TP')).toBe('M14')
    expect(areaKeyFor('m145tp')).toBe('M14')
    expect(areaKeyFor('PO9 1AB')).toBe('PO9')
    expect(areaKeyFor('SW1A 1AA')).toBe('SW1A')
  })

  it('groups two radii around one postcode into one window', () => {
    // Deliberate. A score has to mean the same thing for both subscribers or
    // nothing can be compared between them.
    expect(areaKeyFor('M14 5TP')).toBe(areaKeyFor('M14 6AA'))
  })
})

describe('a score is a fact about the property, not about the run', () => {
  const subject = measureQuality('btl', listing(180_000), enrichment(1_500), AREA)

  it('does not move when the other properties in the run change', () => {
    const window = windowOf(60, -200, 900)

    // The same property, measured twice, in two very different weeks: once
    // among poor company and once among excellent company.
    const poorCompany = [subject, measureQuality('btl', listing(400_000), enrichment(700), AREA)]
    const goodCompany = [
      subject,
      measureQuality('btl', listing(120_000), enrichment(2_400), AREA),
      measureQuality('btl', listing(130_000), enrichment(2_300), AREA),
    ]

    const inPoor = qualityScores(poorCompany, undefined, window)[0]!
    const inGood = qualityScores(goodCompany, undefined, window)[0]!

    // The run still contributes its own values, so this is not identical — but
    // it is close, where without a window it was the difference between top of
    // the cohort and bottom of it.
    expect(Math.abs(returnPoints(inPoor) - returnPoints(inGood))).toBeLessThan(4)
  })

  it('swings on the company it keeps when there is no window', () => {
    const poorCompany = [subject, measureQuality('btl', listing(400_000), enrichment(700), AREA)]
    const goodCompany = [
      subject,
      measureQuality('btl', listing(120_000), enrichment(2_400), AREA),
      measureQuality('btl', listing(130_000), enrichment(2_300), AREA),
    ]

    const inPoor = returnPoints(qualityScores(poorCompany)[0]!)
    const inGood = returnPoints(qualityScores(goodCompany)[0]!)

    // This is the behaviour the window replaces, pinned so the difference is
    // visible rather than asserted in a comment. Same house, same price, same
    // rent, and twenty points between the two weeks.
    expect(inPoor - inGood).toBeGreaterThan(15)
  })

  it('gives a lone candidate a real place instead of the middle', () => {
    // A cohort of one has no ranking to give and scores half the factor by
    // definition. Against a window, one property in a quiet week is ranked on
    // what it is worth.
    const alone = returnPoints(qualityScores([subject])[0]!)
    const against = returnPoints(qualityScores([subject], undefined, windowOf(60, -400, 200))[0]!)

    expect(alone).toBeCloseTo(20, 1)
    expect(against).toBeGreaterThan(30)
  })
})

describe('the window does not change the rules it sits under', () => {
  it('still refuses to give a loss more than half the factor', () => {
    // A property losing money every month, in an area where everything else
    // loses more. It ranks top of its cohort and still cannot take the factor.
    const losing = measureQuality('btl', listing(400_000), enrichment(600), AREA)
    const window = windowOf(60, -2_000, -1_200)

    const score = qualityScores([losing], undefined, window)[0]!
    expect(returnPoints(score)).toBeLessThanOrEqual(20)
  })

  it('says which cohort it used, so the breakdown cannot mislead', () => {
    const detailFromRun = qualityScores([
      measureQuality('btl', listing(180_000), enrichment(1_500), AREA),
      measureQuality('btl', listing(190_000), enrichment(1_400), AREA),
    ])[0]!.factors.find((f) => f.label.startsWith('Monthly cashflow'))!.detail

    const detailFromWindow = qualityScores(
      [measureQuality('btl', listing(180_000), enrichment(1_500), AREA)],
      undefined,
      windowOf(60, -200, 900),
    )[0]!.factors.find((f) => f.label.startsWith('Monthly cashflow'))!.detail

    expect(detailFromRun).toContain("this week's candidates")
    expect(detailFromWindow).toContain('last three months')
  })
})
