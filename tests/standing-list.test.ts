/**
 * A year of runs against one property.
 *
 * This is the guarantee the product now rests on: a property is on the list
 * because it is a good deal, it stays there while it stays good, and it leaves
 * when the subscriber says so. Events say what changed since they last looked.
 *
 * The file this replaces asserted the opposite — that a property was shown once
 * and then hidden until something happened to it. That rule made the best deal
 * in an area invisible from week two, which is the wrong behaviour for a
 * product that sources deals.
 */
import { describe, expect, it } from 'vitest'
import {
  diffListing,
  disappearanceEvent,
  type PreviousObservation,
  type PropertyEvent,
} from '@/lib/pipeline/events'
import { normaliseListing } from '@/lib/pipeline/listing'
import {
  measureQuality,
  movement,
  qualityScores,
  type AreaContext,
  type Enrichment,
} from '@/lib/pipeline/scoring'
import { qualifies, type PriorImpression, type StoredEvent } from '@/lib/pipeline/qualification'

/**
 * A property priced well below local sold prices, so it clears the quality
 * floor on its own merits rather than on anything having happened to it.
 *
 * One property is its own cohort here, which caps the cashflow factor at half:
 * a percentile has nothing to rank against. That is the point of this file —
 * it tests the mechanic, not the ranking.
 */
const ENRICHMENT: Enrichment = {
  estimatedValue: 260_000,
  estimatedRent: 1_500,
  areaDemandRating: 65,
  soldPricePerSqFt: null,
}
const AREA: AreaContext = {
  soldPricePerSqFt: 300,
  localGrossYieldPercent: 6,
  floodRisk: 'Very Low',
  leaseholdShare: 0.1,
}

class Ledger {
  events: StoredEvent[] = []
  impressions: PriorImpression[] = []
  removed = false
  private nextId = 1

  record(events: PropertyEvent[]): StoredEvent[] {
    const held = new Set(this.events.map((event) => event.dedupeKey))
    const fresh = events
      .filter((event) => !held.has(event.dedupeKey))
      .map((event) => ({ ...event, id: `e${this.nextId++}` }))

    this.events.push(...fresh)
    return fresh
  }

  show(event: StoredEvent | null, at: Date): void {
    this.impressions.push({ shownAt: at, qualifyingEventId: event?.id ?? null })
  }
}

function week(n: number): Date {
  return new Date(Date.UTC(2026, 5, 7 + (n - 1) * 7, 22, 0, 0))
}

function listing(price: number, daysOnMarket: number, state: 'listed' | 'sstc' = 'listed') {
  return {
    ...normaliseListing({
      id: 'pd-1',
      sqf: 900,
      address: '12 Example Street',
      postcode: 'M14 5TP',
      price,
      bedrooms: 3,
      type_standardised: 'Terraced house',
      lists: ['reduced-properties'],
      days_on_market: daysOnMarket,
    }),
    state,
  }
}

function observationFrom(price: number, daysOnMarket: number, state: 'listed' | 'sstc', at: Date): PreviousObservation {
  return { price, state, daysOnMarket, lastObservedAt: at }
}

type Seen = { shown: boolean; changed: boolean; reason: string; headline: string | null }

function runWeek(
  ledger: Ledger,
  current: ReturnType<typeof listing>,
  previous: PreviousObservation | null,
  at: Date,
): Seen {
  ledger.record(diffListing(current, previous, at))

  const q = qualityScores([measureQuality('btl', current, ENRICHMENT, AREA)])[0]!
  movement(ledger.events, at)

  const verdict = qualifies({
    events: ledger.events,
    impressions: ledger.impressions,
    qualityScore: q.score,
    removed: ledger.removed,
    listingState: current.state,
  })

  if (!verdict.qualifies) return { shown: false, changed: false, reason: verdict.reason, headline: null }

  ledger.show(verdict.event, at)
  return {
    shown: true,
    changed: verdict.changedSinceSeen,
    reason: verdict.reason,
    headline: verdict.event?.type ?? 'first_seen',
  }
}

