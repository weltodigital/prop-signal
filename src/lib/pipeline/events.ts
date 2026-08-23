import type { Listing, ListingState } from './listing'

/**
 * The diff. Everything depends on this being right.
 *
 * Every run compares what came back against what we last observed and writes
 * events. Events are permanent, dated, and are the reason a property is on a
 * list. A property that appeared months ago can lead this week because
 * something here fired against it.
 *
 * Pure. No database, no clock of its own — the observation time is passed in,
 * because it is the retrieval date of the data, not the moment this ran.
 */

export type EventType =
  | 'first_seen'
  | 'price_reduced'
  | 'price_increased'
  | 'returned_to_market'
  | 'marked_sstc'
  | 'no_longer_listed'
  | 'days_on_market_crossed'

export type PropertyEvent = {
  type: EventType
  observedAt: Date
  previousValue: Record<string, unknown> | null
  currentValue: Record<string, unknown> | null
  /** Signed size of the move: percent for a price change, days for a crossing. */
  magnitude: number | null
  isMaterial: boolean
  /** Natural key, so the same move is never recorded twice. */
  dedupeKey: string
}

/** What we last observed about a property, read back from `properties`. */
export type PreviousObservation = {
  price: number | null
  state: ListingState
  daysOnMarket: number | null
  lastObservedAt: Date
}

export type EventThresholds = {
  /**
   * A price reduction of at least this percentage is material. Smaller ones are
   * still recorded — they are part of the history — but do not on their own
   * earn a place on a list.
   */
  materialReductionPercent: number
  /**
   * Days-on-market marks worth crossing. Crossing one is material: it is the
   * point at which an agent starts getting nervous, which is the whole idea.
   */
  daysOnMarketMarks: number[]
}

export const DEFAULT_THRESHOLDS: EventThresholds = {
  materialReductionPercent: 5,
  daysOnMarketMarks: [60, 90, 120, 180, 270, 365],
}

function percentChange(from: number, to: number): number {
  if (from === 0) return 0
  return Number((((to - from) / from) * 100).toFixed(2))
}

/** The highest mark at or below a day count, or null below the first mark. */
export function crossedMark(days: number | null, marks: number[]): number | null {
  if (days === null) return null

  const passed = marks.filter((mark) => days >= mark)
  return passed.length ? Math.max(...passed) : null
}

/**
 * Compares one property against what was last observed of it.
 *
 * `previous` is null the first time we ever see it, which produces `first_seen`
 * and nothing else. A first sighting is not a price change.
 */
export function diffListing(
  listing: Listing,
  previous: PreviousObservation | null,
  observedAt: Date,
  thresholds: EventThresholds = DEFAULT_THRESHOLDS,
): PropertyEvent[] {
  if (!previous) {
    return [
      {
        type: 'first_seen',
        observedAt,
        previousValue: null,
        currentValue: { price: listing.price, state: listing.state, days_on_market: listing.daysOnMarket },
        magnitude: null,
        // A first sighting is material: the user has never been shown it, so it
        // is a reason to put it in front of them.
        isMaterial: true,
        dedupeKey: 'first_seen',
      },
    ]
  }

  const events: PropertyEvent[] = []

  // --- Price ---------------------------------------------------------------
  if (listing.price !== null && previous.price !== null && listing.price !== previous.price) {
    const change = percentChange(previous.price, listing.price)
    const reduced = listing.price < previous.price

    events.push({
      type: reduced ? 'price_reduced' : 'price_increased',
      observedAt,
      previousValue: { price: previous.price },
      currentValue: { price: listing.price },
      magnitude: change,
      // Only a reduction of real size counts. A £500 trim on a £250,000 house
      // is a rounding error, and the product is that we filtered.
      isMaterial: reduced && Math.abs(change) >= thresholds.materialReductionPercent,
      // The prices themselves are the key, so the same move is one event even
      // if two runs observe it.
      dedupeKey: `price:${previous.price}:${listing.price}`,
    })
  }

  // --- Availability --------------------------------------------------------
  if (listing.state !== previous.state) {
    if (listing.state === 'sstc') {
      events.push({
        type: 'marked_sstc',
        observedAt,
        previousValue: { state: previous.state },
        currentValue: { state: 'sstc' },
        magnitude: null,
        // Worth recording, not worth a place on a list — it is going, not coming.
        isMaterial: false,
        dedupeKey: `sstc:${observedAt.toISOString().slice(0, 10)}`,
      })
    } else if (previous.state !== 'listed' && listing.state === 'listed') {
      events.push({
        type: 'returned_to_market',
        observedAt,
        previousValue: { state: previous.state },
        currentValue: { state: 'listed' },
        magnitude: null,
        // A fall-through. One of the three things worth interrupting someone for.
        isMaterial: true,
        dedupeKey: `returned:${observedAt.toISOString().slice(0, 10)}`,
      })
    }
  }

  // --- Time on the market --------------------------------------------------
  const previousMark = crossedMark(previous.daysOnMarket, thresholds.daysOnMarketMarks)
  const currentMark = crossedMark(listing.daysOnMarket, thresholds.daysOnMarketMarks)

  if (currentMark !== null && currentMark !== previousMark) {
    events.push({
      type: 'days_on_market_crossed',
      observedAt,
      previousValue: { days_on_market: previous.daysOnMarket, mark: previousMark },
      currentValue: { days_on_market: listing.daysOnMarket, mark: currentMark },
      magnitude: currentMark,
      isMaterial: true,
      // The mark is the key: crossing 120 days is one event however many runs
      // observe the property afterwards.
      dedupeKey: `dom:${currentMark}`,
    })
  }

  return events
}

/**
 * A property we held before and which did not come back in this run.
 *
 * Not material. It is the absence of an opportunity rather than one, and the
 * user is told about it on the timeline instead.
 */
export function disappearanceEvent(previous: PreviousObservation, observedAt: Date): PropertyEvent {
  return {
    type: 'no_longer_listed',
    observedAt,
    previousValue: { state: previous.state, price: previous.price },
    currentValue: null,
    magnitude: null,
    isMaterial: false,
    dedupeKey: `gone:${observedAt.toISOString().slice(0, 10)}`,
  }
}
