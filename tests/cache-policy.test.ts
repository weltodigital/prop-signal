import { describe, expect, it } from 'vitest'
import {
  isPurgeable,
  isReadableAsCurrent,
  resolveExpiry,
  stripImageFields,
} from '@/lib/propertydata/cache-policy'
import { DAY_MS, ENDPOINTS, MAX_PAYLOAD_AGE_MS, type EndpointName } from '@/lib/propertydata/endpoints'

const NOW = new Date('2026-06-01T12:00:00.000Z')

function ago(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS)
}

describe('the 60-day ceiling', () => {
  it('is sixty days', () => {
    expect(MAX_PAYLOAD_AGE_MS).toBe(60 * DAY_MS)
  })

  it.each(Object.keys(ENDPOINTS) as EndpointName[])(
    'never lets %s expire more than 60 days after retrieval',
    (endpoint) => {
      const retrievedAt = new Date('2026-01-01T00:00:00.000Z')
      const expiry = resolveExpiry(endpoint, retrievedAt)

      expect(expiry.getTime() - retrievedAt.getTime()).toBeLessThanOrEqual(MAX_PAYLOAD_AGE_MS)
      expect(expiry.getTime()).toBeGreaterThan(retrievedAt.getTime())
    },
  )

  it('clamps a TTL that is longer than 60 days', () => {
    // Stand in for someone typing 90 into endpoints.ts. The clamp is the only
    // thing between that and a breach of PropertyData's terms.
    const retrievedAt = new Date('2026-01-01T00:00:00.000Z')
    const ninetyDays = { ...ENDPOINTS.demand, ttlMs: 90 * DAY_MS }
    const clamped = Math.min(retrievedAt.getTime() + ninetyDays.ttlMs, retrievedAt.getTime() + MAX_PAYLOAD_AGE_MS)

    expect(clamped - retrievedAt.getTime()).toBe(MAX_PAYLOAD_AGE_MS)
  })

  it('refuses to read a payload older than 60 days, whatever its expiry claims', () => {
    // This is the test the build order asks for. A row that says it is good for
    // another year is still refused once it is over 60 days old.
    const forged = {
      retrievedAt: ago(61),
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    }

    expect(isReadableAsCurrent(forged, NOW)).toBe(false)
    expect(isPurgeable(forged, NOW)).toBe(true)
  })

  it('refuses a payload exactly 60 days old', () => {
    const boundary = { retrievedAt: ago(60), expiresAt: new Date('2099-01-01T00:00:00.000Z') }
    expect(isReadableAsCurrent(boundary, NOW)).toBe(false)
  })

  it('still serves a payload a day under the ceiling with time left on its TTL', () => {
    const fresh = { retrievedAt: ago(59), expiresAt: new Date(NOW.getTime() + DAY_MS) }
    expect(isReadableAsCurrent(fresh, NOW)).toBe(true)
    expect(isPurgeable(fresh, NOW)).toBe(false)
  })
})

describe('isReadableAsCurrent', () => {
  it('refuses an expired payload that is well inside 60 days', () => {
    const expired = { retrievedAt: ago(5), expiresAt: ago(2) }
    expect(isReadableAsCurrent(expired, NOW)).toBe(false)
    expect(isPurgeable(expired, NOW)).toBe(true)
  })

  it('refuses a payload retrieved in the future', () => {
    const skewed = { retrievedAt: new Date(NOW.getTime() + DAY_MS), expiresAt: new Date(NOW.getTime() + 2 * DAY_MS) }
    expect(isReadableAsCurrent(skewed, NOW)).toBe(false)
  })

  it('refuses a payload at the instant it expires', () => {
    const boundary = { retrievedAt: ago(3), expiresAt: NOW }
    expect(isReadableAsCurrent(boundary, NOW)).toBe(false)
  })
})

describe('TTLs against the weekly run', () => {
  it('expires sourced-properties before the next Sunday run', () => {
    expect(ENDPOINTS['sourced-properties'].ttlMs).toBeLessThan(7 * DAY_MS)
  })

  it('holds the slow-moving area and valuation data for longer than a week', () => {
    for (const endpoint of ['valuation-sale', 'valuation-rent', 'demand', 'demand-rent'] as const) {
      expect(ENDPOINTS[endpoint].ttlMs).toBeGreaterThan(7 * DAY_MS)
      expect(ENDPOINTS[endpoint].ttlMs).toBeLessThanOrEqual(MAX_PAYLOAD_AGE_MS)
    }
  })
})

describe('stripImageFields', () => {
  it('removes the image url PropertyData returns on every sourced property', () => {
    const payload = {
      status: 'success',
      properties: [
        { address: '1 Example Street', price: 250_000, image_url: 'https://media.rightmove.co.uk/1.jpeg' },
        { address: '2 Example Street', price: 300_000, images: ['https://example.com/a.jpg'] },
      ],
    }

    const stripped = stripImageFields(payload)

    expect(JSON.stringify(stripped)).not.toContain('jpeg')
    expect(JSON.stringify(stripped)).not.toContain('jpg')
    expect(stripped.properties[0]?.address).toBe('1 Example Street')
    expect(stripped.properties[0]?.price).toBe(250_000)
  })

  it('reaches image fields nested at any depth', () => {
    const payload = { a: { b: { c: [{ thumbnail: 'https://example.com/t.png', keep: 1 }] } } }
    const stripped = stripImageFields(payload)

    expect(stripped.a.b.c[0]).toEqual({ keep: 1 })
  })

  it('leaves the original untouched', () => {
    const payload = { image_url: 'https://example.com/a.jpg', price: 1 }
    stripImageFields(payload)
    expect(payload.image_url).toBe('https://example.com/a.jpg')
  })

  it('does not mistake a similarly named field for an image', () => {
    const payload = { imagery_notes: 'kept', image_url: 'dropped' }
    expect(stripImageFields(payload)).toEqual({ imagery_notes: 'kept' })
  })
})
