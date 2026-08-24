import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { describeEvent } from '@/lib/pipeline/qualification'

/**
 * Reading what the pipeline published.
 *
 * `weekly_selections` is the single source of truth for what was published and
 * when. Everything here starts from that row, which is what lets a notification
 * channel be added later without touching the pipeline.
 *
 * Nothing in this file spends anything. The whole subscriber app is reads
 * against rows the Sunday run already wrote, which is why starring a property,
 * opening a timeline and working a deal are all free.
 *
 * Every figure carries the date it was observed. They are dated observations,
 * not answers about the present, and the interface says so next to each one.
 */

/** One line of the score, as the scoring module wrote it. */
export type ScoreFactor = { label: string; points: number; detail: string }

/** The enrichment, all of it dated by `enrichedAt`. Null until enriched. */
export type DealEnrichment = {
  estimatedValue: number | null
  estimatedRent: number | null
  areaDemandRating: number | null
  enrichedAt: string | null
}

/** The listing as last observed. Shared by the deal card and the property page. */
export type PropertySnapshot = {
  propertyId: string
  address: string | null
  preciseAddress: string | null
  postcode: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  propertyType: string | null
  listingUrl: string | null
  state: 'listed' | 'sstc' | 'withdrawn'
  daysOnMarket: number | null
  internalAreaSqFt: number | null
  reducedByPercent: number | null
  daysSincePriceChange: number | null
  lowestPriceSeen: number | null
  highestPriceSeen: number | null
  lists: string[]
  firstObservedAt: string
  /** The date every figure above was observed. Shown next to all of them. */
  observedAt: string
  enrichment: DealEnrichment
}

export type PublishedDeal = PropertySnapshot & {
  position: number
  /** The qualifying event, in the headline position. It is why this is here. */
  headline: string
  totalScore: number
  qualityScore: number
  movementScore: number
  scoreVersion: string
  qualityFactors: ScoreFactor[]
  movementFactors: ScoreFactor[]
  /** Whether the signed-in user has starred it. */
  watched: boolean
}

export type WeekSummary = {
  runId: string
  kind: 'backfill' | 'weekly' | 'manual'
  publishedAt: string
  weekOf: string
  dealCount: number
  isThin: boolean
  thinReason: string | null
  seenAt: string | null
}

export type PublishedWeek = WeekSummary & { deals: PublishedDeal[] }

const SELECTION_COLUMNS = 'run_id, kind, published_at, week_of, deal_count, is_thin, thin_reason, seen_at'

// One literal string, on one line, because supabase-js reads the select at the
// type level: a concatenation or a joined array arrives as an opaque `string`
// and every row it returns comes back untyped.
// prettier-ignore
export const PROPERTY_COLUMNS = 'id, address, precise_address, postcode, price, bedrooms, bathrooms, property_type, listing_url, state, days_on_market, internal_area_sqft, reduced_by_percent, days_since_price_change, lowest_price_seen, highest_price_seen, lists, first_observed_at, last_observed_at, estimated_value, estimated_rent, area_demand_rating, enriched_at'

/**
 * The rows this module reads, as they arrive.
 *
 * Written out by hand rather than generated. There is no `Database` type in
 * this project, so the alternative is `any`, and a column renamed in a
 * migration should fail here rather than quietly read as undefined two layers
 * further up.
 */
export type PropertyRow = {
  id: string
  address: string | null
  precise_address: string | null
  postcode: string | null
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  property_type: string | null
  listing_url: string | null
  state: PropertySnapshot['state']
  days_on_market: number | null
  internal_area_sqft: number | null
  reduced_by_percent: number | string | null
  days_since_price_change: number | null
  lowest_price_seen: number | null
  highest_price_seen: number | null
  lists: string[] | null
  first_observed_at: string
  last_observed_at: string
  estimated_value: number | null
  estimated_rent: number | null
  area_demand_rating: number | string | null
  enriched_at: string | null
}

type SelectionRow = {
  run_id: string
  kind: WeekSummary['kind']
  published_at: string
  week_of: string
  deal_count: number
  is_thin: boolean
  thin_reason: string | null
  seen_at: string | null
}

type ImpressionRow = {
  property_id: string
  position: number
  quality_score: number | string
  movement_score: number | string
  total_score: number | string
  score_version: string
  score_breakdown: unknown
}

type EventRow = {
  id: string
  event_type: TimelineEntry['type']
  observed_at: string
  previous_value: unknown
  current_value: unknown
  magnitude: number | string | null
  is_material: boolean
}

type AppearanceRow = {
  run_id: string
  shown_at: string
  position: number
  quality_score: number | string
  movement_score: number | string
  total_score: number | string
  score_version: string
  score_breakdown: unknown
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asFactors(value: unknown): ScoreFactor[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (typeof record.label !== 'string') return []

    return [
      {
        label: record.label,
        points: asNumber(record.points) ?? 0,
        detail: typeof record.detail === 'string' ? record.detail : '',
      },
    ]
  })
}

