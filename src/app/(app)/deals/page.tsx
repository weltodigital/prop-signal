import Link from 'next/link'
import { listTrackedDeals, stageCounts } from '@/lib/deal-progress'
import { listNotifications } from '@/lib/watchlist'
import { markReadAction } from './mark-read'
import { formatShortDate } from '@/lib/format'
import { Button, Card } from '@/components/ui'
import { DEAL_STAGES, isActive, STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { requireSubscriber } from '@/lib/require-subscriber'
import { groupChanges, StageSummary, TrackedRow } from '@/components/deal-tracker'
import { EmptyState } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Everything the subscriber has tracked, finished ones included.
 *
 * The dashboard shows the live ones because that is what needs doing this
 * week. This is the record: what completed, what was passed on, and what fell
 * through — which is the only honest way to read a completion rate.
 */
export default async function DealsPage() {
  const { email } = await requireSubscriber('/deals')

  const [deals, counts, changes] = await Promise.all([
    listTrackedDeals({ includeFinished: true }),
    stageCounts(),
    // Anything material that has happened on a deal being worked since it was
    // last read. Derived from events the run already wrote, so it costs nothing.
    listNotifications(),
  ])

  const live = deals.filter((deal) => isActive(deal.stage))
  const finished = deals.filter((deal) => !isActive(deal.stage))

  // A property withdrawn from the market is not a deal that failed, so it is
  // held out of the denominator rather than quietly dragging the rate down.
  // Counting it as a loss would say we surfaced something the subscriber
  // rejected, when what happened is the seller left.
  const delisted = deals.filter((deal) => deal.stage === 'delisted').length
  const completed = finished.filter((deal) => !STAGE_DEFINITIONS[deal.stage].lost).length

  const ordered = DEAL_STAGES.filter((stage) => (counts.get(stage) ?? 0) > 0).map(
    (stage) => [stage, counts.get(stage) ?? 0] as [DealStage, number],
  )

  const byProperty = groupChanges(changes)

  return (
    <>
      <h1 className="font-display text-h2 font-normal">Your pipeline</h1>
      <p className="mt-2 max-w-prose text-muted">
        The properties you are pursuing, where each one got to, and what has changed since you looked. Anything you
        are working is watched automatically, so you do not have to ask twice.
      </p>

      <StageSummary counts={ordered} />

      {/* A count and a way to clear it. The events themselves now sit on the
          property they happened to, which is where somebody deciding what to
          do about one will be looking — a separate list at the top made you
          hold an address in your head while you scrolled to find it. */}
      {changes.length ? (
        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-l-2 border-highlight-deep/40 py-1 pl-4">
          <p className="text-sm">
            <span className="font-medium">
              {changes.length} {changes.length === 1 ? 'change' : 'changes'} since you last looked
            </span>
            <span className="text-muted">, shown on the properties below.</span>
          </p>
          <form action={markReadAction}>
            <Button type="submit" variant="quiet">
              Mark all read
            </Button>
          </form>
        </div>
      ) : null}

      {deals.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nothing in your pipeline yet">
            <p>
              Mark a property in{' '}
              <Link href="/dashboard" className="underline underline-offset-4 hover:text-ink">
                your opportunities
              </Link>{' '}
              as one to look at, and it will appear here as you move it along.
            </p>
          </EmptyState>
        </div>
      ) : null}

      {live.length ? (
        <section className="mt-8">
          <h2 className="text-h3 font-medium">Tracked</h2>
          <p className="mt-1 text-sm text-muted">The properties you are actively pursuing.</p>
          <div className="mt-4 space-y-3">
            {live.map((deal) => (
              <TrackedRow
                key={deal.propertyId}
                deal={deal}
                changes={byProperty.get(deal.propertyId) ?? []}
              />
            ))}
          </div>
        </section>
      ) : null}

      {finished.length ? (
        <section className="mt-10">
          <h2 className="text-h3 font-medium">Finished</h2>
          <p className="mt-1 text-sm text-muted">
            Bought, passed on, or lost. Kept rather than deleted — a completion rate that quietly drops the ones
            that did not complete is not a completion rate.
          </p>
          <div className="mt-4 space-y-3">
            {finished.map((deal) => (
              <TrackedRow key={deal.propertyId} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}

      {finished.length ? (
        <p className="mt-8 text-sm text-muted">
          {completed} of {deals.length - delisted} completed.
          {delisted
            ? ` ${delisted} more came off the market while you were working ${
                delisted === 1 ? 'it' : 'them'
              }, which is not a decision you made, so ${delisted === 1 ? 'it is' : 'they are'} counted separately.`
            : ''}
        </p>
      ) : null}
    </>
  )
}
