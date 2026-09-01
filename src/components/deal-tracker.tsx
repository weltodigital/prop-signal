import Link from 'next/link'
import type { TrackedDeal } from '@/lib/deal-progress'
import { FORWARD_STAGES, STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { StageControl } from '@/components/stage-control'
import { formatDate, formatMoney } from '@/lib/format'

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
        <h2 className="text-h3 font-medium">Deals you&rsquo;re working</h2>
        <p className="text-sm text-muted">
          {deals.length} live ·{' '}
          <Link href="/deals" className="underline underline-offset-4 hover:text-ink">
            everything you have tracked
          </Link>
        </p>
      </div>

      <div className="mt-4">
        {deals.map((deal) => (
          <TrackedRow key={deal.propertyId} deal={deal} />
        ))}
      </div>
    </section>
  )
}

/**
 * How far along a deal is, as a row of steps.
 *
 * Ordered markers are usually decoration. Here the content genuinely is a
 * sequence — interested, contacted, viewing, offer, accepted, completed — and
 * where a deal sits in it is the whole reason the row exists.
 *
 * A deal that ended shows the run greyed rather than hidden, because "this one
 * died at viewing" is worth seeing at a glance.
 */
function StageProgress({ stage }: { stage: DealStage }) {
  const definition = STAGE_DEFINITIONS[stage]
  const reached = definition.terminal && definition.lost ? definition.step - 1 : definition.step

  return (
    <div
      className="flex items-center gap-1"
      title={`${definition.label}${definition.lost ? ' — ended here' : ''}`}
      aria-label={`Stage: ${definition.label}`}
    >
      {FORWARD_STAGES.map((id, index) => {
        const done = index + 1 <= reached
        return (
          <span
            key={id}
            aria-hidden="true"
            className={`h-1 w-4 rounded-full transition-colors ${
              done ? (definition.lost ? 'bg-muted/50' : 'bg-highlight-deep') : 'bg-line'
            }`}
          />
        )
      })}
    </div>
  )
}

export function TrackedRow({ deal }: { deal: TrackedDeal }) {
  return (
    <div className="border-t border-line py-4 transition-colors duration-150 hover:bg-ink/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <Link href={`/property/${deal.propertyId}`} className="transition-colors hover:text-highlight-deep">
              {deal.address ?? 'Address not held'}
            </Link>
          </p>
          <p className="mt-0.5 truncate text-sm text-muted">
            {[deal.postcode, deal.price === null ? null : formatMoney(deal.price)].filter(Boolean).join(' · ')}
            {' · '}
            {STAGE_DEFINITIONS[deal.stage].happened} {formatDate(deal.enteredAt)}
          </p>
          <div className="mt-2">
            <StageProgress stage={deal.stage} />
          </div>
        </div>

        <StageControl propertyId={deal.propertyId} stage={deal.stage} />
      </div>
    </div>
  )
}

/** A count per stage, for the summary at the top of the deals page. */
export function StageSummary({ counts }: { counts: Array<[DealStage, number]> }) {
  if (counts.length === 0) return null

  return (
    <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
      {counts.map(([stage, count]) => (
        <div key={stage}>
          <dt className="label text-muted">{STAGE_DEFINITIONS[stage].label}</dt>
          <dd className="figure mt-1.5 text-2xl leading-none">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
