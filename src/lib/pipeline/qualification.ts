import type { PropertyEvent } from './events'

/**
 * Whether a property belongs on a user's list.
 *
 * This product sources deals. A deal is good because of what it is, not
 * because something happened to it, so the only question asked here is whether
 * it clears the quality bar and whether the subscriber has removed it.
 *
 * That is a change from how this worked. A property used to need either a
 * first sighting or a fresh material event to appear, which meant the best deal
 * in an area became invisible in week two purely because it had already been
 * seen. A sourcing product that hides its best deal is not sourcing.
 *
 * So the list stands. A property stays on it while it stays good, and the
 * events say what has changed since the subscriber last looked rather than
 * deciding whether they get to see it at all.
 *
 * Pure. The impressions, events and removals are read by the caller.
 */

/** What we have already shown this user about this property. */
export type PriorImpression = {
  shownAt: Date
  /** Null where the justification was "never seen before". */
  qualifyingEventId: string | null
}

export type StoredEvent = PropertyEvent & { id: string }

export type Qualification =
  | {
      qualifies: true
      /** New to this subscriber, or standing on the list from a previous run. */
      reason: 'new' | 'standing'
      /** The most recent material change, for the headline. Null where nothing has happened. */
      event: StoredEvent | null
      /** True where that event landed since they last saw this property. */
      changedSinceSeen: boolean
    }
  | { qualifies: false; reason: 'below_quality_floor' | 'removed' }

export type QualificationOptions = {
  /**
   * Quality a property must reach to be worth showing, out of 100.
   *
   * On quality alone, not on the total. Movement is a bonus for a motivated
   * seller and cannot carry a property that does not stack — a 20% reduction on
   * something that loses money every month is still something that loses money
   * every month.
   *
   * Chosen against v5's normalised scale and never tested against real output,
   * because the pipeline has not run. First thing to retune after it does.
   */
  qualityFloor: number
}

export const DEFAULT_QUALIFICATION: QualificationOptions = {
  qualityFloor: 50,
}

export function qualifies(
  input: {
    /** Every event ever recorded against this property for this user. */
    events: StoredEvent[]
    /** Every time this property has been shown to this user. */
    impressions: PriorImpression[]
    /** Quality alone, out of 100. Not the total. */
    qualityScore: number
    /** True where the subscriber has taken this property off their list. */
    removed: boolean
  },
  options: QualificationOptions = DEFAULT_QUALIFICATION,
): Qualification {
  const { events, impressions, qualityScore, removed } = input

  // The subscriber's own decision outranks the score. Once it is off the list
  // it stays off, however well it scores later.
  if (removed) return { qualifies: false, reason: 'removed' }

  if (qualityScore < options.qualityFloor) {
    return { qualifies: false, reason: 'below_quality_floor' }
  }

  const event = strongestMaterialEvent(events)

  if (impressions.length === 0) {
    return { qualifies: true, reason: 'new', event, changedSinceSeen: Boolean(event) }
  }

  // Something they have already seen. It stays on the list, and the only
  // question left is whether there is anything new to say about it.
  const lastShownAt = new Date(Math.max(...impressions.map((impression) => impression.shownAt.getTime())))
  const fresh = events.filter((e) => e.isMaterial && e.observedAt > lastShownAt)
  const newest = strongestMaterialEvent(fresh)

  return {
    qualifies: true,
    reason: 'standing',
    event: newest ?? event,
    changedSinceSeen: newest !== null,
  }
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
 * How many to publish, and what to say when there are few.
 *
 * The list stands rather than churning, so this is a ceiling on one run's
 * output rather than a weekly quota. Nothing is padded to reach it: a short
 * honest list builds more trust than five with two duds, and the entire
 * product is that we filtered.
 */
export const LIST_CEILING = 25

export function selectionSize(qualifyingCount: number): number {
  return Math.min(qualifyingCount, LIST_CEILING)
}

/**
 * Said when an area is not producing much, so a short list reads as a finding
 * rather than as the product being broken.
 */
export function thinReason(published: number): string | null {
  if (published >= 3) return null

  if (published === 0) {
    return 'Nothing in your area clears the bar at the moment. Rather than pad the list with deals that do not stack, we have shown you none.'
  }

  return `Only ${published} ${published === 1 ? 'property' : 'properties'} in your area clears the bar at the moment. The rest do not stack, so they are not here.`
}