/**
 * A week in which the property did not come back in the payload.
 *
 * There is no listing to pass, which is the whole point: the run learns a
 * property has gone by its absence, writes the disappearance against what it
 * last held, and marks it withdrawn. Quality is whatever it was last worth,
 * because a good deal does not become a bad one by being taken off the market
 * — it stops being available, which is a different thing and has to be the
 * thing that decides.
 */
function runDelistedWeek(ledger: Ledger, previous: PreviousObservation, at: Date, quality = 100): Seen {
  ledger.record([disappearanceEvent(previous, at)])

  const verdict = qualifies({
    events: ledger.events,
    impressions: ledger.impressions,
    qualityScore: quality,
    removed: ledger.removed,
    listingState: 'withdrawn',
  })

  if (!verdict.qualifies) return { shown: false, changed: false, reason: verdict.reason, headline: null }

  ledger.show(verdict.event, at)
  return { shown: true, changed: verdict.changedSinceSeen, reason: verdict.reason, headline: null }
}

/** £180,000 on 900 sq ft against £300 locally. A genuinely good buy. */
const GOOD = 180_000

describe('a good deal stays on the list', () => {
  it('appears in week one having done nothing at all', () => {
    const ledger = new Ledger()
    const w1 = runWeek(ledger, listing(GOOD, 3), null, week(1))

    // Three days on the market, no price history, nothing has happened to it.
    // Under the old rule it needed a first sighting to appear. Under this one
    // it appears because it is a good buy.
    expect(w1.shown).toBe(true)
  })

  it('is still there a month later with nothing having happened', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))

    for (const n of [2, 3, 4, 5]) {
      const seen = runWeek(
        ledger,
        listing(GOOD, 3 + (n - 1) * 7),
        observationFrom(GOOD, 3 + (n - 2) * 7, 'listed', week(n - 1)),
        week(n),
      )
      expect(seen.shown, `week ${n}`).toBe(true)
      expect(seen.changed, `week ${n} should be quiet`).toBe(false)
    }
  })

  it('is marked as changed the week it is reduced, and not the week after', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))

    const cut = runWeek(ledger, listing(158_000, 10), observationFrom(GOOD, 3, 'listed', week(1)), week(2))
    expect(cut.shown).toBe(true)
    expect(cut.changed).toBe(true)
    expect(cut.headline).toBe('price_reduced')

    const after = runWeek(
      ledger,
      listing(158_000, 17),
      observationFrom(158_000, 10, 'listed', week(2)),
      week(3),
    )
    expect(after.shown).toBe(true)
    expect(after.changed, 'the same cut must not be news twice').toBe(false)
  })

  it('stays on the list for a year of quiet weeks', () => {
    const ledger = new Ledger()
    let previous: PreviousObservation | null = null

    let shown = 0
    for (let n = 1; n <= 52; n += 1) {
      const days = 3 + (n - 1) * 7
      const seen = runWeek(ledger, listing(GOOD, days), previous, week(n))
      if (seen.shown) shown += 1
      previous = observationFrom(GOOD, days, 'listed', week(n))
    }

    // Fifty-two out of fifty-two. It never stopped being the best buy in the
    // area, so it never stopped being on the list.
    expect(shown).toBe(52)
  })
})

describe('the subscriber decides what leaves', () => {
  it('drops off the moment they remove it, and does not come back on its own', () => {
    const ledger = new Ledger()
    expect(runWeek(ledger, listing(GOOD, 3), null, week(1)).shown).toBe(true)

    ledger.removed = true

    // Even a 12% cut does not bring it back. Their decision outranks the score.
    const cut = runWeek(ledger, listing(158_000, 10), observationFrom(GOOD, 3, 'listed', week(1)), week(2))
    expect(cut.shown).toBe(false)

    const later = runWeek(
      ledger,
      listing(158_000, 17),
      observationFrom(158_000, 10, 'listed', week(2)),
      week(3),
    )
    expect(later.shown).toBe(false)
  })

  it('comes back when they put it back', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))
    ledger.removed = true
    runWeek(ledger, listing(GOOD, 10), observationFrom(GOOD, 3, 'listed', week(1)), week(2))

    ledger.removed = false
    const back = runWeek(ledger, listing(GOOD, 17), observationFrom(GOOD, 10, 'listed', week(2)), week(3))
    expect(back.shown).toBe(true)
  })
})

