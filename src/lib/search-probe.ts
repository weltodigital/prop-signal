import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPropertyDataClient } from '@/lib/propertydata'
import { applyFilter, listingsFromPayload } from '@/lib/pipeline/listing'
import type { SearchProfile } from '@/lib/search-profile.types'

/**
 * How many properties an area actually holds, answered before the card.
 *
 * The one question a subscriber cannot answer for themselves and the one we
 * could always have answered: is there anything here? Ten miles of a quiet
 * market may hold two properties worth anybody's time, and the person it holds
 * two for should find that out for nothing rather than for £29.
 *
 * One `/sourced-properties` call, charged at one credit per ten results. A
 * dense area costs the page size; a sparse one — the case this exists for —
 * costs almost nothing, because there is almost nothing to charge for. That is
 * the right way round.
 *
 * The count is not a promise about the list. It is the stock the search has to
 * work with before scoring throws most of it away, and the wording says so:
 * a hundred candidates is not a hundred deals, but two candidates is certainly
 * not five deals, and two is the number worth knowing before paying.
 */

/**
 * Results asked for. Twenty credits at the very most, and only in an area
 * dense enough that the answer was never going to be "not many".
 */
export const PROBE_PAGE_SIZE = 200

/** Nothing this call does may cost more than this, whatever comes back. */
const PROBE_CEILING = 25

/**
 * Probes one account may run in an allowance period.
 *
 * Enough to check, widen, and check again — which is the whole journey this
 * exists to support — and not enough to be a free search tool for somebody who
 * never intends to subscribe.
 */
export const PROBE_LIMIT = 3

/**
 * Below this, say so plainly and offer a wider radius before taking any money.
 *
 * Candidates, not deals. Most of these will not clear the quality floor, so ten
 * is already a thin area rather than a comfortable one.
 */
export const THIN_CANDIDATES = 10

export type ProbeResult = {
  /** Everything the sourcing lists returned for the postcode and radius. */
  candidates: number
  /** What was left after the optional price, bedroom and type filters. */
  matching: number
  /** True where the page size was reached, so the real figure is at least this. */
  capped: boolean
  /** True where this is too few to be worth paying for without widening. */
  thin: boolean
  postcode: string
  radiusMiles: number
  /** True where this came back from a probe already run, at no cost. */
  reused: boolean
}

type ProbeRow = {
  postcode: string
  radius_miles: number
  sourcing_lists: string[]
  candidates: number
  matching: number
  capped: boolean
}

function toResult(row: ProbeRow, reused: boolean): ProbeResult {
  return {
    candidates: row.candidates,
    matching: row.matching,
    capped: row.capped,
    thin: row.matching < THIN_CANDIDATES,
    postcode: row.postcode,
    radiusMiles: row.radius_miles,
    reused,
  }
}

/** True where a stored probe was run against exactly this search. */
function matchesProfile(row: ProbeRow, profile: SearchProfile): boolean {
  if (row.postcode !== profile.postcode) return false
  if (row.radius_miles !== profile.radiusMiles) return false

  const before = [...row.sourcing_lists].sort().join(',')
  const after = [...profile.sourcingLists].sort().join(',')
  return before === after
}

/**
 * The most recent probe for this exact search, if there is one.
 *
 * A refresh, a back button or a second tab must not buy the same answer twice,
 * and the answer does not change between one minute and the next.
 */
export async function latestProbeFor(
  userId: string,
  profile: SearchProfile,
  admin: SupabaseClient = createAdminClient(),
): Promise<ProbeResult | null> {
  const { data, error } = await admin
    .from('search_probes')
    .select('postcode, radius_miles, sourcing_lists, candidates, matching, capped')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (error || !data) return null

  const match = (data as ProbeRow[]).find((row) => matchesProfile(row, profile))
  return match ? toResult(match, true) : null
}

/** Probes run in the current allowance period. */
export async function countProbes(
  userId: string,
  admin: SupabaseClient = createAdminClient(),
): Promise<number> {
  const { data: periodStart } = await admin.rpc('current_period_start', { p_owner_id: userId })

  const { count, error } = await admin
    .from('search_probes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .gte('created_at', periodStart ?? new Date(0).toISOString())

  if (error) throw new Error(`Could not count search probes: ${error.message}`)
  return count ?? 0
}

export type ProbeOutcome =
  | { status: 'ok'; result: ProbeResult }
  | { status: 'quota_exhausted'; used: number; limit: number }

/**
 * Runs the probe, or hands back the one already run for this search.
 *
 * Written with the service role, so the count that bounds the quota cannot be
 * edited by the person it bounds.
 */
export async function runSearchProbe(userId: string, profile: SearchProfile): Promise<ProbeOutcome> {
  const admin = createAdminClient()

  const existing = await latestProbeFor(userId, profile, admin)
  if (existing) return { status: 'ok', result: existing }

  const used = await countProbes(userId, admin)
  if (used >= PROBE_LIMIT) return { status: 'quota_exhausted', used, limit: PROBE_LIMIT }

  const client = createPropertyDataClient({
    ownerId: userId,
    runCreditCeiling: PROBE_CEILING,
    supabase: admin,
  })

  const sourced = await client.call<unknown>('sourced-properties', {
    list: profile.sourcingLists.join(','),
    postcode: profile.postcode,
    radius: profile.radiusMiles,
    results: PROBE_PAGE_SIZE,
  })

  const listings = listingsFromPayload(sourced.data)
  const matching = applyFilter(listings, {
    minPrice: profile.minPrice,
    maxPrice: profile.maxPrice,
    minBedrooms: profile.minBedrooms,
    propertyTypes: profile.propertyTypes,
  })

  const row: ProbeRow = {
    postcode: profile.postcode,
    radius_miles: profile.radiusMiles,
    sourcing_lists: profile.sourcingLists,
    candidates: listings.length,
    matching: matching.length,
    capped: listings.length >= PROBE_PAGE_SIZE,
  }

  const { error } = await admin.from('search_probes').insert({
    owner_id: userId,
    ...row,
    credits_spent: client.creditsSpent(),
  })

  // A probe that ran and could not be recorded is still an answer worth
  // showing. What it costs is a repeat if they reload, which is a credit or
  // two, against sending somebody to checkout with no answer at all.
  if (error) {
    console.error(JSON.stringify({ at: 'search_probe.record_failed', message: error.message }))
  }

  return { status: 'ok', result: toResult(row, false) }
}
