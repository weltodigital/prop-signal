import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPropertyDataClient } from '@/lib/propertydata'
import { applyFilter, listingsFromPayload, type Listing } from '@/lib/pipeline/listing'
import { mergeTierListings, planSourcingTiers, sourcingListRadii } from '@/lib/pipeline/sourcing-tiers'
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
 * Probes from one origin in a day, and unpaid probes across the whole product
 * in a day.
 *
 * The per-account quota above is the right shape and the wrong unit. Accounts
 * are free, unlimited, and need nothing but an email address to create — so
 * three probes per account is three probes per email address, and a hundred
 * throwaway addresses is 7,500 credits, which is more than the subscription
 * they were pretending to consider. A quota counted in the thing the attacker
 * mints for nothing is not a quota.
 *
 * Two bounds that are not the account, then. The origin catches the cheap
 * version — one script, one machine, many addresses — and is generous enough
 * that a household or an office behind one address is never the one it stops.
 * The daily ceiling is the backstop: it does not care how the probes were
 * spread, and it caps what an unpaid day can cost at roughly one subscription.
 *
 * Both count only probes that actually spent something. A repeat of the same
 * search is served from the stored answer and has never cost a credit, so it
 * has never been the thing worth limiting.
 */
export const PROBE_IP_DAILY_LIMIT = 6

/**
 * Unpaid probes across every account in a rolling day.
 *
 * At the 25 credit ceiling per probe this is a worst case of 1,500 credits a
 * day and a realistic case far below it, because a sparse area — the case this
 * feature exists for — returns almost nothing and is charged for almost
 * nothing. A subscriber's probe is not counted here: they have paid, and the
 * ceiling exists to bound what people who have not can spend.
 */
export const PROBE_DAILY_CEILING = 60

const DAY_MS = 86_400_000

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

/**
 * The caller's origin, as a hash.
 *
 * Hashed with the service role key as the salt, so the stored value is useful
 * for exactly one thing — telling two requests apart — and is not an IP
 * address sitting in a table. Rotating the key rotates the counter, which is a
 * fair price for not keeping the addresses themselves.
 */
export function originKey(ip: string | null, salt: string): string | null {
  const trimmed = ip?.trim()
  if (!trimmed) return null
  return createHash('sha256').update(`${salt}:${trimmed}`).digest('hex')
}

/** The client address, out of whatever the proxy in front of us set. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    // The first entry is the client; everything after it is our own proxies.
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  return headers.get('x-real-ip')?.trim() || null
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

/** Paid probes in the last day from one origin. */
async function countProbesFromOrigin(
  originHash: string,
  admin: SupabaseClient,
  now: Date,
): Promise<number> {
  const { count, error } = await admin
    .from('search_probes')
    .select('id', { count: 'exact', head: true })
    .eq('origin_hash', originHash)
    .gt('credits_spent', 0)
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())

  if (error) throw new Error(`Could not count probes for this origin: ${error.message}`)
  return count ?? 0
}

/** Paid probes in the last day from accounts with no subscription. */
async function countUnpaidProbes(admin: SupabaseClient, now: Date): Promise<number> {
  const { count, error } = await admin
    .from('search_probes')
    .select('id', { count: 'exact', head: true })
    .eq('subscribed', false)
    .gt('credits_spent', 0)
    .gte('created_at', new Date(now.getTime() - DAY_MS).toISOString())

  if (error) throw new Error(`Could not count unpaid probes: ${error.message}`)
  return count ?? 0
}

export type ProbeOutcome =
  | { status: 'ok'; result: ProbeResult }
  | { status: 'quota_exhausted'; used: number; limit: number }
  /**
   * Stopped by a bound that is not this account's. Deliberately vague to the
   * caller — naming the ceiling tells somebody probing it exactly what to
   * spread their signups across — and it says plainly that nothing is wrong
   * with their account, because for almost everybody who sees it nothing is.
   */
  | { status: 'rate_limited'; scope: 'origin' | 'daily' }

/**
 * Runs the probe, or hands back the one already run for this search.
 *
 * Written with the service role, so the count that bounds the quota cannot be
 * edited by the person it bounds.
 */
export async function runSearchProbe(
  userId: string,
  profile: SearchProfile,
  /**
   * Who is asking and whether they have paid. Both bound spending by something
   * other than the account, which is the only thing here that is free to mint.
   */
  caller: { originHash: string | null; subscribed: boolean } = { originHash: null, subscribed: false },
): Promise<ProbeOutcome> {
  const admin = createAdminClient()

  // A repeat of the same search was already bought. Served before any limit is
  // consulted, because it spends nothing and refusing it would only make a
  // refresh look like a failure.
  const existing = await latestProbeFor(userId, profile, admin)
  if (existing) return { status: 'ok', result: existing }

  const used = await countProbes(userId, admin)
  if (used >= PROBE_LIMIT) return { status: 'quota_exhausted', used, limit: PROBE_LIMIT }

  const now = new Date()

  if (!caller.subscribed) {
    if (caller.originHash) {
      const fromOrigin = await countProbesFromOrigin(caller.originHash, admin, now)
      if (fromOrigin >= PROBE_IP_DAILY_LIMIT) return { status: 'rate_limited', scope: 'origin' }
    }

    const unpaid = await countUnpaidProbes(admin, now)
    if (unpaid >= PROBE_DAILY_CEILING) return { status: 'rate_limited', scope: 'daily' }
  }

  const client = createPropertyDataClient({
    ownerId: userId,
    runCreditCeiling: PROBE_CEILING,
    supabase: admin,
  })

  // Split by radius cap exactly as the run is, and for the same reason: three
  // of the lists refuse a wide search, one call carries all the lists it is
  // given, and a count taken over a clamped search is not a count of the area
  // the subscriber is about to pay for.
  const tiers = planSourcingTiers(
    await sourcingListRadii(admin, profile.sourcingLists),
    profile.radiusMiles,
    PROBE_PAGE_SIZE,
  )

  const pages: Listing[][] = []
  for (const tier of tiers) {
    const sourced = await client.call<unknown>('sourced-properties', {
      list: tier.lists.join(','),
      postcode: profile.postcode,
      radius: tier.radius,
      results: tier.results,
    })
    pages.push(listingsFromPayload(sourced.data))
  }

  const listings = mergeTierListings(pages)
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
    origin_hash: caller.originHash,
    subscribed: caller.subscribed,
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
