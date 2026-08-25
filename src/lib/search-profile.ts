import 'server-only'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalisePostcode } from '@/lib/postcode'
import {
  EMPTY_ASSUMPTIONS,
  isInvestmentStrategy,
  type InvestmentStrategy,
  type StrategyAssumptions,
} from '@/lib/strategies'
import { RADIUS_OPTIONS, SEARCH_CHANGE_LIMIT, type SearchProfile, type SourcingList } from '@/lib/search-profile.types'

/**
 * The saved search: where a subscriber buys and what they buy.
 *
 * One per user. Reads go through RLS as the signed-in user; the audit trail and
 * the change quota use the service role, because the person being counted must
 * not be able to edit the count.
 *
 * Types and constants live in `search-profile.types.ts`, which carries no
 * `server-only` guard and can therefore be imported by the form.
 */

export { PROPERTY_TYPES, RADIUS_OPTIONS, SEARCH_CHANGE_LIMIT } from '@/lib/search-profile.types'
export type { SearchProfile, SourcingList } from '@/lib/search-profile.types'

/** The sourcing lists on offer. Only enabled rows, so an unverified guess is never shown. */
export async function listSourcingLists(): Promise<SourcingList[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sourcing_lists')
    .select('id, label, description, verified_at, max_radius_miles')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Could not read the sourcing lists: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    verified: row.verified_at !== null,
    maxRadiusMiles: row.max_radius_miles,
  }))
}

