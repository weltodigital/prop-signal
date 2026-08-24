import type { Listing, ListingState, PriceHistoryEntry } from './listing'

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

/**
 * Events derived from PropertyData's own dated price history.
 *
 * A property that appeared months ago can lead this week's list because
 * something changed — and the history means we know what changed before we
 * have watched it for a single week. Without this the opening backfill can
 * only say "new to your area" about a property that has been reduced twice
 * since 2024.
 *
 * Each event is dated with the date of the change itself, which is a dated
 * historical observation and is exactly what may be kept indefinitely.
 * `learnedAt` records when we found out, so the two are never confused.
 *
 * The dedupe key matches the one a live diff produces for the same move, so a
 * reduction we learn from history and then observe ourselves is one event.
 */
export function eventsFromPriceHistory(
  history: PriceHistoryEntry[],
  learnedAt: Date,
  thresholds: EventThresholds = DEFAULT_THRESHOLDS,
): PropertyEvent[] {
  const events: PropertyEvent[] = []

  for (let i = 1; i < history.length; i += 1) {
    const before = history[i - 1]
    const after = history[i]
    if (!before || !after || before.price === after.price) continue

    const change = percentChange(before.price, after.price)
    const reduced = after.price < before.price

    const observedAt = new Date(`${after.date}T00:00:00.000Z`)
    if (Number.isNaN(observedAt.getTime())) continue

    events.push({
      type: reduced ? 'price_reduced' : 'price_increased',
      observedAt,
      previousValue: { price: before.price, on: before.date },
      currentValue: {
        price: after.price,
        on: after.date,
        // Says plainly where this came from and when we learned it, so the
        // timeline can label it rather than implying we watched it happen.
        source: 'price_history',
        learned_at: learnedAt.toISOString(),
      },
      magnitude: change,
      isMaterial: reduced && Math.abs(change) >= thresholds.materialReductionPercent,
      dedupeKey: `price:${before.price}:${after.price}`,
    })
  }

  return events
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
    const firstSeen: PropertyEvent = {
      type: 'first_seen',
      observedAt,
      previousValue: null,
      currentValue: { price: listing.price, state: listing.state, days_on_market: listing.daysOnMarket },
      magnitude: null,
      // A first sighting is material: the user has never been shown it, so it
      // is a reason to put it in front of them.
      isMaterial: true,
      dedupeKey: 'first_seen',
    }

    // The history comes with the payload, so a property's past is known on the
    // first run rather than after weeks of watching. These are dated when they
    // happened, so the recency decay in scoring treats them as the old news
    // they are, while the headline can still say what actually moved.
    const history = eventsFromPriceHistory(listing.priceHistory, observedAt, thresholds)

    // A property 702 days unsold has already passed every mark. Without this it
    // would produce no crossing at all, because there is no previous
    // observation to have crossed from — and "140 days unsold" is one of the
    // headlines this product exists to write.
    const stale = staleOnFirstSight(listing, observedAt, thresholds)

    return stale ? [firstSeen, ...history, stale] : [firstSeen, ...history]
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
 * The days-on-market mark a property had already passed the first time we saw it.
 *
 * Dated by working backwards from the day count PropertyData give us, rather
 * than stamped with today. A property 702 days on the market crossed 365 some
 * 337 days ago, and saying so is both true and what stops the recency score
 * treating every stale listing on a backfill as fresh news.
 */
export function staleOnFirstSight(
  listing: Listing,
  observedAt: Date,
  thresholds: EventThresholds = DEFAULT_THRESHOLDS,
): PropertyEvent | null {
  const days = listing.daysOnMarket
  const mark = crossedMark(days, thresholds.daysOnMarketMarks)
  if (days === null || mark === null) return null

  const crossedAt = new Date(observedAt.getTime() - (days - mark) * 86_400_000)

  return {
    type: 'days_on_market_crossed',
    observedAt: crossedAt,
    previousValue: null,
    currentValue: {
      days_on_market: days,
      mark,
      source: 'days_on_market',
      learned_at: observedAt.toISOString(),
    },
    magnitude: mark,
    isMaterial: true,
    dedupeKey: `dom:${mark}`,
  }
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
