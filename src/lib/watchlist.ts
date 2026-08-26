import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { describeEvent } from '@/lib/pipeline/qualification'
import { PROPERTY_COLUMNS, toPropertySnapshot, type PropertySnapshot, type TimelineEntry } from '@/lib/deals'

/**
 * The watchlist, and the notifications derived from it.
 *
 * Starring costs nothing and never will. The weekly diff already writes every
 * event for every property in the user's area, so a notification is a row that
 * was going to exist anyway, read back through `watchlist`. There is no
 * notifications table and nothing is pushed — an unread notification is simply
 * a material event observed after the user last looked.
 */

export type WatchedProperty = PropertySnapshot & {
  watchedSince: string
  /** Material events observed since this item was last read. */
  unread: TimelineEntry[]
}

export type WatchlistNotification = TimelineEntry & {
  propertyId: string
  address: string | null
  postcode: string | null
  price: number | null
}


type WatchRow = { property_id: string; created_at: string; events_seen_at: string }

type EventRow = {
  id: string
  property_id: string
  event_type: TimelineEntry['type']
  observed_at: string
  previous_value: unknown
  current_value: unknown
  magnitude: number | string | null
  is_material: boolean
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function priceFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  return asNumber((value as Record<string, unknown>).price)
}

function learnedFrom(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const learned = (value as Record<string, unknown>).learned_at
  return typeof learned === 'string' ? learned : null
}

function toTimelineEntry(row: EventRow): TimelineEntry {
  return {
    id: row.id,
    type: row.event_type,
    label: describeEvent({ type: row.event_type, magnitude: asNumber(row.magnitude) }),
    observedAt: row.observed_at,
    learnedAt: learnedFrom(row.current_value),
    previousPrice: priceFrom(row.previous_value),
    currentPrice: priceFrom(row.current_value),
    magnitude: asNumber(row.magnitude),
    isMaterial: Boolean(row.is_material),
  }
}

/**
 * Reads the watchlist and the material events each item has not been read for.
 *
 * Two queries and a join in memory rather than an embedded select, because the
 * cut-off is per item: each row carries its own `events_seen_at` and PostgREST
 * cannot compare a column on one table against a column on another.
 */
async function loadWatchlist(): Promise<{ items: WatchRow[]; events: EventRow[] }> {
  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from('watchlist')
    .select('property_id, created_at, events_seen_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not read the watchlist: ${error.message}`)

  const rows = (items ?? []) as WatchRow[]
  if (!rows.length) return { items: [], events: [] }

  // The oldest cut-off across the list bounds the query; the per-item
  // comparison happens below, where each item's own cut-off is known. ISO
  // timestamps sort lexicographically, so the first is the earliest.
  const earliest = rows.map((row) => row.events_seen_at).sort()[0] ?? new Date(0).toISOString()

  const { data: events } = await supabase
    .from('property_events')
    .select('id, property_id, event_type, observed_at, previous_value, current_value, magnitude, is_material')
    .in('property_id', rows.map((row) => row.property_id))
    .eq('is_material', true)
    .gt('observed_at', earliest)
    .order('observed_at', { ascending: false })

  return { items: rows, events: (events ?? []) as EventRow[] }
}

/** Everything starred, newest first, each with its own unread events. */
export async function listWatchlist(): Promise<WatchedProperty[]> {
  const { items, events } = await loadWatchlist()
  if (!items.length) return []

  const supabase = await createClient()
  const { data: properties } = await supabase
    .from('properties')
    .select(PROPERTY_COLUMNS)
    .in('id', items.map((row) => row.property_id))

  const byId = new Map((properties ?? []).map((row) => [row.id, row]))

  return items.flatMap((item) => {
    const property = byId.get(item.property_id)
    if (!property) return []

    return [
      {
        ...toPropertySnapshot(property),
        watchedSince: item.created_at,
        unread: events
          .filter((event) => event.property_id === item.property_id && event.observed_at > item.events_seen_at)
          .map(toTimelineEntry),
      },
    ]
  })
}

/** Every unread event across the whole watchlist, newest first. */
export async function listNotifications(): Promise<WatchlistNotification[]> {
  const { items, events } = await loadWatchlist()
  if (!items.length) return []

  const cutoffs = new Map(items.map((item) => [item.property_id, item.events_seen_at]))
  const unread = events.filter((event) => {
    const cutoff = cutoffs.get(event.property_id)
    return cutoff !== undefined && event.observed_at > cutoff
  })

  if (!unread.length) return []

  const supabase = await createClient()
  const { data: properties } = await supabase
    .from('properties')
    .select('id, address, postcode, price')
    .in('id', [...new Set(unread.map((event) => event.property_id))])

  const byId = new Map((properties ?? []).map((row) => [row.id, row]))

  return unread.map((event) => {
    const property = byId.get(event.property_id)
    return {
      ...toTimelineEntry(event),
      propertyId: event.property_id,
      address: property?.address ?? null,
      postcode: property?.postcode ?? null,
      price: asNumber(property?.price),
    }
  })
}

/**
 * How many unread events the watchlist holds.
 *
 * Read on every page for the marker in the navigation, so it does the same two
 * queries as the list itself and nothing more.
 */
export async function countUnread(): Promise<number> {
  const { items, events } = await loadWatchlist()
  if (!items.length) return 0

  const cutoffs = new Map(items.map((item) => [item.property_id, item.events_seen_at]))

  return events.filter((event) => {
    const cutoff = cutoffs.get(event.property_id)
    return cutoff !== undefined && event.observed_at > cutoff
  }).length
}

/** Whether the signed-in user has starred this property. */
export async function isWatched(propertyId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.from('watchlist').select('id').eq('property_id', propertyId).maybeSingle()
  return Boolean(data)
}

/**
 * Stars or unstars a property, returning where it ended up.
 *
 * Row level security decides whether the property is the caller's to star: the
 * insert policy checks it against `properties` under the caller's own read
 * policy, so a property id belonging to someone else fails at the database.
 */
/**
 * Puts a property on the watchlist, or takes it off.
 *
 * Not a decision the subscriber makes any more. `recordStage` calls this so the
 * watch follows the deal: anything being worked is watched, anything passed or
 * untracked is not. The toggle it replaces sat beside "Track this" on every
 * card and nobody could say what the difference was.
 *
 * Idempotent in both directions, because the stage it follows can be recorded
 * twice and moving backwards is allowed.
 */
export async function setWatched(propertyId: string, watched: boolean): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  if (!watched) {
    const { error } = await supabase.from('watchlist').delete().eq('property_id', propertyId)
    if (error) throw new Error(`Could not stop watching: ${error.message}`)
    return
  }

  // ignoreDuplicates, because a stage recorded twice must not raise here.
  const { error } = await supabase
    .from('watchlist')
    .upsert({ owner_id: user.id, property_id: propertyId }, { onConflict: 'owner_id,property_id', ignoreDuplicates: true })

  if (error) throw new Error(`Could not start watching: ${error.message}`)
}

/** Marks everything currently unread as read. */
export async function markNotificationsRead(propertyId?: string): Promise<void> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  const query = supabase.from('watchlist').update({ events_seen_at: now })
  const { error } = propertyId ? await query.eq('property_id', propertyId) : await query.gt('created_at', '1970-01-01')

  if (error) throw new Error(`Could not mark those as read: ${error.message}`)
}
