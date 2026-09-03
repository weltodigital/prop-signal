import Link from 'next/link'
import { developmentGdvPerSqFt, getCurrentWeek, type PublishedDeal } from '@/lib/deals'
import type { DealStage } from '@/lib/deal-stages'
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

/**
 * One band of the list, with a heading that says what it is.
 *
 * Renders nothing when empty, so a quiet week is three sections shorter rather
 * than three empty headings claiming otherwise.
 */
function OpportunityGroup({
  title,
  note,
  deals,
  unseen,
  stages,
  gdvPerSqFt,
}: {
  title: string
  note: string
  deals: PublishedDeal[]
  unseen: boolean
  stages: Map<string, { stage: DealStage }>
  gdvPerSqFt: number | null
}) {
  if (deals.length === 0) return null

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-h3 font-medium">{title}</h2>
        <span className="figure text-sm text-muted">{deals.length}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{note}</p>

      <div className="mt-4 space-y-4">
        {deals.map((deal, index) => (
          <Rise key={deal.propertyId} delay={Math.min(index, 6) * 0.05}>
            <DealCard
              deal={deal}
              isNew={unseen}
              stage={stages.get(deal.propertyId)?.stage ?? null}
              gdvPerSqFt={gdvPerSqFt}
            />
          </Rise>
        ))}
      </div>
    </section>
  )
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

  // The three counts the heading is about. `changedSinceSeen` marks a property
  // whose qualifying event landed since they last looked; on a week nobody has
  // opened, everything on it is new to them rather than merely changed.
  //
  // "New" is a property this run observed for the first time: `first_observed_at`
  // and the run's `published_at` are written from the same timestamp, so they
  // match exactly for anything that entered the payload this week. Everything
  // else has been on the list before, and the only question about it is whether
  // it has moved since they looked.
  const fresh = week?.deals.filter((deal) => week && deal.firstObservedAt >= week.publishedAt) ?? []
  const freshIds = new Set(fresh.map((deal) => deal.propertyId))
  const changed = week?.deals.filter((deal) => !freshIds.has(deal.propertyId) && deal.changedSinceSeen) ?? []
  const standing =
    week?.deals.filter((deal) => !freshIds.has(deal.propertyId) && !deal.changedSinceSeen) ?? []

  const changedCount = changed.length
  const newCount = fresh.length
  const workingChanged = moved.filter((entry) => entry.working).length

  return (
    <>
      {/* The head of the page sits on the same wash the front page opens on, so
          the figures have something to sit on and the list below has somewhere
          to start. Full width of the shell, which is why the negative margin. */}
      <div className="-mx-6 -mt-12 bg-gradient-to-b from-tint to-ground px-6 pt-12 pb-10">
        <Rise>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            {/* The count, as the heading. Somebody opening this wants to know
                how many properties are worth their attention — not to be told
                the name of the screen they are already looking at. */}
            <h1 className="font-display text-h2 font-normal">
              {week && week.deals.length > 0
                ? `${week.deals.length} ${week.deals.length === 1 ? 'property' : 'properties'} worth looking at`
                : 'Your opportunities'}
            </h1>
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

          {/* New, changed, being worked, and when we last looked — the four
              things that decide whether this page is worth reading today. */}
          {week ? (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {newCount > 0 ? (
                <span className="label border border-highlight-deep/40 px-1.5 py-0.5 text-highlight-deep">
                  {newCount} new
                </span>
              ) : null}
              {changedCount > 0 ? (
                <span className="label border border-line px-1.5 py-0.5 text-ink">{changedCount} changed</span>
              ) : null}
              {workingChanged > 0 ? (
                <span className="label border border-line px-1.5 py-0.5 text-ink">
                  {workingChanged} in your pipeline moved
                </span>
              ) : null}
              <span>
                Last checked {formatDate(week.publishedAt)}.{' '}
                {/* Previous weeks kept a permanent slot in the navigation, which
                    said the product had four parts when it has three. Reached
                    from here instead, where somebody wanting last week already
                    is. */}
                <Link href="/archive" className="underline underline-offset-4 hover:text-ink">
                  Previous weeks
                </Link>
              </span>
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
          <Notice tone="warn" title="Nothing new this week">
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
      <DealTracker deals={tracked} changes={notifications} />



      <div className="mt-8">
        {week && week.deals.length > 0 ? (
          <div className="space-y-10">
            {/* Three groups, because a flat list of everything that still
                stacks grows every week and reads as a dump. The order is the
                order somebody wants them in: what we just found, what has
                moved since they looked, and the rest of what still stands. */}
            <OpportunityGroup
              title="New"
              note="Found for the first time this week."
              deals={fresh}
              unseen={unseen}
              stages={stages}
              gdvPerSqFt={gdvPerSqFt}
            />
            <OpportunityGroup
              title="Changed"
              note="Already on your list, and something has happened since you last looked."
              deals={changed}
              unseen={false}
              stages={stages}
              gdvPerSqFt={gdvPerSqFt}
            />
            <OpportunityGroup
              title="Still worth a look"
              note="On your list and unchanged. They have not stopped being good buys."
              deals={standing}
              unseen={false}
              stages={stages}
              gdvPerSqFt={gdvPerSqFt}
            />
          </div>
        ) : awaitingFirstRun ? (
          // The panel above is doing it. Saying "not built yet" underneath
          // would read as a contradiction.
          null
        ) : profile.backfillCompletedAt === null ? (
          <EmptyState title="We have not searched your area yet">
            <p>
              We look at everything standing in your area rather than only what appeared this week, so the first
              one takes a little longer to put together.
            </p>
            <p className="mt-3">It runs on Sunday night and your opportunities are here on Monday morning.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Nothing clears the bar right now">
            <p>
              Nothing in your area is worth your attention at the moment. We would rather show you a short list than
              pad it out with properties that do not stack.
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
