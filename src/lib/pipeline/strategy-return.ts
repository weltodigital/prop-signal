import { stack } from '@/lib/stack'
import {
  COSTS_PERCENT_OF_RENT,
  NIGHTS_PER_MONTH,
  STRATEGY_DEFINITIONS,
  type InvestmentStrategy,
  type StrategyAssumptions,
} from '@/lib/strategies'
import type { Listing } from './listing'

/**
 * The one number each strategy is judged on.
 *
 * Everything else in the quality score — price against comparables, demand,
 * room to add value — means the same thing whatever you intend to do with the
 * property. This does not. A buy-to-let lives on monthly cashflow, a BRRR on
 * how much of your money comes back out, and neither figure tells you anything
 * about the other.
 *
 * So the strategy swaps out this measurement and leaves the rest of the score
 * alone. It is then ranked against the other candidates *within the same
 * strategy*, which is why a mixed cohort never compares a room rate to a
 * refinance.
 *
 * Pure. Every input is passed in.
 */

/** The finance every strategy borrows on, unless it says otherwise. */
export const STRATEGY_FINANCE = {
  depositPercent: 25,
  annualRatePercent: 5.5,
  interestOnly: true,
  termYears: 25,
  /** What a lender will go back to on the refinance. */
  refinanceLtvPercent: 75,
} as const

export type StrategyReturn = {
  /** Higher is better, whatever the unit. Null where it cannot be worked out. */
  value: number | null
  /** The figure in words, or which input was missing. */
  detail: string
  /**
   * The property does not make money under this strategy — a monthly loss, or
   * a refinance that leaves everything in. Ranking best-of-a-bad-run should
   * not hand it the whole factor, so this caps it at half.
   */
  belowWater: boolean
}

/** Area figures a strategy needs beyond the six every run already pulls. */
export type StrategyAreaContext = {
  /** Average asking rent for one room in a shared house, per month. */
  hmoRoomRatePerMonth: number | null
  /** Gross development value per square foot, for what the works are worth. */
  developmentGdvPerSqFt: number | null
}

export const EMPTY_STRATEGY_AREA: StrategyAreaContext = {
  hmoRoomRatePerMonth: null,
  developmentGdvPerSqFt: null,
}

function missing(strategy: InvestmentStrategy, what: string): StrategyReturn {
  return { value: null, detail: `${what} — cannot be scored as ${STRATEGY_DEFINITIONS[strategy].label}`, belowWater: false }
}

function money(value: number): string {
  return `£${Math.round(value).toLocaleString('en-GB')}`
}

/** Monthly cashflow on a given gross rent, at this product's standard finance. */
function cashflowOn(price: number, grossMonthlyRent: number, costsPercent: number): number {
  return stack({
    purchasePrice: price,
    refurbCost: 0,
    buyingCosts: 0,
    depositPercent: STRATEGY_FINANCE.depositPercent,
    annualRatePercent: STRATEGY_FINANCE.annualRatePercent,
    termYears: STRATEGY_FINANCE.termYears,
    interestOnly: STRATEGY_FINANCE.interestOnly,
    monthlyRent: grossMonthlyRent,
    monthlyCosts: Math.round(grossMonthlyRent * (costsPercent / 100)),
    postRefurbValue: null,
    refinanceLtvPercent: STRATEGY_FINANCE.refinanceLtvPercent,
  }).monthlyCashflow
}

function describeCashflow(strategy: InvestmentStrategy, cashflow: number, basis: string): string {
  const costs = COSTS_PERCENT_OF_RENT[strategy]
  const finance = `at ${STRATEGY_FINANCE.depositPercent}% down and ${STRATEGY_FINANCE.annualRatePercent}% interest only, after ${costs}% of rent in costs`
  return cashflow >= 0
    ? `${money(cashflow)} a month clear on ${basis}, ${finance}`
    : `Loses ${money(Math.abs(cashflow))} a month on ${basis}, ${finance}`
}

/**
 * Buy to let. Cashflow on a single-household rent.
 *
 * This is what every score was before strategies existed, which is why it is
 * the default: it was never a neutral choice, only an unstated one.
 */
function buyToLet(price: number | null, monthlyRent: number | null): StrategyReturn {
  if (!price) return missing('btl', 'No asking price held')
  if (!monthlyRent) return missing('btl', 'No rent estimate held')

  const cashflow = cashflowOn(price, monthlyRent, COSTS_PERCENT_OF_RENT.btl)
  return {
    value: cashflow,
    detail: describeCashflow('btl', cashflow, `${money(monthlyRent)} a month`),
    belowWater: cashflow < 0,
  }
}

/**
 * HMO. Cashflow at local room rates.
 *
 * Rooms are taken as bedrooms. That understates the case a landlord who
 * converts a reception room would make, and overstates nothing — better to be
 * short than to invent a room the listing does not mention.
 *
 * The room rate is an area figure, not a figure about this house. It says what
 * a room goes for nearby, which is the honest thing an area endpoint can tell
 * you and is stated as such.
 */
