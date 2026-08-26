import Link from 'next/link'
import { listTrackedDeals, stageCounts } from '@/lib/deal-progress'
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

  const [deals, counts] = await Promise.all([listTrackedDeals({ includeFinished: true }), stageCounts()])

  const live = deals.filter((deal) => isActive(deal.stage))
  const finished = deals.filter((deal) => !isActive(deal.stage))

  const ordered = DEAL_STAGES.filter((stage) => (counts.get(stage) ?? 0) > 0).map(
    (stage) => [stage, counts.get(stage) ?? 0] as [DealStage, number],
  )

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your deals</h1>
      <p className="mt-2 max-w-prose text-muted">
        Where each property got to, and when. Nothing here is sent anywhere or costs anything. It is your own record
        of what you did next.
      </p>

      <StageSummary counts={ordered} />

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
          <h2 className="text-lg font-medium">Live</h2>
          <div className="mt-4 space-y-3">
            {live.map((deal) => (
              <TrackedRow key={deal.propertyId} deal={deal} />
            ))}
          </div>
        </section>
      ) : null}

      {finished.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Finished</h2>
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
