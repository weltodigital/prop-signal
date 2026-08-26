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
import { diffListing, type PreviousObservation, type PropertyEvent } from '@/lib/pipeline/events'
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
const ENRICHMENT: Enrichment = { estimatedValue: 260_000, estimatedRent: 1_500, areaDemandRating: 65 }
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

type Seen = { shown: boolean; changed: boolean; headline: string | null }

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
  })

  if (!verdict.qualifies) return { shown: false, changed: false, headline: null }

  ledger.show(verdict.event, at)
  return {
    shown: true,
    changed: verdict.changedSinceSeen,
    headline: verdict.event?.type ?? 'first_seen',
  }
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
