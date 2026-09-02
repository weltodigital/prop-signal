import Link from 'next/link'
import { developmentGdvPerSqFt, getCurrentWeek } from '@/lib/deals'
import { currentStages, listTrackedDeals } from '@/lib/deal-progress'
import { requireSubscriber } from '@/lib/require-subscriber'
import { formatDate } from '@/lib/format'
import { DealCard } from '@/components/deal-card'
import { DealTracker } from '@/components/deal-tracker'
import { DashboardStats } from '@/components/dashboard-stats'
import { AreaSwitcher } from '@/components/area-switcher'
import { WhatMoved, whatMoved } from '@/components/what-moved'
import { listNotifications } from '@/lib/watchlist'
import { FirstRun } from '@/components/first-run'
import { MarkSeen } from '@/components/mark-seen'
import { EmptyState, Notice } from '@/components/ui'
import { Rise } from '@/components/motion-ui'
import { STRATEGY_DEFINITIONS } from '@/lib/strategies'

export const dynamic = 'force-dynamic'

function describeArea(postcode: string, radiusMiles: number): string {
  return `${postcode}, within ${radiusMiles} ${radiusMiles === 1 ? 'mile' : 'miles'}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; onboarded?: string; area?: string }>
}) {
  const requested = (await searchParams).area
  const { email, profile, profiles } = await requireSubscriber('/dashboard', requested)
  const [week, params, tracked, stages, gdvPerSqFt, notifications] = await Promise.all([
    getCurrentWeek(profile.id),
    searchParams,
    listTrackedDeals(),
    currentStages(),
    developmentGdvPerSqFt(),
    // Derived from the diff the run already wrote, so this costs nothing.
    listNotifications(),
  ])

  // What is worth coming back for once the list has been worked through. Read
  // before the marker is cleared, like the marker itself.
  const moved = whatMoved(week?.deals ?? [], notifications)

  // Read before the marker is cleared, so this render still shows it. The
  // clearing happens in MarkSeen, on the visit rather than on publish.
  const unseen = week !== null && week.seenAt === null

  // Nothing has ever been sourced for this subscriber. The dashboard kicks the
  // first run off itself rather than waiting for the Sunday cron.
  // The flag is the signal on its own. Requiring an empty dashboard as well
  // meant a subscriber whose opening run had published something could never
  // trigger another, which is wrong whenever the first one needs redoing.
  const awaitingFirstRun = profile.backfillCompletedAt === null

  return (
    <>
      {/* The head of the page sits on the same wash the front page opens on, so
          the figures have something to sit on and the list below has somewhere
          to start. Full width of the shell, which is why the negative margin. */}
      <div className="-mx-6 -mt-12 bg-gradient-to-b from-tint to-ground px-6 pt-12 pb-10">
        <Rise>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h1 className="font-display text-h2 font-normal">Your properties</h1>
            <p className="text-sm text-muted">
              {describeArea(profile.postcode, profile.radiusMiles)} ·{' '}
              <Link
                href={`/onboarding?area=${profile.id}`}
                className="underline underline-offset-4 hover:text-ink"
              >
                change
              </Link>
            </p>
          </div>

          {/* Nothing at all for a subscriber with one area, which is everyone
              until the tiers ship. */}
          <AreaSwitcher profiles={profiles} current={profile} />

          {/* The run date, so the user knows the list is fresh rather than the
              one they saw last time. */}
          {week ? (
            <p className="mt-3 text-sm text-muted">
              {unseen ? (
                <span className="label mr-2 border border-highlight-deep/40 px-1.5 py-0.5 text-highlight-deep">
                  New
                </span>
              ) : null}
              {week.dealCount} {week.dealCount === 1 ? 'property' : 'properties'} that stack in your area, last
              checked {formatDate(week.publishedAt)}.
            </p>
          ) : null}
        </Rise>

        {week && week.deals.length > 0 ? (
          <DashboardStats
            deals={week.deals}
            tracked={tracked}
            newThisWeek={week.deals.filter((deal) => deal.changedSinceSeen).length}
          />
        ) : null}
      </div>

      {/* Above everything, because by week twenty this is the reason to open
          the page at all. The list is mostly the list they already worked
          through; what changed on it is the news. */}
      <WhatMoved moved={moved} />

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

      {/* The opening backfill has not happened yet. Run it now rather than
          leaving somebody who has just paid looking at an empty dashboard
          until Sunday. */}
      {awaitingFirstRun ? <FirstRun /> : null}

      {/* Above the week's five, because a deal at "offer accepted" wants
          attention today and a new listing can wait. Renders nothing when
          there is nothing in it. */}
      <DealTracker deals={tracked} />

      {tracked.length ? <h2 className="mt-12 text-h3 font-medium">Your properties</h2> : null}

      <div className="mt-8 space-y-4">
        {week && week.deals.length > 0 ? (
          week.deals.map((deal, index) => (
            <Rise key={deal.propertyId} delay={Math.min(index, 6) * 0.05}>
              <DealCard
                deal={deal}
                isNew={unseen}
                stage={stages.get(deal.propertyId)?.stage ?? null}
                gdvPerSqFt={gdvPerSqFt}
              />
            </Rise>
          ))
        ) : awaitingFirstRun ? (
          // The panel above is doing it. Saying "not built yet" underneath
          // would read as a contradiction.
          null
        ) : profile.backfillCompletedAt === null ? (
          <EmptyState title="Your first list is not built yet">
            <p>
              We look at everything standing in your area rather than only what appeared this week, so the first
              one takes a little longer to put together.
            </p>
            <p className="mt-3">It runs on Sunday night and the list is here on Monday morning.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing clears the bar right now">
            <p>
              Nothing in your area clears the bar at the moment. We would rather show you a short list than pad it out
              with deals that do not stack.
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
    </>
  )
}
