import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import {
  countSearchChanges,
  getSearchProfile,
  listSourcingLists,
  SEARCH_CHANGE_LIMIT,
} from '@/lib/search-profile'
import { SearchForm } from './search-form'
import { Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/onboarding')

  const subscription = await getSubscriptionState()
  if (!subscription.active) redirect('/subscribe')

  const [profile, sourcingLists, changesUsed] = await Promise.all([
    getSearchProfile(),
    listSourcingLists(),
    countSearchChanges(user.id),
  ])

  const isNew = profile === null

  return (
    <>
      <h1 className="font-display text-h2 font-normal">
        {isNew ? 'Three questions' : 'Your area and strategy'}
      </h1>

      <p className="mt-2 max-w-prose text-muted">
        {isNew
          ? 'Answer these and your first list is built from everything standing in your area, not just what appeared this week.'
          : 'Change what you are looking for. Moving the area or the strategy means sourcing somewhere new from scratch, so those changes are limited.'}
      </p>

      {isNew ? (
        <div className="mt-6">
          <Notice title="Your first list is the widest search">
            <p>
              It looks at everything standing in your area rather than only what appeared this week, so it will
              include properties that have been listed for months. You get the best five of them, and up to five more
              join your list each week after that.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <SearchForm
          sourcingLists={sourcingLists}
          profile={profile}
          searchChangesUsed={changesUsed}
          searchChangeLimit={SEARCH_CHANGE_LIMIT}
        />
      </div>
    </>
  )
}
