/**
 * Which candidates are worth spending on.
 *
 * A property cannot clear the quality floor without a rent estimate, cannot get
 * one without being enriched, and only twenty-five are enriched per run. So
 * this screen decides what can reach the list at all, and if it disagrees with
 * the scoring then the scoring does not get the final say.
 */
import { describe, expect, it } from 'vitest'
import { chooseEnrichmentTargets } from '@/lib/pipeline/run'
import { normaliseListing, type Listing } from '@/lib/pipeline/listing'
import type { PropertyEvent } from '@/lib/pipeline/events'

const AREA_PER_SQ_FT = 300

function listing(key: string, price: number, sqf: number | null = 1_000): Listing {
  return normaliseListing({
    id: key,
    address: `${key} Street`,
    postcode: 'PO9 3LR',
    price,
    bedrooms: 3,
    type_standardised: 'Terraced house',
    sqf,
  })
}

function reduction(percent: number): PropertyEvent {
  return {
    type: 'price_reduced',
    observedAt: new Date('2026-08-01'),
    previousValue: null,
    currentValue: null,
    magnitude: -percent,
    isMaterial: true,
    dedupeKey: `r${percent}`,
  }
}

describe('chooseEnrichmentTargets', () => {
  it('picks a cheap property that has never moved over an average one that has', () => {
    // The case the old screen got wrong. Ranking on movement alone meant a
    // great deal listed yesterday was never enriched, so it could never score,
    // so it could never appear however good it was.
    const cheapAndStill = listing('cheap', 210_000) // £210/sq ft against £300
    const averageAndMoved = listing('moved', 300_000) // at the benchmark

    const events = new Map([[averageAndMoved.key, [reduction(15)]]])

    const [first] = chooseEnrichmentTargets([averageAndMoved, cheapAndStill], events, AREA_PER_SQ_FT, 1)
    expect(first?.key).toBe(cheapAndStill.key)
  })

  it('still prefers the mover when two look equally good', () => {
    const quiet = listing('quiet', 240_000)
    const moved = listing('moved', 240_000)
    const events = new Map([[moved.key, [reduction(18)]]])

    const [first] = chooseEnrichmentTargets([quiet, moved], events, AREA_PER_SQ_FT, 1)
    expect(first?.key).toBe(moved.key)
  })

  it('falls back to movement when there is no benchmark to screen against', () => {
    const quiet = listing('quiet', 210_000)
    const moved = listing('moved', 300_000)
    const events = new Map([[moved.key, [reduction(15)]]])

    const [first] = chooseEnrichmentTargets([quiet, moved], events, null, 1)
    expect(first?.key).toBe(moved.key)
  })

  it('does not fall over on a property with no floor area', () => {
    const noArea = listing('noarea', 200_000, null)
    const picked = chooseEnrichmentTargets([noArea], new Map(), AREA_PER_SQ_FT, 5)
    expect(picked).toHaveLength(1)
  })

  it('honours the cap', () => {
    const many = Array.from({ length: 40 }, (_, i) => listing(`p${i}`, 200_000 + i * 1_000))
    expect(chooseEnrichmentTargets(many, new Map(), AREA_PER_SQ_FT, 25)).toHaveLength(25)
  })
})
