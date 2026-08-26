import { EMPTY_ASSUMPTIONS, type InvestmentStrategy, type StrategyAssumptions } from '@/lib/strategies'
import { EMPTY_STRATEGY_AREA, strategyReturn, type StrategyAreaContext, type StrategyReturn } from './strategy-return'
import type { Listing } from './listing'
import type { PropertyEvent } from './events'

/**
 * Scoring. Pure functions, versioned weights, no LLM anywhere in this path.
 *
 * Two scores. Quality asks whether the property makes money, on 0..100.
 * Movement asks how hard and how recently the seller moved, also on 0..100, and
 * then counts for half.
 *
 * That weighting is the product. This sources deals, and a deal is good because
 * of what it is rather than because something happened to it. A great property
 * listed yesterday has no movement at all and must still be able to lead the
 * list, so movement is a bonus for a motivated seller rather than half the
 * answer. Totals run 0..150.
 *
 * Quality cannot be scored one property at a time, because cashflow is ranked
 * against the rest of the run. So it comes in two phases: `measureQuality` per
 * property, then `qualityScores` over the cohort. `movement` stays per property.
 *
 * Every stored score records the version below. Change the weights, change the
 * version, and old scores stay readable as what they were.
 */

export const SCORE_VERSION = 'v5'

export type Weights = {
  quality: {
    /**
     * Whatever the chosen strategy is judged on, ranked against the rest of
     * this run under the same strategy. Cashflow for a let, money back out for
     * a BRRR — never one compared against the other.
     */
    strategyReturn: number
    /** Asking price per square foot against what nearby homes actually sold for. */
    comparables: number
    /** Local sales demand, from the area-level figure. */
    demand: number
    /** Value-add lists this subscriber did not already ask for. */
    condition: number
  }
  movement: {
    /** Cumulative reduction from the peak asking price. */
    reduction: number
    /** A return to market after a fall-through. */
    returned: number
    /** Time on the market, once it has crossed a mark. */
    stale: number
    /** How recently the property actually moved. */
    recency: number
  }
}

/**
 * Quality sums to 100 and is then normalised over the factors actually held.
 * Movement sums to 85 and is scaled to 100 before being halved into the total.
 */
export const DEFAULT_WEIGHTS: Weights = {
  quality: { strategyReturn: 40, comparables: 30, demand: 15, condition: 15 },
  movement: { reduction: 35, returned: 25, stale: 10, recency: 15 },
}

const MOVEMENT_TOTAL = 85

/**
 * How many of the four quality factors must have data behind them before a
 * property can be ranked at all.
 *
 * Normalising over the factors held stops a flat with no floor area being
 * punished for a gap in the data. On its own it would also let a property top
 * the list on two factors, so the two rules come as a pair.
 *
 * In practice this means at least one of cashflow or comparables: demand is
 * area-level and held for every property in a run or none of them, and
 * condition is held unless the subscriber has ticked every value-add list.
 */
export const MIN_QUALITY_FACTORS = 3

/**
 * What a property capped by a risk can reach, out of 150.
 *
 * Enough to appear on a thin week, not enough to lead a real one.
 */
export const RISK_CAPPED_TOTAL = 90

export type Factor = {
  /** Plain English, shown to the user. */
  label: string
  /** Points contributed, after weighting. */
  points: number
  /** Points that were available for this factor, or 0 where it is not held. */
  available: number
  /** The figure the points came from, stated so it can be argued with. */
  detail: string
}

