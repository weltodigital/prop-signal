import { describe, expect, it } from 'vitest'
import { diffListing, type PreviousObservation, type PropertyEvent } from '@/lib/pipeline/events'
import { normaliseListing } from '@/lib/pipeline/listing'
import { movement, quality, type AreaContext, type Enrichment } from '@/lib/pipeline/scoring'
import { qualifies, type PriorImpression, type StoredEvent } from '@/lib/pipeline/qualification'

/**
 * Several weeks of runs against one property, composed from the same pure
 * functions the pipeline uses.
 *
 * This is the guarantee the whole product rests on: a property is shown when
 * something happened to it, and is not shown again until something else does.
 */

/**
 * A property good enough to clear the threshold on quality alone, so that what
 * this file tests is the mechanic rather than the scoring. £1,500 on £250,000
 * at 25% down and 5.5% interest only clears about £340 a month.
 */
const ENRICHMENT: Enrichment = { estimatedValue: 260_000, estimatedRent: 1_500, areaDemandRating: 65 }

/** The area figures the run shares across every candidate in a search. */
const AREA: AreaContext = {
  soldPricePerSqFt: 300,
  localGrossYieldPercent: 5.5,
  floodRisk: 'Very Low',
  leaseholdShare: 0.1,
}

/** A standing record of one user's dealings with one property. */
class Ledger {
  events: StoredEvent[] = []
  impressions: PriorImpression[] = []
  private nextId = 1

  /** Records events, refusing any whose dedupe key we already hold. */
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
  // Sunday nights, a week apart.
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

/** One run: diff, record, score, decide. Returns what the user would see. */
function runWeek(
  ledger: Ledger,
  current: ReturnType<typeof listing>,
  previous: PreviousObservation | null,
  at: Date,
): { shown: boolean; headline: string | null } {
  ledger.record(diffListing(current, previous, at))

  const q = quality(current, ENRICHMENT, AREA)
  const m = movement(ledger.events, at)
  const verdict = qualifies({
    events: ledger.events,
    impressions: ledger.impressions,
    totalScore: q.score + m.score,
  })

  if (!verdict.qualifies) return { shown: false, headline: null }

  ledger.show(verdict.event, at)
  return { shown: true, headline: verdict.event?.type ?? 'first_seen' }
}

describe('four weeks against one property', () => {
  it('shows it once, stays quiet, then shows it again when it moves', () => {
    const ledger = new Ledger()

    // Week 1 — never seen before, scores well enough. It goes on the list.
    const w1 = runWeek(ledger, listing(250_000, 20), null, week(1))
    expect(w1.shown).toBe(true)
    expect(w1.headline).toBe('first_seen')

    // Week 2 — nothing has changed. It must not appear again.
    const w2 = runWeek(
      ledger,
      listing(250_000, 27),
      observationFrom(250_000, 20, 'listed', week(1)),
      week(2),
    )
    expect(w2.shown).toBe(false)

    // Week 3 — reduced 12%. That is a new material event, so it returns.
    const w3 = runWeek(
      ledger,
      listing(220_000, 34),
      observationFrom(250_000, 27, 'listed', week(2)),
      week(3),
    )
    expect(w3.shown).toBe(true)
    expect(w3.headline).toBe('price_reduced')

    // Week 4 — the same price, still. The reduction is spent.
    const w4 = runWeek(
      ledger,
      listing(220_000, 41),
      observationFrom(220_000, 34, 'listed', week(3)),
      week(4),
    )
    expect(w4.shown).toBe(false)

    expect(ledger.impressions).toHaveLength(2)
  })

  it('does not show it twice for the same reduction, even if two runs observe it', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(250_000, 20), null, week(1))

    // The reduction observed in week 2, and again in week 3 because the
    // previous observation was somehow not advanced. Same move, same key.
    runWeek(ledger, listing(220_000, 27), observationFrom(250_000, 20, 'listed', week(1)), week(2))
    const repeat = runWeek(ledger, listing(220_000, 34), observationFrom(250_000, 27, 'listed', week(2)), week(3))

    expect(repeat.shown).toBe(false)
    expect(ledger.events.filter((event) => event.type === 'price_reduced')).toHaveLength(1)
  })

  it('does not show it again for a trivial price trim', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(250_000, 20), null, week(1))

    // £1,000 off £250,000. Recorded, not material, not a reason to interrupt.
    const trimmed = runWeek(ledger, listing(249_000, 27), observationFrom(250_000, 20, 'listed', week(1)), week(2))

    expect(trimmed.shown).toBe(false)
    expect(ledger.events.some((event) => event.type === 'price_reduced')).toBe(true)
  })

  it('shows it again when it comes back after going under offer', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(250_000, 20), null, week(1))

    // Under offer. Recorded, but not a reason to show it — it is going, not coming.
    const sstc = runWeek(ledger, listing(250_000, 27, 'sstc'), observationFrom(250_000, 20, 'listed', week(1)), week(2))
    expect(sstc.shown).toBe(false)

    // The sale falls through. That is one of the three things worth interrupting for.
    const back = runWeek(ledger, listing(250_000, 34), observationFrom(250_000, 27, 'sstc', week(2)), week(3))
    expect(back.shown).toBe(true)
    expect(back.headline).toBe('returned_to_market')
  })

  it('shows a long-unsold property once per days-on-market mark, not every week', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(250_000, 20), null, week(1))

    let previousDays = 20
    const shownOn: number[] = []

    // Fifty weeks of sitting there. It should surface as it passes 60, 90, 120,
    // 180, 270 and 365 days, and be silent in between.
    for (let n = 2; n <= 50; n += 1) {
      const days = previousDays + 7
      const result = runWeek(
        ledger,
        listing(250_000, days),
        observationFrom(250_000, previousDays, 'listed', week(n - 1)),
        week(n),
      )
      if (result.shown) shownOn.push(days)
      previousDays = days
    }

    // Six marks over the year, and nothing between them.
    expect(shownOn.length).toBeLessThanOrEqual(6)
    expect(shownOn.length).toBeGreaterThanOrEqual(4)
    expect(new Set(ledger.events.filter((e) => e.type === 'days_on_market_crossed').map((e) => e.dedupeKey)).size).toBe(
      ledger.events.filter((e) => e.type === 'days_on_market_crossed').length,
    )
  })

  it('never shows the same property twice in a row over a year of quiet weeks', () => {
    const ledger = new Ledger()
    runWeek(ledger, listing(250_000, 400), null, week(1))

    for (let n = 2; n <= 52; n += 1) {
      const result = runWeek(
        ledger,
        listing(250_000, 400),
        observationFrom(250_000, 400, 'listed', week(n - 1)),
        week(n),
      )
      expect(result.shown).toBe(false)
    }

    expect(ledger.impressions).toHaveLength(1)
  })
})
