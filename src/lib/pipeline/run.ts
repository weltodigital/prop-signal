import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPropertyDataClient, CreditRefusal, PropertyDataError } from '@/lib/propertydata'
import { applyFilter, listingsFromPayload, type Listing } from './listing'
import {
  DEFAULT_THRESHOLDS,
  diffListing,
  disappearanceEvent,
  type PreviousObservation,
  type PropertyEvent,
} from './events'
import {
  matchAddress,
  readCouncilTax,
  readDevelopmentGdv,
  readHmoRoomRate,
  readRegisteredHmos,
  readEpc,
  readFloodRisk,
  readGrowth,
  readLocalYield,
  readSoldComparables,
  type AreaInsights,
} from './area'
import {
  DEFAULT_WEIGHTS,
  factorsHeld,
  isExcluded,
  measureQuality,
  MIN_QUALITY_FACTORS,
  movement,
  qualityScores,
  rank,
  risks,
  SCORE_VERSION,
  type Enrichment,
  type QualityMeasurement,
  type Risk,
  type Score,
} from './scoring'
import {
  areaDataNeeded,
  EMPTY_ASSUMPTIONS,
  isInvestmentStrategy,
  missingAssumptions,
  STRATEGY_DEFINITIONS,
  type InvestmentStrategy,
  type StrategyAssumptions,
} from '@/lib/strategies'
import {
  DEFAULT_QUALIFICATION,
  describeEvent,
  qualifies,
  selectionSize,
  thinReason,
  type PriorImpression,
  type StoredEvent,
} from './qualification'

/**
 * The weekly run.
 *
 * One profile at a time. Pull the area, diff it against what we last observed,
 * write the events, enrich a capped number of candidates, score, rank, select.
 *
 * Every limit here is a number rather than a judgement made at runtime: the
 * page size, the enrichment cap, the credit ceiling. Nothing is unlimited.
 */

/** Results asked for in one `/sourced-properties` call. 1 credit per 10. */
const WEEKLY_PAGE_SIZE = 100
/** The opening list draws on the whole standing inventory. 500 is the API's per-call maximum. */
const BACKFILL_PAGE_SIZE = 500

/** Never enrich more than this many candidates in one run. Two credits each. */
const ENRICHMENT_CAP = 25

/** Credits one profile may spend in one run. Aborts rather than going over. */
const WEEKLY_CEILING = 100
const BACKFILL_CEILING = 150

export type RunKind = 'backfill' | 'weekly' | 'manual'

export type ProfileRow = {
  id: string
  owner_id: string
  postcode: string
  radius_miles: number
  sourcing_lists: string[]
  investment_strategies: string[]
  strategy_assumptions: Record<string, unknown> | null
  min_price: number | null
  max_price: number | null
  min_bedrooms: number | null
  property_types: string[] | null
  backfill_completed_at: string | null
}

export type RunSummary = {
  runId: string
  ownerId: string
  profileId: string
  kind: RunKind
  status: 'completed' | 'failed' | 'aborted'
  candidatesSeen: number
  candidatesFiltered: number
  candidatesEnriched: number
  eventsWritten: number
  /** Removed by a risk severe enough to disqualify, before scoring. */
  candidatesRiskExcluded: number
  /** Dropped for holding too few quality factors to rank honestly. */
  candidatesThinData: number
  dealsSelected: number
  creditsSpent: number
  cacheHits: number
  isThin: boolean
  error: string | null
  durationMs: number
}

/**
 * The profile's strategies, filtered to ones this build can actually score.
 *
 * A row could name a strategy a later deploy removed. Falling back to
 * buy-to-let is right rather than lenient: it is what every score meant before
 * strategies existed, so a profile with nothing valid is scored the old way
 * rather than not at all.
 */
function readStrategies(stored: string[] | null): InvestmentStrategy[] {
  const valid = (stored ?? []).filter(isInvestmentStrategy)
  return valid.length ? valid : ['btl']
}

/** The figures the subscriber supplied, read defensively out of jsonb. */
function readAssumptions(stored: Record<string, unknown> | null): StrategyAssumptions {
  const positive = (value: unknown): number | null => {
    const parsed = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  if (!stored) return EMPTY_ASSUMPTIONS

  return {
    refurbCostPerSqFt: positive(stored.refurbCostPerSqFt),
    nightlyRate: positive(stored.nightlyRate),
    occupancyPercent: positive(stored.occupancyPercent),
  }
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: 'pipeline', event, ...fields }))
}

/**
 * The Monday of the week a run publishes into.
 *
 * The cron fires Sunday at 22:00 and the list is there on Monday morning, so a
 * Sunday run belongs to the Monday after it. Every other day belongs to the
 * Monday of its own week, which is what makes a midweek manual refresh land in
 * the week the user is actually living in rather than the next one.
 */
