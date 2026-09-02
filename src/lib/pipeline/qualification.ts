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
  | { qualifies: false; reason: 'below_quality_floor' | 'removed' | 'delisted' | 'under_offer' }

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
    /**
     * Where the property stands on the market, as of this run.
     *
     * `withdrawn` is set by the run when a property we held did not come back
     * in the payload. Defaults to `listed` so a caller that does not care —
     * every test of the scoring mechanic — reads as it always did.
     */
    listingState?: 'listed' | 'sstc' | 'withdrawn'
  },
  options: QualificationOptions = DEFAULT_QUALIFICATION,
): Qualification {
  const { events, impressions, qualityScore, removed, listingState = 'listed' } = input

  // Nothing you cannot buy belongs on a list of things to buy.
  //
  // This is checked before the subscriber's own removal and before the score,
  // because it is a fact about the world rather than a preference or a
  // measurement. A house that sold two months ago sitting on somebody's list
  // is the fastest way to stop being believed about any of the rest of it.
  //
  // The two are kept apart. Withdrawn means gone, and the run closes the deal
  // out. Sold subject to contract means somebody else got there first and it
  // may yet fall through — which fires `returned_to_market` and puts the
  // property straight back on the list, where it is one of the best headlines
  // this product has.
  if (listingState === 'withdrawn') return { qualifies: false, reason: 'delisted' }
  if (listingState === 'sstc') return { qualifies: false, reason: 'under_offer' }

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
 * How many to publish.
 *
 * The list stands, so this is not a quota on the list. It is a cap on how many
 * properties are *added* to it in one run.
 *
 * Splitting it that way is what lets both rules hold at once. A property the
 * subscriber has already been shown stays on the list however many better ones
 * turn up, because it does not stop being a good deal when a better one
 * appears. What is limited is the intake: five new ones a week is a list
 * somebody reads, and twenty-five is a list somebody triages.
 */
export const NEW_PER_RUN = 5

/**
 * The opening list is five, and on a backfill everything is new, so the two
 * numbers are the same. Kept separate because they answer different questions
 * and will not always agree.
 */
export const OPENING_LIST = 5

export type Publishable<T> = { entry: T; standing: boolean }

/**
 * Everything already on the list, plus the best few that are not on it yet.
 *
 * Order in, order out. The caller ranks first, so the new ones taken are the
 * best-scoring new ones.
 */
export function selectForPublication<T>(
  candidates: ReadonlyArray<Publishable<T>>,
  kind: 'backfill' | 'weekly' | 'manual' = 'weekly',
): T[] {
  const intake = kind === 'backfill' ? OPENING_LIST : NEW_PER_RUN
  let taken = 0

  return candidates
    .filter((candidate) => {
      if (candidate.standing) return true
      if (taken >= intake) return false
      taken += 1
      return true
    })
    .map((candidate) => candidate.entry)
}

/**
 * Said when an area is not producing much.
 *
 * Measured on what the run *added*, not on the size of the list. A subscriber
 * with fourteen deals they are working and nothing new this week has not had a
 * thin week, and telling them they have would be nonsense.
 */
export function thinReason(added: number, listSize: number): string | null {
  if (added >= 3) return null

  if (added === 0) {
    return listSize > 0
      ? 'Nothing new in your area clears the bar this week. Everything already on your list is still there.'
      : 'Nothing in your area clears the bar at the moment. Rather than pad the list with deals that do not stack, we have shown you none.'
  }

  return `${added} new ${added === 1 ? 'property' : 'properties'} in your area clears the bar this week. The rest do not stack, so they are not here.`
}
