/**
 * The one example property the homepage is built around, worked out by the
 * product rather than typed into the markup.
 *
 * The audience for that page adds figures up for a living. A cashflow that
 * does not follow from the price and the rent, or a score that does not follow
 * from the factor lines printed under it, costs more credibility than the
 * example buys — so nothing here is a literal that a human had to keep in step.
 * Only the inputs are stated. Every figure shown is derived from them by the
 * same functions the pipeline runs.
 *
 * Deliberately not `server-only`, and it spends nothing: `stack`, `band`,
 * `movement` and `scoreBand` are pure and take every input as an argument.
 */

import { band, DEFAULT_WEIGHTS, movement } from '@/lib/pipeline/scoring'
import type { PropertyEvent } from '@/lib/pipeline/events'
import { scoreBand } from '@/lib/score-band'
import { stack } from '@/lib/stack'
import { COSTS_PERCENT_OF_RENT, STRATEGY_FINANCE } from '@/lib/strategies'

/**
 * The inputs, and the only numbers in this file that were chosen rather than
 * calculated.
 *
 * A two-bed ex-local-authority flat in Eccles at £140,000 letting for £1,000 a
 * month. Ordinary stock in an ordinary northern market, not a unicorn: the
 * point of the example is that the arithmetic holds, and an example nobody
 * believes proves nothing.
 */
export const EXAMPLE_INPUTS = {
  price: 140_000,
  /** Peak asking price, before the one reduction in the history below. */
  peakPrice: 160_000,
  internalAreaSqFt: 620,
  monthlyRent: 1_000,
  /** Completed sales per square foot in this postcode. */
  soldPricePerSqFt: 256.6,
  /** PropertyData's 0..100 area demand rating. */
  demand: 68,
  /**
   * Where this cashflow sits against what the same strategy has been worth in
   * this area over the last three months. Illustrative: a percentile needs a
   * cohort, and a cohort of invented properties would be no more real than the
   * number itself.
   */
  cashflowPercentile: 0.88,
  daysOnMarket: 703,
  /** Days before today that each event was observed. */
  observed: { reduced: 45, passedAYear: 338, returnedToMarket: 520 },
} as const

const finance = stack({
  purchasePrice: EXAMPLE_INPUTS.price,
  refurbCost: 0,
  buyingCosts: 0,
  depositPercent: STRATEGY_FINANCE.depositPercent,
  annualRatePercent: STRATEGY_FINANCE.annualRatePercent,
  termYears: STRATEGY_FINANCE.termYears,
  interestOnly: STRATEGY_FINANCE.interestOnly,
  monthlyRent: EXAMPLE_INPUTS.monthlyRent,
  monthlyCosts: Math.round(EXAMPLE_INPUTS.monthlyRent * (COSTS_PERCENT_OF_RENT.btl / 100)),
  postRefurbValue: null,
  refinanceLtvPercent: STRATEGY_FINANCE.refinanceLtvPercent,
})

const askingPerSqFt = EXAMPLE_INPUTS.price / EXAMPLE_INPUTS.internalAreaSqFt
const comparableDiscount =
  ((EXAMPLE_INPUTS.soldPricePerSqFt - askingPerSqFt) / EXAMPLE_INPUTS.soldPricePerSqFt) * 100

const reductionPercent =
  ((EXAMPLE_INPUTS.peakPrice - EXAMPLE_INPUTS.price) / EXAMPLE_INPUTS.peakPrice) * 100

const w = DEFAULT_WEIGHTS.quality

/**
 * The three quality factors this property has a figure behind, weighted the
 * way the pipeline weights them.
 *
 * Room to add value is absent rather than zero, which is the whole reason the
 * lines on the page do not sum to the score above them. That is stated on the
 * page in these same numbers.
 */
const points = {
  cashflow: round1(EXAMPLE_INPUTS.cashflowPercentile * w.strategyReturn),
  comparables: round1(band(comparableDiscount, 0, 25) * w.comparables),
  demand: round1(band(EXAMPLE_INPUTS.demand, 20, 80) * w.demand),
}

const earned = round1(points.cashflow + points.comparables + points.demand)
const available = w.strategyReturn + w.comparables + w.demand
const qualityScore = (earned / available) * 100

/** The history, dated relative to the request rather than to the day it was written. */
export function exampleEvents(now: Date = new Date()): PropertyEvent[] {
  const at = (days: number) => new Date(now.getTime() - days * 86_400_000)
  const { observed } = EXAMPLE_INPUTS

  return [
    {
      type: 'price_reduced',
      observedAt: at(observed.reduced),
      previousValue: { price: EXAMPLE_INPUTS.peakPrice },
      currentValue: { price: EXAMPLE_INPUTS.price },
      magnitude: -reductionPercent,
      isMaterial: true,
      dedupeKey: 'example:price_reduced',
    },
    {
      type: 'days_on_market_crossed',
      observedAt: at(observed.passedAYear),
      previousValue: null,
      currentValue: null,
      magnitude: 365,
      isMaterial: true,
      dedupeKey: 'example:days_on_market_crossed',
    },
    {
      type: 'returned_to_market',
      observedAt: at(observed.returnedToMarket),
      previousValue: null,
      currentValue: null,
      magnitude: null,
      isMaterial: true,
      dedupeKey: 'example:returned_to_market',
    },
  ]
}

/** Quality in full plus half of movement, and the word that total earns. */
export function exampleBand(now: Date = new Date()): string {
  const moved = movement(exampleEvents(now), now)
  return scoreBand(qualityScore + moved.score * 0.5).label
}

function round1(value: number): number {
  return Number(value.toFixed(1))
}

function money(value: number): string {
  return `£${Math.round(value).toLocaleString('en-GB')}`
}

/**
 * Everything the page prints, already formatted.
 *
 * One shape so the deal card, the timeline and the score breakdown cannot
 * describe three different properties.
 */
export const EXAMPLE = {
  price: money(EXAMPLE_INPUTS.price),
  peakPrice: money(EXAMPLE_INPUTS.peakPrice),
  perSqFt: `${money(askingPerSqFt)} per sq ft`,
  rent: `${money(EXAMPLE_INPUTS.monthlyRent)} a month`,
  cashflow: money(finance.monthlyCashflow),
  grossYield: `${finance.grossYieldPercent?.toFixed(1)}% gross on the asking price`,
  financeBasis: `${STRATEGY_FINANCE.depositPercent}% down, ${STRATEGY_FINANCE.annualRatePercent}% interest only, ${COSTS_PERCENT_OF_RENT.btl}% of rent in costs`,
  reduction: `${reductionPercent.toFixed(1)}%`,
  discount: `${comparableDiscount.toFixed(1)}%`,
  daysOnMarket: String(EXAMPLE_INPUTS.daysOnMarket),
  demand: String(EXAMPLE_INPUTS.demand),
  lastMoved: `Price last moved ${EXAMPLE_INPUTS.observed.reduced} days ago`,
  percentile: `${Math.round(EXAMPLE_INPUTS.cashflowPercentile * 100)}%`,
} as const

/** The score breakdown, in the units the real breakdown uses. */
export const EXAMPLE_SCORE = {
  cashflow: points.cashflow.toFixed(1),
  cashflowAvailable: String(w.strategyReturn),
  comparables: points.comparables.toFixed(1),
  comparablesAvailable: String(w.comparables),
  demand: points.demand.toFixed(1),
  demandAvailable: String(w.demand),
  earned: earned.toFixed(1),
  available: String(available),
  quality: qualityScore.toFixed(1),
} as const
