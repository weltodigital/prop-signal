/**
 * The parts of the search profile that a browser needs.
 *
 * Split out of `search-profile.ts` because that module imports `server-only`.
 * Types, constants and the shape of the form live here; anything that reads or
 * writes the database lives there.
 */

export const RADIUS_OPTIONS = [1, 3, 5, 10, 15, 20, 30, 40] as const

/** PropertyData's standardised types, which is what the payload is filtered against. */
export const PROPERTY_TYPES = [
  { id: 'flat', label: 'Flat' },
  { id: 'terraced_house', label: 'Terraced house' },
  { id: 'semi-detached_house', label: 'Semi-detached house' },
  { id: 'detached_house', label: 'Detached house' },
] as const

/**
 * Changes to the search itself in one allowance period. Not unlimited, because
 * each one triggers a fresh backfill over the whole standing inventory of a new
 * area, and that is the most expensive thing this product does.
 */
export const SEARCH_CHANGE_LIMIT = 3

export type StrategyList = {
  id: string
  label: string
  description: string
  verified: boolean
}

export type SearchProfile = {
  id: string
  postcode: string
  radiusMiles: number
  strategies: string[]
  minPrice: number | null
  maxPrice: number | null
  minBedrooms: number | null
  propertyTypes: string[] | null
  backfillCompletedAt: string | null
  lastRunAt: string | null
}
