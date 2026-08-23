import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Reading what the pipeline published.
 *
 * `weekly_selections` is the single source of truth for what was published and
 * when. Everything here starts from that row, which is what lets a notification
 * channel be added later without touching the pipeline.
 */

export type PublishedDeal = {
  propertyId: string
  position: number
  headline: string
  address: string | null
  postcode: string | null
  price: number | null
  bedrooms: number | null
  propertyType: string | null
  listingUrl: string | null
  /** The date the figures above were observed. Shown next to every one of them. */
  observedAt: string
  totalScore: number
  qualityScore: number
  movementScore: number
  scoreVersion: string
}

export type PublishedWeek = {
  runId: string
  kind: 'backfill' | 'weekly' | 'manual'
  publishedAt: string
  weekOf: string
  dealCount: number
  isThin: boolean
  thinReason: string | null
  seenAt: string | null
  deals: PublishedDeal[]
}

/** The most recent list published to the signed-in user, or null if none yet. */
export async function getCurrentWeek(): Promise<PublishedWeek | null> {
  const supabase = await createClient()

  const { data: selection, error } = await supabase
    .from('weekly_selections')
    .select('run_id, kind, published_at, week_of, deal_count, is_thin, thin_reason, seen_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the published list: ${error.message}`)
  if (!selection) return null

  const { data: impressions } = await supabase
    .from('deal_impressions')
    .select('property_id, position, quality_score, movement_score, total_score, score_version, score_breakdown')
    .eq('run_id', selection.run_id)
    .order('position', { ascending: true })

  const propertyIds = (impressions ?? []).map((row) => row.property_id)

  const { data: properties } = propertyIds.length
    ? await supabase
        .from('properties')
        .select('id, address, postcode, price, bedrooms, property_type, listing_url, last_observed_at')
        .in('id', propertyIds)
    : { data: [] }

  const byId = new Map((properties ?? []).map((row) => [row.id, row]))

  const deals: PublishedDeal[] = (impressions ?? []).flatMap((impression) => {
    const property = byId.get(impression.property_id)
    if (!property) return []

    const breakdown = impression.score_breakdown as { headline?: string } | null

    return [
      {
        propertyId: impression.property_id,
        position: impression.position,
        headline: breakdown?.headline ?? 'New to your area',
        address: property.address,
        postcode: property.postcode,
        price: property.price,
        bedrooms: property.bedrooms,
        propertyType: property.property_type,
        listingUrl: property.listing_url,
        observedAt: property.last_observed_at,
        totalScore: Number(impression.total_score),
        qualityScore: Number(impression.quality_score),
        movementScore: Number(impression.movement_score),
        scoreVersion: impression.score_version,
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

/** Clears the unseen marker. The only column a user may write on that table. */
export async function markWeekSeen(runId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('weekly_selections').update({ seen_at: new Date().toISOString() }).eq('run_id', runId)
}