describe('a deal that stops being a deal', () => {
  it('falls off the list when the price rises out of range', () => {
    const ledger = new Ledger()
    expect(runWeek(ledger, listing(GOOD, 3), null, week(1)).shown).toBe(true)

    // Asking well above what nearby homes sold for. Nothing about the seller
    // changed; it simply is not a good buy any more.
    const dear = runWeek(ledger, listing(400_000, 10), observationFrom(GOOD, 3, 'listed', week(1)), week(2))
    expect(dear.shown).toBe(false)
  })
})

describe('a property that leaves the market', () => {
  it('goes the week it is delisted, however good a buy it still is', () => {
    const ledger = new Ledger()
    expect(runWeek(ledger, listing(GOOD, 3), null, week(1)).shown).toBe(true)

    // Nothing about the property got worse. It is the same house at the same
    // price against the same comparables, and it scores a perfect hundred
    // here. It is simply not for sale, and a list of things to buy that
    // carries a house somebody else already bought is not worth reading.
    const gone = runDelistedWeek(ledger, observationFrom(GOOD, 10, 'listed', week(1)), week(2), 100)
    expect(gone.shown).toBe(false)
    expect(gone.reason).toBe('delisted')
  })

  it('says gone rather than passed, because those are different facts', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))

    const gone = runDelistedWeek(ledger, observationFrom(GOOD, 10, 'listed', week(1)), week(2))

    // The distinction is the whole point of the stage. 'removed' is the
    // subscriber's judgement about a property we surfaced; 'delisted' is the
    // seller leaving. Reading one as the other puts a fault in exactly the
    // numbers the deal tracking exists to produce.
    expect(gone.reason).not.toBe('removed')
    expect(gone.reason).toBe('delisted')
  })

  it('stays gone in later weeks', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))

    for (const n of [2, 3, 4]) {
      const gone = runDelistedWeek(ledger, observationFrom(GOOD, 10, 'listed', week(1)), week(n))
      expect(gone.shown, `week ${n}`).toBe(false)
    }
  })

  it('comes back on its own if the sale falls through', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(GOOD, 3), null, week(1))
    expect(runDelistedWeek(ledger, observationFrom(GOOD, 10, 'listed', week(1)), week(2)).shown).toBe(false)

    // Relisted. The diff sees a property that was withdrawn back on the
    // market, which is a material event and one of the best headlines this
    // product has — somebody's sale collapsed and the seller is now motivated.
    const back = runWeek(
      ledger,
      listing(GOOD, 24),
      observationFrom(GOOD, 17, 'withdrawn' as 'listed', week(2)),
      week(3),
    )

    expect(back.shown).toBe(true)
    expect(back.changed).toBe(true)
    expect(back.headline).toBe('returned_to_market')
  })

  it('leaves the list the moment it goes under offer, and returns if that collapses', () => {
    const ledger = new Ledger()
    expect(runWeek(ledger, listing(GOOD, 3), null, week(1)).shown).toBe(true)

    // Sold subject to contract still comes back in the payload, so nothing
    // takes it off the list except this rule. Somebody else is buying it.
    const sstc = runWeek(ledger, listing(GOOD, 10, 'sstc'), observationFrom(GOOD, 3, 'listed', week(1)), week(2))
    expect(sstc.shown).toBe(false)
    expect(sstc.reason).toBe('under_offer')

    const back = runWeek(ledger, listing(GOOD, 17), observationFrom(GOOD, 10, 'sstc', week(2)), week(3))
    expect(back.shown).toBe(true)
    expect(back.headline).toBe('returned_to_market')
  })
})
