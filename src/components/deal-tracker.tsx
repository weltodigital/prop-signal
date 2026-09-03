import Link from 'next/link'
import type { TrackedDeal } from '@/lib/deal-progress'
import { FORWARD_STAGES, STAGE_DEFINITIONS, type DealStage } from '@/lib/deal-stages'
import { StageControl } from '@/components/stage-control'
import { formatDate, formatMoney, formatShortDate } from '@/lib/format'
import type { WatchlistNotification } from '@/lib/watchlist'
import { Meter } from '@/components/motion-ui'

/**
 * The deals the subscriber is working.
 *
 * Above the week's five, and only when there is something in it. A deal at
 * "offer accepted" wants attention today; a new listing can wait until the
 * subscriber has read the ones they are already in. An empty section would be
 * furniture, so it does not render at all.
 */
export function DealTracker({
  deals,
  changes = [],
}: {
  deals: TrackedDeal[]
  changes?: WatchlistNotification[]
}) {
  if (deals.length === 0) return null

  const byProperty = groupChanges(changes)

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-h3 font-medium">In your pipeline</h2>
        <p className="text-sm text-muted">
          {deals.length} live ·{' '}
          <Link href="/deals" className="underline underline-offset-4 hover:text-ink">
            see all of them
          </Link>
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {deals.map((deal) => (
          <TrackedRow key={deal.propertyId} deal={deal} changes={byProperty.get(deal.propertyId) ?? []} />
        ))}
      </div>
    </section>
  )
}

/** Unread events, newest first, keyed by the property they happened to. */
export function groupChanges(changes: WatchlistNotification[]): Map<string, WatchlistNotification[]> {
  const grouped = new Map<string, WatchlistNotification[]>()

  for (const change of changes) {
    const list = grouped.get(change.propertyId)
    if (list) list.push(change)
    else grouped.set(change.propertyId, [change])
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => b.observedAt.localeCompare(a.observedAt))
  }

  return grouped
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
 *
 * How far it got is read from the history rather than from the exit. All three
 * exits sit at step six so a mixed list still sorts sensibly, and taking that
 * as the reach drew a deal abandoned at "interested" as five-sixths done. The
 * history knows which step it actually reached, and that is the one thing this
 * row is for.
 */
function StageProgress({ stage, history }: { stage: DealStage; history: TrackedDeal['history'] }) {
  const definition = STAGE_DEFINITIONS[stage]

  const furthestForward = history
    .filter((entry) => !STAGE_DEFINITIONS[entry.stage].lost)
    .reduce((highest, entry) => Math.max(highest, STAGE_DEFINITIONS[entry.stage].step), 0)

  const reached = definition.lost ? furthestForward : definition.step

  return (
    <div
      className="flex items-center gap-1"
      title={`${definition.label}${definition.lost ? ' — ended here' : ''}`}
      aria-label={`Stage: ${definition.label}`}
    >
      {FORWARD_STAGES.map((id, index) => {
        const done = index + 1 <= reached
        return (
          <Meter
            key={id}
            share={done ? 1 : 0}
            trackClassName="h-1 w-4 rounded-full bg-line"
            className={`h-full rounded-full ${definition.lost ? 'bg-muted/50' : 'bg-highlight-deep'}`}
          />
        )
      })}
    </div>
  )
}

/**
 * Where the property stands on the market, where that is not "on it".
 *
 * The run takes anything withdrawn or under offer off the list, but a deal
 * somebody is part-way through is not on the list — it is in their working
 * pile, and it stays there until they say otherwise. So the row says what
 * happened rather than quietly going on looking live.
 *
 * A deal below an offer is closed out by the run and reads "No longer listed"
 * as its stage. This is for the other case: somebody with an offer in, whose
 * stage is deliberately left alone because the property coming off the market
 * may well be their own purchase going through.
 */
function MarketState({ state }: { state: TrackedDeal['state'] }) {
  if (state === 'listed') return null

  const label = state === 'withdrawn' ? 'No longer listed' : 'Under offer'

  return (
    <span className="label border border-line px-1.5 py-0.5 text-muted" title="Observed on the last run">
      {label}
    </span>
  )
}

export function TrackedRow({
  deal,
  changes = [],
}: {
  deal: TrackedDeal
  /** Material events on this property since the subscriber last read it. */
  changes?: WatchlistNotification[]
}) {
  const definition = STAGE_DEFINITIONS[deal.stage]

  return (
    <div className="rounded-xl border border-line bg-card p-4 transition-colors duration-150 hover:border-highlight-deep/40">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            <Link href={`/property/${deal.propertyId}`} className="transition-colors hover:text-highlight-deep">
              {deal.address ?? 'Address not held'}
            </Link>
            <MarketState state={deal.state} />
          </p>
          <p className="mt-0.5 truncate text-sm text-muted">
            {[deal.postcode, deal.price === null ? null : formatMoney(deal.price)].filter(Boolean).join(' · ')}
            {' · '}
            {definition.happened} {formatDate(deal.enteredAt)}
          </p>
          <div className="mt-2">
            <StageProgress stage={deal.stage} history={deal.history} />
          </div>
        </div>

        <StageControl propertyId={deal.propertyId} stage={deal.stage} />
      </div>

      {/* What the market has done to this since they last read it.
          
          The most time-sensitive thing in the product: a price cut on a
          property you have an offer in on is worth knowing today, and it was
          previously only visible in a list at the top of the page, away from
          the property it happened to. */}
      {changes.length ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          {changes.slice(0, 3).map((change) => (
            <li key={`${change.observedAt}-${change.label}`} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-highlight-deep" />
              <span>
                <span className="font-medium">{change.label}</span>
                <span className="text-muted"> · {formatShortDate(change.observedAt)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* What would move it on. The stage says where a property got to; this
          says what to do about it, which is the half a list of eleven
          properties at eleven different stages cannot be read without. */}
      {definition.next ? (
        <p className="mt-3 text-sm text-muted">
          <span className="label mr-2 text-highlight-deep">Next</span>
          {definition.next}
        </p>
      ) : null}
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