function hmo(price: number | null, bedrooms: number | null, roomRate: number | null): StrategyReturn {
  if (!price) return missing('hmo', 'No asking price held')
  if (!bedrooms || bedrooms < 3) {
    return {
      value: null,
      // Most councils treat three unrelated occupants as the threshold. Below
      // it there is no HMO to score.
      detail: bedrooms ? `${bedrooms} bedrooms is too few for an HMO` : 'No bedroom count held',
      belowWater: false,
    }
  }
  if (!roomRate) return missing('hmo', 'No local room rate held')

  const gross = roomRate * bedrooms
  const cashflow = cashflowOn(price, gross, COSTS_PERCENT_OF_RENT.hmo)

  return {
    value: cashflow,
    detail: describeCashflow('hmo', cashflow, `${bedrooms} rooms at ${money(roomRate)} locally`),
    belowWater: cashflow < 0,
  }
}

/**
 * BRRR. How much of your money comes back out on the refinance.
 *
 * Not monthly cashflow: the whole point of the strategy is to recycle the
 * deposit, and a BRRR that cashflows nicely but leaves £40,000 stuck in the
 * wall has failed at the thing it was for.
 *
 * Refurb cost is the subscriber's own figure per square foot. This product
 * does not hold one and will not derive one — `/build-cost` prices building
 * from nothing, and what fraction of that a refurbishment costs is exactly the
 * invented number the scoring refuses everywhere else.
 */
function brrr(
  price: number | null,
  internalAreaSqFt: number | null,
  monthlyRent: number | null,
  gdvPerSqFt: number | null,
  refurbPerSqFt: number | null,
): StrategyReturn {
  if (!price) return missing('brrr', 'No asking price held')
  if (!internalAreaSqFt) return missing('brrr', 'No floor area held, so no refurb cost and no end value')
  if (!gdvPerSqFt) return missing('brrr', 'No local development value held')
  if (!refurbPerSqFt) return missing('brrr', 'No refurb cost per square foot set on your account')

  const refurbCost = refurbPerSqFt * internalAreaSqFt
  const postRefurbValue = gdvPerSqFt * internalAreaSqFt

  const result = stack({
    purchasePrice: price,
    refurbCost,
    buyingCosts: 0,
    depositPercent: STRATEGY_FINANCE.depositPercent,
    annualRatePercent: STRATEGY_FINANCE.annualRatePercent,
    termYears: STRATEGY_FINANCE.termYears,
    interestOnly: STRATEGY_FINANCE.interestOnly,
    // Rent only matters here for whether it holds together after refinancing.
    monthlyRent: monthlyRent ?? 0,
    monthlyCosts: Math.round((monthlyRent ?? 0) * (COSTS_PERCENT_OF_RENT.brrr / 100)),
    postRefurbValue,
    refinanceLtvPercent: STRATEGY_FINANCE.refinanceLtvPercent,
  })

  if (!result.refinance || result.cashIn <= 0) {
    return missing('brrr', 'The refinance does not compute on these figures')
  }

  const recovered = ((result.cashIn - result.refinance.leftIn) / result.cashIn) * 100
  const summary = `${money(refurbCost)} of works at ${money(refurbPerSqFt)}/sq ft, out at ${money(postRefurbValue)}`

  return {
    value: Number(recovered.toFixed(2)),
    detail: result.refinance.allOut
      ? `All of your money back out, and ${money(-result.refinance.leftIn)} over. ${summary}`
      : `${Math.max(0, Math.round(recovered))}% of your money back out, ${money(result.refinance.leftIn)} left in. ${summary}`,
    belowWater: recovered <= 0,
  }
}

/**
 * Serviced accommodation. Cashflow at the subscriber's own nightly rate.
 *
 * PropertyData publish no nightly rate and no occupancy figure — there is no
 * endpoint for either across all 69 of them. Rather than leave the strategy
 * unavailable or invent a rate, the subscriber gives their own numbers for
 * their own area, which is what they would use to underwrite it anyway.
 *
 * The seam is deliberate: swap these two inputs for a real market feed and
 * nothing else here changes.
 */
function servicedAccommodation(
  price: number | null,
  nightlyRate: number | null,
  occupancyPercent: number | null,
): StrategyReturn {
  if (!price) return missing('r2sa', 'No asking price held')
  if (!nightlyRate || !occupancyPercent) {
    return missing('r2sa', 'No nightly rate and occupancy set on your account')
  }

  const gross = nightlyRate * NIGHTS_PER_MONTH * (occupancyPercent / 100)
  const cashflow = cashflowOn(price, gross, COSTS_PERCENT_OF_RENT.r2sa)

  return {
    value: cashflow,
    detail: describeCashflow(
      'r2sa',
      cashflow,
      `${money(nightlyRate)} a night at ${Math.round(occupancyPercent)}% occupancy, your own figures`,
    ),
    belowWater: cashflow < 0,
  }
}

export function strategyReturn(
  strategy: InvestmentStrategy,
  listing: Listing,
  estimatedRent: number | null,
  area: StrategyAreaContext,
  assumptions: StrategyAssumptions,
): StrategyReturn {
  const price = listing.price && listing.price > 0 ? listing.price : null

  switch (strategy) {
    case 'btl':
      return buyToLet(price, estimatedRent)
    case 'hmo':
      return hmo(price, listing.bedrooms, area.hmoRoomRatePerMonth)
    case 'brrr':
      return brrr(
        price,
        listing.internalAreaSqFt,
        estimatedRent,
        area.developmentGdvPerSqFt,
        assumptions.refurbCostPerSqFt,
      )
    case 'r2sa':
      return servicedAccommodation(price, assumptions.nightlyRate, assumptions.occupancyPercent)
  }
}
