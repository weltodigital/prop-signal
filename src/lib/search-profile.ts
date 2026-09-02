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
import {
  RADIUS_OPTIONS,
  RADIUS_WIDEN_LIMIT,
  SEARCH_CHANGE_LIMIT,
  type SearchProfile,
  type SourcingList,
} from '@/lib/search-profile.types'

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

export {
  PROPERTY_TYPES,
  RADIUS_OPTIONS,
  RADIUS_WIDEN_LIMIT,
  SEARCH_CHANGE_LIMIT,
} from '@/lib/search-profile.types'
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

  return { refurbCostPerSqFt: positive(record.refurbCostPerSqFt) }
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
    assumptions: z.object({ refurbCostPerSqFt: optionalMoney }),
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
  | { status: 'quota_exhausted'; kind: CountedChange; used: number; limit: number }

/** The kinds of change that cost something, and are therefore counted. */
export type CountedChange = 'search_changed' | 'radius_widened'
type ChangeKind = CountedChange | 'filters_changed'

/**
 * What kind of change this is, which decides which allowance it comes out of.
 *
 * Widening the radius is separated from everything else because it is the one
 * change a subscriber makes *because we told them to*. The onboarding form says
 * the radius is the biggest thing they control and that a short list is fixed
 * by widening it — and then the same three-change cap that exists to stop
 * somebody re-sourcing a different part of the country every week locked them
 * out after three attempts at the advice we gave them.
 *
 * It still costs a backfill, so it is still bounded. It is bounded separately,
 * out of an allowance that only widening can spend.
 *
 * Narrowing is not the same thing and is not exempt. It resets the backfill
 * exactly as any other move does, and nobody widening a thin search is
 * narrowing it on the way.
 */
export function classifyChange(previous: SearchProfile, next: SearchProfileInput): ChangeKind {
  const before = [...previous.sourcingLists].sort().join(',')
  const after = [...next.sourcingLists].sort().join(',')

  if (previous.postcode !== next.postcode || before !== after) return 'search_changed'

  if (previous.radiusMiles !== next.radiusMiles) {
    return next.radiusMiles > previous.radiusMiles ? 'radius_widened' : 'search_changed'
  }

  return 'filters_changed'
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

  const kind = classifyChange(previous, input)

  if (kind === 'search_changed') {
    const used = await countSearchChanges(userId)
    if (used >= SEARCH_CHANGE_LIMIT) {
      return { status: 'quota_exhausted', kind, used, limit: SEARCH_CHANGE_LIMIT }
    }
  }

  if (kind === 'radius_widened') {
    const used = await countRadiusWidenings(userId)
    if (used >= RADIUS_WIDEN_LIMIT) {
      return { status: 'quota_exhausted', kind, used, limit: RADIUS_WIDEN_LIMIT }
    }
  }

  // Anything that moves the search itself brings inventory this subscriber has
  // never been shown, so the database resets the backfill for all of them.
  const isSearchChange = kind !== 'filters_changed'

  const { error } = await admin.from('search_profiles').update(row).eq('owner_id', userId)
  if (error) throw new Error(`Could not save the search profile: ${error.message}`)

  await admin.from('search_profile_changes').insert({
    owner_id: userId,
    profile_id: previous.id,
    kind,
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

async function countChanges(userId: string, kind: CountedChange): Promise<number> {
  const admin = createAdminClient()

  const { data: periodStart, error: periodError } = await admin.rpc('current_period_start', {
    p_owner_id: userId,
  })
  if (periodError) throw new Error(`Could not read the allowance period: ${periodError.message}`)

  const { count, error } = await admin
    .from('search_profile_changes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('kind', kind)
    .gte('created_at', periodStart ?? new Date(0).toISOString())

  if (error) throw new Error(`Could not count ${kind} changes: ${error.message}`)
  return count ?? 0
}

/** Moves of the postcode, the sourcing lists or a narrowing, this period. */
export async function countSearchChanges(userId: string): Promise<number> {
  return countChanges(userId, 'search_changed')
}

/** Widenings of the radius this period, out of their own allowance. */
export async function countRadiusWidenings(userId: string): Promise<number> {
  return countChanges(userId, 'radius_widened')
}
