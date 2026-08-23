import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import {
  countSearchChanges,
  getSearchProfile,
  listStrategies,
  SEARCH_CHANGE_LIMIT,
} from '@/lib/search-profile'
import { AppShell } from '@/components/app-shell'
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

  const [profile, strategies, changesUsed] = await Promise.all([
    getSearchProfile(),
    listStrategies(),
    countSearchChanges(user.id),
  ])

  const isNew = profile === null

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isNew ? 'Two questions' : 'Your area and strategy'}
      </h1>

      <p className="mt-2 max-w-prose text-muted">
        {isNew
          ? 'Answer these and your first list is built from everything standing in your area, not just what appeared this week.'
          : 'Change what you are looking for. Moving the area or the strategy means sourcing somewhere new from scratch, so those changes are limited.'}
      </p>

      {isNew ? (
        <div className="mt-6">
          <Notice title="Your first list is a backfill">
            <p>
              It draws on the whole standing inventory in your area, so it will be longer than five and it will
              include properties that have been listed for months. Every list after it is the week&rsquo;s five.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <SearchForm
          strategies={strategies}
          profile={profile}
          searchChangesUsed={changesUsed}
          searchChangeLimit={SEARCH_CHANGE_LIMIT}
        />
      </div>
    </AppShell>
  )
}
