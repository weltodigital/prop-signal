import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import {
  countRadiusWidenings,
  countSearchChanges,
  areaAllowance,
  getSearchProfile,
  listSearchProfiles,
  listSourcingLists,
  RADIUS_WIDEN_LIMIT,
  SEARCH_CHANGE_LIMIT,
} from '@/lib/search-profile'
import { ButtonLink } from '@/components/ui'
import { STRATEGY_DEFINITIONS } from '@/lib/strategies'
import { ChangePasswordForm } from './change-password-form'
import { chooseAreaAction } from './actions'
import { areaName } from '@/lib/search-profile.types'
import { PLANS, tierForPrice } from '@/lib/plans'
import { planPriceIds } from '@/lib/stripe/client'
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

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/account')

  const state = await getSubscriptionState()
  const subscription = state.subscription

  const [profile, profiles, allowance, sourcingLists, changesUsed, wideningsUsed, params] = await Promise.all([
    state.active ? getSearchProfile() : Promise.resolve(null),
    state.active ? listSearchProfiles() : Promise.resolve([]),
    areaAllowance(user.id),
    state.active ? listSourcingLists() : Promise.resolve([]),
    state.active ? countSearchChanges(user.id) : Promise.resolve(0),
    state.active ? countRadiusWidenings(user.id) : Promise.resolve(0),
    searchParams,
  ])

  const listLabels = new Map(sourcingLists.map((list) => [list.id, list.label]))

  // Which tier this subscription is, by price id and the explicit map.
  const tier = tierForPrice(subscription?.priceId ?? null, planPriceIds())
  const plan = tier ? PLANS[tier] : null

  return (
    <>
      <h1 className="font-display text-h2 font-normal">Account</h1>

      {params.saved === '1' ? (
        <div className="mt-6">
          <Notice title="Saved">
            <p>Your search is updated. It takes effect on the next run.</p>
          </Notice>
        </div>
      ) : null}

      <Card className="mt-8">
        <h2 className="text-base font-medium">Plan</h2>

        {subscription ? (
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-muted">Status</dt>
              <dd className="font-medium">{STATUS_WORDING[subscription.status] ?? subscription.status}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-line pb-3">
              <dt className="text-muted">Plan</dt>
              {/* Read from the price they actually bought rather than printed
                  as a constant. A hardcoded £29 on a Portfolio account is the
                  kind of wrong that costs a support email. */}
              <dd className="font-medium">
                {plan ? (
                  <>
                    {plan.label} —{' '}
                    <span className="figure">£{plan.monthlyPrice}</span> a month,{' '}
                    <span className="figure">{plan.areas}</span> {plan.areas === 1 ? 'area' : 'areas'}
                  </>
                ) : (
                  'Active'
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Next payment'}
              </dt>
              <dd className="figure font-medium">{formatDate(subscription.currentPeriodEnd)}</dd>
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
            <ButtonLink href="/subscribe">Choose a plan</ButtonLink>
          )}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-base font-medium">Your areas</h2>
          <p className="text-sm text-muted">
            <span className="figure">{allowance.used}</span> of{' '}
            <span className="figure">{allowance.limit}</span> used
          </p>
        </div>

        {/* At the limit and wanting another: the honest next step is the plan,
            and saying so beats a form that refuses on submit. */}
        {allowance.used >= allowance.limit && state.active ? (
          <p className="mt-2 text-sm text-muted">
            Your plan covers {allowance.limit} {allowance.limit === 1 ? 'area' : 'areas'}.{' '}
            <a href="/api/stripe/portal" className="underline underline-offset-4 hover:text-ink">
              Move up a tier
            </a>{' '}
            to search more.
          </p>
        ) : null}

        {profiles.length ? (
          <div className="mt-5 space-y-4">
            {profiles.map((area) => (
              <div key={area.id} className="border-t border-line pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">
                    {areaName(area)}
                    {area.pausedAt ? <span className="label ml-2 text-muted">Paused</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {area.postcode}, within {area.radiusMiles} {area.radiusMiles === 1 ? 'mile' : 'miles'}
                  </p>
                </div>

                <p className="mt-1 text-sm text-muted">
                  {area.investmentStrategies.map((id) => STRATEGY_DEFINITIONS[id].label).join(', ')} ·{' '}
                  {area.sourcingLists.map((id) => listLabels.get(id) ?? id).join(', ')}
                </p>

                {/* Why it is paused, and that nothing has been thrown away.
                    Somebody who has just downgraded needs to know their search
                    is intact before they need to know anything else. */}
                {area.pausedAt ? (
                  <p className="mt-2 text-sm text-muted">
                    {area.pausedReason ?? 'Paused.'} Nothing has been deleted — the search, its history and your
                    deals are all still here, and it starts again the moment there is room for it.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-3">
                  <ButtonLink href={`/onboarding?area=${area.id}`} variant="secondary">
                    {area.pausedAt ? 'View' : 'Change'}
                  </ButtonLink>
                  {area.pausedAt ? (
                    <form action={chooseAreaAction}>
                      <input type="hidden" name="profileId" value={area.id} />
                      <Button type="submit" variant="quiet">
                        Make this one live instead
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {profile ? (
          <>
            <dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4 border-b border-line pb-3">
                <dt className="text-muted">Area and strategy changes this month</dt>
                <dd className="figure font-medium">
                  {changesUsed} of {SEARCH_CHANGE_LIMIT}
                </dd>
              </div>
              {/* Its own allowance, because widening is what somebody with a
                  thin list is told to do and it should not come out of the
                  budget for moving house. */}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Radius widenings this month</dt>
                <dd className="figure font-medium">
                  {wideningsUsed} of {RADIUS_WIDEN_LIMIT}
                </dd>
              </div>
            </dl>

            {allowance.used < allowance.limit ? (
              <div className="mt-6">
                <ButtonLink href="/onboarding?new=1">Add another area</ButtonLink>
              </div>
            ) : null}
          </>
        ) : state.active ? (
          <>
            <p className="mt-3 text-sm text-muted">You have not answered the two questions yet.</p>
            <div className="mt-6">
              <ButtonLink href="/onboarding">Set up my search</ButtonLink>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Set up once you subscribe. There are two questions, and they are the only two you will be asked.
          </p>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-base font-medium">Sign-in</h2>
        <p className="mt-3 text-sm text-muted">
          You sign in as {user.email}. Changing the address is not something you can do here. Email me and I will
          move it, so that losing an inbox does not lose the subscription with it.
        </p>
        <ChangePasswordForm />
      </Card>
    </>
  )
}
