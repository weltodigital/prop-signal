import { describe, expect, it } from 'vitest'
import { bandFor, bandMidpoint, bandTotal, REFURB_BANDS } from '@/lib/refurb'

describe('the refurbishment bands', () => {
  it('runs from cheapest to dearest with no gaps between the bands', () => {
    for (let i = 1; i < REFURB_BANDS.length; i += 1) {
      expect(REFURB_BANDS[i]!.perSqFtLow).toBe(REFURB_BANDS[i - 1]!.perSqFtHigh)
    }
  })

  it('is a range in every band, never a single figure', () => {
    for (const band of REFURB_BANDS) {
      expect(band.perSqFtHigh).toBeGreaterThan(band.perSqFtLow)
    }
  })

  it('takes the middle of a band for the box', () => {
    expect(bandMidpoint(REFURB_BANDS[0]!)).toBe(38)
  })
})

describe('what a band comes to for one property', () => {
  it('multiplies by the floor area and rounds to the nearest hundred', () => {
    expect(bandTotal(REFURB_BANDS[1]!, 850)).toEqual({ low: 42500, high: 85000 })
  })

  it('answers nothing where no floor area is held, rather than assuming one', () => {
    expect(bandTotal(REFURB_BANDS[1]!, null)).toBeNull()
    expect(bandTotal(REFURB_BANDS[1]!, 0)).toBeNull()
    expect(bandTotal(REFURB_BANDS[1]!, Number.NaN)).toBeNull()
  })
})

describe('placing a figure in a band', () => {
  it('finds the band a figure sits in', () => {
    expect(bandFor(30)?.id).toBe('light')
    expect(bandFor(75)?.id).toBe('full')
    expect(bandFor(150)?.id).toBe('structural')
  })

  it('has no band for nothing, or for a figure past the top of the last one', () => {
    expect(bandFor(null)).toBeNull()
    expect(bandFor(400)).toBeNull()
  })
})
