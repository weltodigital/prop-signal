import { describe, expect, it } from 'vitest'
import { applyFilter, listingsFromPayload, normaliseListing, propertyKey } from '@/lib/pipeline/listing'
import { weekOf } from '@/lib/pipeline/run'

describe('reading a sourced property', () => {
  it('reads the fields PropertyData document', () => {
    const listing = normaliseListing({
      address: '12 Example Street, Manchester',
      postcode: 'M14 5TP',
      price: 250_000,
      bedrooms: 3,
      type_standardised: 'Terraced house',
      url: 'https://www.rightmove.co.uk/properties/1',
      months_on_market: 4,
      lists: ['reduced-properties', 'unmodernised-properties'],
    })

    expect(listing.address).toBe('12 Example Street, Manchester')
    expect(listing.price).toBe(250_000)
    expect(listing.propertyType).toBe('Terraced house')
    expect(listing.lists).toEqual(['reduced-properties', 'unmodernised-properties'])
  })

  it('falls back through the alias list when a field is named differently', () => {
    const listing = normaliseListing({ display_address: '1 Other Road', asking_price: '£199,995', beds: '2' })

    expect(listing.address).toBe('1 Other Road')
    expect(listing.price).toBe(199_995)
    expect(listing.bedrooms).toBe(2)
  })

  it('turns months on the market into days when no day count is given', () => {
    expect(normaliseListing({ months_on_market: 4 }).daysOnMarket).toBe(122)
  })

  it('prefers an explicit day count over the month approximation', () => {
    expect(normaliseListing({ months_on_market: 4, days_on_market: 130 }).daysOnMarket).toBe(130)
  })

  it('reads sstc however it is expressed', () => {
    expect(normaliseListing({ sstc: 1 }).state).toBe('sstc')
    expect(normaliseListing({ sstc: true }).state).toBe('sstc')
    expect(normaliseListing({ sold_stc: 'yes' }).state).toBe('sstc')
    expect(normaliseListing({}).state).toBe('listed')
  })

  it('keeps the raw payload so a mapping fix can be applied later', () => {
    const raw = { unmapped_field: 'kept', price: 1 }
    expect(normaliseListing(raw).raw).toBe(raw)
  })

  it('survives a payload with nothing recognisable in it', () => {
    const listing = normaliseListing({ something_else: true })

    expect(listing.price).toBeNull()
    expect(listing.address).toBeNull()
    expect(listing.key).toMatch(/^addr:/)
  })

  it('reads the properties array, and ignores anything that is not one', () => {
    const listings = listingsFromPayload({ status: 'success', properties: [{ price: 1 }, null, 'nonsense'] })
    expect(listings).toHaveLength(1)
  })

  it('returns nothing for a payload with no properties at all', () => {
    expect(listingsFromPayload({ status: 'success' })).toEqual([])
    expect(listingsFromPayload(null)).toEqual([])
  })
})

describe('property identity', () => {
  it('uses PropertyData’s own id where there is one', () => {
    expect(propertyKey({ id: 'abc123', address: '1 Road' })).toBe('pd:abc123')
  })

  it('falls back to the listing url, which survives an address being retyped', () => {
    const a = propertyKey({ url: 'https://example.com/1', address: '12 Example Street' })
    const b = propertyKey({ url: 'https://example.com/1', address: '12 Example St' })

    expect(a).toBe(b)
    expect(a).toMatch(/^url:/)
  })

  it('falls back to address and postcode, ignoring spacing and case', () => {
    const a = propertyKey({ address: '12 Example Street', postcode: 'M14 5TP' })
    const b = propertyKey({ address: '12  EXAMPLE   street', postcode: 'M14 5TP' })

    expect(a).toBe(b)
  })

  it('keeps two different properties apart', () => {
    const a = propertyKey({ address: '12 Example Street', postcode: 'M14 5TP' })
    const b = propertyKey({ address: '14 Example Street', postcode: 'M14 5TP' })

    expect(a).not.toBe(b)
  })

  it('is stable across runs, which is what makes week-on-week diffing work', () => {
    const raw = { address: '12 Example Street', postcode: 'M14 5TP' }
    expect(propertyKey(raw)).toBe(propertyKey({ ...raw }))
  })
})

describe('the optional filters', () => {
  const listings = [
    normaliseListing({ address: 'a', price: 100_000, bedrooms: 2, type_standardised: 'Flat' }),
    normaliseListing({ address: 'b', price: 250_000, bedrooms: 3, type_standardised: 'Terraced house' }),
    normaliseListing({ address: 'c', price: 500_000, bedrooms: 5, type_standardised: 'Detached house' }),
  ]

  const none = { minPrice: null, maxPrice: null, minBedrooms: null, propertyTypes: null }

  it('keeps everything when nothing is set', () => {
    expect(applyFilter(listings, none)).toHaveLength(3)
  })

  it('applies a price range', () => {
    const kept = applyFilter(listings, { ...none, minPrice: 150_000, maxPrice: 300_000 })
    expect(kept.map((l) => l.address)).toEqual(['b'])
  })

  it('applies a bedroom floor', () => {
    expect(applyFilter(listings, { ...none, minBedrooms: 3 }).map((l) => l.address)).toEqual(['b', 'c'])
  })

  it('matches a property type across spelling and separators', () => {
    const kept = applyFilter(listings, { ...none, propertyTypes: ['terraced_house'] })
    expect(kept.map((l) => l.address)).toEqual(['b'])
  })

  it('drops a property whose price is unknown when a price filter is set', () => {
    const unknown = [normaliseListing({ address: 'x' })]
    expect(applyFilter(unknown, { ...none, maxPrice: 300_000 })).toEqual([])
  })
})

describe('the week a run publishes into', () => {
  it('puts a Sunday-night run into the Monday after it', () => {
    // The cron runs Sunday 22:00 and the list is there on Monday morning.
    expect(weekOf(new Date('2026-06-07T22:00:00.000Z'))).toBe('2026-06-08')
  })

  it('puts a Monday run into that same Monday', () => {
    expect(weekOf(new Date('2026-06-08T09:00:00.000Z'))).toBe('2026-06-08')
  })

  it('puts a midweek manual run into the Monday of its own week, not the next one', () => {
    expect(weekOf(new Date('2026-06-10T12:00:00.000Z'))).toBe('2026-06-08') // Wednesday
    expect(weekOf(new Date('2026-06-13T12:00:00.000Z'))).toBe('2026-06-08') // Saturday
  })

  it('never lands on anything but a Monday', () => {
    for (let day = 0; day < 21; day += 1) {
      const date = new Date(Date.UTC(2026, 5, 1 + day, 13, 0, 0))
      expect(new Date(`${weekOf(date)}T00:00:00Z`).getUTCDay()).toBe(1)
    }
  })
})
