import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAccount, createPropertyDataClient, CreditRefusal, PropertyDataError } from '@/lib/propertydata'
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
  readDemand,
  readDevelopmentGdv,
  readHmoRoomRate,
  readLocalRent,
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
  areaKeyFor,
  loadReturnWindow,
  MIN_WINDOW_SAMPLE,
  recordReturnObservations,
} from './return-window'
import { DELISTABLE_STAGES } from '@/lib/deal-stages'
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
  selectForPublication,
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

/**
 * Account credits never spent by the weekly batch.
 *
 * Held back for `/api/runs/first`: somebody who has just paid and is watching
 * a panel build their opening list is the most time-critical spend this
 * product has, and an existing subscriber missing one weekly refresh is the
 * least. When the account is low, the batch is what gives way.
 */
const ACCOUNT_RESERVE = 200

/**
 * Rows per write statement.
 *
 * Everything a run persists goes in bulk now rather than a row at a time. This
 * is the size of one statement: large enough that three hundred properties are
 * one round trip, small enough that a busy area is not one enormous one.
 */
const WRITE_CHUNK = 500

/**
 * How a failed run should be recorded, and whether it stops the batch.
 *
 * The distinction is whose limit was hit.
 *
 * `abortedReason` is set only by a fatal PropertyDataError — X03, X04, X05,
 * X13 — and every one of those is about the *account*: out of credits,
 * cancelled, or a bad key. Nothing the subscriber did caused it, nothing about
 * their area was tried, and every profile behind them would fail the same way.
 * So it is `blocked`: the batch stops, and the run does not count as their
 * attempt for the week.
 *
 * A `CreditRefusal` is the opposite. It is a limit of ours — the per-run
 * ceiling or the subscriber's own monthly allowance — working exactly as
 * intended, on one profile, and it says nothing about the account. That is
 * `aborted`, and the batch carries on to the next subscriber.
 *
 * Reading the second as the first is what let one subscriber's exhausted
 * allowance look like a dead account. Reading the first as the second is what
 * let a dead account cost everybody their Monday list.
 */
export function runOutcome(
  error: unknown,
  abortedReason: string | null,
): { status: 'failed' | 'aborted' | 'blocked'; accountBlocked: boolean } {
  if (abortedReason !== null) return { status: 'blocked', accountBlocked: true }
  if (error instanceof CreditRefusal) return { status: 'aborted', accountBlocked: false }
  return { status: 'failed', accountBlocked: false }
}