export async function getSearchProfile(): Promise<SearchProfile | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('search_profiles')
    .select(
      'id, postcode, radius_miles, sourcing_lists, investment_strategies, strategy_assumptions, min_price, max_price, min_bedrooms, property_types, backfill_completed_at, last_run_at',
    )
    .maybeSingle()

  if (error) throw new Error(`Could not read the search profile: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    postcode: data.postcode,
    radiusMiles: data.radius_miles,
    sourcingLists: data.sourcing_lists,
    investmentStrategies: readStrategies(data.investment_strategies),
    assumptions: readAssumptions(data.strategy_assumptions),
    minPrice: data.min_price,
    maxPrice: data.max_price,
    minBedrooms: data.min_bedrooms,
    propertyTypes: data.property_types,
    backfillCompletedAt: data.backfill_completed_at,
    lastRunAt: data.last_run_at,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value.replace(/[£,\s]/g, '')))
  .refine((value) => value === null || /^\d+$/.test(value), 'Use numbers only, for example 180000.')
  .transform((value) => (value === null ? null : Number(value)))

/**
 * Strategies as stored, filtered to ones this build can score.
 *
 * Buy-to-let is the fallback because it is what every score meant before
 * strategies existed — a profile with nothing valid is scored the old way
 * rather than not at all.
 */
function readStrategies(stored: unknown): InvestmentStrategy[] {
  const valid = Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string').filter(isInvestmentStrategy) : []
  return valid.length ? valid : ['btl']
}

/** The subscriber's own figures, read defensively out of jsonb. */
function readAssumptions(stored: unknown): StrategyAssumptions {
  if (!stored || typeof stored !== 'object') return EMPTY_ASSUMPTIONS
  const record = stored as Record<string, unknown>

  const positive = (value: unknown): number | null => {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return {
    refurbCostPerSqFt: positive(record.refurbCostPerSqFt),
    nightlyRate: positive(record.nightlyRate),
    occupancyPercent: positive(record.occupancyPercent),
  }
}

export const searchProfileSchema = z
  .object({
    postcode: z
      .string()
      .trim()
      .min(1, 'Enter the postcode you want to search around.')
      .transform((value) => normalisePostcode(value))
      .refine((value): value is string => value !== null, 'That does not look like a full UK postcode.'),
    radiusMiles: z.coerce
      .number()
      .int()
      .refine((value) => (RADIUS_OPTIONS as readonly number[]).includes(value), 'Choose one of the offered radii.'),
    sourcingLists: z
      .array(z.string().min(1))
      .min(1, 'Choose at least one thing to look for.')
      .max(8, 'Eight sourcing lists is the most one search can carry.')
      .transform((value) => [...new Set(value)]),
    investmentStrategies: z
      .array(z.string().min(1))
      .min(1, 'Choose at least one strategy.')
      .transform((value) => [...new Set(value)].filter(isInvestmentStrategy))
      .refine((value) => value.length > 0, 'Choose at least one strategy we can score.'),
    assumptions: z.object({
      refurbCostPerSqFt: optionalMoney,
      nightlyRate: optionalMoney,
      occupancyPercent: z
        .string()
        .trim()
        .transform((value) => (value === '' ? null : Number(value)))
        .refine(
          (value) => value === null || (Number.isFinite(value) && value > 0 && value <= 100),
          'Occupancy is a percentage between 1 and 100.',
        ),
    }),
    minPrice: optionalMoney,
    maxPrice: optionalMoney,
    minBedrooms: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : Number(value)))
      .refine((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 10), 'Between 0 and 10.'),
    propertyTypes: z.array(z.string()).transform((value) => (value.length ? value : null)),
  })
  .refine(
    (value) => value.minPrice === null || value.maxPrice === null || value.minPrice <= value.maxPrice,
    { message: 'The lowest price is above the highest.', path: ['maxPrice'] },
  )

export type SearchProfileInput = z.infer<typeof searchProfileSchema>

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type SaveOutcome =
  | { status: 'created'; backfillPending: true }
  | { status: 'updated'; backfillPending: boolean }
  | { status: 'quota_exhausted'; used: number; limit: number }

function searchChanged(previous: SearchProfile, next: SearchProfileInput): boolean {
  if (previous.postcode !== next.postcode) return true
  if (previous.radiusMiles !== next.radiusMiles) return true

  const before = [...previous.sourcingLists].sort().join(',')
  const after = [...next.sourcingLists].sort().join(',')
  return before !== after
}

/**
 * Creates or updates the search profile for a user.
 *
 * Changing the search resets the backfill — a new area's standing inventory has
 * never been shown to them, and their next list should draw on all of it. That
 * costs credits, so it is capped. Changing only the optional filters is free
 * and uncapped, because it cannot surface anything new.
 */
export async function saveSearchProfile(userId: string, input: SearchProfileInput): Promise<SaveOutcome> {
  const admin = createAdminClient()

  const { data: existingRow, error: readError } = await admin
    .from('search_profiles')
    .select(
      'id, postcode, radius_miles, sourcing_lists, investment_strategies, strategy_assumptions, min_price, max_price, min_bedrooms, property_types, backfill_completed_at, last_run_at',
    )
    .eq('owner_id', userId)
    .maybeSingle()

  if (readError) throw new Error(`Could not read the existing search profile: ${readError.message}`)

  const row = {
    owner_id: userId,
    postcode: input.postcode,
    radius_miles: input.radiusMiles,
    sourcing_lists: input.sourcingLists,
    investment_strategies: input.investmentStrategies,
    strategy_assumptions: input.assumptions,
    min_price: input.minPrice,
    max_price: input.maxPrice,
    min_bedrooms: input.minBedrooms,
    property_types: input.propertyTypes,
  }

  if (!existingRow) {
    const { data, error } = await admin.from('search_profiles').insert(row).select('id').single()
    if (error) throw new Error(`Could not save the search profile: ${error.message}`)

    await admin.from('search_profile_changes').insert({
      owner_id: userId,
      profile_id: data.id,
      kind: 'created',
      current: row,
    })

    return { status: 'created', backfillPending: true }
  }

  const previous: SearchProfile = {
    id: existingRow.id,
    postcode: existingRow.postcode,
    radiusMiles: existingRow.radius_miles,
    sourcingLists: existingRow.sourcing_lists,
    investmentStrategies: readStrategies(existingRow.investment_strategies),
    assumptions: readAssumptions(existingRow.strategy_assumptions),
    minPrice: existingRow.min_price,
    maxPrice: existingRow.max_price,
    minBedrooms: existingRow.min_bedrooms,
    propertyTypes: existingRow.property_types,
    backfillCompletedAt: existingRow.backfill_completed_at,
    lastRunAt: existingRow.last_run_at,
  }

  const isSearchChange = searchChanged(previous, input)

  if (isSearchChange) {
    const used = await countSearchChanges(userId)
    if (used >= SEARCH_CHANGE_LIMIT) {
      return { status: 'quota_exhausted', used, limit: SEARCH_CHANGE_LIMIT }
    }
  }

  const { error } = await admin.from('search_profiles').update(row).eq('owner_id', userId)
  if (error) throw new Error(`Could not save the search profile: ${error.message}`)

  await admin.from('search_profile_changes').insert({
    owner_id: userId,
    profile_id: previous.id,
    kind: isSearchChange ? 'search_changed' : 'filters_changed',
    previous: {
      postcode: previous.postcode,
      radius_miles: previous.radiusMiles,
      sourcingLists: previous.sourcingLists,
      min_price: previous.minPrice,
      max_price: previous.maxPrice,
      min_bedrooms: previous.minBedrooms,
      property_types: previous.propertyTypes,
    },
    current: row,
  })

  // The database resets backfill_completed_at on a search change, so a pending
  // backfill after an update means exactly that the search moved.
  return { status: 'updated', backfillPending: isSearchChange }
}

/** Search changes used in the current allowance period. */
export async function countSearchChanges(userId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: periodStart, error: periodError } = await admin.rpc('current_period_start', {
    p_owner_id: userId,
  })
  if (periodError) throw new Error(`Could not read the allowance period: ${periodError.message}`)

  const { count, error } = await admin
    .from('search_profile_changes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('kind', 'search_changed')
    .gte('created_at', periodStart ?? new Date(0).toISOString())

  if (error) throw new Error(`Could not count search changes: ${error.message}`)
  return count ?? 0
}
