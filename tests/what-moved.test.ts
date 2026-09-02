/**
 * The dashboard lede.
 *
 * Two sources into one list, and the count above it has to be the number of
 * properties rather than the number of rows — a property that is both on the
 * standing list and in the deal pipeline moved once.
 */
import { describe, expect, it } from 'vitest'
import { whatMoved } from '@/components/what-moved'
import type { PublishedDeal } from '@/lib/deals'
import type { WatchlistNotification } from '@/lib/watchlist'

function deal(propertyId: string, changed: boolean, headline = 'Reduced 12%'): PublishedDeal {
  return {
    propertyId,
    address: `${propertyId} Example Street`,
    headline,
    changedSinceSeen: changed,
    observedAt: '2026-09-01T00:00:00.000Z',
  } as unknown as PublishedDeal
}

function notification(propertyId: string, label: string, observedAt: string): WatchlistNotification {
  return { propertyId, address: `${propertyId} Example Street`, label, observedAt } as WatchlistNotification
}

describe('what moved', () => {
  it('leaves out anything that has not changed since they looked', () => {
    expect(whatMoved([deal('a', false), deal('b', false)], [])).toEqual([])
  })

  it('counts a property once when it is both on the list and being worked', () => {
    const moved = whatMoved([deal('a', true)], [notification('a', 'Reduced 8%', '2026-08-30T00:00:00.000Z')])

    expect(moved).toHaveLength(1)
    // The worked version wins, because it carries the event and its real date
    // rather than the list's headline and the run date.
    expect(moved[0]?.working).toBe(true)
    expect(moved[0]?.label).toBe('Reduced 8%')
    expect(moved[0]?.observedAt).toBe('2026-08-30T00:00:00.000Z')
  })

  it('puts deals being worked above properties merely on the list', () => {
    const moved = whatMoved(
      [deal('a', true), deal('b', true)],
      [notification('c', 'Back on the market', '2026-08-28T00:00:00.000Z')],
    )

    expect(moved).toHaveLength(3)
    expect(moved[0]?.propertyId).toBe('c')
    expect(moved[0]?.working).toBe(true)
  })

  it('prints no date for a list entry, because the date it holds is not the move', () => {
    const moved = whatMoved([deal('a', true)], [])
    expect(moved[0]?.observedAt).toBeNull()
  })

  it('orders worked deals by the most recent move', () => {
    const moved = whatMoved(
      [],
      [
        notification('old', 'Reduced 5%', '2026-08-01T00:00:00.000Z'),
        notification('new', 'Reduced 9%', '2026-08-30T00:00:00.000Z'),
      ],
    )

    expect(moved.map((entry) => entry.propertyId)).toEqual(['new', 'old'])
  })
})