export function weekOf(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() // 0 Sunday, 1 Monday, ... 6 Saturday.

  const offset = day === 0 ? 1 : -(day - 1)
  utc.setUTCDate(utc.getUTCDate() + offset)

  return utc.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// One profile
// ---------------------------------------------------------------------------

export async function runProfile(options: {
  profile: ProfileRow
  batchId: string
  kind?: RunKind
  supabase?: SupabaseClient
  now?: () => Date
}): Promise<RunSummary> {
  const supabase = options.supabase ?? createAdminClient()
  const now = options.now ?? (() => new Date())
  const startedAt = Date.now()
  const observedAt = now()

  const { profile } = options
  const kind: RunKind = options.kind ?? (profile.backfill_completed_at === null ? 'backfill' : 'weekly')
  const isBackfill = kind === 'backfill'

  const { data: run, error: runError } = await supabase
    .from('pipeline_runs')
    .insert({
      batch_id: options.batchId,
      owner_id: profile.owner_id,
      profile_id: profile.id,
      kind,
      status: 'running',
      observed_at: observedAt.toISOString(),
    })
    .select('id')
    .single()

  if (runError || !run) throw new Error(`Could not open a run for ${profile.owner_id}: ${runError?.message}`)

  const summary: RunSummary = {
    runId: run.id,
    ownerId: profile.owner_id,
    profileId: profile.id,
    kind,
    status: 'completed',
    candidatesSeen: 0,
    candidatesFiltered: 0,
    candidatesEnriched: 0,
    eventsWritten: 0,
    candidatesRiskExcluded: 0,
    candidatesThinData: 0,
    dealsSelected: 0,
    creditsSpent: 0,
    cacheHits: 0,
    isThin: false,
    error: null,
    durationMs: 0,
  }

  const client = createPropertyDataClient({
    ownerId: profile.owner_id,
    runId: run.id,
    runCreditCeiling: isBackfill ? BACKFILL_CEILING : WEEKLY_CEILING,
    supabase,
  })

  try {
    // --- 1. Pull the area --------------------------------------------------
    // Some lists reject a radius over 30 or 20 miles with error 1103, so the
    // call is clamped to the smallest maximum across the lists being asked for.
    // Saved profiles are constrained the same way by a database trigger; this
    // is the second lock, for a list whose limit changed after someone saved.
    const radius = await allowedRadius(supabase, profile)
    if (radius < profile.radius_miles) {
      log('radius_clamped', {
        run_id: run.id,
        requested: profile.radius_miles,
        used: radius,
        sourcing_lists: profile.sourcing_lists,
      })
    }

    const sourced = await client.call<unknown>('sourced-properties', {
      list: profile.sourcing_lists.join(','),
      postcode: profile.postcode,
      radius,
      results: isBackfill ? BACKFILL_PAGE_SIZE : WEEKLY_PAGE_SIZE,
    })

    const listings = listingsFromPayload(sourced.data)
    summary.candidatesSeen = listings.length

    // --- 2. The optional third question, applied at no cost ----------------
    const filtered = applyFilter(listings, {
      minPrice: profile.min_price,
      maxPrice: profile.max_price,
      minBedrooms: profile.min_bedrooms,
      propertyTypes: profile.property_types,
    })
    summary.candidatesFiltered = filtered.length

    // --- 3. Diff against what we last observed -----------------------------
    const existing = await loadExistingProperties(supabase, profile.owner_id)
    const { propertyIds, events } = await diffAndPersist(supabase, {
      ownerId: profile.owner_id,
      profileId: profile.id,
      runId: run.id,
      listings: filtered,
      existing,
      observedAt,
    })

    summary.eventsWritten = [...events.values()].reduce((total, list) => total + list.length, 0)

    // --- 4. Enrich a capped number of candidates ---------------------------
    const enrichmentTargets = chooseEnrichmentTargets(filtered, events)
    if (filtered.length > enrichmentTargets.length) {
      log('enrichment_capped', {
        run_id: run.id,
        considered: filtered.length,
        enriched: enrichmentTargets.length,
        dropped: filtered.length - enrichmentTargets.length,
      })
    }
    // Area-level, one call per endpoint per run. Every candidate in this search
    // shares them, so twenty-five properties cost the same as one.
    const area = await loadAreaInsights(
      client,
      profile.postcode,
      observedAt,
      areaDataNeeded(readStrategies(profile.investment_strategies)),
    )

    const enrichment = await enrichCandidates(client, enrichmentTargets, profile.postcode)
    summary.candidatesEnriched = enrichment.size

    await persistEnrichment(supabase, profile.owner_id, propertyIds, enrichment, observedAt)
    await persistAreaInsights(supabase, profile.owner_id, profile.id, run.id, area)

    // --- 5. Score, qualify, rank -------------------------------------------
    const history = await loadHistory(supabase, profile.owner_id, [...propertyIds.values()])

    const areaContext = {
      soldPricePerSqFt: area.sold.averagePricePerSqFt,
      localGrossYieldPercent: area.localGrossYieldPercent,
      floodRisk: area.floodRisk,
      leaseholdShare: area.sold.leaseholdShare,
    }

    // The strategies this subscriber picked, and the figures they supplied for
    // the ones we do not hold data for.
    const strategies = readStrategies(profile.investment_strategies)
    const assumptions = readAssumptions(profile.strategy_assumptions)

    const strategyArea = {
      hmoRoomRatePerMonth: area.hmoRoomRatePerMonth,
      developmentGdvPerSqFt: area.developmentGdvPerSqFt,
    }

    // A strategy the subscriber has not given us the numbers for cannot be
    // scored. Say so in the log rather than silently ranking on the rest.
    const scorable = strategies.filter((strategy) => {
      const gaps = missingAssumptions(strategy, assumptions)
      if (gaps.length === 0) return true
      log('strategy_skipped', {
        run_id: run.id,
        owner_id: profile.owner_id,
        strategy,
        missing: gaps,
      })
      return false
    })

    // Pass one: everything true of a property whatever you intend to do with
    // it. No property can be scored until every property has been measured,
    // because the strategy's own figure is ranked against the rest of the run.
    const measured = filtered.flatMap((listing) => {
      const propertyId = propertyIds.get(listing.key)
      if (!propertyId) return []

      const address = listing.preciseAddress ?? listing.address
      const epcRow = matchAddress(area.epcByAddress, address)
      const epc = epcRow ? { rating: epcRow.rating, score: epcRow.score } : null
      const taxRow = matchAddress(area.taxBandByAddress, address)

      const propertyRisks: Risk[] = risks(listing, areaContext, epc, profile.sourcing_lists)

      // A risk this severe is not a note beside a deal. It is not a deal.
      if (isExcluded(propertyRisks)) {
        summary.candidatesRiskExcluded += 1
        return []
      }

      const propertyEnrichment =
        enrichment.get(enrichmentKey(listing, profile.postcode)) ?? EMPTY_ENRICHMENT

      return [
        {
          listing,
          propertyId,
          epc,
          councilTaxBand: taxRow?.band ?? null,
          risks: propertyRisks,
          events: history.events.get(propertyId) ?? [],
          impressions: history.impressions.get(propertyId) ?? [],
          measurements: new Map<InvestmentStrategy, QualityMeasurement>(
            scorable.map((strategy) => [
              strategy,
              measureQuality(
                strategy,
                listing,
                propertyEnrichment,
                areaContext,
                profile.sourcing_lists,
                strategyArea,
                assumptions,
              ),
            ]),
          ),
        },
      ]
    })

    // Pass two: score each strategy against its own cohort. A room rate is
    // never ranked against a refinance, so each strategy gets its own pass.
    const byStrategy = new Map<InvestmentStrategy, Score[]>(
      scorable.map((strategy) => [
        strategy,
        qualityScores(
          measured.map((entry) => entry.measurements.get(strategy)!),
          DEFAULT_WEIGHTS,
        ),
      ]),
    )

    // Pass three: a property is ranked by whichever strategy suits it best, and
    // carries what the others came to so the page can say why.
    const scored = measured.flatMap((entry, index) => {
      const m = movement(entry.events, observedAt, DEFAULT_WEIGHTS)

      const perStrategy = scorable.flatMap((strategy) => {
        const q = byStrategy.get(strategy)?.[index]
        if (!q) return []

        // Normalising over the factors held stops a flat with no floor area
        // being punished for it. Without a floor it would also let a property
        // top the list on two factors, so the two rules come as a pair.
        if (factorsHeld(q) < MIN_QUALITY_FACTORS) return []

        return [{ strategy, quality: q, total: Number((q.score + m.score).toFixed(2)) }]
      })

      if (perStrategy.length === 0) {
        summary.candidatesThinData += 1
        return []
      }

      const best = perStrategy.reduce((winner, entry) => (entry.total > winner.total ? entry : winner))

      const verdict = qualifies(
        { events: entry.events, impressions: entry.impressions, totalScore: best.total },
        DEFAULT_QUALIFICATION,
      )
      if (!verdict.qualifies) return []

      return [
        {
          candidate: {
            listing: entry.listing,
            propertyId: entry.propertyId,
            verdict,
            epc: entry.epc,
            councilTaxBand: entry.councilTaxBand,
            risks: entry.risks,
            winningStrategy: best.strategy,
            strategyScores: perStrategy.map((s) => ({
              strategy: s.strategy,
              label: STRATEGY_DEFINITIONS[s.strategy].label,
              quality: s.quality.score,
              total: s.total,
            })),
          },
          quality: best.quality,
          movement: m,
          risks: entry.risks,
        },
      ]
    })

    const ranked = rank(scored)
    const take = selectionSize(ranked.length, kind)
    const selected = ranked.slice(0, take)

    // --- 6. Publish --------------------------------------------------------
    await publish(supabase, {
      ownerId: profile.owner_id,
      runId: run.id,
      kind,
      observedAt,
      selected,
    })

    summary.dealsSelected = selected.length
    summary.isThin = !isBackfill && selected.length < 5

    // --- 7. Close out ------------------------------------------------------
    const profileUpdate: Record<string, unknown> = { last_run_at: observedAt.toISOString() }
    if (isBackfill) profileUpdate.backfill_completed_at = observedAt.toISOString()
    await supabase.from('search_profiles').update(profileUpdate).eq('id', profile.id)
  } catch (error) {
    const refusal = error instanceof CreditRefusal
    summary.status = refusal || client.abortedReason() ? 'aborted' : 'failed'
    summary.error = error instanceof Error ? error.message : String(error)

    log('profile_failed', {
      run_id: run.id,
      owner_id: profile.owner_id,
      status: summary.status,
      message: summary.error,
      code: error instanceof PropertyDataError ? error.code : null,
    })
  }

  summary.creditsSpent = client.creditsSpent()
  summary.cacheHits = await countCacheHits(supabase, run.id)
  summary.durationMs = Date.now() - startedAt

  await supabase
    .from('pipeline_runs')
    .update({
      status: summary.status,
      completed_at: new Date().toISOString(),
      candidates_seen: summary.candidatesSeen,
      candidates_filtered: summary.candidatesFiltered,
      candidates_enriched: summary.candidatesEnriched,
      events_written: summary.eventsWritten,
      deals_selected: summary.dealsSelected,
      credits_spent: summary.creditsSpent,
      cache_hits: summary.cacheHits,
      error: summary.error,
    })
    .eq('id', run.id)

  log('profile_complete', {
    run_id: run.id,
    owner_id: profile.owner_id,
    kind,
    status: summary.status,
    candidates_seen: summary.candidatesSeen,
    candidates_filtered: summary.candidatesFiltered,
    candidates_enriched: summary.candidatesEnriched,
    events_written: summary.eventsWritten,
    // Logged rather than stored: a run that published two is worth being able
    // to explain, and these say whether the filter or the data did it.
    candidates_risk_excluded: summary.candidatesRiskExcluded,
    candidates_thin_data: summary.candidatesThinData,
    deals_selected: summary.dealsSelected,
    credits_spent: summary.creditsSpent,
    cache_hits: summary.cacheHits,
    is_thin: summary.isThin,
    duration_ms: summary.durationMs,
  })

  return summary
}

// ---------------------------------------------------------------------------
// Every profile
// ---------------------------------------------------------------------------

export async function runWeekly(options: {
  supabase?: SupabaseClient
  now?: () => Date
  /** Restrict the batch to one owner. Used by a manual refresh. */
  ownerId?: string
} = {}): Promise<{ batchId: string; summaries: RunSummary[] }> {
  const supabase = options.supabase ?? createAdminClient()
  const now = options.now ?? (() => new Date())
  const batchId = crypto.randomUUID()

  let query = supabase
    .from('search_profiles')
    .select(
      'id, owner_id, postcode, radius_miles, sourcing_lists, investment_strategies, strategy_assumptions, min_price, max_price, min_bedrooms, property_types, backfill_completed_at',
    )

  if (options.ownerId) query = query.eq('owner_id', options.ownerId)

  const { data: profiles, error } = await query
  if (error) throw new Error(`Could not read the search profiles: ${error.message}`)

  log('batch_start', { batch_id: batchId, profiles: profiles?.length ?? 0 })

  const summaries: RunSummary[] = []

  for (const profile of profiles ?? []) {
    // Every subscriber costs credits, so only people who are paying are run.
    const { data: entitled } = await supabase.rpc('has_active_subscription', { p_owner_id: profile.owner_id })
    if (entitled !== true) {
      log('profile_skipped', { owner_id: profile.owner_id, reason: 'no_active_subscription' })
      continue
    }

    try {
      summaries.push(await runProfile({ profile: profile as ProfileRow, batchId, supabase, now }))
    } catch (error) {
      // One profile failing must not take the batch down. Its own run row
      // records what happened.
      log('profile_threw', {
        owner_id: profile.owner_id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  log('batch_complete', {
    batch_id: batchId,
    profiles_processed: summaries.length,
    credits_spent: summaries.reduce((total, s) => total + s.creditsSpent, 0),
    events_written: summaries.reduce((total, s) => total + s.eventsWritten, 0),
    deals_selected: summaries.reduce((total, s) => total + s.dealsSelected, 0),
    thin_weeks: summaries.filter((s) => s.isThin).length,
    failures: summaries.filter((s) => s.status !== 'completed').length,
  })

  return { batchId, summaries }
}

/**
 * The widest radius every chosen list will accept.
 *
 * PropertyData enforce a maximum per list and reject the whole call when it is
 * exceeded, so one narrow list caps the search rather than failing it.
 */
async function allowedRadius(supabase: SupabaseClient, profile: ProfileRow): Promise<number> {
  const { data, error } = await supabase
    .from('strategy_lists')
    .select('max_radius_miles')
    .in('id', profile.sourcing_lists)

  if (error || !data?.length) return profile.radius_miles

  const smallest = Math.min(...data.map((row) => row.max_radius_miles))
  return Math.min(profile.radius_miles, smallest)
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type ExistingProperty = PreviousObservation & { id: string; lowestPrice: number | null; highestPrice: number | null }

async function loadExistingProperties(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Map<string, ExistingProperty>> {
  const { data, error } = await supabase
    .from('properties')
    .select('id, property_key, price, state, days_on_market, last_observed_at, lowest_price_seen, highest_price_seen')
    .eq('owner_id', ownerId)

  if (error) throw new Error(`Could not read stored properties: ${error.message}`)

  return new Map(
    (data ?? []).map((row) => [
      row.property_key,
      {
        id: row.id,
        price: row.price,
        state: row.state,
        daysOnMarket: row.days_on_market,
        lastObservedAt: new Date(row.last_observed_at),
        lowestPrice: row.lowest_price_seen,
        highestPrice: row.highest_price_seen,
      },
    ]),
  )
}

async function diffAndPersist(
  supabase: SupabaseClient,
  input: {
    ownerId: string
    profileId: string
    runId: string
    listings: Listing[]
    existing: Map<string, ExistingProperty>
    observedAt: Date
  },
): Promise<{ propertyIds: Map<string, string>; events: Map<string, PropertyEvent[]> }> {
  const { ownerId, profileId, runId, listings, existing, observedAt } = input
  const propertyIds = new Map<string, string>()
  const byListing = new Map<string, PropertyEvent[]>()

  for (const listing of listings) {
    const previous = existing.get(listing.key) ?? null
    const events = diffListing(listing, previous, observedAt, DEFAULT_THRESHOLDS)

    const lowest = Math.min(...[previous?.lowestPrice, listing.price].filter((v): v is number => typeof v === 'number'))
    const highest = Math.max(...[previous?.highestPrice, listing.price].filter((v): v is number => typeof v === 'number'))

    const { data, error } = await supabase
      .from('properties')
      .upsert(
        {
          owner_id: ownerId,
          property_key: listing.key,
          last_observed_at: observedAt.toISOString(),
          last_run_id: runId,
          ...(previous ? {} : { first_observed_at: observedAt.toISOString() }),
          address: listing.address,
          precise_address: listing.preciseAddress,
          postcode: listing.postcode,
          internal_area_sqft: listing.internalAreaSqFt,
          reduced_by_percent: listing.reducedByPercent,
          days_since_price_change: listing.daysSincePriceChange,
          price: listing.price,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          property_type: listing.propertyType,
          listing_url: listing.listingUrl,
          agent: listing.agent,
          state: listing.state,
          days_on_market: listing.daysOnMarket,
          first_listed_at: listing.firstListedAt,
          lists: listing.lists,
          lowest_price_seen: Number.isFinite(lowest) ? lowest : null,
          highest_price_seen: Number.isFinite(highest) ? highest : null,
        },
        { onConflict: 'owner_id,property_key' },
      )
      .select('id')
      .single()

    if (error || !data) {
      log('property_upsert_failed', { key: listing.key, message: error?.message })
      continue
    }

    propertyIds.set(listing.key, data.id)
    byListing.set(listing.key, events)

    if (events.length) {
      await writeEvents(supabase, { ownerId, profileId, runId, propertyId: data.id, events })
    }
  }

  // Anything we held that did not come back in this run has gone.
  const seen = new Set(listings.map((listing) => listing.key))
  for (const [key, previous] of existing) {
    if (seen.has(key)) continue
    if (previous.state === 'withdrawn') continue

    const event = disappearanceEvent(previous, observedAt)
    await writeEvents(supabase, { ownerId, profileId, runId, propertyId: previous.id, events: [event] })
    await supabase.from('properties').update({ state: 'withdrawn' }).eq('id', previous.id)
    byListing.set(key, [event])
  }

  return { propertyIds, events: byListing }
}

async function writeEvents(
  supabase: SupabaseClient,
  input: { ownerId: string; profileId: string; runId: string; propertyId: string; events: PropertyEvent[] },
): Promise<void> {
  const rows = input.events.map((event) => ({
    owner_id: input.ownerId,
    property_id: input.propertyId,
    profile_id: input.profileId,
    run_id: input.runId,
    event_type: event.type,
    observed_at: event.observedAt.toISOString(),
    previous_value: event.previousValue,
    current_value: event.currentValue,
    magnitude: event.magnitude,
    is_material: event.isMaterial,
    dedupe_key: event.dedupeKey,
  }))

  // ignoreDuplicates, because the unique constraint is the point: the same move
  // observed by two runs is one event.
  const { error } = await supabase.from('property_events').upsert(rows, {
    onConflict: 'owner_id,property_id,dedupe_key',
    ignoreDuplicates: true,
  })

  if (error) log('event_write_failed', { property_id: input.propertyId, message: error.message })
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

const EMPTY_ENRICHMENT: Enrichment = { estimatedValue: null, estimatedRent: null, areaDemandRating: null }

/**
 * Enrichment is shared by every property the valuation would treat the same:
 * one postcode, one type, one bedroom count. Floor area is deliberately not
 * part of the key — including it would make almost every property unique and
 * turn a handful of calls back into twenty-five.
 */
function enrichmentKey(listing: Listing, fallbackPostcode: string): string {
  const postcode = listing.postcode ?? fallbackPostcode
  return `${postcode}|${listing.propertyType ?? ''}|${listing.bedrooms ?? ''}`.toLowerCase()
}

/**
 * Picks which candidates are worth paying to enrich.
 *
 * Movement first, because a property that just moved is the one we might
 * actually publish. Then the size of the move. Capped at ENRICHMENT_CAP,
 * because two credits each makes this the largest line in the run.
 *
 * The cap is a hard truncation and the run logs how many were dropped, so a
 * short list is never mistaken for full coverage.
 */
export function chooseEnrichmentTargets(
  listings: Listing[],
  events: Map<string, PropertyEvent[]>,
  cap: number = ENRICHMENT_CAP,
): Listing[] {
  const weight = (listing: Listing): number => {
    const own = events.get(listing.key) ?? []
    const material = own.filter((event) => event.isMaterial)
    if (!material.length) return 0

    const size = Math.max(...material.map((event) => Math.abs(event.magnitude ?? 0)), 1)
    return material.length * 100 + size
  }

  return [...listings]
    .map((listing) => ({ listing, weight: weight(listing) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, cap)
    .map((entry) => entry.listing)
}

async function enrichCandidates(
  client: ReturnType<typeof createPropertyDataClient>,
  listings: Listing[],
  fallbackPostcode: string,
): Promise<Map<string, Enrichment>> {
  const results = new Map<string, Enrichment>()

  // Area demand is one figure for the whole search and is cached for 30 days,
  // so it is one credit at most and often none.
  let demand: number | null = null
  try {
    const response = await client.call<Record<string, unknown>>('demand', { postcode: fallbackPostcode })
    demand = readNumber(response.data, ['demand_rating', 'rating', 'demand'])
  } catch (error) {
    log('demand_unavailable', { message: error instanceof Error ? error.message : String(error) })
  }

  for (const listing of listings) {
    const key = enrichmentKey(listing, fallbackPostcode)
    if (results.has(key)) continue

    const postcode = listing.postcode ?? fallbackPostcode
    const attributes: Record<string, unknown> = { postcode }
    if (listing.bedrooms !== null) attributes.bedrooms = listing.bedrooms
    if (listing.propertyType) attributes.property_type = listing.propertyType
    // The payload carries the floor area, and /valuation-sale takes it. Passing
    // it costs nothing and is the difference between valuing a postcode and
    // valuing this property.
    if (listing.internalAreaSqFt !== null) attributes.internal_area = listing.internalAreaSqFt

    let estimatedValue: number | null = null
    let estimatedRent: number | null = null

    try {
      const sale = await client.call<Record<string, unknown>>('valuation-sale', attributes)
      estimatedValue = readNumber(sale.data, ['result', 'estimate', 'valuation', 'value'])
    } catch (error) {
      if (error instanceof CreditRefusal) break
      log('valuation_sale_unavailable', { postcode, message: error instanceof Error ? error.message : String(error) })
    }

    try {
      const rentResponse = await client.call<Record<string, unknown>>('valuation-rent', attributes)
      estimatedRent = readNumber(rentResponse.data, ['result', 'estimate', 'valuation', 'rent'])
    } catch (error) {
      if (error instanceof CreditRefusal) break
      log('valuation_rent_unavailable', { postcode, message: error instanceof Error ? error.message : String(error) })
    }

    results.set(key, { estimatedValue, estimatedRent, areaDemandRating: demand })
  }

  return results
}

/** PropertyData nest their figures differently per endpoint. Look in the likely places. */
function readNumber(payload: unknown, keys: string[]): number | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
    if (value && typeof value === 'object') {
      const nested = readNumber(value, ['estimate', 'value', 'average', 'result', '50'])
      if (nested !== null) return nested
    }
  }

  return null
}

async function persistEnrichment(
  supabase: SupabaseClient,
  ownerId: string,
  propertyIds: Map<string, string>,
  enrichment: Map<string, Enrichment>,
  observedAt: Date,
): Promise<void> {
  if (!enrichment.size || !propertyIds.size) return

  const { data: rows } = await supabase
    .from('properties')
    .select('id, postcode, property_type, bedrooms')
    .eq('owner_id', ownerId)
    .in('id', [...propertyIds.values()])

  for (const row of rows ?? []) {
    const key = `${row.postcode ?? ''}|${row.property_type ?? ''}|${row.bedrooms ?? ''}`.toLowerCase()
    const found = enrichment.get(key)
    if (!found) continue

    await supabase
      .from('properties')
      .update({
        enriched_at: observedAt.toISOString(),
        estimated_value: found.estimatedValue,
        estimated_rent: found.estimatedRent,
        area_demand_rating: found.areaDemandRating,
      })
      .eq('id', row.id)
  }
}

// ---------------------------------------------------------------------------
// History and publishing
// ---------------------------------------------------------------------------

async function loadHistory(
  supabase: SupabaseClient,
  ownerId: string,
  propertyIds: string[],
): Promise<{ events: Map<string, StoredEvent[]>; impressions: Map<string, PriorImpression[]> }> {
  const events = new Map<string, StoredEvent[]>()
  const impressions = new Map<string, PriorImpression[]>()

  if (!propertyIds.length) return { events, impressions }

  const { data: eventRows } = await supabase
    .from('property_events')
    .select('id, property_id, event_type, observed_at, previous_value, current_value, magnitude, is_material, dedupe_key')
    .eq('owner_id', ownerId)
    .in('property_id', propertyIds)
    .order('observed_at', { ascending: false })

  for (const row of eventRows ?? []) {
    const list = events.get(row.property_id) ?? []
    list.push({
      id: row.id,
      type: row.event_type,
      observedAt: new Date(row.observed_at),
      previousValue: row.previous_value,
      currentValue: row.current_value,
      magnitude: row.magnitude === null ? null : Number(row.magnitude),
      isMaterial: row.is_material,
      dedupeKey: row.dedupe_key,
    })
    events.set(row.property_id, list)
  }

  const { data: impressionRows } = await supabase
    .from('deal_impressions')
    .select('property_id, shown_at, qualifying_event_id')
    .eq('owner_id', ownerId)
    .in('property_id', propertyIds)

  for (const row of impressionRows ?? []) {
    const list = impressions.get(row.property_id) ?? []
    list.push({ shownAt: new Date(row.shown_at), qualifyingEventId: row.qualifying_event_id })
    impressions.set(row.property_id, list)
  }

  return { events, impressions }
}

type SelectedCandidate = {
  candidate: {
    listing: Listing
    propertyId: string
    verdict: { event: StoredEvent | null }
    epc: { rating: string; score: number | null } | null
    councilTaxBand: string | null
    risks: Array<{ label: string; detail: string; severity: string }>
    winningStrategy: InvestmentStrategy
    strategyScores: Array<{ strategy: string; label: string; quality: number; total: number }>
  }
  quality: { score: number; factors: unknown[] }
  movement: { score: number; factors: unknown[] }
  total: number
  /** Set where a risk held the total below what the factors earned. */
  cappedBy: string | null
}

async function publish(
  supabase: SupabaseClient,
  input: {
    ownerId: string
    runId: string
    kind: RunKind
    observedAt: Date
    selected: SelectedCandidate[]
  },
): Promise<void> {
  const { ownerId, runId, kind, observedAt, selected } = input

  if (selected.length) {
    const rows = selected.map((entry, index) => ({
      owner_id: ownerId,
      property_id: entry.candidate.propertyId,
      run_id: runId,
      shown_at: observedAt.toISOString(),
      qualifying_event_id: entry.candidate.verdict.event?.id ?? null,
      position: index + 1,
      quality_score: entry.quality.score,
      movement_score: entry.movement.score,
      total_score: entry.total,
      score_version: SCORE_VERSION,
      // Which strategy put it here, and what the others came to. Kept with the
      // impression so a later change of strategy does not rewrite the reason
      // something was shown.
      winning_strategy: entry.candidate.winningStrategy,
      strategy_scores: entry.candidate.strategyScores,
      score_breakdown: {
        headline: describeEvent(entry.candidate.verdict.event),
        quality: entry.quality.factors,
        movement: entry.movement.factors,
        // What was true about this property when it was published. Kept with
        // the impression rather than on `properties`, because it is part of
        // why this was shown and should not be rewritten by a later run.
        epc: entry.candidate.epc,
        councilTaxBand: entry.candidate.councilTaxBand,
        risks: entry.candidate.risks,
        cappedBy: entry.cappedBy,
      },
    }))

    // ignoreDuplicates upholds "never twice for the same event" even if a run
    // is somehow repeated.
    const { error } = await supabase.from('deal_impressions').upsert(rows, { ignoreDuplicates: true })
    if (error) log('impression_write_failed', { run_id: runId, message: error.message })
  }

  const published = selected.length
  const thin = kind !== 'backfill' && published < 5

  // The single source of truth for what was published, and when. A future
  // notification channel reads this and nothing else.
  const { error } = await supabase.from('weekly_selections').upsert(
    {
      owner_id: ownerId,
      run_id: runId,
      kind,
      published_at: observedAt.toISOString(),
      week_of: weekOf(observedAt),
      deal_count: published,
      is_thin: thin,
      thin_reason: thinReason(published, kind),
    },
    { onConflict: 'owner_id,run_id' },
  )

  if (error) log('selection_write_failed', { run_id: runId, message: error.message })
}

async function countCacheHits(supabase: SupabaseClient, runId: string): Promise<number> {
  const { count } = await supabase
    .from('usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', runId)
    .eq('outcome', 'served_from_cache')

  return count ?? 0
}

// ---------------------------------------------------------------------------
// Area-level enrichment.
// ---------------------------------------------------------------------------

/**
 * The six area endpoints, called once per run.
 *
 * Each one is wrapped on its own. A postcode outside England has no flood risk
 * and a thin area has no sold comparables, and neither is a reason to lose the
 * other five. A failure costs nothing — PropertyData do not charge for a call
 * they reject.
 *
 * `/build-cost` is deliberately absent. It requires an internal area, which
 * makes it per-property rather than per-area, and at one credit each that is
 * the wrong side of the budget.
 */
async function loadAreaInsights(
  client: ReturnType<typeof createPropertyDataClient>,
  postcode: string,
  observedAt: Date,
  needed: { hmoRents: boolean; developmentGdv: boolean } = { hmoRents: false, developmentGdv: false },
): Promise<AreaInsights> {
  const insights: AreaInsights = {
    postcode,
    observedAt: observedAt.toISOString(),
    sold: {
      averagePricePerSqFt: null,
      rangeLow: null,
      rangeHigh: null,
      transactions: null,
      latestSale: null,
      leaseholdShare: null,
    },
    localGrossYieldPercent: null,
    floodRisk: null,
    council: null,
    councilRating: null,
    councilTaxBandD: null,
    growth1YearPercent: null,
    growth5YearPercent: null,
    epcByAddress: [],
    taxBandByAddress: [],
    hmoRoomRatePerMonth: null,
    registeredHmosNearby: null,
    developmentGdvPerSqFt: null,
  }

  async function attempt(name: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      log('area_endpoint_unavailable', {
        endpoint: name,
        postcode,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await attempt('sold-prices-per-sqf', async () => {
    const response = await client.call<unknown>('sold-prices-per-sqf', { postcode })
    insights.sold = readSoldComparables(response.data)
  })

  await attempt('yields', async () => {
    const response = await client.call<unknown>('yields', { postcode })
    insights.localGrossYieldPercent = readLocalYield(response.data)
  })

  await attempt('energy-efficiency', async () => {
    const response = await client.call<unknown>('energy-efficiency', { postcode })
    insights.epcByAddress = readEpc(response.data)
  })

  await attempt('flood-risk', async () => {
    const response = await client.call<unknown>('flood-risk', { postcode })
    insights.floodRisk = readFloodRisk(response.data)
  })

  await attempt('council-tax', async () => {
    const response = await client.call<unknown>('council-tax', { postcode })
    const tax = readCouncilTax(response.data)
    insights.council = tax.council
    insights.councilRating = tax.rating
    insights.councilTaxBandD = tax.bandD
    insights.taxBandByAddress = tax.byAddress
  })

  await attempt('growth', async () => {
    const response = await client.call<unknown>('growth', { postcode })
    const growth = readGrowth(response.data)
    insights.growth1YearPercent = growth.oneYear
    insights.growth5YearPercent = growth.fiveYear
  })

  // The rest are paid for only by a profile whose strategies need them. A
  // buy-to-let subscriber never spends a credit on HMO room rates.
  if (needed.hmoRents) {
    await attempt('rents-hmo', async () => {
      const response = await client.call<unknown>('rents-hmo', { postcode })
      insights.hmoRoomRatePerMonth = readHmoRoomRate(response.data)
    })

    await attempt('national-hmo-register', async () => {
      const response = await client.call<unknown>('national-hmo-register', { postcode })
      insights.registeredHmosNearby = readRegisteredHmos(response.data)
    })
  }

  if (needed.developmentGdv) {
    await attempt('development-gdv', async () => {
      const response = await client.call<unknown>('development-gdv', { postcode })
      insights.developmentGdvPerSqFt = readDevelopmentGdv(response.data)
    })
  }

  return insights
}

async function persistAreaInsights(
  supabase: SupabaseClient,
  ownerId: string,
  profileId: string,
  runId: string,
  area: AreaInsights,
): Promise<void> {
  const { error } = await supabase.from('area_insights').upsert(
    {
      owner_id: ownerId,
      profile_id: profileId,
      run_id: runId,
      postcode: area.postcode,
      observed_at: area.observedAt,
      sold_price_per_sqf: area.sold.averagePricePerSqFt === null ? null : Math.round(area.sold.averagePricePerSqFt),
      sold_price_per_sqf_low: area.sold.rangeLow === null ? null : Math.round(area.sold.rangeLow),
      sold_price_per_sqf_high: area.sold.rangeHigh === null ? null : Math.round(area.sold.rangeHigh),
      sold_transactions: area.sold.transactions,
      sold_latest: area.sold.latestSale,
      leasehold_share: area.sold.leaseholdShare,
      local_gross_yield_pct: area.localGrossYieldPercent,
      flood_risk: area.floodRisk,
      council: area.council,
      council_rating: area.councilRating,
      council_tax_band_d: area.councilTaxBandD,
      growth_1y_pct: area.growth1YearPercent,
      growth_5y_pct: area.growth5YearPercent,
      // Null where this profile's strategies did not need them, which is also
      // the record of what the run did not pay for.
      hmo_room_rate_pcm: area.hmoRoomRatePerMonth,
      registered_hmos_nearby: area.registeredHmosNearby,
      development_gdv_per_sqf: area.developmentGdvPerSqFt,
    },
    { onConflict: 'owner_id,run_id' },
  )

  if (error) log('area_insights_write_failed', { run_id: runId, message: error.message })
}
