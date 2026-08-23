import { describe, expect, it } from 'vitest'
import { searchProfileSchema } from '@/lib/search-profile'
import { RADIUS_OPTIONS, SEARCH_CHANGE_LIMIT } from '@/lib/search-profile.types'

function form(overrides: Record<string, unknown> = {}) {
  return {
    postcode: 'm14 5tp',
    radiusMiles: '10',
    strategies: ['reduced-properties'],
    minPrice: '',
    maxPrice: '',
    minBedrooms: '',
    propertyTypes: [],
    ...overrides,
  }
}

describe('the two questions', () => {
  it('accepts a postcode and one strategy, which is the whole requirement', () => {
    const result = searchProfileSchema.safeParse(form())

    expect(result.success).toBe(true)
    expect(result.data?.postcode).toBe('M14 5TP')
    expect(result.data?.strategies).toEqual(['reduced-properties'])
    expect(result.data?.minPrice).toBeNull()
    expect(result.data?.propertyTypes).toBeNull()
  })

  it('normalises the postcode so one area cannot become two cache entries', () => {
    for (const spelling of ['M145TP', 'm14 5tp', ' M14  5TP ']) {
      expect(searchProfileSchema.safeParse(form({ postcode: spelling })).data?.postcode).toBe('M14 5TP')
    }
  })

  it('refuses a postcode that is not a full one', () => {
    const result = searchProfileSchema.safeParse(form({ postcode: 'M14' }))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('full UK postcode')
  })

  it('refuses no strategy at all', () => {
    const result = searchProfileSchema.safeParse(form({ strategies: [] }))
    expect(result.success).toBe(false)
  })

  it('de-duplicates a strategy chosen twice', () => {
    const result = searchProfileSchema.safeParse(
      form({ strategies: ['reduced-properties', 'reduced-properties', 'auction-properties'] }),
    )
    expect(result.data?.strategies).toEqual(['reduced-properties', 'auction-properties'])
  })
})

describe('the radius', () => {
  it.each(RADIUS_OPTIONS)('accepts the offered radius of %i miles', (miles) => {
    expect(searchProfileSchema.safeParse(form({ radiusMiles: String(miles) })).success).toBe(true)
  })

  it('refuses a radius that was not offered, including one wide enough to be expensive', () => {
    for (const miles of ['0', '41', '200', '-5']) {
      expect(searchProfileSchema.safeParse(form({ radiusMiles: miles })).success).toBe(false)
    }
  })

  it('stops well short of the 200 miles the API would allow', () => {
    expect(Math.max(...RADIUS_OPTIONS)).toBeLessThanOrEqual(40)
  })
})

describe('the optional third question', () => {
  it('reads a price with a pound sign and commas', () => {
    const result = searchProfileSchema.safeParse(form({ minPrice: '£80,000', maxPrice: '250000' }))

    expect(result.data?.minPrice).toBe(80_000)
    expect(result.data?.maxPrice).toBe(250_000)
  })

  it('refuses a price range that is the wrong way round', () => {
    const result = searchProfileSchema.safeParse(form({ minPrice: '300000', maxPrice: '100000' }))

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(['maxPrice'])
  })

  it('refuses something that is not a number', () => {
    expect(searchProfileSchema.safeParse(form({ maxPrice: 'about 200k' })).success).toBe(false)
  })

  it('treats an empty answer as no filter rather than as zero', () => {
    const result = searchProfileSchema.safeParse(form({ minPrice: '', minBedrooms: '' }))

    expect(result.data?.minPrice).toBeNull()
    expect(result.data?.minBedrooms).toBeNull()
  })

  it('accepts zero bedrooms, which is a studio and not a mistake', () => {
    expect(searchProfileSchema.safeParse(form({ minBedrooms: '0' })).data?.minBedrooms).toBe(0)
  })

  it('refuses an implausible bedroom count', () => {
    expect(searchProfileSchema.safeParse(form({ minBedrooms: '99' })).success).toBe(false)
  })
})

describe('limits', () => {
  it('caps strategies at eight', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `list-${i}`)
    expect(searchProfileSchema.safeParse(form({ strategies: nine })).success).toBe(false)
  })

  it('keeps the search change quota small and finite', () => {
    expect(SEARCH_CHANGE_LIMIT).toBeGreaterThan(0)
    expect(SEARCH_CHANGE_LIMIT).toBeLessThanOrEqual(5)
  })
})
