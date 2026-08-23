import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { getSearchProfile } from '@/lib/search-profile'
import { AppShell } from '@/components/app-shell'
import { EmptyState, Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

function describeArea(postcode: string, radiusMiles: number): string {
  return `${postcode}, within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; onboarded?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/dashboard')

  const state = await getSubscriptionState()
  if (!state.active) redirect('/subscribe')

  const profile = await getSearchProfile()
  if (!profile) redirect('/onboarding')

  const params = await searchParams
  const justSubscribed = params.checkout === 'complete'
  const justOnboarded = params.onboarded === '1'
  const awaitingBackfill = profile.backfillCompletedAt === null

  return (
    <AppShell email={user.email}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
        <p className="text-sm text-muted">
          {describeArea(profile.postcode, profile.radiusMiles)} ·{' '}
          <Link href="/onboarding" className="underline underline-offset-4 hover:text-ink">
            change
          </Link>
        </p>
      </div>

      {justSubscribed ? (
        <div className="mt-6">
          <Notice title="You are subscribed">
            <p>Thank you. Your card is set up and your account is active.</p>
          </Notice>
        </div>
      ) : null}

      {justOnboarded ? (
        <div className="mt-6">
          <Notice title="Your search is saved">
            <p>
              {describeArea(profile.postcode, profile.radiusMiles)}, across{' '}
              {profile.strategies.length} {profile.strategies.length === 1 ? 'strategy' : 'strategies'}.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8">
        {awaitingBackfill ? (
          <EmptyState title="Your first list is not built yet">
            <p>
              The opening list is a backfill. It draws on everything standing in your area rather than only what
              appeared this week, so it takes a full run to put together.
            </p>
            <p className="mt-3">
              Sourcing is not switched on yet, so no run has happened. When it is, this page fills up on Monday
              morning and stays there for the week.
            </p>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing qualified this week">
            <p>
              A quiet week in a quiet area will not always produce five that meet the threshold, and we would rather
              show you a short list than pad it out.
            </p>
          </EmptyState>
        )}
      </div>
    </AppShell>
  )
}
