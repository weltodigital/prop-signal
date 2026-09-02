import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Keeping a subscriber's active areas in step with what their plan covers.
 *
 * Called after every subscription change, because a plan can move in either
 * direction and only one of those directions is comfortable.
 *
 * **Nothing is ever deleted.** Somebody dropping from five areas to one has
 * not asked us to destroy four searches, four backfills' worth of credits, and
 * whatever deal history hangs off them. They have asked to pay less. Deleting
 * their data because of it is how a downgrade turns into a chargeback, and it
 * is not recoverable when they change their mind a week later.
 *
 * So the excess is paused: kept whole, skipped by the weekly run, shown on the
 * account page with the reason, and offered straight back when there is room.
 */

/** Why an area is paused, in the words the account page uses. */
export const PAUSED_BY_DOWNGRADE = 'Your plan no longer covers this many areas.'

export type ReconcileResult = {
  limit: number
  active: number
  paused: number
  resumed: number
}

/**
 * Pauses or restores areas so the active count fits the plan.
 *
 * Which areas get paused is the newest first, so somebody who has been
 * searching one postcode since they joined keeps it and the ones they added
 * later are the ones that stop. That is the least surprising rule available
 * without asking, and the account page lets them choose differently.
 *
 * Resuming only ever un-pauses what a downgrade paused. An area the subscriber
 * paused for their own reasons is theirs, and an upgrade is not consent to
 * start spending credits on it again.
 */
export async function reconcileAreas(
  ownerId: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<ReconcileResult> {
  const { data: limitRow, error: limitError } = await supabase.rpc('area_limit_for', { p_owner_id: ownerId })
  if (limitError) throw new Error(`Could not read the area limit for ${ownerId}: ${limitError.message}`)

  const limit = Number(limitRow ?? 1)

  const { data: profiles, error } = await supabase
    .from('search_profiles')
    .select('id, paused_at, paused_reason, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Could not read the areas for ${ownerId}: ${error.message}`)

  const rows = profiles ?? []
  const active = rows.filter((row) => row.paused_at === null)
  const pausedByUs = rows.filter((row) => row.paused_at !== null && row.paused_reason === PAUSED_BY_DOWNGRADE)

  let paused = 0
  let resumed = 0

  // Too many for the plan. Newest first, so the area they have had longest is
  // the one that survives.
  if (active.length > limit) {
    const excess = active.slice(limit).map((row) => row.id)

    const { error: pauseError } = await supabase
      .from('search_profiles')
      .update({ paused_at: new Date().toISOString(), paused_reason: PAUSED_BY_DOWNGRADE })
      .in('id', excess)

    if (pauseError) throw new Error(`Could not pause areas for ${ownerId}: ${pauseError.message}`)
    paused = excess.length
  }

  // Room again, after an upgrade or a renewal. Oldest paused first, for the
  // same reason: put back what they had longest.
  if (active.length < limit && pausedByUs.length > 0) {
    const room = limit - active.length
    const restore = pausedByUs.slice(0, room).map((row) => row.id)

    const { error: resumeError } = await supabase
      .from('search_profiles')
      .update({ paused_at: null, paused_reason: null })
      .in('id', restore)

    if (resumeError) throw new Error(`Could not resume areas for ${ownerId}: ${resumeError.message}`)
    resumed = restore.length
  }

  return { limit, active: Math.min(active.length + resumed, limit), paused, resumed }
}

/**
 * Swaps which area is live, for a subscriber at their limit.
 *
 * The account page offers this after a downgrade: they are down to one area
 * and it should be theirs to say which. Pausing first and activating second,
 * because the trigger counts active rows and would refuse the other order.
 */
export async function chooseActiveArea(
  ownerId: string,
  profileId: string,
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { data: limitRow } = await supabase.rpc('area_limit_for', { p_owner_id: ownerId })
  const limit = Number(limitRow ?? 1)

  const { data: profiles, error } = await supabase
    .from('search_profiles')
    .select('id, paused_at, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Could not read the areas for ${ownerId}: ${error.message}`)

  const rows = profiles ?? []
  if (!rows.some((row) => row.id === profileId)) {
    throw new Error('That area does not belong to this account.')
  }

  // Everything except the chosen one, oldest first, keeping as many as the
  // plan allows alongside it.
  const others = rows.filter((row) => row.id !== profileId)
  const keep = new Set([profileId, ...others.slice(0, Math.max(0, limit - 1)).map((row) => row.id)])

  const toPause = rows.filter((row) => !keep.has(row.id) && row.paused_at === null).map((row) => row.id)
  const toResume = rows.filter((row) => keep.has(row.id) && row.paused_at !== null).map((row) => row.id)

  if (toPause.length) {
    await supabase
      .from('search_profiles')
      .update({ paused_at: new Date().toISOString(), paused_reason: PAUSED_BY_DOWNGRADE })
      .in('id', toPause)
  }

  if (toResume.length) {
    await supabase.from('search_profiles').update({ paused_at: null, paused_reason: null }).in('id', toResume)
  }
}
