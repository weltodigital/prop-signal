import Link from 'next/link'
import type { TrackedDeal } from '@/lib/deal-progress'
import { STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { StageControl } from '@/components/stage-control'
import { formatDate, formatMoney } from '@/lib/format'
import { Card } from '@/components/ui'

/**
 * The deals the subscriber is working.
 *
 * Above the week's five, and only when there is something in it. A deal at
 * "offer accepted" wants attention today; a new listing can wait until the
 * subscriber has read the ones they are already in. An empty section would be
 * furniture, so it does not render at all.
 */
export function DealTracker({ deals }: { deals: TrackedDeal[] }) {
  if (deals.length === 0) return null

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-medium">Deals you&rsquo;re working</h2>
        <p className="text-sm text-muted">
          {deals.length} live ·{' '}
          <Link href="/deals" className="underline underline-offset-4 hover:text-ink">
            everything you have tracked
          </Link>
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {deals.map((deal) => (
          <TrackedRow key={deal.propertyId} deal={deal} />
        ))}
      </div>
    </section>
  )
}

export function TrackedRow({ deal }: { deal: TrackedDeal }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <Link href={`/property/${deal.propertyId}`} className="hover:text-accent">
              {deal.address ?? 'Address not held'}
            </Link>
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {[deal.postcode, deal.price === null ? null : formatMoney(deal.price)].filter(Boolean).join(' · ')}
            {' · '}
            {STAGE_DEFINITIONS[deal.stage].happened} {formatDate(deal.enteredAt)}
          </p>
        </div>

        <StageControl propertyId={deal.propertyId} stage={deal.stage} />
      </div>
    </Card>
  )
}

/** A count per stage, for the summary at the top of the deals page. */
export function StageSummary({ counts }: { counts: Array<[DealStage, number]> }) {
  if (counts.length === 0) return null

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
      {counts.map(([stage, count]) => (
        <div key={stage}>
          <dt className="text-sm text-muted">{STAGE_DEFINITIONS[stage].label}</dt>
          <dd className="nums text-lg font-medium">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
