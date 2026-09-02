import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { getSearchProfile } from '@/lib/search-profile'
import { latestProbeFor } from '@/lib/search-probe'
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

  // The questions come first now, so anybody here has answered them — except
  // somebody who has followed an old link, who is sent to answer them.
  const profile = await getSearchProfile()
  if (!profile) redirect('/onboarding')

  const [probe, params] = await Promise.all([latestProbeFor(user.id, profile), searchParams])
  const message = MESSAGES[params.error ?? params.checkout ?? '']

  return (
    <>
      <h1 className="font-display text-h2 font-normal">Subscribe</h1>
      <p className="mt-2 max-w-prose text-muted">
        £29 a month. One area, searched every week, with the best of it kept on your list. Cancel any time from your account page.
      </p>

      {/* What we already told them, repeated at the till so the decision is
          made on the same figure it was made on a screen ago. Nothing is
          re-fetched: this is the probe they already ran. */}
      <p className="mt-4 max-w-prose text-sm text-muted">
        Searching{' '}
        <span className="font-medium text-ink">
          {profile.postcode}, within {profile.radiusMiles} {profile.radiusMiles === 1 ? 'mile' : 'miles'}
        </span>
        {probe
          ? `, which currently holds ${probe.capped ? `more than ${probe.matching}` : probe.matching} ${
              probe.matching === 1 && !probe.capped ? 'property' : 'properties'
            } on the lists you picked.`
          : '.'}{' '}
        <Link href="/onboarding" className="underline underline-offset-4 hover:text-ink">
          Change it
        </Link>
        .
      </p>

      {probe?.thin ? (
        <div className="mt-6">
          <Notice tone="warn" title="That is a thin area at this radius">
            <p>
              We said so before asking for a card and we will say it again here. Widening the radius is the biggest
              thing you control and costs you nothing to try. If you are happy with it, carry on.
            </p>
          </Notice>
        </div>
      ) : null}

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
          <span className="figure text-3xl font-semibold">£29</span>
          <span className="text-muted">per month</span>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-muted">
          <li>Every property in your area that clears the bar, with new ones joining each Monday.</li>
          <li>No searching, no saved alerts, and nothing to check in between.</li>
          <li>The qualifying event stated on every one, with the date it was observed.</li>
          <li>Cashflow, price against comparables and a score breakdown you can argue with.</li>
          <li>Scored for how you invest, whether that is a let, an HMO or a flip.</li>
          <li>Your first list drawn from everything standing in your area, not just this week.</li>
        </ul>

        <form action="/api/stripe/checkout" method="post" className="mt-8">
          <Button type="submit">Continue to payment</Button>
        </form>

        <p className="mt-4 text-sm text-muted">
          Payment is handled by Stripe. We never see your card details.
        </p>
      </Card>
    </>
  )
}
