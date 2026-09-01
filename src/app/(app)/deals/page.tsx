import Link from 'next/link'
import { listTrackedDeals, stageCounts } from '@/lib/deal-progress'
import { listNotifications } from '@/lib/watchlist'
import { markReadAction } from './mark-read'
import { formatShortDate } from '@/lib/format'
import { Button, Card } from '@/components/ui'
import { DEAL_STAGES, isActive, STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { requireSubscriber } from '@/lib/require-subscriber'
import { StageSummary, TrackedRow } from '@/components/deal-tracker'
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

  const ordered = DEAL_STAGES.filter((stage) => (counts.get(stage) ?? 0) > 0).map(
    (stage) => [stage, counts.get(stage) ?? 0] as [DealStage, number],
  )

  return (
    <>
      <h1 className="font-display text-h2 font-normal">Your deals</h1>
      <p className="mt-2 max-w-prose text-muted">
        Where each property got to, and what has changed on it since you looked. Anything you are working is watched
        automatically, so you do not have to ask twice.
      </p>

      <StageSummary counts={ordered} />

      {/* What has changed, above the deals themselves. A price cut on a deal
          you have an offer in on is the most time-sensitive thing on the page. */}
      {changes.length ? (
        <Card className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <h2 className="text-base font-medium">
              {changes.length} {changes.length === 1 ? 'change' : 'changes'} since you last looked
            </h2>
            <form action={markReadAction}>
              <Button type="submit" variant="quiet">
                Mark all read
              </Button>
            </form>
          </div>

          <ul className="mt-3 space-y-1.5 text-sm">
            {changes.map((change) => (
              <li key={`${change.propertyId}-${change.observedAt}-${change.label}`} className="flex gap-3">
                <span className="figure shrink-0 text-muted">{formatShortDate(change.observedAt)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{change.label}</span>
                  <span className="text-muted"> on {change.address ?? 'a property you are working'}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {deals.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Nothing tracked yet">
            <p>
              Mark a property on{' '}
              <Link href="/dashboard" className="underline underline-offset-4 hover:text-ink">
                this week&rsquo;s list
              </Link>{' '}
              as one to look at, and it will appear here as you move it along.
            </p>
          </EmptyState>
        </div>
      ) : null}

      {live.length ? (
        <section className="mt-8">
          <h2 className="text-h3 font-medium">Live</h2>
          <div className="mt-4 space-y-3">
            {live.map((deal) => (
              <TrackedRow key={deal.propertyId} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}

      {finished.length ? (
        <section className="mt-10">
          <h2 className="text-h3 font-medium">Finished</h2>
          <p className="mt-1 text-sm text-muted">
            Kept rather than deleted. A completion rate that quietly drops the ones that did not complete is not a
            completion rate.
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
          {finished.filter((d) => STAGE_DEFINITIONS[d.stage].lost === false).length} of {deals.length} completed.
        </p>
      ) : null}
    </>
  )
}
