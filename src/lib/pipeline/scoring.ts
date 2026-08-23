import type { Listing } from './listing'
import type { PropertyEvent } from './events'

/**
 * Scoring. Pure functions, versioned weights, no LLM anywhere in this path.
 *
 * Two scores, added. A quality score for whether the property is any good, and
 * a movement score for how hard and how recently it moved. A mediocre property
 * that just dropped 12% can outrank a good one that has not moved, which is the
 * whole premise of the product.
 *
 * Every stored score records the version below. Change the weights, change the
 * version, and old scores stay readable as what they were.
 */

export const SCORE_VERSION = 'v1'

export type Weights = {
  quality: {
    /** Gross yield: annual rent against asking price. */
    yield: number
    /** Asking price against the estimated value of the property. */
    valueGap: number
    /** Local sales demand, from the area-level figure. */
    demand: number
    /** Whether the property is on a list that implies work, and so margin. */
    condition: number
  }
  movement: {
    /** Size of a price reduction. */
    reduction: number
    /** A return to market after a fall-through. */
    returned: number
    /** Time on the market, once it has crossed a mark. */
    stale: number
    /** How recently the qualifying event fired. */
    recency: number
  }
}

export const DEFAULT_WEIGHTS: Weights = {
  quality: { yield: 30, valueGap: 30, demand: 20, condition: 20 },
  movement: { reduction: 40, returned: 25, stale: 20, recency: 15 },
}

export type Factor = {
  /** Plain English, shown to the user. */
  label: string
  /** Points contributed, after weighting. */
  points: number
  /** The figure the points came from, stated so it can be argued with. */
  detail: string
}

export type Score = {
  score: number
  factors: Factor[]
  version: string
}

export type Enrichment = {
  estimatedValue: number | null
  estimatedRent: number | null
  areaDemandRating: number | null
}

