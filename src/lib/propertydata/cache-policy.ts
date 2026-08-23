import { MAX_PAYLOAD_AGE_MS, endpointSpec, type EndpointName } from './endpoints'

/**
 * Pure decisions about stored payloads. No database, no network — so the rules
 * that matter most can be tested exhaustively and cheaply.
 */

export type StoredPayload = {
  retrievedAt: Date
  expiresAt: Date
}

/**
 * When a payload fetched now stops being current.
 *
 * The endpoint's TTL applies, clamped to 60 days from retrieval. The clamp is
 * not decoration: it is the last line of code between a mistyped TTL and a
 * breach of PropertyData's terms.
 */
export function resolveExpiry(name: EndpointName, retrievedAt: Date): Date {
  const ttl = Math.max(0, endpointSpec(name).ttlMs)
  const ceiling = retrievedAt.getTime() + MAX_PAYLOAD_AGE_MS
  return new Date(Math.min(retrievedAt.getTime() + ttl, ceiling))
}

/**
 * Whether a stored payload may be served as an answer about the present.
 *
 * Two conditions, both required. The TTL has not run out, and the payload is
 * under 60 days old whatever its expiry claims. A row that fails the second
 * test is a bug elsewhere, and this returns false rather than trusting it.
 */
export function isReadableAsCurrent(payload: StoredPayload, now: Date = new Date()): boolean {
  const age = now.getTime() - payload.retrievedAt.getTime()

  if (age < 0) return false // Retrieved in the future. Clock skew or a forged row.
  if (age >= MAX_PAYLOAD_AGE_MS) return false
  return payload.expiresAt.getTime() > now.getTime()
}

/** Whether a row must be deleted, regardless of whether anyone is reading it. */
export function isPurgeable(payload: StoredPayload, now: Date = new Date()): boolean {
  const age = now.getTime() - payload.retrievedAt.getTime()
  return age >= MAX_PAYLOAD_AGE_MS || payload.expiresAt.getTime() <= now.getTime()
}

/**
 * Keys stripped from every payload before it is stored.
 *
 * Listing photographs carry no rights. We link to the original advert instead,
 * and the safest way to honour that is for an image URL never to reach our
 * database in the first place. Stripping happens in the wrapper, so no caller
 * can opt out.
 */
const IMAGE_KEYS = new Set([
  'image',
  'images',
  'image_url',
  'image_urls',
  'main_image',
  'media',
  'photo',
  'photos',
  'picture',
  'pictures',
  'thumbnail',
  'thumbnails',
])

/** Removes image fields from a payload, at any depth. Returns a new value. */
export function stripImageFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripImageFields(item)) as unknown as T
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (IMAGE_KEYS.has(key.toLowerCase())) continue
      out[key] = stripImageFields(item)
    }
    return out as unknown as T
  }

  return value
}
