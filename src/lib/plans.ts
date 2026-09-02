/**
 * The three tiers, and how many areas each one buys.
 *
 * Priced on areas because areas are what this product costs us. A subscriber
 * searching one postcode is roughly two hundred PropertyData credits a month;
 * one searching five is roughly a thousand. Charging them the same would mean
 * either overcharging the first or losing money on the fifth.
 *
 * The mapping from a Stripe price to an area limit is **explicit and by id**.
 * Never by amount: re-pricing a tier — a promotion, a rise, a currency — would
 * otherwise silently change what people are entitled to, and entitlement
 * changing because somebody edited a number in a dashboard is exactly the kind
 * of drift this codebase writes triggers to avoid.
 *
 * Deliberately not `server-only`. The pricing section of the marketing page and
 * the tier chooser both render these, and nothing here is a secret — a price id
 * is public the moment a checkout session exists.
 */

export const PLAN_TIERS = ['starter', 'investor', 'portfolio'] as const
export type PlanTier = (typeof PLAN_TIERS)[number]

export type PlanDefinition = {
  id: PlanTier
  /** The Stripe product name, so the two cannot drift in conversation. */
  label: string
  /** Pounds per month. Display only — Stripe is the authority on what is charged. */
  monthlyPrice: number
  /** Areas this tier entitles. The number the database enforces. */
  areas: number
  /** One line, on the pricing card. */
  summary: string
  /** Shown as the common choice. Exactly one tier should carry it. */
  recommended: boolean
  sortOrder: number
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    monthlyPrice: 29,
    areas: 1,
    summary: 'One area, searched every week.',
    recommended: false,
    sortOrder: 10,
  },
  investor: {
    id: 'investor',
    label: 'Investor',
    monthlyPrice: 59,
    areas: 3,
    summary: 'Three areas, each with its own list and its own scoring.',
    recommended: true,
    sortOrder: 20,
  },
  portfolio: {
    id: 'portfolio',
    label: 'Portfolio',
    monthlyPrice: 99,
    areas: 5,
    summary: 'Five areas, for buying across a region.',
    recommended: false,
    sortOrder: 30,
  },
}

export const PLAN_LIST: PlanDefinition[] = Object.values(PLANS).sort((a, b) => a.sortOrder - b.sortOrder)

/** The tier every unknown or legacy price falls back to. */
export const DEFAULT_TIER: PlanTier = 'starter'

/**
 * Which tier a Stripe price id is.
 *
 * The ids live in the environment because they differ between the test and
 * live accounts, and getting a test id into production would hand somebody
 * five areas for nothing. The shape of the map lives here.
 */
export function tierForPrice(
  priceId: string | null,
  priceIds: { starter: string; investor: string; portfolio: string },
): PlanTier | null {
  if (!priceId) return null

  for (const tier of PLAN_TIERS) {
    if (priceIds[tier] === priceId) return tier
  }

  return null
}

/**
 * Areas a price entitles.
 *
 * An unrecognised price is one area, not none. A price we do not know about is
 * far more likely to be a legacy one, or one created by hand in the dashboard,
 * than an attack — and the failure that matters is a paying subscriber locked
 * out of their own search because a price id was not in an environment
 * variable. One area is the safe floor: it is what they had before tiers
 * existed, and the database's own floor is the same.
 */
export function areaLimitForPrice(
  priceId: string | null,
  priceIds: { starter: string; investor: string; portfolio: string },
): number {
  const tier = tierForPrice(priceId, priceIds)
  return tier ? PLANS[tier].areas : PLANS[DEFAULT_TIER].areas
}