export function toPropertySnapshot(row: PropertyRow): PropertySnapshot {
  return {
    propertyId: row.id,
    address: row.address,
    preciseAddress: row.precise_address,
    postcode: row.postcode,
    price: asNumber(row.price),
    bedrooms: asNumber(row.bedrooms),
    bathrooms: asNumber(row.bathrooms),
    propertyType: row.property_type,
    listingUrl: row.listing_url,
    state: row.state,
    daysOnMarket: asNumber(row.days_on_market),
    internalAreaSqFt: asNumber(row.internal_area_sqft),
    reducedByPercent: asNumber(row.reduced_by_percent),
    daysSincePriceChange: asNumber(row.days_since_price_change),
    lowestPriceSeen: asNumber(row.lowest_price_seen),
    highestPriceSeen: asNumber(row.highest_price_seen),
    lists: Array.isArray(row.lists) ? row.lists : [],
    firstObservedAt: row.first_observed_at,
    observedAt: row.last_observed_at,
    enrichment: {
      estimatedValue: asNumber(row.estimated_value),
      estimatedRent: asNumber(row.estimated_rent),
      areaDemandRating: asNumber(row.area_demand_rating),
      enrichedAt: row.enriched_at,
    },
  }
}

/** The property ids out of the set that this user has starred. */
async function watchedAmong(propertyIds: string[]): Promise<Set<string>> {
  if (!propertyIds.length) return new Set()

  const supabase = await createClient()
  const { data } = await supabase.from('watchlist').select('property_id').in('property_id', propertyIds)

  return new Set((data ?? []).map((row: { property_id: string }) => row.property_id))
}

/** Fills a selection row out with the deals it published. */
async function loadWeek(selection: SelectionRow): Promise<PublishedWeek> {
  const supabase = await createClient()

  const { data: impressions } = await supabase
    .from('deal_impressions')
    .select('property_id, position, quality_score, movement_score, total_score, score_version, score_breakdown')
    .eq('run_id', selection.run_id)
    .order('position', { ascending: true })

  const propertyIds = (impressions ?? []).map((row: ImpressionRow) => row.property_id)

  const [{ data: properties }, watched] = await Promise.all([
    propertyIds.length
      ? supabase.from('properties').select(PROPERTY_COLUMNS).in('id', propertyIds)
      : Promise.resolve({ data: [] as PropertyRow[] }),
    watchedAmong(propertyIds),
  ])

  const byId = new Map((properties ?? []).map((row: PropertyRow) => [row.id, row]))

  const deals: PublishedDeal[] = (impressions ?? []).flatMap((impression) => {
    const property = byId.get(impression.property_id)
    if (!property) return []

    const breakdown = (impression.score_breakdown ?? {}) as Record<string, unknown>

    return [
      {
        ...toPropertySnapshot(property),
        position: impression.position,
        headline: typeof breakdown.headline === 'string' ? breakdown.headline : 'New to your area',
        totalScore: Number(impression.total_score),
        qualityScore: Number(impression.quality_score),
        movementScore: Number(impression.movement_score),
        scoreVersion: impression.score_version,
        qualityFactors: asFactors(breakdown.quality),
        movementFactors: asFactors(breakdown.movement),
        watched: watched.has(impression.property_id),
      },
    ]
  })

  return {
    runId: selection.run_id,
    kind: selection.kind,
    publishedAt: selection.published_at,
    weekOf: selection.week_of,
    dealCount: selection.deal_count,
    isThin: selection.is_thin,
    thinReason: selection.thin_reason,
    seenAt: selection.seen_at,
    deals,
  }
}

