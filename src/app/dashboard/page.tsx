import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSubscriptionState } from '@/lib/subscription'
import { getSearchProfile } from '@/lib/search-profile'
import { getCurrentWeek, type PublishedDeal } from '@/lib/deals'
import { AppShell } from '@/components/app-shell'
import { Card, EmptyState, Notice } from '@/components/ui'

export const dynamic = 'force-dynamic'

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso))
}

function formatMoney(pence: number | null): string {
  return pence === null ? 'Price not held' : `£${pence.toLocaleString('en-GB')}`
}

function describeArea(postcode: string, radiusMiles: number): string {
  return `${postcode}, within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`
}

/**
 * A published deal.
 *
 * The qualifying event is in the headline position, because it is the reason
 * the property is here. Every figure carries the date it was observed. There is
 * never a photograph — listing images carry no rights, so we link to the advert.
 */
function DealCard({ deal }: { deal: PublishedDeal }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-accent">{deal.headline}</p>
        <p className="nums text-sm text-muted">Score {deal.totalScore.toFixed(0)}</p>
      </div>

      <h3 className="mt-2 text-lg font-medium">{deal.address ?? 'Address not held'}</h3>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt className="text-muted">Asking price</dt>
          <dd className="nums font-medium">{formatMoney(deal.price)}</dd>
        </div>
        <div>
          <dt className="text-muted">Bedrooms</dt>
          <dd className="nums font-medium">{deal.bedrooms ?? 'Not held'}</dd>
        </div>
        <div>
          <dt className="text-muted">Type</dt>
          <dd className="font-medium">{deal.propertyType ?? 'Not held'}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-muted">
        Observed {formatDate(deal.observedAt)}. Quality {deal.qualityScore.toFixed(0)}, movement{' '}
        {deal.movementScore.toFixed(0)}, scoring {deal.scoreVersion}.
      </p>

      {deal.listingUrl ? (
        <a
          href={deal.listingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-accent"
        >
          View the original listing
        </a>
      ) : null}
    </Card>
  )
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

  const [week, params] = await Promise.all([getCurrentWeek(), searchParams])

  return (
    <AppShell email={user.email}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {week?.kind === 'backfill' ? 'Your opening list' : 'This week'}
        </h1>
        <p className="text-sm text-muted">
          {describeArea(profile.postcode, profile.radiusMiles)} ·{' '}
          <Link href="/onboarding" className="underline underline-offset-4 hover:text-ink">
            change
          </Link>
        </p>
      </div>

      {/* The run date, so the user knows the list is fresh rather than the one
          they saw last time. */}
      {week ? (
        <p className="mt-2 text-sm text-muted">
          Published {formatDate(week.publishedAt)}
          {week.kind === 'backfill'
            ? '. Drawn from everything standing in your area, not only what appeared this week.'
            : `, for the week of ${formatDate(week.weekOf)}.`}
        </p>
      ) : null}

      {params.checkout === 'complete' ? (
        <div className="mt-6">
          <Notice title="You are subscribed">
            <p>Thank you. Your card is set up and your account is active.</p>
          </Notice>
        </div>
      ) : null}

      {params.onboarded === '1' ? (
        <div className="mt-6">
          <Notice title="Your search is saved">
            <p>
              {describeArea(profile.postcode, profile.radiusMiles)}, across {profile.strategies.length}{' '}
              {profile.strategies.length === 1 ? 'strategy' : 'strategies'}.
            </p>
          </Notice>
        </div>
      ) : null}

      {week?.isThin && week.thinReason ? (
        <div className="mt-6">
          <Notice tone="warn" title="A short list this week">
            <p>{week.thinReason}</p>
          </Notice>
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {week && week.deals.length > 0 ? (
          week.deals.map((deal) => <DealCard key={deal.propertyId} deal={deal} />)
        ) : profile.backfillCompletedAt === null ? (
          <EmptyState title="Your first list is not built yet">
            <p>
              The opening list is a backfill. It draws on everything standing in your area rather than only what
              appeared this week, so it takes a full run to put together.
            </p>
            <p className="mt-3">The run happens on Sunday night and the list is here on Monday morning.</p>
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
