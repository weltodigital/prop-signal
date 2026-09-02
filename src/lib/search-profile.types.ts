import type { InvestmentStrategy, StrategyAssumptions } from '@/lib/strategies'

/**
 * The parts of the search profile that a browser needs.
 *
 * Split out of `search-profile.ts` because that module imports `server-only`.
 * Types, constants and the shape of the form live here; anything that reads or
 * writes the database lives there.
 */

/**
 * The radii on offer, in miles.
 *
 * The API accepts 1 to 200. A hundred is the ceiling here because past that a
 * "local area" is a region, and the steps widen as they go because the
 * difference between 60 and 80 miles matters less than the difference between
 * 3 and 5.
 *
 * How wide somebody searches is the single biggest thing they control about how
 * many properties reach them, which is why the form says so.
 */
export const RADIUS_OPTIONS = [1, 3, 5, 10, 15, 20, 30, 40, 60, 80, 100] as const

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
 *
 * Widening the radius is counted separately — see `RADIUS_WIDEN_LIMIT`.
 */
export const SEARCH_CHANGE_LIMIT = 3

/**
 * Widenings of the radius in one allowance period, out of their own allowance.
 *
 * This exists because the cap above was landing on exactly the subscriber it
 * should have been helping. The form tells somebody the radius is the biggest
 * thing they control and that a thin list is fixed by widening it; charging
 * that to the same three changes that exist to stop somebody re-sourcing a new
 * county every week meant we rationed our own advice.
 *
 * Still bounded, because a widening still costs a backfill. Bounded by
 * something only widening can spend.
 */
export const RADIUS_WIDEN_LIMIT = 3

export type SourcingList = {
  id: string
  label: string
  description: string
  verified: boolean
  /** The API rejects a wider search than this for this list. */
  maxRadiusMiles: number
}

export type SearchProfile = {
  id: string
  postcode: string
  radiusMiles: number
  /** PropertyData sourcing lists — which stock to pull. */
  sourcingLists: string[]
  /** How the subscriber makes money, which decides how a property is scored. */
  investmentStrategies: InvestmentStrategy[]
  assumptions: StrategyAssumptions
  minPrice: number | null
  maxPrice: number | null
  minBedrooms: number | null
  propertyTypes: string[] | null
  backfillCompletedAt: string | null
  lastRunAt: string | null
}
