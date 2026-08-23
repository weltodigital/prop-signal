/**
 * UK postcode handling.
 *
 * Normalised before it is stored so that "m14 5tp", "M145TP" and "M14 5TP" are
 * one postcode rather than three. That matters more than tidiness here: the
 * PropertyData cache is keyed on the request, so three spellings would be three
 * calls and three charges for the same area.
 */

// Outward code, then the inward code's digit and two letters. Deliberately not
// the full Royal Mail expression, which rejects valid postcodes for the sake of
// catching typos we would rather let the API reject.
const FULL_POSTCODE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/

export function normalisePostcode(input: string): string | null {
  const compact = input.toUpperCase().replace(/\s+/g, '')

  if (!FULL_POSTCODE.test(compact)) return null

  // The inward code is always the last three characters.
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

export function isValidPostcode(input: string): boolean {
  return normalisePostcode(input) !== null
}

/** The outward code, for describing an area without naming a doorstep. */
export function outwardCode(postcode: string): string | null {
  const normalised = normalisePostcode(postcode)
  return normalised ? (normalised.split(' ')[0] ?? null) : null
}
