import Link from 'next/link'
import { getCurrentWeek } from '@/lib/deals'
import { currentStages, listTrackedDeals } from '@/lib/deal-progress'
import { requireSubscriber } from '@/lib/require-subscriber'
import { formatDate } from '@/lib/format'
import { AppShell } from '@/components/app-shell'
import { DealCard } from '@/components/deal-card'
import { DealTracker } from '@/components/deal-tracker'
import { MarkSeen } from '@/components/mark-seen'
import { EmptyState, Notice } from '@/components/ui'
import { STRATEGY_DEFINITIONS } from '@/lib/strategies'

export const dynamic = 'force-dynamic'

function describeArea(postcode: string, radiusMiles: number): string {
  return `${postcode}, within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; onboarded?: string }>
}) {
  const { email, profile } = await requireSubscriber('/dashboard')
  const [week, params, tracked, stages] = await Promise.all([
    getCurrentWeek(),
    searchParams,
    listTrackedDeals(),
    currentStages(),
  ])

  // Read before the marker is cleared, so this render still shows it. The
  // clearing happens in MarkSeen, on the visit rather than on publish.
  const unseen = week !== null && week.seenAt === null

  return (
    <AppShell email={email}>
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
          {unseen ? (
            <span className="mr-2 rounded-full bg-accent px-2 py-0.5 text-xs tracking-wide text-white uppercase">
              New
            </span>
          ) : null}
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
              {describeArea(profile.postcode, profile.radiusMiles)}, across {profile.sourcingLists.length}{' '}
              {profile.sourcingLists.length === 1 ? 'list' : 'lists'}, scored for{' '}
              {profile.investmentStrategies.map((id) => STRATEGY_DEFINITIONS[id].label).join(' and ')}.
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

      {/* Above the week's five, because a deal at "offer accepted" wants
          attention today and a new listing can wait. Renders nothing when
          there is nothing in it. */}
      <DealTracker deals={tracked} />

      {tracked.length ? <h2 className="mt-10 text-lg font-medium">This week&rsquo;s list</h2> : null}

      <div className="mt-8 space-y-4">
        {week && week.deals.length > 0 ? (
          week.deals.map((deal) => (
            <DealCard
              key={deal.propertyId}
              deal={deal}
              isNew={unseen}
              stage={stages.get(deal.propertyId)?.stage ?? null}
            />
          ))
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
            <p className="mt-3">
              <Link href="/archive" className="underline underline-offset-4 hover:text-ink">
                Previous weeks
              </Link>{' '}
              are still here.
            </p>
          </EmptyState>
        )}
      </div>

      {unseen && week ? <MarkSeen runId={week.runId} /> : null}
    </AppShell>
  )
}
