import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import {
  countRadiusWidenings,
  countSearchChanges,
  getSearchProfile,
  listSourcingLists,
  RADIUS_WIDEN_LIMIT,
  SEARCH_CHANGE_LIMIT,
} from '@/lib/search-profile'
import { countProbes, latestProbeFor, PROBE_LIMIT } from '@/lib/search-probe'
import { AreaCheck, ProbeExhausted } from '@/components/area-check'
import { SearchForm } from './search-form'
import { Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ checked?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) redirect('/login?next=/onboarding')

  // No subscription check. These questions come *before* the card now, so the
  // next screen can say how many properties the area actually holds — the one
  // thing somebody cannot find out for themselves and the one thing worth
  // knowing before £29. Nothing on this page spends anything.
  const [subscription, profile, sourcingLists, changesUsed, wideningsUsed, params] = await Promise.all([
    getSubscriptionState(),
    getSearchProfile(),
    listSourcingLists(),
    countSearchChanges(user.id),
    countRadiusWidenings(user.id),
    searchParams,
  ])

  const isNew = profile === null

  // The count, for somebody who has answered the questions and not yet paid.
  if (params.checked === '1' && profile && !subscription.active) {
    const [existing, probesUsed] = await Promise.all([
      latestProbeFor(user.id, profile),
      countProbes(user.id),
    ])

    // A probe already run for this exact search is handed straight back, so a
    // refresh or a back button costs nothing.
    const exhausted = existing === null && probesUsed >= PROBE_LIMIT

    return (
      <>
        <h1 className="font-display text-h2 font-normal">What is in your area</h1>
        <p className="mt-2 max-w-prose text-muted">
          Before you pay anything, here is what your search actually has to work with. If it is thin, widen the
          radius and check again — it costs you nothing.
        </p>

        <div className="mt-8">
          {exhausted ? (
            <ProbeExhausted used={probesUsed} limit={PROBE_LIMIT} />
          ) : (
            <AreaCheck initial={existing} />
          )}
        </div>

        <p className="mt-8 text-sm text-muted">
          <Link href="/onboarding" className="underline underline-offset-4 hover:text-ink">
            Back to your answers
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="font-display text-h2 font-normal">
        {isNew ? 'Three questions' : 'Your area and strategy'}
      </h1>

      <p className="mt-2 max-w-prose text-muted">
        {isNew
          ? 'Answer these and we will tell you how many properties your area holds, before you pay anything.'
          : 'Change what you are looking for. Moving the area or the strategy means sourcing somewhere new from scratch, so those changes are limited.'}
      </p>

      {isNew ? (
        <div className="mt-6">
          <Notice title="Your first list is the widest search">
            <p>
              It looks at everything standing in your area rather than only what appeared this week, so it will
              include properties that have been listed for months. How many reach you is decided by what you set
              below: a wider radius and looser filters mean more, and a tight search in a quiet market may mean two.
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
          wideningsUsed={wideningsUsed}
          wideningLimit={RADIUS_WIDEN_LIMIT}
          subscribed={subscription.active}
        />
      </div>
    </>
  )
}
