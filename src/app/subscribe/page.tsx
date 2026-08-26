import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { AppShell } from '@/components/app-shell'
import { Button, Card, Notice } from '@/components/ui'

const MESSAGES: Record<string, { tone: 'info' | 'warn'; title: string; body: string }> = {
  cancelled: {
    tone: 'info',
    title: 'Checkout cancelled',
    body: 'Nothing was charged. You can start again whenever you are ready.',
  },
  checkout_failed: {
    tone: 'warn',
    title: 'Stripe did not return a checkout page',
    body: 'Nothing was charged. Try again, and if it keeps happening reply to the newsletter and I will look at it.',
  },
}

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/subscribe')

  const state = await getSubscriptionState()
  if (state.active) redirect('/dashboard')

  const params = await searchParams
  const message = MESSAGES[params.error ?? params.checkout ?? '']

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Subscribe</h1>
      <p className="mt-2 max-w-prose text-muted">
        £29 a month. One area, searched every week, with the best of it kept on your list. Cancel any time from your account page.
      </p>

      {message ? (
        <div className="mt-6">
          <Notice tone={message.tone} title={message.title}>
            <p>{message.body}</p>
          </Notice>
        </div>
      ) : null}

      {state.needsAttention && state.subscription ? (
        <div className="mt-6">
          <Notice tone="warn" title="Your last subscription is not active">
            <p>
              Stripe reports it as <span className="font-medium">{state.subscription.status}</span>. Starting checkout
              below will set up a new one.
            </p>
          </Notice>
        </div>
      ) : null}

      <Card className="mt-8">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="nums text-3xl font-semibold">£29</span>
          <span className="text-muted">per month</span>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-muted">
          <li>Up to five new properties join your list every Monday, chosen because they stack.</li>
          <li>No searching, no saved alerts, and nothing to check in between.</li>
          <li>The qualifying event stated on every one, with the date it was observed.</li>
          <li>Cashflow, price against comparables and a score breakdown you can argue with.</li>
          <li>Scored for how you invest, whether that is a let, an HMO or a flip.</li>
          <li>An opening list drawn from everything standing in your area, not just this week.</li>
        </ul>

        <form action="/api/stripe/checkout" method="post" className="mt-8">
          <Button type="submit">Continue to payment</Button>
        </form>

        <p className="mt-4 text-sm text-muted">
          Payment is handled by Stripe. We never see your card details.
        </p>
      </Card>
    </AppShell>
  )
}