/** Maps a value onto 0..1 between a floor and a ceiling. */
function band(value: number, floor: number, ceiling: number): number {
  if (ceiling === floor) return 0
  return Math.min(1, Math.max(0, (value - floor) / (ceiling - floor)))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

/** Lists that imply the property needs work, and so carries margin. */
const CONDITION_LISTS = new Set([
  'unmodernised-properties',
  'repossessed-properties',
  'auction-properties',
  'short-lease-properties',
])

/**
 * How good the property is, ignoring whether it has moved.
 *
 * A factor with no data behind it scores nothing rather than an assumed
 * average. Omitting is better than estimating, and the breakdown says so.
 */
export function quality(
  listing: Listing,
  enrichment: Enrichment,
  weights: Weights = DEFAULT_WEIGHTS,
): Score {
  const factors: Factor[] = []
  const w = weights.quality

  // --- Gross yield ---------------------------------------------------------
  if (listing.price && listing.price > 0 && enrichment.estimatedRent) {
    const grossYield = ((enrichment.estimatedRent * 12) / listing.price) * 100
    // 4% is unremarkable, 10% is exceptional for a UK single let.
    const points = round(band(grossYield, 4, 10) * w.yield)
    factors.push({
      label: 'Gross yield',
      points,
      detail: `${grossYield.toFixed(1)}% on £${enrichment.estimatedRent.toLocaleString('en-GB')} a month against the asking price`,
    })
  } else {
    factors.push({ label: 'Gross yield', points: 0, detail: 'No rent estimate held' })
  }

  // --- Price against value -------------------------------------------------
  if (listing.price && listing.price > 0 && enrichment.estimatedValue) {
    const discount = ((enrichment.estimatedValue - listing.price) / enrichment.estimatedValue) * 100
    // At value scores nothing; 25% under scores everything.
    const points = round(band(discount, 0, 25) * w.valueGap)
    factors.push({
      label: 'Price against comparables',
      points,
      detail:
        discount >= 0
          ? `${discount.toFixed(1)}% below the £${enrichment.estimatedValue.toLocaleString('en-GB')} estimate`
          : `${Math.abs(discount).toFixed(1)}% above the £${enrichment.estimatedValue.toLocaleString('en-GB')} estimate`,
    })
  } else {
    factors.push({ label: 'Price against comparables', points: 0, detail: 'No sale valuation held' })
  }

  // --- Demand --------------------------------------------------------------
  if (enrichment.areaDemandRating !== null) {
    // PropertyData report demand on a 0 to 100 scale.
    const points = round(band(enrichment.areaDemandRating, 20, 80) * w.demand)
    factors.push({
      label: 'Local demand',
      points,
      detail: `Area demand rated ${enrichment.areaDemandRating.toFixed(0)} out of 100`,
    })
  } else {
    factors.push({ label: 'Local demand', points: 0, detail: 'No demand figure held' })
  }

  // --- Condition -----------------------------------------------------------
  const conditionLists = listing.lists.filter((list) => CONDITION_LISTS.has(list))
  if (conditionLists.length) {
    const points = round(Math.min(1, conditionLists.length / 2) * w.condition)
    factors.push({
      label: 'Room to add value',
      points,
      detail: `On ${conditionLists.length === 1 ? 'the' : ''} ${conditionLists.join(' and ')} list`,
    })
  } else {
    factors.push({ label: 'Room to add value', points: 0, detail: 'Not on a list that implies work' })
  }

  return {
    score: round(factors.reduce((total, factor) => total + factor.points, 0)),
    factors,
    version: SCORE_VERSION,
  }
}

/**
 * How hard and how recently the property moved.
 *
 * Driven by the events, not by the listing. A property with no events scores
 * zero here and has to stand on quality alone.
 */
export function movement(
  events: PropertyEvent[],
  observedAt: Date,
  weights: Weights = DEFAULT_WEIGHTS,
): Score {
  const factors: Factor[] = []
  const w = weights.movement

  const reductions = events.filter((event) => event.type === 'price_reduced')
  if (reductions.length) {
    const deepest = Math.max(...reductions.map((event) => Math.abs(event.magnitude ?? 0)))
    // 2% is noise, 20% is an agent in trouble.
    const points = round(band(deepest, 2, 20) * w.reduction)
    factors.push({
      label: reductions.length > 1 ? `Reduced ${reductions.length} times` : 'Price reduced',
      points,
      detail: `Largest reduction ${deepest.toFixed(1)}%`,
    })
  }

  if (events.some((event) => event.type === 'returned_to_market')) {
    factors.push({
      label: 'Back on the market',
      points: w.returned,
      detail: 'Returned after coming off, which usually means a fall-through',
    })
  }

  const crossing = events.find((event) => event.type === 'days_on_market_crossed')
  if (crossing) {
    const days = crossing.magnitude ?? 0
    // 60 days is ordinary, a year is not.
    const points = round(band(days, 60, 365) * w.stale)
    factors.push({
      label: 'Slow to sell',
      points,
      detail: `Passed ${days.toFixed(0)} days on the market`,
    })
  }

  // --- Recency -------------------------------------------------------------
  if (events.length) {
    const newest = Math.max(...events.map((event) => event.observedAt.getTime()))
    const daysAgo = Math.max(0, (observedAt.getTime() - newest) / 86_400_000)
    // This week is worth everything; a month ago is worth nothing.
    const points = round((1 - band(daysAgo, 0, 28)) * w.recency)
    factors.push({
      label: 'Recency',
      points,
      detail: daysAgo < 1 ? 'Moved in this run' : `Moved ${Math.round(daysAgo)} days ago`,
    })
  }

  return {
    score: round(factors.reduce((total, factor) => total + factor.points, 0)),
    factors,
    version: SCORE_VERSION,
  }
}

export type RankedCandidate<T> = {
  candidate: T
  quality: Score
  movement: Score
  total: number
}

/**
 * Combines the two scores and orders the result.
 *
 * Straight addition. A weighted blend would let a good-but-static property beat
 * a mediocre one that just dropped twelve per cent, and that is precisely the
 * outcome this product exists to avoid.
 */
export function rank<T>(scored: Array<Omit<RankedCandidate<T>, 'total'>>): Array<RankedCandidate<T>> {
  return scored
    .map((entry) => ({ ...entry, total: round(entry.quality.score + entry.movement.score) }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      // A tie goes to the one that moved, not the one that merely looks good.
      return b.movement.score - a.movement.score
    })
}
