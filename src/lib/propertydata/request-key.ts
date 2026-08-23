import { createHash } from 'node:crypto'

/**
 * Turns a set of request parameters into a stable cache key.
 *
 * Two calls that differ only in the order they listed their parameters, or in
 * the case of a postcode, are the same call and must not be paid for twice.
 *
 * The API key is never part of the key and never part of what is stored.
 */

const SECRET_PARAMS = new Set(['key', 'api_key', 'apikey'])

export function redactParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}

  for (const [rawKey, rawValue] of Object.entries(params)) {
    const key = rawKey.toLowerCase()
    if (SECRET_PARAMS.has(key)) continue
    if (rawValue === undefined || rawValue === null || rawValue === '') continue

    out[key] = String(rawValue).trim()
  }

  return out
}

/** Case-insensitive for postcodes and list ids; order-insensitive throughout. */
export function canonicaliseParams(params: Record<string, unknown>): Record<string, string> {
  const redacted = redactParams(params)
  const out: Record<string, string> = {}

  for (const key of Object.keys(redacted).sort()) {
    const value = redacted[key]!
    // Comma-separated lists are merged and de-duplicated by the API, so the
    // order the caller wrote them in is not part of the request's identity.
    out[key] = value.includes(',')
      ? value
          .split(',')
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean)
          .sort()
          .join(',')
      : value.toLowerCase()
  }

  return out
}

export function requestKey(endpoint: string, params: Record<string, unknown>): string {
  const canonical = canonicaliseParams(params)
  const material = `${endpoint}?${new URLSearchParams(canonical).toString()}`
  return createHash('sha256').update(material).digest('hex').slice(0, 32)
}
