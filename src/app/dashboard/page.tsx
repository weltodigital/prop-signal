import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { AppShell } from '@/components/app-shell'
import { EmptyState, Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/dashboard')

  const state = await getSubscriptionState()
  if (!state.active) redirect('/subscribe')

  const params = await searchParams
  const justSubscribed = params.checkout === 'complete'

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">This week</h1>

      {justSubscribed ? (
        <div className="mt-6">
          <Notice title="You are subscribed">
            <p>
              Thank you. Your card is set up and your account is active. Nothing sources yet — the area and strategy
              questions come next.
            </p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8">
        <EmptyState title="No properties yet">
          <p>
            Your account is active but there is nothing to show. Sourcing is not built yet, so no run has produced a
            list for you.
          </p>
          <p className="mt-3">
            When it is, this page holds five properties every Monday, each with the event that put it there and the
            date that event was observed.
          </p>
        </EmptyState>
      </div>
    </AppShell>
  )
}
