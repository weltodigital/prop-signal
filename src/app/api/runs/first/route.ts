import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveSubscriptionAdmin } from '@/lib/subscription'
import { runProfile, type ProfileRow } from '@/lib/pipeline/run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One profile's opening backfill, rate-limited to four calls per ten seconds.
// It needs the same room the Sunday batch gets.
export const maxDuration = 800

/**
 * The first run, on demand.
 *
 * A subscriber who has just answered the two questions should not have to wait
 * until Sunday to find out whether they wasted £29. The dashboard calls this
 * once, and it builds their opening list from everything standing in the area.
 *
 * This spends real credits, so every guard below matters:
 *
 *   - a session, and the profile is read as that user
 *   - an active subscription, checked with the service role rather than the
 *     caller's own claim
 *   - the backfill has not already been done, on the profile flag
 *   - no run is already in flight for this profile
 *   - and no backfill run has ever finished for this owner
 *
 * The last three are what make it safe to call twice. A double-click, a
 * refresh mid-run, or two tabs must not buy the same list twice. The last one
 * is deliberately independent of the flag, because the flag is set by a write
 * at the end of a run and a write can fail.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  if (!(await hasActiveSubscriptionAdmin(user.id))) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 402 })
  }

  // Which area to build. Absent means the first one without a list yet, which
  // is what a subscriber who has just answered the questions wants.
  const requested = new URL(request.url).searchParams.get('area')

  // Read through row level security, so this can only ever be the caller's own.
  let query = supabase
    .from('search_profiles')
    .select(
      'id, owner_id, postcode, radius_miles, sourcing_lists, investment_strategies, strategy_assumptions, min_price, max_price, min_bedrooms, property_types, backfill_completed_at',
    )
    .is('paused_at', null)
    .order('created_at', { ascending: true })

  if (requested) query = query.eq('id', requested)

  const { data: profiles, error } = await query
  const profile = requested
    ? (profiles ?? [])[0]
    : (profiles ?? []).find((row) => row.backfill_completed_at === null)

  if (error) {
    return NextResponse.json({ error: 'Could not read your search' }, { status: 500 })
  }

  if (!profile) {
    // Either they have no areas at all, or every area already has its list —
    // both of which the dashboard handles by simply showing what is there.
    return NextResponse.json({ ok: true, status: 'already_done' })
  }

  if (profile.backfill_completed_at !== null) {
    // Already done. Not an error — the caller can simply reload.
    return NextResponse.json({ ok: true, status: 'already_done' })
  }

  const admin = createAdminClient()

  // A run already in flight *for this area*. Two tabs, or a refresh partway
  // through. Scoped to the profile rather than the owner: a subscriber with
  // three areas building their second must not be blocked by the first, which
  // is exactly what an owner-wide guard would have done.
  const { data: inFlight } = await admin
    .from('pipeline_runs')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('status', 'running')
    .limit(1)

  if (inFlight && inFlight.length > 0) {
    return NextResponse.json({ ok: true, status: 'already_running' })
  }

  // Belt and braces, and not paranoia: the backfill_completed_at check above
  // relies on a write at the end of a run, and a missed column rename in 0008
  // made that write fail silently. Without this, that bug turned the dashboard
  // into a loop that spent a full run's credits on every visit. This guard
  // reads a row the run itself wrote, so it holds even when the flag does not.
  const { data: pastRuns } = await admin
    .from('pipeline_runs')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('kind', 'backfill')
    .in('status', ['completed', 'aborted'])
    .limit(1)

  if (pastRuns && pastRuns.length > 0) {
    return NextResponse.json({ ok: true, status: 'already_done' })
  }

  try {
    const summary = await runProfile({
      profile: profile as ProfileRow,
      batchId: crypto.randomUUID(),
      supabase: admin,
      now: () => new Date(),
    })

    return NextResponse.json({
      ok: summary.status === 'completed',
      status: summary.status,
      dealsSelected: summary.dealsSelected,
      creditsSpent: summary.creditsSpent,
      error: summary.error,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'unknown error'
    console.error(JSON.stringify({ at: 'runs.first', event: 'failed', owner_id: user.id, message }))
    return NextResponse.json({ error: message, status: 'failed' }, { status: 500 })
  }
}