export type Score = {
  /** 0..100. Quality is the share of available points; movement is scaled. */
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
 * Something that should stop a subscriber.
 *
 * Still never scored — working out how many points an EPC of F is worth
 * against a 12% reduction would mean inventing a number. But a note alone let a
 * G-rated house on a flood plain lead the week, so severity now gates instead:
 *
 *   note     stated beside the property, nothing else
 *   cap      the total cannot exceed RISK_CAPPED_TOTAL
 *   exclude  the property does not appear at all
 */
export type RiskSeverity = 'note' | 'cap' | 'exclude'
export type Risk = { label: string; detail: string; severity: RiskSeverity }

const MEES_FAIL = new Set(['F', 'G'])
const MEES_TIGHT = new Set(['D', 'E'])

/** Flood bands that take a property off the list rather than annotate it. */
const FLOOD_EXCLUDES = ['high']
const FLOOD_IGNORES = ['very low', 'low']

/**
 * Lists that imply work, and so margin.
 *
 * Short lease is not among them any more. A lease with 70 years left is a bill
 * before it is an opportunity, and the length — the only thing that decides
 * which — is not a field we hold. It is a risk below.
 */
export const CONDITION_LISTS = ['unmodernised-properties', 'repossessed-properties', 'auction-properties'] as const

const SHORT_LEASE_LIST = 'short-lease-properties'

/** Someone who asked for these is buying the work, so an EPC of F is the point. */
function buysRefurbishment(strategies: readonly string[]): boolean {
  return CONDITION_LISTS.some((list) => strategies.includes(list))
}

export function risks(
  listing: Pick<Listing, 'lists'>,
  area: AreaContext,
  epc: EnergyCertificate,
  strategies: readonly string[] = [],
): Risk[] {
  const found: Risk[] = []

  if (epc && MEES_FAIL.has(epc.rating)) {
    found.push({
      label: `EPC ${epc.rating}`,
      detail: 'Cannot be let at this rating without works or a registered exemption.',
      // A subscriber who asked for unmodernised or auction stock is looking for
      // exactly this. Capping it would hide what they came for.
      severity: buysRefurbishment(strategies) ? 'note' : 'cap',
    })
  } else if (epc && MEES_TIGHT.has(epc.rating)) {
    found.push({
      label: `EPC ${epc.rating}`,
      detail: 'Lettable now. The proposed C minimum would need work before it could be let again.',
      severity: 'note',
    })
  }

  const flood = area.floodRisk?.toLowerCase().trim()
  if (flood && !FLOOD_IGNORES.includes(flood)) {
    const excluded = FLOOD_EXCLUDES.some((band) => flood.includes(band))
    found.push({
      label: `Flood risk ${area.floodRisk}`,
      detail: excluded
        ? 'Rivers and sea. High enough that this is not a deal at any price.'
        : 'Rivers and sea. Expect it to show in the premium.',
      severity: excluded ? 'exclude' : 'note',
    })
  }

  if (listing.lists.includes(SHORT_LEASE_LIST)) {
    found.push({
      label: 'Short lease',
      detail:
        'Lease length, ground rent and service charge are not held here. An extension is a cost before it is a discount.',
      severity: 'note',
    })
  }

  return found
}

/** True where a risk takes the property off the list entirely. */
export function isExcluded(risks: readonly Risk[]): boolean {
  return risks.some((risk) => risk.severity === 'exclude')
}

/** True where a risk caps what the property can score. */
export function isCapped(risks: readonly Risk[]): boolean {
  return risks.some((risk) => risk.severity === 'cap')
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
 * Where a value sits in its cohort, 0 worst and 1 best, ties sharing a place.
 *
 * A cohort of one has no ranking to give, so it returns the middle rather than
 * the top: being the only property with a rent estimate is not an achievement.
 */
export function percentile(value: number, cohort: readonly number[]): number {
  if (cohort.length < 2) return 0.5

  let below = 0
  let equal = 0
  for (const other of cohort) {
    if (other < value) below += 1
    else if (other === value) equal += 1
  }

  return (below + 0.5 * Math.max(0, equal - 1)) / (cohort.length - 1)
}

/**
 * The per-property half of quality: what we can measure, before knowing what
 * anything else in the run measured.
 *
 * A null is a factor with no data behind it. It is normalised out rather than
 * scored zero, so a flat with no floor area competes on what is held.
 */
export type QualityMeasurement = {
  /** The strategy this measurement was taken under. */
  strategy: InvestmentStrategy
  /** What that strategy is judged on, and whether it could be worked out. */
  strategyReturn: StrategyReturn
  /** Percent below local completed sales per square foot. Negative is above. */
  comparableDiscount: number | null
  /** PropertyData's 0..100 area demand rating. */
  demand: number | null
  /**
   * Value-add lists this property is on that the subscriber did not ask for,
   * or null where they asked for all of them and the factor cannot discriminate.
   */
  extraConditionLists: string[] | null
  /** Kept for the breakdown, so the detail line can say what was missing. */
  hasFloorArea: boolean
  hasSoldPrices: boolean
}

export function measureQuality(
  strategy: InvestmentStrategy,
  listing: Listing,
  enrichment: Enrichment,
  area: AreaContext = EMPTY_AREA,
  sourcingLists: readonly string[] = [],
  strategyArea: StrategyAreaContext = EMPTY_STRATEGY_AREA,
  assumptions: StrategyAssumptions = EMPTY_ASSUMPTIONS,
): QualityMeasurement {
  const price = listing.price && listing.price > 0 ? listing.price : null

  let comparableDiscount: number | null = null
  if (price && listing.internalAreaSqFt && area.soldPricePerSqFt) {
    const askingPerSqFt = price / listing.internalAreaSqFt
    comparableDiscount = ((area.soldPricePerSqFt - askingPerSqFt) / area.soldPricePerSqFt) * 100
  }

  // Condition, relative to what the subscriber already asked for.
  //
  // Someone who picked unmodernised gets a list of unmodernised properties, so
  // being unmodernised says nothing about which of them is the better deal —
  // it is a constant, and a constant that used to be worth half marks. Only
  // the lists they did not tick carry information. Tick all of them and the
  // factor carries none at all, so it is normalised out instead.
  const unasked: string[] = CONDITION_LISTS.filter((list) => !sourcingLists.includes(list))
  const extraConditionLists =
    unasked.length === 0 ? null : listing.lists.filter((list) => unasked.includes(list))

  return {
    strategy,
    strategyReturn: strategyReturn(strategy, listing, enrichment.estimatedRent, strategyArea, assumptions),
    comparableDiscount,
    demand: enrichment.areaDemandRating,
    extraConditionLists,
    hasFloorArea: Boolean(listing.internalAreaSqFt),
    hasSoldPrices: Boolean(area.soldPricePerSqFt),
  }
}

/** What the strategy's own factor is called on the breakdown. */
const RETURN_LABELS: Record<InvestmentStrategy, string> = {
  btl: 'Monthly cashflow',
  hmo: 'Monthly cashflow as an HMO',
  brrr: 'Money back out on refinance',
}

/**
 * The cohort half of quality.
 *
 * Index-aligned with the measurements it is given. Cashflow is scored as a
 * percentile against the other properties in the same run, because the absolute
 * scale it used to use did not survive leaving one part of the country: £0 to
 * £350 a month scores nearly nothing across the South East and nearly
 * everything up north, and a 30-point factor that is constant either way is not
 * a factor at all.
 *
 * The price of that: a percentile ranks within a filtered, event-driven cohort
 * that is not a sample of the local market. The one place that matters is a run
 * where everything loses money, so a property that does not make money cannot
 * take the whole factor however well it ranks.
 */
export function qualityScores(
  measurements: readonly QualityMeasurement[],
  weights: Weights = DEFAULT_WEIGHTS,
): Score[] {
  const w = weights.quality

  // The cohort is whatever was handed in, which the caller has already split
  // by strategy. A room rate is never ranked against a refinance.
  const cohort = measurements
    .map((m) => m.strategyReturn.value)
    .filter((value): value is number => value !== null)

  return measurements.map((m) => {
    const factors: Factor[] = []
    const label = RETURN_LABELS[m.strategy]

    // --- What this strategy is judged on, against the rest of the run -------
    if (m.strategyReturn.value === null) {
      factors.push({ label, points: 0, available: 0, detail: m.strategyReturn.detail })
    } else {
      const place = percentile(m.strategyReturn.value, cohort)
      // Losing money is losing money however the rest of the run is doing.
      const share = m.strategyReturn.belowWater ? Math.min(place, 0.5) : place
      const standing =
        cohort.length < 2
          ? 'the only one this week that could be scored this way'
          : `better than ${Math.round(place * 100)}% of this week's candidates`

      factors.push({
        label,
        points: round(share * w.strategyReturn),
        available: w.strategyReturn,
        detail: `${m.strategyReturn.detail}, ${standing}`,
      })
    }

    // --- Price against what actually sold ------------------------------------
    if (m.comparableDiscount === null) {
      factors.push({
        label: 'Price against nearby sales',
        points: 0,
        available: 0,
        detail: m.hasFloorArea ? 'No local sold prices held' : 'No floor area held',
      })
    } else {
      factors.push({
        label: 'Price against nearby sales',
        points: round(band(m.comparableDiscount, 0, 25) * w.comparables),
        available: w.comparables,
        detail:
          m.comparableDiscount >= 0
            ? `${m.comparableDiscount.toFixed(1)}% below what nearby homes sold for per square foot`
            : `${Math.abs(m.comparableDiscount).toFixed(1)}% above what nearby homes sold for per square foot`,
      })
    }

    // --- Demand --------------------------------------------------------------
    if (m.demand === null) {
      factors.push({ label: 'Local demand', points: 0, available: 0, detail: 'No demand figure held' })
    } else {
      factors.push({
        label: 'Local demand',
        points: round(band(m.demand, 20, 80) * w.demand),
        available: w.demand,
        detail: `Area demand rated ${m.demand.toFixed(0)} out of 100`,
      })
    }

    // --- Condition, beyond what was asked for --------------------------------
    if (m.extraConditionLists === null) {
      factors.push({
        label: 'Room to add value',
        points: 0,
        available: 0,
        detail: 'You asked for every value-add list, so this cannot separate one property from another',
      })
    } else {
      const count = m.extraConditionLists.length
      factors.push({
        label: 'Room to add value',
        points: round(Math.min(1, count / 2) * w.condition),
        available: w.condition,
        detail: count
          ? `Also on ${m.extraConditionLists.join(' and ')}, which you did not ask for`
          : 'Nothing beyond the lists you asked for',
      })
    }

    return {
      score: normalise(factors),
      factors,
      version: SCORE_VERSION,
    }
  })
}

/** Share of the points that were actually available, on 0..100. */
function normalise(factors: readonly Factor[]): number {
  const available = factors.reduce((total, factor) => total + factor.available, 0)
  if (available === 0) return 0
  const earned = factors.reduce((total, factor) => total + factor.points, 0)
  return round((earned / available) * 100)
}

/** How many quality factors had data behind them. */
export function factorsHeld(score: Score): number {
  return score.factors.filter((factor) => factor.available > 0).length
}

/**
 * The event types that count as the property having moved.
 *
 * `first_seen` is absent because it is dated when *we* looked. So is
 * `days_on_market_crossed`, for the same reason: passing 90 days is the
 * calendar moving, not the property. It still qualifies a property for the
 * list and still earns its own stale points — it just cannot also claim to be
 * recent news.
 */
const MOVEMENT_TYPES = new Set(['price_reduced', 'returned_to_market'])

/**
 * Cumulative reduction from the peak asking price, as a positive percent.
 *
 * Not the deepest single cut. Three cuts of 5% is a seller who has been talked
 * down three times, which is a better prospect than one 14% cut, and taking the
 * largest step scored it at a third of the value.
 */
export function cumulativeReduction(events: readonly PropertyEvent[]): number | null {
  const reductions = events.filter((event) => event.type === 'price_reduced')
  if (reductions.length === 0) return null

  const priceOf = (value: Record<string, unknown> | null): number | null => {
    const price = value?.price
    return typeof price === 'number' && price > 0 ? price : null
  }

  const peak = Math.max(...reductions.map((e) => priceOf(e.previousValue) ?? 0))

  // The current price is the one from the most recent reduction, not the
  // smallest ever seen: a property can be reduced, raised, and reduced again.
  //
  // `>=` rather than `>` so the last of several same-day reductions wins.
  // Price history read in one go dates every step it derives to the day it
  // happened, and a property cut three times in a week would otherwise be read
  // as having been cut once.
  const latest = reductions.reduce((newest, event) =>
    event.observedAt.getTime() >= newest.observedAt.getTime() ? event : newest,
  )
  const current = priceOf(latest.currentValue)

  if (!peak || current === null || peak <= 0) return null

  return round(((peak - current) / peak) * 100)
}

/**
 * How hard and how recently the property moved.
 *
 * Driven by the events, not by the listing. A property with no events scores
 * zero here and has to stand on quality alone. Scaled to 0..100 so it shares a
 * ceiling with quality.
 */
export function movement(
  events: PropertyEvent[],
  observedAt: Date,
  weights: Weights = DEFAULT_WEIGHTS,
): Score {
  const factors: Factor[] = []
  const w = weights.movement

  const cumulative = cumulativeReduction(events)
  if (cumulative !== null && cumulative > 0) {
    const count = events.filter((event) => event.type === 'price_reduced').length
    // 2% is noise, 20% is an agent in trouble.
    factors.push({
      label: count > 1 ? `Reduced ${count} times` : 'Price reduced',
      points: round(band(cumulative, 2, 20) * w.reduction),
      available: w.reduction,
      detail:
        count > 1
          ? `${cumulative.toFixed(1)}% below its peak asking price, over ${count} reductions`
          : `${cumulative.toFixed(1)}% below its peak asking price`,
    })
  }

  if (events.some((event) => event.type === 'returned_to_market')) {
    factors.push({
      label: 'Back on the market',
      points: w.returned,
      available: w.returned,
      detail: 'Returned after coming off, which usually means a fall-through',
    })
  }

  const crossing = events.find((event) => event.type === 'days_on_market_crossed')
  if (crossing) {
    const days = crossing.magnitude ?? 0
    // 60 days is ordinary, a year is not.
    factors.push({
      label: 'Slow to sell',
      points: round(band(days, 60, 365) * w.stale),
      available: w.stale,
      detail: `Passed ${days.toFixed(0)} days on the market`,
    })
  }

  // --- Recency -------------------------------------------------------------
  // Over the events where the property itself did something, so it answers
  // "how recently did this move" rather than "how recently did we run".
  const moved = events.filter((event) => MOVEMENT_TYPES.has(event.type))

  if (moved.length) {
    const newest = Math.max(...moved.map((event) => event.observedAt.getTime()))
    const daysAgo = Math.max(0, (observedAt.getTime() - newest) / 86_400_000)
    // This week is worth everything; a month ago is worth nothing.
    factors.push({
      label: 'Recency',
      points: round((1 - band(daysAgo, 0, 28)) * w.recency),
      available: w.recency,
      detail: daysAgo < 1 ? 'Moved in this run' : `Moved ${Math.round(daysAgo)} days ago`,
    })
  }

  const earned = factors.reduce((total, factor) => total + factor.points, 0)

  return {
    // Against the fixed total, not the factors present: a property that has not
    // moved has scored nothing, rather than having nothing to be scored on.
    score: round((earned / MOVEMENT_TOTAL) * 100),
    factors,
    version: SCORE_VERSION,
  }
}

export type RankedCandidate<T> = {
  candidate: T
  quality: Score
  movement: Score
  /** Quality plus half of movement, on 0..150, after any risk cap. */
  total: number
  /** Set where a risk held the total below what the factors earned. */
  cappedBy: string | null
}

/**
 * What a movement score is worth in the total.
 *
 * Half. A seller who has cut twice and sat unsold for a year is telling you
 * something worth knowing, and it is not worth as much as the property being a
 * good buy in the first place. At parity a mediocre property that moved beat an
 * excellent one that had not, which is the wrong answer for a product that
 * sources deals rather than reports news.
 */
export const MOVEMENT_SHARE = 0.5

/** The most a property can total: 100 of quality and 50 of movement. */
export const MAX_TOTAL = 150

/**
 * Combines the two scores and orders the result.
 *
 * Quality in full, movement at half. A property listed yesterday can reach 100
 * of 150 on its own merits; movement is what separates two good deals rather
 * than what earns a place.
 */
export function rank<T>(
  scored: Array<{ candidate: T; quality: Score; movement: Score; risks?: readonly Risk[] }>,
): Array<RankedCandidate<T>> {
  return scored
    .map((entry) => {
      const earned = round(entry.quality.score + entry.movement.score * MOVEMENT_SHARE)
      const capping = entry.risks?.find((risk) => risk.severity === 'cap')

      return {
        candidate: entry.candidate,
        quality: entry.quality,
        movement: entry.movement,
        total: capping ? Math.min(earned, RISK_CAPPED_TOTAL) : earned,
        cappedBy: capping && earned > RISK_CAPPED_TOTAL ? capping.label : null,
      }
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total
      // A tie goes to the one that moved, not the one that merely looks good.
      return b.movement.score - a.movement.score
    })
}
