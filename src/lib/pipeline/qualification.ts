import type { PropertyEvent } from './events'

/**
 * Whether a property belongs on a user's list this week.
 *
 * Two ways in, and no others:
 *
 *   - it has never been shown to that user and scores above threshold, or
 *   - it has been shown before and a new material event has fired since it was
 *     last shown to them.
 *
 * A property must never appear twice for the same event. That rule is what
 * stops the list becoming repetitive, and it is enforced twice: here, and by a
 * unique index on `deal_impressions`.
 *
 * Pure. The impressions and events are read by the caller and passed in.
 */

/** What we have already shown this user about this property. */
export type PriorImpression = {
  shownAt: Date
  /** Null where the justification was "never seen before". */
  qualifyingEventId: string | null
}

export type StoredEvent = PropertyEvent & { id: string }

export type Qualification =
  | { qualifies: true; reason: 'unseen'; event: StoredEvent | null }
  | { qualifies: true; reason: 'new_material_event'; event: StoredEvent }
  | { qualifies: false; reason: 'below_threshold' | 'already_shown' | 'no_new_event' }

export type QualificationOptions = {
  /** Total score a never-shown property must beat to earn a place. */
  scoreThreshold: number
}

export const DEFAULT_QUALIFICATION: QualificationOptions = {
  // Deliberately not zero. A property with no yield figure, no valuation and no
  // movement scores close to nothing, and showing it would be padding.
  scoreThreshold: 25,
}

export function qualifies(
  input: {
    /** Every event ever recorded against this property for this user. */
    events: StoredEvent[]
    /** Every time this property has been shown to this user. */
    impressions: PriorImpression[]
    totalScore: number
  },
  options: QualificationOptions = DEFAULT_QUALIFICATION,
): Qualification {
  const { events, impressions, totalScore } = input

  if (impressions.length === 0) {
    if (totalScore < options.scoreThreshold) {
      return { qualifies: false, reason: 'below_threshold' }
    }

    // The strongest material event is what we lead with. On a backfill there
    // may be none beyond first_seen, and that is a good enough reason on its own.
    const event = strongestMaterialEvent(events)
    return { qualifies: true, reason: 'unseen', event }
  }

  const lastShownAt = new Date(Math.max(...impressions.map((impression) => impression.shownAt.getTime())))
  const alreadyUsed = new Set(
    impressions.map((impression) => impression.qualifyingEventId).filter((id): id is string => id !== null),
  )

  const fresh = events.filter(
    (event) => event.isMaterial && event.observedAt > lastShownAt && !alreadyUsed.has(event.id),
  )

  if (!fresh.length) {
    return { qualifies: false, reason: 'no_new_event' }
  }

  const event = strongestMaterialEvent(fresh)
  if (!event) return { qualifies: false, reason: 'no_new_event' }

  return { qualifies: true, reason: 'new_material_event', event }
}

/**
 * The event to lead with in the headline position.
 *
 * A return to market beats a reduction beats a days-on-market crossing, and
 * within a type the bigger move wins. Something being back on after a
 * fall-through is the most actionable thing on the list.
 */
const LEAD_PRIORITY: Record<string, number> = {
  returned_to_market: 4,
  price_reduced: 3,
  days_on_market_crossed: 2,
  first_seen: 1,
}

export function strongestMaterialEvent(events: StoredEvent[]): StoredEvent | null {
  const material = events.filter((event) => event.isMaterial)
  if (!material.length) return null

  return material.reduce((best, event) => {
    const bestRank = LEAD_PRIORITY[best.type] ?? 0
    const eventRank = LEAD_PRIORITY[event.type] ?? 0

    if (eventRank !== bestRank) return eventRank > bestRank ? event : best

    const bestSize = Math.abs(best.magnitude ?? 0)
    const eventSize = Math.abs(event.magnitude ?? 0)
    if (eventSize !== bestSize) return eventSize > bestSize ? event : best

    return event.observedAt > best.observedAt ? event : best
  })
}

/** Plain English for why a property is on the list, for the headline position. */
export function describeEvent(event: Pick<StoredEvent, 'type' | 'magnitude'> | null): string {
  if (!event) return 'New to your area'

  switch (event.type) {
    case 'returned_to_market':
      return 'Back on the market'
    case 'price_reduced': {
      const size = Math.abs(event.magnitude ?? 0)
      return `Reduced ${size.toFixed(size < 10 ? 1 : 0)}%`
    }
    case 'price_increased':
      return 'Asking price raised'
    case 'days_on_market_crossed':
      return `${(event.magnitude ?? 0).toFixed(0)} days unsold`
    case 'marked_sstc':
      return 'Sold subject to contract'
    case 'no_longer_listed':
      return 'No longer listed'
    case 'first_seen':
    default:
      return 'New to your area'
  }
}

/**
 * How many to publish, and whether to say the week was thin.
 *
 * Never pad. A short honest list builds more trust than five with two duds, and
 * the entire product is that we filtered.
 */
export const WEEKLY_TARGET = 5

export function selectionSize(qualifyingCount: number, kind: 'backfill' | 'weekly' | 'manual'): number {
  // The opening list draws on the whole standing inventory, and is the moment a
  // subscriber decides whether they wasted £29. It is allowed to be longer.
  if (kind === 'backfill') return Math.min(qualifyingCount, 15)
  return Math.min(qualifyingCount, WEEKLY_TARGET)
}

export function thinReason(published: number, kind: 'backfill' | 'weekly' | 'manual'): string | null {
  if (kind === 'backfill' || published >= WEEKLY_TARGET) return null

  if (published === 0) {
    return 'Nothing in your area moved enough to qualify this week. Rather than pad the list, we have shown you none.'
  }

  return `Only ${published} ${published === 1 ? 'property' : 'properties'} qualified this week. The rest of your area did not move enough to be worth your time.`
}
