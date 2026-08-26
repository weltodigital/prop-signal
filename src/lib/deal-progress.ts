import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { toPropertySnapshot, type PropertySnapshot } from '@/lib/deals'
import { isDealStage, isActive, STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { setWatched } from '@/lib/watchlist'

/**
 * Reading and writing how far a subscriber got.
 *
 * Every read goes through row level security as the signed-in user, so it can
 * only ever answer for the caller. Nothing here spends a credit — this is the
 * subscriber's own record of their own actions.
 */

export type StageEntry = {
  stage: DealStage
  enteredAt: string
}

export type TrackedDeal = PropertySnapshot & {
  stage: DealStage
  enteredAt: string
  /** Every step so far, newest first. */
  history: StageEntry[]
}

type ProgressRow = { property_id: string; stage: string; entered_at: string }

/**
 * The current stage per property, derived from the newest row.
 *
 * Not stored. A `stage` column beside the history is a second copy of the same
 * fact, and the two drift the first time a write half-fails.
 */
export async function currentStages(): Promise<Map<string, StageEntry>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deal_progress')
    .select('property_id, stage, entered_at')
    .order('entered_at', { ascending: false })

  if (error) throw new Error(`Could not read deal progress: ${error.message}`)

  const newest = new Map<string, StageEntry>()
  for (const row of (data ?? []) as ProgressRow[]) {
    // Ordered newest first, so the first sighting of a property is its current
    // stage and everything after it is history.
    if (newest.has(row.property_id)) continue
    if (!isDealStage(row.stage)) continue
    newest.set(row.property_id, { stage: row.stage, enteredAt: row.entered_at })
  }

  return newest
}

/** Every step recorded against one property, newest first. */
export async function stageHistory(propertyId: string): Promise<StageEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deal_progress')
    .select('property_id, stage, entered_at')
    .eq('property_id', propertyId)
    .order('entered_at', { ascending: false })

  if (error) throw new Error(`Could not read deal progress: ${error.message}`)

  return ((data ?? []) as ProgressRow[])
    .filter((row) => isDealStage(row.stage))
    .map((row) => ({ stage: row.stage as DealStage, enteredAt: row.entered_at }))
}

/**
 * The deals the subscriber is working, newest movement first.
 *
 * Terminal ones are left out by default: a completed purchase and a deal you
 * passed on are both finished, and a working list that never shrinks stops
 * being one.
 */
export async function listTrackedDeals(options: { includeFinished?: boolean } = {}): Promise<TrackedDeal[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deal_progress')
    .select('property_id, stage, entered_at')
    .order('entered_at', { ascending: false })

  if (error) throw new Error(`Could not read deal progress: ${error.message}`)

  const rows = ((data ?? []) as ProgressRow[]).filter((row) => isDealStage(row.stage))
  if (rows.length === 0) return []

  const byProperty = new Map<string, ProgressRow[]>()
  for (const row of rows) {
    const existing = byProperty.get(row.property_id)
    if (existing) existing.push(row)
    else byProperty.set(row.property_id, [row])
  }

  const wanted = [...byProperty.entries()].filter(([, history]) => {
    const stage = history[0]?.stage as DealStage
    return options.includeFinished ? true : isActive(stage)
  })

  if (wanted.length === 0) return []

  const { data: properties, error: propertyError } = await supabase
    .from('properties')
    .select('*')
    .in(
      'id',
      wanted.map(([id]) => id),
    )

  if (propertyError) throw new Error(`Could not read the tracked properties: ${propertyError.message}`)

  const snapshots = new Map((properties ?? []).map((row) => [row.id, toPropertySnapshot(row)]))

  return wanted
    .flatMap(([propertyId, history]) => {
      const snapshot = snapshots.get(propertyId)
      const newest = history[0]
      if (!snapshot || !newest) return []

      return [
        {
          ...snapshot,
          stage: newest.stage as DealStage,
          enteredAt: newest.entered_at,
          history: history.map((row) => ({ stage: row.stage as DealStage, enteredAt: row.entered_at })),
        },
      ]
    })
    .sort((a, b) => {
      // Furthest along first — an accepted offer needs you before a maybe does.
      const step = STAGE_DEFINITIONS[b.stage].step - STAGE_DEFINITIONS[a.stage].step
      if (step !== 0) return step
      return b.enteredAt.localeCompare(a.enteredAt)
    })
}

/**
 * Records a step, and keeps the watch in step with it.
 *
 * Always an insert. Recording the same stage twice is allowed and harmless —
 * it says the subscriber came back and confirmed it — and moving backwards is
 * a real thing that happens to real deals, so neither is refused.
 *
 * Watching used to be a second button beside this one, and nobody could say
 * what the difference was. It is not a separate decision: somebody working a
 * deal towards an offer obviously wants to know if the price moves, and
 * somebody who has passed on one obviously does not. So the watch follows the
 * stage rather than asking again.
 */
export async function recordStage(propertyId: string, stage: DealStage): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('deal_progress')
    .insert({ owner_id: user.id, property_id: propertyId, stage })

  if (error) throw new Error(`Could not record the stage: ${error.message}`)

  // A live deal is watched; a dead one is not.
  await setWatched(propertyId, isActive(stage))
}

/**
 * Removes a property from the record entirely.
 *
 * For a mis-click, not for a deal that died — that is what `passed` and
 * `fell_through` are for, and the wording in the app says so. Deleting a real
 * outcome is how a funnel starts lying.
 */
export async function untrack(propertyId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('deal_progress').delete().eq('property_id', propertyId)
  if (error) throw new Error(`Could not untrack: ${error.message}`)

  await setWatched(propertyId, false)
}

/** How many deals sit at each stage, for the subscriber's own summary. */
export async function stageCounts(): Promise<Map<DealStage, number>> {
  const stages = await currentStages()
  const counts = new Map<DealStage, number>()
  for (const { stage } of stages.values()) {
    counts.set(stage, (counts.get(stage) ?? 0) + 1)
  }
  return counts
}
