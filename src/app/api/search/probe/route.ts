import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdminEnv } from '@/lib/env'
import { getSearchProfile } from '@/lib/search-profile'
import { getSubscriptionState } from '@/lib/subscription'
import { clientIp, originKey, runSearchProbe } from '@/lib/search-probe'
import { CreditRefusal, PropertyDataError } from '@/lib/propertydata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// One rate-limited call. Nothing like the room a run needs.
export const maxDuration = 60

/**
 * How many properties this account's area actually holds.
 *
 * Runs before checkout, which is the whole point: somebody in a sparse area
 * should find out that their list would be short before they pay for it, not
 * after. It is the only thing in this product that spends a credit for an
 * account with no subscription, so the guards are what make that safe:
 *
 *   - a session, and the profile is read as that user through row level
 *     security, so nobody can probe an area they have not saved
 *   - a quota, counted with the service role in the caller's own allowance
 *     period, so this cannot become a free search tool
 *   - two limits that are not the account, because an account is free and a
 *     quota counted in a thing somebody can mint by the hundred is not a quota:
 *     a daily limit per origin, and a daily ceiling on unpaid probes overall
 *   - a repeat of the same search costs nothing, because the answer is stored
 *     and handed back rather than bought again
 *   - a credit ceiling on the call itself, so a dense area cannot surprise us
 */
export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const profile = await getSearchProfile()
  if (!profile) {
    return NextResponse.json({ error: 'No search set up yet', status: 'no_profile' }, { status: 409 })
  }

  const [requestHeaders, subscription] = await Promise.all([headers(), getSubscriptionState()])

  // Salted with the service role key, so what is stored counts requests
  // without being a table of the addresses they came from.
  const originHash = originKey(clientIp(requestHeaders), supabaseAdminEnv().SUPABASE_SERVICE_ROLE_KEY)

  try {
    const outcome = await runSearchProbe(user.id, profile, {
      originHash,
      subscribed: subscription.active,
    })

    if (outcome.status === 'rate_limited') {
      // Deliberately not itemised. Somebody probing the ceiling should not be
      // told which one they hit or how far off it they are, and for everybody
      // else the useful part is that their account is fine and this will pass.
      console.error(
        JSON.stringify({ at: 'search.probe', event: 'rate_limited', scope: outcome.scope, owner_id: user.id }),
      )

      return NextResponse.json(
        {
          status: 'rate_limited',
          error:
            'We are checking more areas than usual just now. Nothing is wrong with your account — try again shortly, or subscribe and your first list will source the whole area anyway.',
        },
        { status: 429, headers: { 'retry-after': '3600' } },
      )
    }

    if (outcome.status === 'quota_exhausted') {
      return NextResponse.json(
        {
          status: 'quota_exhausted',
          used: outcome.used,
          limit: outcome.limit,
          error: `You have checked ${outcome.used} searches this month, which is the limit.`,
        },
        { status: 429 },
      )
    }

    return NextResponse.json({ status: 'ok', ...outcome.result })
  } catch (caught) {
    // A probe that fails must never block the subscription. The panel says so
    // and offers the way on, because somebody who wants to subscribe without
    // knowing the number is entitled to.
    const message =
      caught instanceof CreditRefusal || caught instanceof PropertyDataError
        ? 'We could not check your area just now.'
        : 'Something went wrong on our side.'

    console.error(
      JSON.stringify({
        at: 'search.probe',
        event: 'failed',
        owner_id: user.id,
        message: caught instanceof Error ? caught.message : String(caught),
      }),
    )

    return NextResponse.json({ status: 'failed', error: message }, { status: 502 })
  }
}
