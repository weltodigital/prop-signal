/**
 * What a subscriber intends to do with a property, which is what decides
 * whether it is a good one.
 *
 * This is a different axis from the sourcing lists. A list says which stock to
 * pull out of the market — reduced, repossessed, unmodernised. A strategy says
 * how the money is made from it, and therefore which number means "good". The
 * same three-bed can be an ordinary buy-to-let and an excellent HMO.
 *
 * Deliberately not `server-only`: the onboarding form needs these labels, and
 * nothing here reads the database or spends a credit.
 */

export const INVESTMENT_STRATEGIES = ['btl', 'hmo', 'brrr'] as const
export type InvestmentStrategy = (typeof INVESTMENT_STRATEGIES)[number]

export function isInvestmentStrategy(value: string): value is InvestmentStrategy {
  return (INVESTMENT_STRATEGIES as readonly string[]).includes(value)
}

/**
 * Figures the subscriber supplies, because we do not hold them and will not
 * invent them.
 *
 * A refurbishment costs what their builder charges. The alternative to asking
 * is an assumed average buried inside a score, which is the thing this product
 * refuses everywhere else.
 */
export type StrategyAssumptions = {
  /** BRRR. Works, per square foot of internal area. */
  refurbCostPerSqFt: number | null
}

export const EMPTY_ASSUMPTIONS: StrategyAssumptions = {
  refurbCostPerSqFt: null,
}

/**
 * Running costs as a share of gross rent, by strategy.
 *
 * A buy-to-let landlord pays management, insurance and maintenance. An HMO
 * landlord pays those and every bill in the building, plus the licence and the
 * higher wear. These are ordinary industry figures, stated here rather than
 * buried so a subscriber can see what they are being judged against.
 */
export const COSTS_PERCENT_OF_RENT: Record<InvestmentStrategy, number> = {
  btl: 20,
  hmo: 35,
  brrr: 20,
}

export type StrategyDefinition = {
  id: InvestmentStrategy
  label: string
  /** One line, shown on the onboarding form. */
  description: string
  /** What the score measures for this strategy, in the subscriber's words. */
  measures: string
  /**
   * Whether the strategy needs area figures beyond the six every run already
   * pulls. Used to decide what a run pays for: a subscriber with no HMO
   * strategy never spends a credit on HMO room rates.
   */
  needs: {
    hmoRents: boolean
    developmentGdv: boolean
  }
  /** Assumption fields the subscriber must fill in before this can be scored. */
  requiresAssumptions: Array<keyof StrategyAssumptions>
  sortOrder: number
}

export const STRATEGY_DEFINITIONS: Record<InvestmentStrategy, StrategyDefinition> = {
  btl: {
    id: 'btl',
    label: 'Buy to let',
    description: 'Hold it and rent it to one household. The ordinary case.',
    measures: 'What is left each month after the mortgage and the running costs.',
    needs: { hmoRents: false, developmentGdv: false },
    requiresAssumptions: [],
    sortOrder: 10,
  },
  hmo: {
    id: 'hmo',
    label: 'HMO',
    description: 'Let it by the room. More income, more management, more regulation.',
    measures: 'Monthly cashflow at local room rates, with bills and licensing in the costs.',
    needs: { hmoRents: true, developmentGdv: false },
    requiresAssumptions: [],
    sortOrder: 20,
  },
  brrr: {
    id: 'brrr',
    label: 'Flip or BRRR',
    description: 'Buy, refurbish, then refinance or sell. The value is in the works.',
    measures: 'How much of your money comes back out on the refinance.',
    needs: { hmoRents: false, developmentGdv: true },
    // Without a refurb cost there is no margin to score. We do not hold one and
    // will not derive one — see DECISIONS.md on /build-cost.
    requiresAssumptions: ['refurbCostPerSqFt'],
    sortOrder: 30,
  },
}

export const STRATEGY_LIST: StrategyDefinition[] = Object.values(STRATEGY_DEFINITIONS).sort(
  (a, b) => a.sortOrder - b.sortOrder,
)

/** Everything a run must fetch to score the strategies this profile picked. */
export function areaDataNeeded(strategies: readonly InvestmentStrategy[]): {
  hmoRents: boolean
  developmentGdv: boolean
} {
  return {
    hmoRents: strategies.some((s) => STRATEGY_DEFINITIONS[s].needs.hmoRents),
    developmentGdv: strategies.some((s) => STRATEGY_DEFINITIONS[s].needs.developmentGdv),
  }
}

/** Assumptions a strategy needs that the subscriber has not supplied. */
export function missingAssumptions(
  strategy: InvestmentStrategy,
  assumptions: StrategyAssumptions,
): Array<keyof StrategyAssumptions> {
  return STRATEGY_DEFINITIONS[strategy].requiresAssumptions.filter((field) => {
    const value = assumptions[field]
    return value === null || !Number.isFinite(value) || value <= 0
  })
}
