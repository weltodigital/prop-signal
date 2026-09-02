import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { listSearchProfiles } from '@/lib/search-profile'
import type { SearchProfile } from '@/lib/search-profile.types'

/**
 * The three gates every page of the subscriber app stands behind: signed in,
 * having answered the questions, and paying.
 *
 * Checked on each page rather than once in the proxy, because a redirect
 * decided at the edge cannot tell the difference between "no subscription" and
 * "no search profile", and the two send the user to different places.
 *
 * The questions come before the payment, and so does this check. Somebody who
 * has signed up and not answered them is sent to answer them, because the end
 * of that form is where we tell them how many properties their area actually
 * holds — and being told that before handing over a card is the entire point of
 * asking first.
 */
export async function requireSubscriber(
  path: string,
  /**
   * Which area the page is about, from the `?area=` parameter. An id that is
   * not theirs, or is paused, falls back to their first live area rather than
   * erroring — a stale bookmark should land somewhere sensible.
   */
  profileId?: string,
): Promise<{
  email: string
  userId: string
  /** The area this page is showing. */
  profile: SearchProfile
  /** Every area they have, for the switcher. Paused ones included. */
  profiles: SearchProfile[]
  /** The areas the run will actually search. */
  active: SearchProfile[]
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect(`/login?next=${encodeURIComponent(path)}`)

  const profiles = await listSearchProfiles()
  if (!profiles.length) redirect('/onboarding')

  const state = await getSubscriptionState()
  if (!state.active) redirect('/subscribe')

  const active = profiles.filter((profile) => profile.pausedAt === null)

  // A paused area is still readable — the account page links to it and the
  // history is theirs — but it is not what a bare dashboard should open on.
  const chosen =
    (profileId ? profiles.find((profile) => profile.id === profileId) : undefined) ?? active[0] ?? profiles[0]!

  return { email: user.email, userId: user.id, profile: chosen, profiles, active }
}
