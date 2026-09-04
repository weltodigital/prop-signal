import type { SupabaseClient } from '@supabase/supabase-js'
import type { Listing } from './listing'

/**
 * Splitting one sourcing call into the calls the API will actually accept.
 *
 * Three of the eight lists will not go as wide as the rest.
 * `unmodernised-properties` and `slow-to-sell-properties` reject a radius over
 * thirty miles with error 1103, and `large-plot` over twenty. One
 * `/sourced-properties` call carries every list it is given and is rejected
 * outright if the radius exceeds any of them.
 *
 * There were two ways to survive that and both were bad. Refusing to save such
 * a profile answers a question the subscriber already answered. Clamping the
 * whole search to the narrowest cap — which is what the code meant to do and
 * never did, see `sourcingListRadii` — makes one ticked box quietly halve the
 * radius of every other list in the search: tick `large-plot` at forty miles
 * and the seven lists that would happily have searched forty are searched at
 * twenty, for no reason the subscriber can see.
 *
 * So the call is split by cap instead. One call per distinct radius, each list
 * searched at the widest radius it will accept, and the results merged. A
 * subscriber whose lists all reach their radius is one call exactly as before;
 * the worst case is three.
 *
 * The page size is split with it rather than multiplied by it. `/sourced-
 * properties` charges a credit per ten results, so asking three calls for a
 * full page each would triple the bill — and on a backfill that is 150 credits
 * of sourcing against a 150 credit ceiling, leaving nothing for enrichment.
 * Splitting one page across the tiers keeps the spend where it was.
 */

/** The API's billing unit, and therefore the unit a page is split in. */
export const RESULTS_PER_CREDIT = 10

export type ListRadius = {
  id: string
  /** The API rejects a wider search than this for this list. */
  maxRadiusMiles: number
}

export type SourcingTier = {
  /** What this call asks for, which every list in it accepts. */
  radius: number
  lists: string[]
  /** Results asked for. A multiple of ten, so no fraction of a credit is wasted. */
  results: number
}

/**
 * The calls to make for one search, widest first.
 *
 * Lists are grouped by the radius they will actually be searched at, and the
 * page size is shared out in proportion to how many lists each group carries —
 * so the tier holding five of the eight lists gets most of the page, and the
 * one holding `large-plot` alone gets a tenth of it.
 *
 * Shares are whole credits. A tier allotted seven results is charged the same
 * credit as one allotted ten and returns three fewer properties, so rounding
 * down to a multiple of ten is free depth.
 */
export function planSourcingTiers(
  lists: readonly ListRadius[],
  radiusMiles: number,
  pageSize: number,
): SourcingTier[] {
  const grouped = new Map<number, string[]>()

  for (const list of lists) {
    const radius = Math.max(1, Math.min(radiusMiles, list.maxRadiusMiles))
    grouped.set(radius, [...(grouped.get(radius) ?? []), list.id])
  }

  const tiers = [...grouped.entries()]
    .map(([radius, ids]) => ({ radius, lists: [...ids].sort() }))
    .sort((a, b) => b.radius - a.radius)

  if (tiers.length === 0) return []

  // At least one credit per tier, whatever the page size, or a narrow tier is
  // planned as a call that asks for nothing.
  const budget = Math.max(tiers.length, Math.floor(pageSize / RESULTS_PER_CREDIT))

  let left = budget
  const shares = tiers.map((tier, index) => {
    // Whatever is taken here has to leave one credit for each tier after it.
    const reserved = tiers.length - index - 1
    const want = Math.round((budget * tier.lists.length) / lists.length)
    const share = Math.min(Math.max(1, want), left - reserved)
    left -= share
    return share
  })

  // Rounding leftovers go to the widest tier, which carries the most lists and
  // searches the most ground.
  shares[0] = shares[0]! + left

  return tiers.map((tier, index) => ({ ...tier, results: shares[index]! * RESULTS_PER_CREDIT }))
}

/**
 * One set of listings out of several calls.
 *
 * A property can come back from more than one tier — `reduced-properties` and
 * `unmodernised-properties` sit in different tiers above thirty miles and the
 * same house is often on both — so the sourcing lists are unioned rather than
 * overwritten. That union is what the card shows as the situation a property
 * was found in, and it is what `Room to add value` is scored from, so losing
 * half of it would both under-describe and under-score the property.
 *
 * First sighting wins for every other field: the tiers are ordered widest
 * first, so the fullest search of the two is the one that describes it.
 */
export function mergeTierListings(pages: ReadonlyArray<readonly Listing[]>): Listing[] {
  const merged = new Map<string, Listing>()

  for (const page of pages) {
    for (const listing of page) {
      const seen = merged.get(listing.key)
      if (!seen) {
        merged.set(listing.key, listing)
        continue
      }

      seen.lists = [...new Set([...seen.lists, ...listing.lists])].sort()
    }
  }

  return [...merged.values()]
}

/**
 * The cap assumed for a sourcing list whose row we could not read.
 *
 * The column's own default, and the widest radius the form offers. Matches
 * `max_radius_for_sourcing_lists()` in the database, which coalesces to 40 for
 * the same reason.
 */
export const DEFAULT_LIST_RADIUS = 40

/**
 * The radius cap PropertyData enforce on each of these lists.
 *
 * This used to read `strategy_lists`, which 0008 renamed to `sourcing_lists`.
 * The query had been erroring ever since and the guard below it swallowed the
 * error and returned the profile's own radius — so the clamp it existed to
 * apply had never once run, and any profile above thirty miles asking for
 * `unmodernised-properties` was failing its whole sourcing call on error 1103.
 *
 * An unknown list falls back to the widest radius the form offers, which is the
 * value the column defaults to. That is the same trade as before: too small is
 * a narrower search and too large is a failed one, and a list we cannot read a
 * cap for is one nothing has told us to narrow.
 */
export async function sourcingListRadii(supabase: SupabaseClient, ids: readonly string[]): Promise<ListRadius[]> {
  const { data, error } = await supabase
    .from('sourcing_lists')
    .select('id, max_radius_miles')
    .in('id', ids)

  if (error) {
    console.error(JSON.stringify({ at: 'sourcing_lists.load_failed', message: error.message }))
  }

  const caps = new Map((data ?? []).map((row) => [row.id as string, Number(row.max_radius_miles)]))

  return ids.map((id) => ({
    id,
    maxRadiusMiles: caps.get(id) ?? DEFAULT_LIST_RADIUS,
  }))
}
