import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { AppShell } from '@/components/app-shell'
import { Button, Card, Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

const STATUS_WORDING: Record<string, string> = {
  active: 'Active',
  trialing: 'In trial',
  past_due: 'Payment failed',
  incomplete: 'Payment not completed',
  incomplete_expired: 'Payment not completed',
  unpaid: 'Unpaid',
  paused: 'Paused',
  canceled: 'Cancelled',
}

function formatDate(iso: string | null): string {
  if (!iso) return 'unknown'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/account')

  const state = await getSubscriptionState()
  const subscription = state.subscription

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      <Card className="mt-8">
        <h2 className="text-base font-medium">Plan</h2>

        {subscription ? (
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">{STATUS_WORDING[subscription.status] ?? subscription.status}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-muted">Price</dt>
              <dd className="nums font-medium">£29 per month</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Next payment'}
              </dt>
              <dd className="nums font-medium">{formatDate(subscription.currentPeriodEnd)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted">You do not have a subscription yet.</p>
        )}

        {state.needsAttention ? (
          <div className="mt-6">
            <Notice tone="warn" title="Access is paused">
              <p>
                Stripe has not been able to take payment. Update your card in the billing portal and access resumes as
                soon as the payment clears.
              </p>
            </Notice>
          </div>
        ) : null}

        {subscription?.cancelAtPeriodEnd ? (
          <div className="mt-6">
            <Notice title="Cancellation scheduled">
              <p>
                Your subscription ends on {formatDate(subscription.currentPeriodEnd)}. Until then everything keeps
                running. You can undo this in the billing portal.
              </p>
            </Notice>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          {subscription ? (
            <form action="/api/stripe/portal" method="post">
              <Button type="submit" variant="secondary">
                Manage billing
              </Button>
            </form>
          ) : (
            <form action="/api/stripe/checkout" method="post">
              <Button type="submit">Subscribe for £29 a month</Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Area and strategy</h2>
        <p className="mt-3 text-sm text-muted">
          Not set up yet. These questions arrive with sourcing, and they are the only two you will be asked.
        </p>
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Sign-in</h2>
        <p className="mt-3 text-sm text-muted">
          You sign in with a link sent to {user.email}. There is no password to change.
        </p>
      </Card>
    </AppShell>
  )
}