/** The most recent list published to the signed-in user, or null if none yet. */
export async function getCurrentWeek(): Promise<PublishedWeek | null> {
  const supabase = await createClient()

  const { data: selection, error } = await supabase
    .from('weekly_selections')
    .select(SELECTION_COLUMNS)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the published list: ${error.message}`)
  if (!selection) return null

  return loadWeek(selection)
}

/** One archived week, by the run that published it. */
export async function getWeekByRunId(runId: string): Promise<PublishedWeek | null> {
  const supabase = await createClient()

  const { data: selection, error } = await supabase
    .from('weekly_selections')
    .select(SELECTION_COLUMNS)
    .eq('run_id', runId)
    .maybeSingle()

  if (error) throw new Error(`Could not read that week: ${error.message}`)
  if (!selection) return null

  return loadWeek(selection)
}

/**
 * Every week published to this user, newest first.
 *
 * Summaries only — the deals themselves are read when a week is opened, so the
 * archive index stays one query however many weeks accumulate.
 */
export async function listPublishedWeeks(): Promise<WeekSummary[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('weekly_selections')
    .select(SELECTION_COLUMNS)
    .order('published_at', { ascending: false })

  if (error) throw new Error(`Could not read the archive: ${error.message}`)

  return (data ?? []).map((row: SelectionRow) => ({
    runId: row.run_id,
    kind: row.kind,
    publishedAt: row.published_at,
    weekOf: row.week_of,
    dealCount: row.deal_count,
    isThin: row.is_thin,
    thinReason: row.thin_reason,
    seenAt: row.seen_at,
  }))
}

/**
 * Whether the most recent published week has not been looked at yet.
 *
 * One indexed row. Read on every page for the marker in the navigation, so it
 * asks for the seen flag and nothing else.
 */
export async function hasUnseenWeek(): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('weekly_selections')
    .select('seen_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Boolean(data) && data?.seen_at === null
}

/** Clears the unseen marker. The only column a user may write on that table. */
export async function markWeekSeen(runId: string): Promise<void> {
  const supabase = await createClient()
  // Only if it is still unset, so revisiting a week does not keep moving the
  // date on which it was first read.
  await supabase
    .from('weekly_selections')
    .update({ seen_at: new Date().toISOString() })
    .eq('run_id', runId)
    .is('seen_at', null)
}

// ---------------------------------------------------------------------------
// One property, and everything we have ever observed about it.
// ---------------------------------------------------------------------------

export type TimelineEntry = {
  id: string
  type:
    | 'first_seen'
    | 'price_reduced'
    | 'price_increased'
    | 'returned_to_market'
    | 'marked_sstc'
    | 'no_longer_listed'
    | 'days_on_market_crossed'
  /** In plain English, the same wording the headline uses. */
  label: string
  /** When the data behind it was observed — not when the row was written. */
  observedAt: string
  /**
   * Set where we learned of a move from the price history rather than by
   * watching it happen, so the timeline can say which it was.
   */
  learnedAt: string | null
  previousPrice: number | null
  currentPrice: number | null
  magnitude: number | null
  isMaterial: boolean
}

export type Appearance = {
  runId: string
  shownAt: string
  position: number
  totalScore: number
  headline: string
  weekOf: string | null
}

export type PropertyDetail = PropertySnapshot & {
  watched: boolean
  /** Newest first. Permanent, dated, never rewritten. */
  events: TimelineEntry[]
  /** Every week this property has been put in front of this user. */
  appearances: Appearance[]
  /**
   * The breakdown from the most recent time it was shown, if it ever was, with
   * the scores and the weights version exactly as they were stored. Recomputing
   * them here would silently restate an old score under today's weights.
   */
  latest: {
    qualityFactors: ScoreFactor[]
    movementFactors: ScoreFactor[]
    qualityScore: number
    movementScore: number
    scoreVersion: string
  } | null
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

/**
 * One property in full.
 *
 * Row level security scopes every table here to the signed-in user, so a
 * property id belonging to somebody else returns null rather than a row.
 */
export async function getPropertyDetail(propertyId: string): Promise<PropertyDetail | null> {
  const supabase = await createClient()

  const { data: property } = await supabase
    .from('properties')
    .select(PROPERTY_COLUMNS)
    .eq('id', propertyId)
    .maybeSingle()

  if (!property) return null

  const [{ data: events }, { data: impressions }, watched] = await Promise.all([
    supabase
      .from('property_events')
      .select('id, event_type, observed_at, previous_value, current_value, magnitude, is_material')
      .eq('property_id', propertyId)
      .order('observed_at', { ascending: false }),
    supabase
      .from('deal_impressions')
      .select('run_id, shown_at, position, quality_score, movement_score, total_score, score_version, score_breakdown')
      .eq('property_id', propertyId)
      .order('shown_at', { ascending: false }),
    watchedAmong([propertyId]),
  ])

  const runIds = (impressions ?? []).map((row: AppearanceRow) => row.run_id).filter(Boolean)

  const { data: selections } = runIds.length
    ? await supabase.from('weekly_selections').select('run_id, week_of').in('run_id', runIds)
    : { data: [] as Array<{ run_id: string; week_of: string }> }

  const weekByRun = new Map((selections ?? []).map((row: { run_id: string; week_of: string }) => [row.run_id, row.week_of]))

  const latest = ((impressions ?? []) as AppearanceRow[])[0]
  const latestBreakdown = (latest?.score_breakdown ?? {}) as Record<string, unknown>

  return {
    ...toPropertySnapshot(property),
    watched: watched.has(propertyId),
    events: (events ?? []).map((row: EventRow) => ({
      id: row.id,
      type: row.event_type,
      label: describeEvent({ type: row.event_type, magnitude: asNumber(row.magnitude) }),
      observedAt: row.observed_at,
      learnedAt: learnedFrom(row.current_value),
      previousPrice: priceFrom(row.previous_value),
      currentPrice: priceFrom(row.current_value),
      magnitude: asNumber(row.magnitude),
      isMaterial: Boolean(row.is_material),
    })),
    appearances: (impressions ?? []).map((row: AppearanceRow) => {
      const breakdown = (row.score_breakdown ?? {}) as Record<string, unknown>
      return {
        runId: row.run_id,
        shownAt: row.shown_at,
        position: row.position,
        totalScore: Number(row.total_score),
        headline: typeof breakdown.headline === 'string' ? breakdown.headline : 'New to your area',
        weekOf: weekByRun.get(row.run_id) ?? null,
      }
    }),
    latest: latest
      ? {
          qualityFactors: asFactors(latestBreakdown.quality),
          movementFactors: asFactors(latestBreakdown.movement),
          qualityScore: Number(latest.quality_score),
          movementScore: Number(latest.movement_score),
          scoreVersion: latest.score_version,
        }
      : null,
  }
}
