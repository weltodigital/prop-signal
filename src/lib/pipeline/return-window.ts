import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvestmentStrategy } from '@/lib/strategies'

/**
 * What a strategy has been worth in an area lately.
 *
 * Forty of the hundred quality points are a percentile: where this property's
 * cashflow, or room rate, or money back out on a refinance sits against other
 * properties measured the same way. That is right — an absolute band does not
 * survive leaving one part of the country, and £300 a month clear means
 * something different in Salford and in Surrey.
 *
 * What was wrong was the cohort. It was the other candidates in the same run,
 * which broke two things once the list started standing:
 *
 *   - A property could drop under the quality floor because *other* properties
 *     got better. Nothing about it changed, and the subscriber is told a deal
 *     stopped stacking when what happened is the company it keeps improved.
 *     A standing list is a promise that a property leaves for a reason, and a
 *     reason has to be about the property.
 *   - A score meant something different every week and something different for
 *     every subscriber. The deal tracking exists to answer "do the properties
 *     we pick complete", and that question cannot be asked of a number that is
 *     not the same number twice.
 *
 * So the cohort becomes the area's own recent history, and the run's own
 * candidates are added to it so the property being scored is in its own cohort
 * and today's market is represented.
 *
 * Nothing here is personal data. These are dated observations of a market —
 * exactly the derived material the licence lets us keep — and the table carries
 * no owner_id and nothing that leads back to one.
 */

/** How far back the window reaches. */
export const WINDOW_DAYS = 90

/**
 * Observations needed before the window is trusted over the run itself.
 *
 * Below this a percentile is a worse answer than the one it replaces: thirty
 * values is enough for a place in the order to mean something, and a dozen is
 * not. An area with less than this falls back to the run's own candidates,
 * which is exactly how every score worked before this existed.
 */
export const MIN_WINDOW_SAMPLE = 30

/** Most values read back. Well past the point of changing a percentile. */
export const MAX_WINDOW_ROWS = 2_000

export type ReturnObservation = {
  areaKey: string
  strategy: InvestmentStrategy
  propertyKey: string
  value: number
  belowWater: boolean
  observedAt: Date
}

/**
 * The area a window is kept for: the outward code of the search postcode.
 *
 * The profile's postcode rather than each property's own. Both were defensible
 * and this one is consistent: a window is read for the search that is running,
 * so it has to be written for the search that found the property. Keying on the
 * property instead would file a Portsmouth house found from Southampton under
 * Portsmouth and then never read it back for either.
 *
 * Radius is deliberately not part of the key. Two subscribers on M14 at ten and
 * forty miles share a window, which is the point — a score has to mean the same
 * thing for both of them or nothing can be compared across subscribers. The
 * cost is that the wider search contributes values from further out, which is a
 * fair trade for a window dense enough to be a percentile at all.
 */
export function areaKeyFor(postcode: string): string {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, '')
  // A UK postcode is outward code then three characters of inward code.
  const outward = cleaned.length > 3 ? cleaned.slice(0, cleaned.length - 3) : cleaned
  return outward
}

/**
 * The window for one area and strategy.
 *
 * Returns the raw values. An empty array is a real answer — a new area has no
 * history and the caller falls back to the run.
 */
export async function loadReturnWindow(
  supabase: SupabaseClient,
  input: { areaKey: string; strategy: InvestmentStrategy; now: Date },
): Promise<number[]> {
  const since = new Date(input.now.getTime() - WINDOW_DAYS * 86_400_000)

  const { data, error } = await supabase
    .from('strategy_return_observations')
    .select('value')
    .eq('area_key', input.areaKey)
    .eq('strategy', input.strategy)
    .gte('observed_at', since.toISOString())
    .order('observed_at', { ascending: false })
    .limit(MAX_WINDOW_ROWS)

  if (error) {
    // A window that cannot be read is not a run that should fail. The caller
    // falls back to the cohort it already has, which is what every score used
    // before this existed.
    console.error(
      JSON.stringify({
        at: 'return_window.load_failed',
        area_key: input.areaKey,
        strategy: input.strategy,
        message: error.message,
      }),
    )
    return []
  }

  return (data ?? [])
    .map((row) => Number(row.value))
    .filter((value) => Number.isFinite(value))
}

/**
 * Adds this run's measurements to the window.
 *
 * Ignores duplicates rather than overwriting them. The unique index is on the
 * area, the strategy, the property and the day, so two subscribers searching
 * the same place on the same Sunday contribute one observation of a house
 * rather than two — which would otherwise let a popular area weight itself.
 */
export async function recordReturnObservations(
  supabase: SupabaseClient,
  observations: readonly ReturnObservation[],
): Promise<number> {
  if (observations.length === 0) return 0

  const rows = observations.map((observation) => ({
    area_key: observation.areaKey,
    strategy: observation.strategy,
    property_key: observation.propertyKey,
    value: observation.value,
    below_water: observation.belowWater,
    observed_at: observation.observedAt.toISOString(),
  }))

  const { error } = await supabase.from('strategy_return_observations').upsert(rows, {
    onConflict: 'area_key,strategy,property_key,observed_on',
    ignoreDuplicates: true,
  })

  if (error) {
    // Losing a week of observations makes the window slightly thinner. Losing
    // the run over it would be a worse trade, so this is logged and swallowed
    // like the read above.
    console.error(
      JSON.stringify({ at: 'return_window.write_failed', rows: rows.length, message: error.message }),
    )
    return 0
  }

  return rows.length
}
