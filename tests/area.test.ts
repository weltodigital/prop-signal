import { describe, expect, it } from 'vitest'
import {
  matchAddress,
  normaliseAddress,
  readCouncilTax,
  readEpc,
  readFloodRisk,
  readGrowth,
  readLocalYield,
  readSoldComparables,
} from '@/lib/pipeline/area'

/**
 * Fixtures taken verbatim from live responses on 2026-08-24, trimmed for
 * length. If PropertyData change a shape, these are what fail.
 */

const SOLD = {
  status: 'success',
  postcode: 'M1 1AE',
  data: {
    points_analysed: 20,
    radius: '0.05',
    date_earliest: '2025-02-28',
    date_latest: '2026-05-22',
    average: 326,
    '70pc_range': [234, 356],
    '100pc_range': [163, 531],
    raw_data: [
      { date: '2025-10-23', price: 94500, type: 'flat', tenure: 'leasehold', sqf: 581, price_per_sqf: 163 },
      { date: '2026-02-26', price: 150000, type: 'flat', tenure: 'leasehold', sqf: 657, price_per_sqf: 228 },
      { date: '2025-05-16', price: 210000, type: 'flat', tenure: 'freehold', sqf: 592, price_per_sqf: 355 },
    ],
  },
}

const YIELDS = {
  status: 'success',
  data: { long_let: { points_analysed: 40, radius: '0.05', gross_yield: '9.5%' } },
}

const EPC = {
  status: 'success',
  energy_efficiency: [
    { inspection_date: '2026-05-12T23:00:00.000000Z', address: 'Apartment 19, 113 Newton Street', score: 67, rating: 'D' },
    { inspection_date: '2026-03-16T00:00:00.000000Z', address: 'Apartment 8, 113 Newton Street', score: 78, rating: 'C' },
    { inspection_date: null, address: null, score: 40, rating: null },
  ],
}

const COUNCIL_TAX = {
  status: 'success',
  council: 'Manchester',
  council_rating: 'Average tax',
  year: '2026/27',
  council_tax: { band_a: '1,541.36', band_c: '2,055.15', band_d: '2,312.04', band_h: '4,624.08' },
  properties: [
    { address: 'APARTMENT 1 AT 113, NEWTON STREET, MANCHESTER, M1 1AE', band: 'D' },
    { address: 'APARTMENT 3 AT 113, NEWTON STREET, MANCHESTER, M1 1AE', band: 'C' },
  ],
}

const GROWTH = {
  status: 'success',
  data: [
    ['Aug 2020', 236317, null],
    ['Aug 2021', 246498, '4.3%'],
    ['Aug 2022', 263672, '7.0%'],
    ['Aug 2023', 271309, '2.9%'],
    ['Aug 2024', 279000, '2.8%'],
    ['Aug 2025', 288000, '3.2%'],
    ['Aug 2026', 295000, '2.4%'],
  ],
}

describe('sold price comparables', () => {
  it('reads the average and the middle of the range', () => {
    const sold = readSoldComparables(SOLD)
    expect(sold.averagePricePerSqFt).toBe(326)
    expect(sold.rangeLow).toBe(234)
    expect(sold.rangeHigh).toBe(356)
    expect(sold.transactions).toBe(20)
    expect(sold.latestSale).toBe('2026-05-22')
  })

  it('works out how much of the local market is leasehold', () => {
    // Two of the three comparables sold leasehold.
    expect(readSoldComparables(SOLD).leaseholdShare).toBeCloseTo(2 / 3, 5)
  })

  it('holds nothing rather than guessing when the payload is empty', () => {
    const sold = readSoldComparables({})
    expect(sold.averagePricePerSqFt).toBeNull()
    expect(sold.leaseholdShare).toBeNull()
  })
})

describe('the local yield', () => {
  it('reads a percentage out of the string the API sends', () => {
    expect(readLocalYield(YIELDS)).toBe(9.5)
  })

  it('is null when the block is absent', () => {
    expect(readLocalYield({ data: {} })).toBeNull()
  })
})

describe('flood risk and growth', () => {
  it('reads the flood band as worded', () => {
    expect(readFloodRisk({ flood_risk: 'Very Low' })).toBe('Very Low')
    expect(readFloodRisk({})).toBeNull()
  })

  it('reads last year from the API and works out five years itself', () => {
    const growth = readGrowth(GROWTH)
    expect(growth.oneYear).toBe(2.4)
    // Aug 2026 against Aug 2021: 295,000 against 246,498.
    expect(growth.fiveYear).toBeCloseTo(19.68, 1)
  })

  it('returns nothing from a series too short to measure', () => {
    expect(readGrowth({ data: [['Aug 2026', 295000, null]] })).toEqual({ oneYear: null, fiveYear: null })
  })
})

describe('energy efficiency', () => {
  it('reads one row per certificate and drops the unusable ones', () => {
    const rows = readEpc(EPC)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      address: 'Apartment 19, 113 Newton Street',
      rating: 'D',
      score: 67,
      inspectedOn: '2026-05-12',
    })
  })
})

describe('council tax', () => {
  it('reads band D through the thousands separator', () => {
    const tax = readCouncilTax(COUNCIL_TAX)
    expect(tax.council).toBe('Manchester')
    expect(tax.bandD).toBeCloseTo(2312.04, 2)
    expect(tax.byAddress).toHaveLength(2)
  })
})

describe('matching an address across two sources', () => {
  it('matches across different wording and punctuation', () => {
    const rows = readCouncilTax(COUNCIL_TAX).byAddress
    // The listing says it one way, the council says it another.
    expect(matchAddress(rows, 'Apartment 3, 113 Newton Street')?.band).toBe('C')
  })

  it('matches an EPC certificate to the flat it belongs to', () => {
    expect(matchAddress(readEpc(EPC), 'Apartment 8, 113 Newton Street')?.rating).toBe('C')
  })

  it('returns nothing for a flat that is not in the list', () => {
    // A wrong EPC is worse than none, so a near miss must fail.
    expect(matchAddress(readEpc(EPC), 'Apartment 44, 113 Newton Street')).toBeNull()
  })

  it('refuses an address too short to be distinctive', () => {
    expect(matchAddress(readEpc(EPC), 'Flat')).toBeNull()
    expect(matchAddress(readEpc(EPC), null)).toBeNull()
  })

  it('strips the joining words that only one source uses', () => {
    expect(normaliseAddress('APARTMENT 1 AT 113, NEWTON STREET')).toBe('apartment 1 113 newton street')
  })
})
