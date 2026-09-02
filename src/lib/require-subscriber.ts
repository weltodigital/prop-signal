import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { getSearchProfile } from '@/lib/search-profile'
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
): Promise<{ email: string; userId: string; profile: SearchProfile }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect(`/login?next=${encodeURIComponent(path)}`)

  const profile = await getSearchProfile()
  if (!profile) redirect('/onboarding')

  const state = await getSubscriptionState()
  if (!state.active) redirect('/subscribe')

  return { email: user.email, userId: user.id, profile }
}
