import { stack } from '@/lib/stack'
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

export const SCORE_VERSION = 'v2'

/**
 * The finance the cashflow factor assumes.
 *
 * Stated here rather than buried, because every cashflow figure the product
 * shows is only true under these. They are ordinary buy-to-let terms and the
 * subscriber can put their own through the calculator on the property page.
 *
 * Versioned with the weights: change these and the scores mean something
 * different, so the version has to move with them.
 */
export const SCORING_FINANCE = {
  depositPercent: 25,
  annualRatePercent: 5.5,
  interestOnly: true,
  /** Management, insurance and maintenance, as a share of the rent. */
  costsPercentOfRent: 20,
} as const

export type Weights = {
  quality: {
    /** What is left each month after the mortgage and the running costs. */
    cashflow: number
    /** Asking price per square foot against what nearby homes actually sold for. */
    comparables: number
    /** This property's gross yield against the local benchmark. */
    yieldVsLocal: number
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
  quality: { cashflow: 30, comparables: 25, yieldVsLocal: 15, demand: 15, condition: 15 },
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

/**
 * The area-level figures, shared by every candidate in the same search.
 *
 * Sold prices per square foot are preferred to the sale valuation because they
 * are completed transactions and owe nothing to what anyone is currently
 * asking. A property that has been reduced twice is "below the estimate"
 * partly because the estimate follows the asking price down, which would let
 * one reduction earn points twice — once here and once in movement.
 */
export type AreaContext = {
  soldPricePerSqFt: number | null
  localGrossYieldPercent: number | null
  floodRisk: string | null
  leaseholdShare: number | null
}

export const EMPTY_AREA: AreaContext = {
  soldPricePerSqFt: null,
  localGrossYieldPercent: null,
  floodRisk: null,
  leaseholdShare: null,
}

/** The EPC for this specific property, where one was matched to its address. */
export type EnergyCertificate = { rating: string; score: number | null } | null

/**
 * Something that should stop a subscriber, stated rather than scored.
 *
 * A penalty would need a magnitude we cannot defend — how many points is an
 * EPC of F worth against a 12% reduction? Nobody knows. So these are surfaced
 * next to the property instead, where the subscriber applies their own
 * judgement to them.
 */
export type Risk = { label: string; detail: string }

const MEES_FAIL = new Set(['F', 'G'])
const MEES_TIGHT = new Set(['D', 'E'])

export function risks(area: AreaContext, epc: EnergyCertificate): Risk[] {
  const found: Risk[] = []

  if (epc && MEES_FAIL.has(epc.rating)) {
    found.push({
      label: `EPC ${epc.rating}`,
      detail: 'Cannot be let at this rating without works or a registered exemption.',
    })
  } else if (epc && MEES_TIGHT.has(epc.rating)) {
    found.push({
      label: `EPC ${epc.rating}`,
      detail: 'Lettable now. The proposed C minimum would need work before it could be let again.',
    })
  }

  const flood = area.floodRisk?.toLowerCase()
  if (flood && flood !== 'very low' && flood !== 'low') {
    found.push({ label: `Flood risk ${area.floodRisk}`, detail: 'Rivers and sea. Expect it to show in the premium.' })
  }

  if (area.leaseholdShare !== null && area.leaseholdShare >= 0.7) {
    found.push({
      label: 'Leasehold area',
      detail: `${Math.round(area.leaseholdShare * 100)}% of nearby sales were leasehold. Lease length, ground rent and service charge are not held here and change the numbers.`,
    })
  }

  return found
}

/**
 * Net monthly cashflow under `SCORING_FINANCE`.
 *
 * Reuses the same arithmetic as the calculator on the property page, so the
 * score and the figure the subscriber can reproduce cannot disagree.
 */
export function netMonthlyCashflow(price: number, monthlyRent: number): number {
  const result = stack({
    purchasePrice: price,
    refurbCost: 0,
    buyingCosts: 0,
    depositPercent: SCORING_FINANCE.depositPercent,
    annualRatePercent: SCORING_FINANCE.annualRatePercent,
    termYears: 25,
    interestOnly: SCORING_FINANCE.interestOnly,
    monthlyRent,
    monthlyCosts: Math.round(monthlyRent * (SCORING_FINANCE.costsPercentOfRent / 100)),
    postRefurbValue: null,
    refinanceLtvPercent: 75,
  })

  return result.monthlyCashflow
}

/** Maps a value onto 0..1 between a floor and a ceiling. */
function band(value: number, floor: number, ceiling: number): number {
  if (ceiling === floor) return 0
  return Math.min(1, Math.max(0, (value - floor) / (ceiling - floor)))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * The event types that earn movement points.
 *
 * `first_seen` is absent deliberately. It is dated when *we* looked, not when
 * the property did anything, so counting it towards recency would give every
 * property on a backfill a full recency score for having been found.
 */
const MOVEMENT_TYPES = new Set(['price_reduced', 'returned_to_market', 'days_on_market_crossed'])

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
  area: AreaContext = EMPTY_AREA,
  weights: Weights = DEFAULT_WEIGHTS,
): Score {
  const factors: Factor[] = []
  const w = weights.quality
  const price = listing.price && listing.price > 0 ? listing.price : null

  // --- Net cashflow --------------------------------------------------------
  // What is actually left each month, not the gross yield. A 5% gross yield is
  // a loss at 5.5% borrowing, and the old score rewarded it.
  if (price && enrichment.estimatedRent) {
    const cashflow = netMonthlyCashflow(price, enrichment.estimatedRent)
    // Breaking even scores nothing; £350 a month clear scores everything.
    const points = round(band(cashflow, 0, 350) * w.cashflow)
    factors.push({
      label: 'Monthly cashflow',
      points,
      detail:
        cashflow >= 0
          ? `£${cashflow.toLocaleString('en-GB')} a month clear, at ${SCORING_FINANCE.depositPercent}% down and ${SCORING_FINANCE.annualRatePercent}% interest only, after ${SCORING_FINANCE.costsPercentOfRent}% of rent in costs`
          : `Loses £${Math.abs(cashflow).toLocaleString('en-GB')} a month, at ${SCORING_FINANCE.depositPercent}% down and ${SCORING_FINANCE.annualRatePercent}% interest only, after ${SCORING_FINANCE.costsPercentOfRent}% of rent in costs`,
    })
  } else {
    factors.push({ label: 'Monthly cashflow', points: 0, detail: 'No rent estimate held' })
  }

  // --- Price against what actually sold -------------------------------------
  if (price && listing.internalAreaSqFt && area.soldPricePerSqFt) {
    const askingPerSqFt = price / listing.internalAreaSqFt
    const discount = ((area.soldPricePerSqFt - askingPerSqFt) / area.soldPricePerSqFt) * 100
    const points = round(band(discount, 0, 25) * w.comparables)
    factors.push({
      label: 'Price against nearby sales',
      points,
      detail:
        discount >= 0
          ? `£${Math.round(askingPerSqFt)} per sq ft against £${Math.round(area.soldPricePerSqFt)} locally, ${discount.toFixed(1)}% below`
          : `£${Math.round(askingPerSqFt)} per sq ft against £${Math.round(area.soldPricePerSqFt)} locally, ${Math.abs(discount).toFixed(1)}% above`,
    })
  } else {
    factors.push({
      label: 'Price against nearby sales',
      points: 0,
      detail: listing.internalAreaSqFt ? 'No local sold prices held' : 'No floor area held',
    })
  }

  // --- Yield against the local benchmark ------------------------------------
  if (price && enrichment.estimatedRent && area.localGrossYieldPercent && area.localGrossYieldPercent > 0) {
    const grossYield = ((enrichment.estimatedRent * 12) / price) * 100
    const ratio = grossYield / area.localGrossYieldPercent
    // Matching the area scores nothing. Half as much again scores everything.
    const points = round(band(ratio, 1, 1.5) * w.yieldVsLocal)
    factors.push({
      label: 'Yield against the area',
      points,
      detail: `${grossYield.toFixed(1)}% against ${area.localGrossYieldPercent.toFixed(1)}% locally`,
    })
  } else {
    factors.push({ label: 'Yield against the area', points: 0, detail: 'No local yield benchmark held' })
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
  // Measured over the events that actually scored, so it answers "how recently
  // did this move" rather than "how recently did we run".
  const scoring = events.filter((event) => MOVEMENT_TYPES.has(event.type))

  if (scoring.length) {
    const newest = Math.max(...scoring.map((event) => event.observedAt.getTime()))
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
