import Link from 'next/link'
import type { PublishedDeal } from '@/lib/deals'
import type { WatchlistNotification } from '@/lib/watchlist'
import { markReadAction } from '@/app/(app)/deals/mark-read'
import { formatShortDate } from '@/lib/format'
import { Button } from '@/components/ui'

/**
 * What moved this week, at the top of the dashboard.
 *
 * The list itself is the product in week one. By week twenty a subscriber has
 * already worked through it, and the page is largely the same page it was last
 * Monday — so the thing worth coming back for is not the list, it is what
 * changed on it. That was a dot on a nav item, which is where you put something
 * you do not mind being missed.
 *
 * Two sources, one lede. A property on the standing list whose qualifying event
 * landed since they last looked, and an unread event on a deal they are
 * actually working. The second matters more — a price cut on something you have
 * an offer in on is the most time-sensitive thing anywhere in this product — so
 * it is stated first and the row says which is which.
 *
 * Both are read from rows the run already wrote. Nothing here costs a credit
 * and there is no notifications table behind it.
 */

export type Moved = {
  propertyId: string
  address: string | null
  /** What happened, in the words the timeline uses. */
  label: string
  /**
   * When the move itself was observed, where we have that.
   *
   * Null for a property flagged on the list rather than in the pipeline: what
   * is held there is when the figures were last observed, which is the run
   * date and not the date of the move. This product does not print a figure
   * beside a date that is not its date, so it prints no date instead.
   */
  observedAt: string | null
  /** True where the subscriber has this one in their deal pipeline. */
  working: boolean
}

/** The lede's own sentence, which is the whole point of it. */
function headline(count: number, working: number): string {
  if (working > 0 && working === count) {
    return `${count} ${count === 1 ? 'deal you are' : 'deals you are'} working moved this week`
  }
  if (working > 0) {
    return `${count} ${count === 1 ? 'property' : 'properties'} on your list moved this week, ${working} you are working`
  }
  return `${count} ${count === 1 ? 'property' : 'properties'} on your list moved this week`
}

export function WhatMoved({ moved }: { moved: Moved[] }) {
  if (moved.length === 0) return null

  const working = moved.filter((entry) => entry.working).length

  return (
    <section className="mt-8 rounded-xl border border-highlight-deep/30 bg-tint p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-h3 font-medium">{headline(moved.length, working)}</h2>
        {working > 0 ? (
          <form action={markReadAction}>
            <Button type="submit" variant="quiet">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {moved.map((entry) => (
          <li key={`${entry.propertyId}-${entry.label}-${entry.observedAt ?? ''}`} className="flex gap-3">
            <span className="figure w-14 shrink-0 text-muted">
              {entry.observedAt ? formatShortDate(entry.observedAt) : ''}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{entry.label}</span>
              <span className="text-muted"> on </span>
              <Link
                href={`/property/${entry.propertyId}`}
                className="underline underline-offset-4 hover:text-highlight-deep"
              >
                {entry.address ?? 'a property on your list'}
              </Link>
              {entry.working ? <span className="text-muted"> — one you are working</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The two sources, merged and ordered.
 *
 * A deal being worked outranks a property merely on the list, and within each
 * the most recent move comes first. One row per property: the same reduction
 * showing twice because it is both on the list and in the pipeline would make
 * the count above it a lie.
 */
export function whatMoved(deals: PublishedDeal[], notifications: WatchlistNotification[]): Moved[] {
  const byProperty = new Map<string, Moved>()

  for (const deal of deals) {
    if (!deal.changedSinceSeen) continue
    byProperty.set(deal.propertyId, {
      propertyId: deal.propertyId,
      address: deal.address,
      label: deal.headline,
      observedAt: null,
      working: false,
    })
  }

  // Second, so a property in both is kept as the worked one — which carries the
  // real event and its date rather than the list's headline.
  for (const notification of notifications) {
    byProperty.set(notification.propertyId, {
      propertyId: notification.propertyId,
      address: notification.address,
      label: notification.label,
      observedAt: notification.observedAt,
      working: true,
    })
  }

  return [...byProperty.values()].sort((a, b) => {
    if (a.working !== b.working) return a.working ? -1 : 1
    return (b.observedAt ?? '').localeCompare(a.observedAt ?? '')
  })
}