/** Splits a list into runs of at most `size`. */
function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

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
  status: 'completed' | 'failed' | 'aborted' | 'blocked'
  /**
   * True where the PropertyData account itself was out of credits.
   *
   * A fact about us, not about this subscriber. It stops the batch and leaves
   * the profile to be tried again, rather than counting as their attempt for
   * the week.
   */
  accountBlocked: boolean
  candidatesSeen: number
  candidatesFiltered: number
  candidatesEnriched: number
  eventsWritten: number
  /** Removed by a risk severe enough to disqualify, before scoring. */
  candidatesRiskExcluded: number
  /** Dropped for holding too few quality factors to rank honestly. */
  candidatesThinData: number
  /** Left out because the subscriber removed them from their list. */
  candidatesRemoved: number
  /** Left out because somebody else is already buying them. */
  candidatesUnderOffer: number
  /** Held before, absent from this run's payload, and now off every list. */
  candidatesDelisted: number
  /** Tracked deals closed out because the property left the market. */
  dealsDelisted: number
  /** New to this subscriber, as opposed to already standing on their list. */
  dealsAdded: number
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

  return { refurbCostPerSqFt: positive(stored.refurbCostPerSqFt) }
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
    accountBlocked: false,
    candidatesRiskExcluded: 0,
    candidatesThinData: 0,
    candidatesRemoved: 0,
    candidatesUnderOffer: 0,
    candidatesDelisted: 0,
    dealsDelisted: 0,
    dealsAdded: 0,
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
    // Some lists reject a radius over 30 or 20 miles with error 1103, and one
    // call carries every list, so it is clamped to the smallest maximum across
    // them. Nothing stops a profile being saved wider than that — the form says
    // what the search will run at, and this is where it happens.
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
    const { propertyIds, events, delisted } = await diffAndPersist(supabase, {
      ownerId: profile.owner_id,
      profileId: profile.id,
      runId: run.id,
      listings: filtered,
      existing,
      observedAt,
    })

    summary.eventsWritten = [...events.values()].reduce((total, list) => total + list.length, 0)
    summary.candidatesDelisted = delisted.length

    // Anything that has left the market is already off the list, because the
    // list is built from what came back. This is the other half: a deal
    // somebody was working on it does not close itself.
    summary.dealsDelisted = await closeDelistedDeals(supabase, {
      ownerId: profile.owner_id,
      propertyIds: delisted,
      observedAt,
    })

    // --- 4. Enrich a capped number of candidates ---------------------------
    //
    // The area figures come first, because choosing which candidates to enrich
    // is itself a judgement about which look like good deals, and the benchmark
    // is what makes that judgement possible.
    const area = await loadAreaInsights(
      client,
      profile.postcode,
      observedAt,
      areaDataNeeded(readStrategies(profile.investment_strategies)),
    )

    const enrichmentTargets = chooseEnrichmentTargets(filtered, events, area.sold.averagePricePerSqFt)
    if (filtered.length > enrichmentTargets.length) {
      log('enrichment_capped', {
        run_id: run.id,
        considered: filtered.length,
        enriched: enrichmentTargets.length,
        dropped: filtered.length - enrichmentTargets.length,
      })
    }

    const enrichment = await enrichCandidates(client, enrichmentTargets, profile.postcode)
    summary.candidatesEnriched = enrichment.size

    await persistEnrichment(supabase, profile.owner_id, propertyIds, enrichment, observedAt)
    await persistAreaInsights(supabase, profile.owner_id, profile.id, run.id, area)

    // --- 5. Score, qualify, rank -------------------------------------------
    const history = await loadHistory(supabase, profile.owner_id, [...propertyIds.values()])

    // Properties the subscriber has taken off their list. Their decision
    // outranks the score, and it holds until they put it back.
    const removed = await loadRemovals(supabase, profile.owner_id)

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

      const propertyEnrichment =
        enrichment.get(enrichmentKey(listing, profile.postcode)) ?? EMPTY_ENRICHMENT

      // Gross yield on the asking price, only so a figure that cannot be right
      // can say so beside itself.
      const grossYield =
        listing.price && listing.price > 0 && propertyEnrichment.estimatedRent
          ? ((propertyEnrichment.estimatedRent * 12) / listing.price) * 100
          : null

      const propertyRisks: Risk[] = risks(listing, areaContext, epc, profile.sourcing_lists, grossYield)

      // A risk this severe is not a note beside a deal. It is not a deal.
      if (isExcluded(propertyRisks)) {
        summary.candidatesRiskExcluded += 1
        return []
      }

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
    //
    // The cohort is the area's own recent history rather than whoever else
    // turned up this Sunday. Without it a property could fall under the floor
    // because the others improved — no fact about the property, and a standing
    // list that drops something has to be able to say why — and no two scores
    // were comparable across weeks or subscribers, which is the ground the
    // completion figures stand on. An area with too little history falls back
    // to the run, which is how this worked before.
    const areaKey = areaKeyFor(profile.postcode)
    const windows = new Map<InvestmentStrategy, number[]>(
      await Promise.all(
        scorable.map(async (strategy): Promise<[InvestmentStrategy, number[]]> => {
          const window = await loadReturnWindow(supabase, { areaKey, strategy, now: observedAt })
          const enough = window.length >= MIN_WINDOW_SAMPLE

          log('return_window', {
            run_id: run.id,
            area_key: areaKey,
            strategy,
            observations: window.length,
            used: enough,
          })

          return [strategy, enough ? window : []]
        }),
      ),
    )

    const byStrategy = new Map<InvestmentStrategy, Score[]>(
      scorable.map((strategy) => [
        strategy,
        qualityScores(
          measured.map((entry) => entry.measurements.get(strategy)!),
          DEFAULT_WEIGHTS,
          windows.get(strategy) ?? [],
        ),
      ]),
    )

    // What this run measured goes into the window for the runs after it. Every
    // strategy that could be scored, whether or not the property was published:
    // the window is what the area offered, not what we chose out of it, and
    // filtering it to the winners would make every later percentile a
    // percentile against a list of winners.
    await recordReturnObservations(
      supabase,
      measured.flatMap((entry) =>
        scorable.flatMap((strategy) => {
          const measurement = entry.measurements.get(strategy)
          const value = measurement?.strategyReturn.value
          if (measurement === undefined || value === null || value === undefined) return []

          return [
            {
              areaKey,
              strategy,
              propertyKey: entry.listing.key,
              value,
              belowWater: measurement.strategyReturn.belowWater,
              observedAt,
            },
          ]
        }),
      ),
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
        {
          events: entry.events,
          impressions: entry.impressions,
          // The quality floor is on quality alone. A 20% reduction on something
          // that loses money every month is still something that loses money.
          qualityScore: best.quality.score,
          removed: removed.has(entry.propertyId),
          listingState: entry.listing.state,
        },
        DEFAULT_QUALIFICATION,
      )
      if (!verdict.qualifies) {
        if (verdict.reason === 'removed') summary.candidatesRemoved += 1
        if (verdict.reason === 'under_offer') summary.candidatesUnderOffer += 1
        return []
      }

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

    // The list is not capped. What is capped is the intake: everything already
    // on the list stays, and at most a handful of new ones join it, because a
    // property does not stop being a good deal when a better one turns up.
    const selected = selectForPublication(
      ranked.map((entry) => ({
        entry,
        standing: entry.candidate.verdict.reason === 'standing',
      })),
      kind,
    )

    const added = selected.filter((entry) => entry.candidate.verdict.reason === 'new').length

    // --- 6. Publish --------------------------------------------------------
    await publish(supabase, {
      ownerId: profile.owner_id,
      profileId: profile.id,
      runId: run.id,
      kind,
      observedAt,
      selected,
    })

    summary.dealsSelected = selected.length
    summary.dealsAdded = added
    // Thin is about what arrived this week, not how long the list is.
    summary.isThin = !isBackfill && added < 3

    // --- 7. Close out ------------------------------------------------------
    const profileUpdate: Record<string, unknown> = { last_run_at: observedAt.toISOString() }
    if (isBackfill) profileUpdate.backfill_completed_at = observedAt.toISOString()

    // Checked, and loudly. This write is what marks the backfill done, and the
    // dashboard runs the backfill again whenever it is not. A silent failure
    // here is a run that repeats on every visit, spending a full run's credits
    // each time — which is exactly what a missed rename in 0008 caused.
    const { error: profileError } = await supabase
      .from('search_profiles')
      .update(profileUpdate)
      .eq('id', profile.id)

    if (profileError) {
      throw new Error(
        `Run completed but the profile could not be marked: ${profileError.message}. ` +
          'Left unmarked, the opening run would repeat and spend credits again.',
      )
    }
  } catch (error) {
    const outcome = runOutcome(error, client.abortedReason())
    summary.accountBlocked = outcome.accountBlocked
    summary.status = outcome.status
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
    candidates_removed: summary.candidatesRemoved,
    candidates_under_offer: summary.candidatesUnderOffer,
    candidates_delisted: summary.candidatesDelisted,
    deals_delisted: summary.dealsDelisted,
    deals_added: summary.dealsAdded,
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
  /**
   * Wall-clock this invocation may use before it stops and leaves the rest for
   * the next one. Null runs everything, which is what a CLI wants.
   */
  budgetMs?: number | null
} = {}): Promise<{ batchId: string; summaries: RunSummary[]; remaining: number }> {
  const supabase = options.supabase ?? createAdminClient()
  const now = options.now ?? (() => new Date())
  const batchId = crypto.randomUUID()
  const startedAt = Date.now()
  const budgetMs = options.budgetMs === undefined ? null : options.budgetMs

  let query = supabase
    .from('search_profiles')
    .select(
      'id, owner_id, postcode, radius_miles, sourcing_lists, investment_strategies, strategy_assumptions, min_price, max_price, min_bedrooms, property_types, backfill_completed_at',
    )
    // An area paused by a downgrade is kept whole and not searched. Running it
    // would be spending credits on something the subscriber is not paying for.
    .is('paused_at', null)

  if (options.ownerId) query = query.eq('owner_id', options.ownerId)

  const { data: allProfiles, error } = await query
  if (error) throw new Error(`Could not read the search profiles: ${error.message}`)

  // Profiles already attempted in this cycle, so a second invocation picks up
  // where the first stopped rather than paying for the same areas again.
  //
  // Attempted, not succeeded: one try per profile per cycle. A profile that
  // failed is left until next week rather than retried on the next invocation,
  // because a profile that fails repeatedly would otherwise take the whole
  // budget every half hour and starve everyone behind it.
  //
  // A named owner is a manual refresh and skips all of this — somebody asking
  // for a run by hand means it.
  const done = options.ownerId ? new Set<string>() : await profilesRunThisCycle(supabase, now())
  const profiles = (allProfiles ?? []).filter((profile) => !done.has(profile.id))

  log('batch_start', {
    batch_id: batchId,
    profiles: profiles.length,
    already_run: done.size,
    budget_ms: budgetMs,
  })

  // What the account has, before a penny of it is spent. `/account/credits`
  // is free, so this costs nothing and answers the one question that decides
  // whether the batch should start at all.
  let budget: number | null = null
  try {
    const account = await checkAccount()
    budget = account.creditsRemaining

    if (budget !== null && budget < ACCOUNT_RESERVE + BACKFILL_CEILING) {
      log('batch_refused_low_account', {
        batch_id: batchId,
        credits_remaining: budget,
        reserve: ACCOUNT_RESERVE,
        profiles: profiles.length,
      })
      return { batchId, summaries: [], remaining: profiles.length }
    }
  } catch (error) {
    // Not being able to read the position is not a reason to refuse to run.
    // The per-run ceilings and the per-user allowances still hold, and the
    // block above still stops the batch if the account turns out to be dry.
    log('account_check_failed', {
      batch_id: batchId,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const summaries: RunSummary[] = []
  let remaining = 0
  let spent = 0

  for (const profile of profiles) {
    // Stop cleanly with time to spare rather than being killed mid-run. A run
    // cut off by the platform leaves a 'running' row that nothing closes, and
    // the next invocation would treat that profile as in flight for ever.
    if (budgetMs !== null && Date.now() - startedAt > budgetMs) {
      remaining = profiles.length - summaries.length
      log('batch_budget_reached', { batch_id: batchId, ran: summaries.length, remaining })
      break
    }

    // Every subscriber costs credits, so only people who are paying are run.
    const { data: entitled } = await supabase.rpc('has_active_subscription', { p_owner_id: profile.owner_id })
    if (entitled !== true) {
      log('profile_skipped', { owner_id: profile.owner_id, reason: 'no_active_subscription' })
      continue
    }

    try {
      const summary = await runProfile({ profile: profile as ProfileRow, batchId, supabase, now })
      summaries.push(summary)

      // The account is out of credits, cancelled, or the key is bad. Every
      // remaining profile would make one doomed call and abort, so the batch
      // stops here.
      //
      // The profiles behind this one are left untouched — no run row, so
      // nothing marks them attempted — and the next invocation picks them up
      // from where this stopped. Which is the whole point: one subscriber
      // exhausting the account used to cost everybody else their Monday list
      // for the rest of the week.
      if (summary.accountBlocked) {
        remaining = profiles.length - summaries.length
        log('batch_blocked', {
          batch_id: batchId,
          reason: summary.error,
          ran: summaries.length,
          remaining,
        })
        break
      }

      spent += summary.creditsSpent

      // Stop before the account is dry rather than after. `budget` is what the
      // account had when the batch opened; the reserve is held back for the
      // opening run of somebody who has just paid, because a new subscriber
      // looking at an empty dashboard is worse than an existing one waiting a
      // week for a refresh they have had fifty times.
      if (budget !== null && budget - spent < ACCOUNT_RESERVE + BACKFILL_CEILING) {
        remaining = profiles.length - summaries.length
        log('batch_reserve_reached', {
          batch_id: batchId,
          account_credits_at_start: budget,
          spent,
          reserve: ACCOUNT_RESERVE,
          ran: summaries.length,
          remaining,
        })
        break
      }
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
    blocked: summaries.filter((s) => s.accountBlocked).length,
    remaining,
  })

  return { batchId, summaries, remaining }
}

/**
 * Profiles already attempted since this cycle opened.
 *
 * The cycle is the Sunday run: everything since the most recent Sunday 22:00.
 * A profile with a run row in that window is left alone, which is what lets a
 * second invocation continue a batch the first could not finish rather than
 * re-sourcing areas that are already done.
 *
 * A row still marked 'running' counts as attempted too. That is deliberate: an
 * overlapping invocation must not start a second run for the same profile, and
 * paying twice is worse than skipping once.
 */
async function profilesRunThisCycle(supabase: SupabaseClient, now: Date): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('profile_id')
    .gte('created_at', cycleStart(now).toISOString())
    // A blocked run is not an attempt. The account was out of credits and this
    // profile never got a fair try, so it is picked up again by the next
    // invocation rather than skipped until the following Sunday.
    .neq('status', 'blocked')

  if (error) {
    // Without this the batch would re-run everybody, which costs real credits.
    // Refusing is the safe direction.
    throw new Error(`Could not read this cycle's runs: ${error.message}`)
  }

  return new Set((data ?? []).map((row) => row.profile_id).filter((id): id is string => Boolean(id)))
}

/** The most recent Sunday 22:00 UTC at or before `now`. */
export function cycleStart(now: Date): Date {
  const start = new Date(now)
  start.setUTCHours(22, 0, 0, 0)

  // Sunday is 0. Wind back to the last Sunday, and back one more week where
  // it is Sunday but not yet ten at night.
  const daysSinceSunday = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - daysSinceSunday)
  if (start > now) start.setUTCDate(start.getUTCDate() - 7)

  return start
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

type ExistingProperty = PreviousObservation & {
  id: string
  lowestPrice: number | null
  highestPrice: number | null
  /**
   * Carried so a repeat run can send it straight back.
   *
   * PostgREST's upsert is an INSERT with an ON CONFLICT clause, so the row it
   * builds has to satisfy every NOT NULL even when the conflict path is the one
   * that runs. Omitting this for a property we already hold made the insert
   * arm fail, which meant every property upsert after the first run failed.
   */
  firstObservedAt: string
}

async function loadExistingProperties(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Map<string, ExistingProperty>> {
  const { data, error } = await supabase
    .from('properties')
    .select(
      'id, property_key, price, state, days_on_market, first_observed_at, last_observed_at, lowest_price_seen, highest_price_seen',
    )
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
        firstObservedAt: row.first_observed_at,
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
): Promise<{
  propertyIds: Map<string, string>
  events: Map<string, PropertyEvent[]>
  /** Ids of properties we held that did not come back in this run. */
  delisted: string[]
}> {
  const { ownerId, profileId, runId, listings, existing, observedAt } = input
  const propertyIds = new Map<string, string>()
  const byListing = new Map<string, PropertyEvent[]>()

  // The diff is pure, so all of it happens before anything is written. What
  // used to be here was a loop doing one upsert and one event write per
  // property: three hundred properties meant six hundred sequential round
  // trips, which was most of the two and a half minutes a run took and all of
  // the reason only about five subscribers fitted in one cron invocation.
  //
  // Nothing about what is written has changed. It is written in two calls
  // instead of six hundred.
  const rows = listings.map((listing) => {
    const previous = existing.get(listing.key) ?? null
    byListing.set(listing.key, diffListing(listing, previous, observedAt, DEFAULT_THRESHOLDS))

    const lowest = Math.min(...[previous?.lowestPrice, listing.price].filter((v): v is number => typeof v === 'number'))
    const highest = Math.max(...[previous?.highestPrice, listing.price].filter((v): v is number => typeof v === 'number'))

    return {
      owner_id: ownerId,
      property_key: listing.key,
      last_observed_at: observedAt.toISOString(),
      last_run_id: runId,
      // Always sent, never omitted. The conflict path would not touch it,
      // but the insert path this is built from still has to satisfy the
      // NOT NULL, and a property we already hold keeps the date we first
      // saw it rather than being reset to today.
      first_observed_at: previous?.firstObservedAt ?? observedAt.toISOString(),
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
    }
  })

  // Chunked, because one statement carrying five hundred rows is a statement
  // and one carrying fifty thousand is a timeout. A failed chunk is logged and
  // the rest still land, which is the same tolerance the old loop had per row.
  for (const chunk of chunked(rows, WRITE_CHUNK)) {
    const { data, error } = await supabase
      .from('properties')
      .upsert(chunk, { onConflict: 'owner_id,property_key' })
      .select('id, property_key')

    if (error || !data) {
      log('property_upsert_failed', { rows: chunk.length, message: error?.message })
      continue
    }

    for (const row of data) propertyIds.set(row.property_key, row.id)
  }

  // Every event from every property, in one write rather than one per
  // property. The ids come from the upsert above, so a property whose chunk
  // failed contributes nothing and its events are dropped with it — the same
  // outcome as the old `continue`.
  const eventRows = [...byListing.entries()].flatMap(([key, events]) => {
    const propertyId = propertyIds.get(key)
    if (!propertyId || events.length === 0) return []
    return [{ propertyId, events }]
  })

  await writeEvents(
    supabase,
    { ownerId, profileId, runId },
    eventRows.flatMap((entry) => entry.events.map((event) => ({ propertyId: entry.propertyId, event }))),
  )

  // Anything we held that did not come back in this run has gone.
  //
  // It is already off the list by then, because the list is built from what
  // came back and this did not. What it is not yet is *closed*: a subscriber
  // part-way through working it is still being shown it under "deals you're
  // working", and will be for ever unless somebody says so. The ids go back to
  // the caller for exactly that.
  const delisted: string[] = []
  const goneEvents: Array<{ propertyId: string; event: PropertyEvent }> = []

  const seen = new Set(listings.map((listing) => listing.key))
  for (const [key, previous] of existing) {
    if (seen.has(key)) continue
    if (previous.state === 'withdrawn') continue

    const event = disappearanceEvent(previous, observedAt)
    byListing.set(key, [event])
    goneEvents.push({ propertyId: previous.id, event })
    delisted.push(previous.id)
  }

  if (delisted.length) {
    await writeEvents(supabase, { ownerId, profileId, runId }, goneEvents)

    // One statement for the lot. Marking them withdrawn one at a time was the
    // same round-trip-per-row problem as the upsert above, and a week that
    // clears a lot of stock is exactly when a run can least afford it.
    for (const chunk of chunked(delisted, WRITE_CHUNK)) {
      const { error } = await supabase.from('properties').update({ state: 'withdrawn' }).in('id', chunk)
      if (error) log('withdrawn_write_failed', { rows: chunk.length, message: error.message })
    }
  }

  return { propertyIds, events: byListing, delisted }
}

/**
 * Closes out tracked deals whose property has left the market.
 *
 * `delisted` is a terminal stage of its own rather than `passed`. Passing is a
 * judgement the subscriber made about a property, and counting a seller's
 * withdrawal as one would quietly say we surfaced a property they rejected —
 * in the very numbers built to tell us whether the properties we surface are
 * any good.
 *
 * Only deals below an offer are closed. A property under offer to *you* comes
 * off the portals; that is what an accepted offer looks like from the outside,
 * and marking it lost would record somebody's purchase as a failure. Those keep
 * their stage and are shown as no longer listed instead, which is the honest
 * version of what we know.
 *
 * Append-only, like every other stage. A subscriber who knows better moves it
 * on and the newest row wins.
 */
async function closeDelistedDeals(
  supabase: SupabaseClient,
  input: { ownerId: string; propertyIds: string[]; observedAt: Date },
): Promise<number> {
  if (input.propertyIds.length === 0) return 0

  const { data, error } = await supabase
    .from('deal_progress')
    .select('property_id, stage, entered_at')
    .eq('owner_id', input.ownerId)
    .in('property_id', input.propertyIds)
    .order('entered_at', { ascending: false })

  if (error) {
    log('delisted_deal_read_failed', { owner_id: input.ownerId, message: error.message })
    return 0
  }

  // The newest row per property is the current stage. One pass, because the
  // rows arrive newest first.
  const current = new Map<string, string>()
  for (const row of data ?? []) {
    if (!current.has(row.property_id)) current.set(row.property_id, row.stage)
  }

  const closing = [...current.entries()]
    .filter(([, stage]) => (DELISTABLE_STAGES as readonly string[]).includes(stage))
    .map(([propertyId]) => ({
      owner_id: input.ownerId,
      property_id: propertyId,
      stage: 'delisted',
      entered_at: input.observedAt.toISOString(),
    }))

  if (closing.length === 0) return 0

  const { error: writeError } = await supabase.from('deal_progress').insert(closing)
  if (writeError) {
    log('delisted_deal_write_failed', { owner_id: input.ownerId, message: writeError.message })
    return 0
  }

  return closing.length
}

/**
 * Every event from a run, in as few statements as the row count allows.
 *
 * Takes the whole run's events rather than one property's. The events of three
 * hundred properties are one write, and were three hundred.
 */
async function writeEvents(
  supabase: SupabaseClient,
  input: { ownerId: string; profileId: string; runId: string },
  events: ReadonlyArray<{ propertyId: string; event: PropertyEvent }>,
): Promise<void> {
  if (events.length === 0) return

  const rows = events.map(({ propertyId, event }) => ({
    owner_id: input.ownerId,
    property_id: propertyId,
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
  for (const chunk of chunked(rows, WRITE_CHUNK)) {
    const { error } = await supabase.from('property_events').upsert(chunk, {
      onConflict: 'owner_id,property_id,dedupe_key',
      ignoreDuplicates: true,
    })

    if (error) log('event_write_failed', { rows: chunk.length, message: error.message })
  }
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

const EMPTY_ENRICHMENT: Enrichment = {
  estimatedValue: null,
  estimatedRent: null,
  areaDemandRating: null,
  soldPricePerSqFt: null,
}

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
  areaPricePerSqFt: number | null = null,
  cap: number = ENRICHMENT_CAP,
): Listing[] {
  /**
   * The same shape as the score this feeds: what the property looks like
   * first, how hard the seller has moved second, at half the weight.
   *
   * It used to rank on movement alone, which quietly undid the thing the
   * scoring was changed to do. A property cannot clear the quality floor
   * without a rent estimate, it cannot get a rent estimate without being
   * enriched, and it could not be enriched without having moved. A great deal
   * listed yesterday was unreachable however good it was.
   *
   * Neither half is available in full yet, because that is what enrichment is
   * for. This is a screen rather than a score, and asking price against the
   * area benchmark is the best proxy available before spending anything.
   */
  const looksCheap = (listing: Listing): number => {
    if (!areaPricePerSqFt || !listing.price || !listing.internalAreaSqFt) return 0

    const askingPerSqFt = listing.price / listing.internalAreaSqFt
    const discount = ((areaPricePerSqFt - askingPerSqFt) / areaPricePerSqFt) * 100

    // 0% to 25% below, the band the real factor uses.
    return Math.min(1, Math.max(0, discount / 25))
  }

  const hasMoved = (listing: Listing): number => {
    const material = (events.get(listing.key) ?? []).filter((event) => event.isMaterial)
    if (!material.length) return 0

    const deepest = Math.max(...material.map((event) => Math.abs(event.magnitude ?? 0)), 0)
    // 2% to 20%, again matching the real factor.
    return Math.min(1, Math.max(0, (deepest - 2) / 18))
  }

  return [...listings]
    .map((listing) => ({ listing, weight: looksCheap(listing) + hasMoved(listing) * 0.5 }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, cap)
    .map((entry) => entry.listing)
}

/**
 * What we can learn about a candidate, from its own postcode.
 *
 * The valuation endpoints are deliberately not called. `/valuation-sale` and
 * `/valuation-rent` refuse without a construction date, a bathroom count, a
 * finish quality and an outdoor-space description. We hold one of those four,
 * and supplying the rest would mean inventing the inputs to the biggest factor
 * in the score. Every one of those calls failed on the first live run, which is
 * how this was found: the run spent nothing on them, because an error is free.
 *
 * `/rents`, `/sold-prices-per-sqf` and `/demand` all answer on a postcode
 * alone, and all three are read for the *property's* postcode rather than the
 * profile's. A forty-mile search otherwise compares a Southampton asking price
 * against a Havant sold price and calls the difference a discount, and reports
 * Havant's demand for every property in it — which showed up as every row
 * reading 23 out of 100. A factor that is identical everywhere cannot rank
 * anything; it is weight in the score doing no work.
 *
 * Both are cached, so candidates sharing a postcode share the credit.
 */
async function enrichCandidates(
  client: ReturnType<typeof createPropertyDataClient>,
  listings: Listing[],
  fallbackPostcode: string,
): Promise<Map<string, Enrichment>> {
  const results = new Map<string, Enrichment>()

  for (const listing of listings) {
    const key = enrichmentKey(listing, fallbackPostcode)
    if (results.has(key)) continue

    const postcode = listing.postcode ?? fallbackPostcode

    let estimatedRent: number | null = null
    let soldPricePerSqFt: number | null = null
    let demand: number | null = null

    if (listing.bedrooms !== null) {
      try {
        // The endpoint takes 0 to 5 and rejects anything above with "Invalid
        // filter: bedrooms". A six-bed is priced as a five-bed, which
        // understates its rent — the safe direction, since it can only make a
        // deal look worse than it is rather than better.
        const response = await client.call<Record<string, unknown>>('rents', {
          postcode,
          bedrooms: Math.max(0, Math.min(5, listing.bedrooms)),
        })
        estimatedRent = readLocalRent(response.data)
      } catch (error) {
        if (error instanceof CreditRefusal) break
        log('rents_unavailable', { postcode, message: error instanceof Error ? error.message : String(error) })
      }
    }

    try {
      const response = await client.call<unknown>('sold-prices-per-sqf', { postcode })
      soldPricePerSqFt = readSoldComparables(response.data).averagePricePerSqFt
    } catch (error) {
      if (error instanceof CreditRefusal) break
      log('local_sold_unavailable', { postcode, message: error instanceof Error ? error.message : String(error) })
    }

    try {
      const response = await client.call<Record<string, unknown>>('demand', { postcode })
      demand = readDemand(response.data)
    } catch (error) {
      if (error instanceof CreditRefusal) break
      log('demand_unavailable', { postcode, message: error instanceof Error ? error.message : String(error) })
    }

    // Not a valuation, and not presented as one. It is what this floor area
    // would fetch at what nearby homes actually sold for, which is a stated
    // calculation from two figures we hold rather than a third-party estimate.
    const estimatedValue =
      soldPricePerSqFt && listing.internalAreaSqFt ? Math.round(soldPricePerSqFt * listing.internalAreaSqFt) : null

    results.set(key, { estimatedValue, estimatedRent, areaDemandRating: demand, soldPricePerSqFt })
  }

  return results
}

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

  // Enrichment is held per postcode, type and bedroom count, and there are at
  // most ENRICHMENT_CAP of those in a run — so the properties sharing a figure
  // are updated together. This was one statement per property, which on a
  // three-hundred-property area was three hundred round trips to write
  // twenty-five distinct values.
  const byKey = new Map<string, string[]>()
  for (const row of rows ?? []) {
    const key = `${row.postcode ?? ''}|${row.property_type ?? ''}|${row.bedrooms ?? ''}`.toLowerCase()
    if (!enrichment.has(key)) continue

    const ids = byKey.get(key)
    if (ids) ids.push(row.id)
    else byKey.set(key, [row.id])
  }

  for (const [key, ids] of byKey) {
    const found = enrichment.get(key)!

    for (const chunk of chunked(ids, WRITE_CHUNK)) {
      const { error } = await supabase
        .from('properties')
        .update({
          enriched_at: observedAt.toISOString(),
          estimated_value: found.estimatedValue,
          estimated_rent: found.estimatedRent,
          area_demand_rating: found.areaDemandRating,
        })
        .in('id', chunk)

      if (error) log('enrichment_write_failed', { rows: chunk.length, message: error.message })
    }
  }
}

// ---------------------------------------------------------------------------
// History and publishing
// ---------------------------------------------------------------------------

/**
 * Properties this subscriber has taken off their list.
 *
 * Removal is the `passed` stage of deal_progress rather than a table of its
 * own. Marking a property passed and removing it from the list are the same
 * decision, and two mechanisms for one decision is how they drift apart.
 */
async function loadRemovals(supabase: SupabaseClient, ownerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('deal_progress')
    .select('property_id, stage, entered_at')
    .eq('owner_id', ownerId)
    .order('entered_at', { ascending: false })

  if (error) {
    log('removals_read_failed', { owner_id: ownerId, message: error.message })
    return new Set()
  }

  // Newest row per property wins, so putting one back on the list works.
  const newest = new Map<string, string>()
  for (const row of data ?? []) {
    if (!newest.has(row.property_id)) newest.set(row.property_id, row.stage)
  }

  return new Set([...newest.entries()].filter(([, stage]) => stage === 'passed').map(([id]) => id))
}

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
    verdict: { event: StoredEvent | null; changedSinceSeen: boolean; reason: 'new' | 'standing' }
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
    profileId: string
    runId: string
    kind: RunKind
    observedAt: Date
    selected: SelectedCandidate[]
  },
): Promise<void> {
  const { ownerId, profileId, runId, kind, observedAt, selected } = input

  if (selected.length) {
    const rows = selected.map((entry, index) => ({
      owner_id: ownerId,
      // Which area this was published for. A subscriber with three areas has
      // three lists, and they are kept apart rather than merged: a Manchester
      // HMO and a Portsmouth flat ranked against each other means nothing.
      profile_id: profileId,
      property_id: entry.candidate.propertyId,
      run_id: runId,
      shown_at: observedAt.toISOString(),
      qualifying_event_id: entry.candidate.verdict.event?.id ?? null,
      changed_since_seen: entry.candidate.verdict.changedSinceSeen,
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
  const added = selected.filter((entry) => entry.candidate.verdict.reason === 'new').length
  // Thin is about what arrived, not how long the list is. A subscriber working
  // fourteen deals with nothing new this week has not had a thin week.
  const thin = kind !== 'backfill' && added < 3

  // The single source of truth for what was published, and when. A future
  // notification channel reads this and nothing else.
  const { error } = await supabase.from('weekly_selections').upsert(
    {
      owner_id: ownerId,
      profile_id: profileId,
      run_id: runId,
      kind,
      published_at: observedAt.toISOString(),
      week_of: weekOf(observedAt),
      deal_count: published,
      is_thin: thin,
      thin_reason: kind === 'backfill' ? null : thinReason(added, published),
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
