import 'server-only'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { getSearchProfile } from '@/lib/search-profile'
import type { SearchProfile } from '@/lib/search-profile.types'

/**
 * The three gates every page of the subscriber app stands behind: signed in,
 * paying, and having answered the two questions.
 *
 * Checked on each page rather than once in the proxy, because a redirect
 * decided at the edge cannot tell the difference between "no subscription" and
 * "no search profile", and the two send the user to different places.
 */
export async function requireSubscriber(
  path: string,
): Promise<{ email: string; userId: string; profile: SearchProfile }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect(`/login?next=${encodeURIComponent(path)}`)

  const state = await getSubscriptionState()
  if (!state.active) redirect('/subscribe')

  const profile = await getSearchProfile()
  if (!profile) redirect('/onboarding')

  return { email: user.email, userId: user.id, profile }
}
