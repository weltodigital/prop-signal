import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { propertyDataEnv } from '@/lib/env'
import { creditsForResponse, endpointSpec, estimateCredits, type EndpointName } from './endpoints'
import { isReadableAsCurrent, resolveExpiry, stripImageFields } from './cache-policy'
import { canonicaliseParams, requestKey } from './request-key'
import { PropertyDataError, CreditRefusal, retryAfterMs } from './errors'
import { RunBudget } from './budget'
import { TokenBucket } from './rate-limiter'

/**
 * THE CREDIT WRAPPER.
 *
 * This is the only module in Prop Signal permitted to call PropertyData. If you
 * are about to write `fetch('https://api.propertydata.co.uk/...')` anywhere
 * else, add the endpoint to `endpoints.ts` and come through here instead.
 * `tests/module-boundary.test.ts` fails the build if you do not.
 *
 * Every call, in order:
 *
 *   1. Check the per-user cache, and serve from it when the payload is still
 *      current. A hit costs nothing and is still recorded.
 *   2. Check this run's ceiling, then the user's remaining monthly allowance.
 *      Refuse rather than overspend, and record the refusal.
 *   3. Wait for a rate-limit token.
 *   4. Make the call, retrying only what is worth retrying.
 *   5. Strip image fields, store the payload with an expiry capped at 60 days,
 *      and record what it actually cost.
 *
 * Nothing here reads another user's cache. The lookup is keyed on owner_id and
 * there is no code path that omits it — PropertyData's terms forbid a shared
 * cache and this is where that promise is kept.
 */

export type CallOptions = {
  /** Skip the cache and pay for a fresh copy. Used by manual refresh, which is quota'd. */
  forceRefresh?: boolean
}

export type CallResult<T = unknown> = {
  data: T
  /** Credits this call cost. Zero for a cache hit. */
  credits: number
  fromCache: boolean
  retrievedAt: Date
}

export type ClientOptions = {
  ownerId: string
  /** Groups usage_events so a run's spend can be totalled. */
  runId?: string
  /** Defaults to PROPERTYDATA_RUN_CREDIT_CEILING. */
  runCreditCeiling?: number
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  supabase?: SupabaseClient
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
}

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1_000
/** Nothing PropertyData does should hang a run for longer than this. */
const REQUEST_TIMEOUT_MS = 30_000

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ at: 'propertydata', event, ...fields }))
}

export class PropertyDataClient {
  private readonly supabase: SupabaseClient
  private readonly budget: RunBudget
  private readonly bucket: TokenBucket
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date
  private readonly sleep: (ms: number) => Promise<void>
  private readonly env = propertyDataEnv()

  /** Cached so the allowance is one read per run, not one per call. */
  private allowanceRemaining: number | null = null

  constructor(private readonly options: ClientOptions) {
    this.supabase = options.supabase ?? createAdminClient()
    this.budget = new RunBudget(options.runCreditCeiling ?? this.env.PROPERTYDATA_RUN_CREDIT_CEILING)
    this.fetchImpl = options.fetchImpl ?? fetch
    this.now = options.now ?? (() => new Date())
    this.sleep = options.sleep ?? defaultSleep
    this.bucket = new TokenBucket(
      this.env.PROPERTYDATA_RATE_LIMIT_PER_10S,
      10_000,
      () => this.now().getTime(),
      this.sleep,
    )
  }

  creditsSpent(): number {
    return this.budget.spentSoFar()
  }

  creditsRemainingInRun(): number {
    return this.budget.remaining()
  }

  abortedReason(): string | null {
    return this.budget.abortedReason()
  }

  async call<T = unknown>(
    endpoint: EndpointName,
    params: Record<string, unknown>,
    options: CallOptions = {},
  ): Promise<CallResult<T>> {
    const spec = endpointSpec(endpoint)
    const canonical = canonicaliseParams(params)
    const key = requestKey(endpoint, params)

    if (!options.forceRefresh) {
      const hit = await this.readCache<T>(endpoint, key)
      if (hit) {
        await this.record({ endpoint, params: canonical, outcome: 'served_from_cache', credits: 0 })
        return hit
      }
    }

    const estimate = estimateCredits(endpoint, params)

    try {
      this.budget.assertAffordable(estimate)
      await this.assertAllowance(estimate)
    } catch (error) {
      if (error instanceof CreditRefusal) {
        await this.record({
          endpoint,
          params: canonical,
          outcome: error.reason === 'allowance' ? 'refused_allowance' : 'refused_run_budget',
          credits: 0,
          errorMessage: error.message,
        })
      }
      throw error
    }

    const startedAt = Date.now()

    try {
      const { payload, httpStatus } = await this.fetchWithRetries(spec.path, canonical)
      const credits = creditsForResponse(endpoint, payload)
      const retrievedAt = this.now()

      // Images are removed before anything is written, so an image URL never
      // reaches our database at all.
      const stored = stripImageFields(payload)

      await this.writeCache(endpoint, key, canonical, stored, credits, retrievedAt)

      this.budget.commit(credits)
      if (this.allowanceRemaining !== null) this.allowanceRemaining -= credits

      await this.record({
        endpoint,
        params: canonical,
        outcome: 'fetched',
        credits,
        httpStatus,
        durationMs: Date.now() - startedAt,
      })

      return { data: stored as T, credits, fromCache: false, retrievedAt }
    } catch (error) {
      const pdError = error instanceof PropertyDataError ? error : null

      if (pdError?.kind === 'fatal') {
        // The account is out of credits or shut off. Retrying costs money and
        // will not work, so every later call in this run refuses immediately.
        this.budget.abort(`${pdError.code ?? 'unknown'}: ${pdError.message}`)
      }

      await this.record({
        endpoint,
        params: canonical,
        outcome: 'error',
        credits: 0,
        httpStatus: pdError?.httpStatus ?? null,
        errorCode: pdError?.code ?? null,
        errorMessage: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      })

      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Cache
  // -------------------------------------------------------------------------

  /**
   * Reads through `api_cache_current`, which is the only view that filters on
   * both the TTL and the 60-day ceiling. `isReadableAsCurrent` then checks the
   * same thing in application code. Two locks on one door, because the cost of
   * getting this wrong is the API licence.
   */
  private async readCache<T>(endpoint: EndpointName, key: string): Promise<CallResult<T> | null> {
    const { data, error } = await this.supabase
      .from('api_cache_current')
      .select('payload, retrieved_at, expires_at')
      .eq('owner_id', this.options.ownerId)
      .eq('endpoint', endpoint)
      .eq('request_key', key)
      .maybeSingle()

    if (error) {
      log('cache_read_failed', { endpoint, message: error.message })
      return null
    }
    if (!data) return null

    const retrievedAt = new Date(data.retrieved_at)
    const expiresAt = new Date(data.expires_at)

    if (!isReadableAsCurrent({ retrievedAt, expiresAt }, this.now())) {
      log('cache_row_rejected_as_stale', { endpoint, retrieved_at: data.retrieved_at })
      return null
    }

    return { data: data.payload as T, credits: 0, fromCache: true, retrievedAt }
  }

  private async writeCache(
    endpoint: EndpointName,
    key: string,
    params: Record<string, string>,
    payload: unknown,
    credits: number,
    retrievedAt: Date,
  ): Promise<void> {
    const { error } = await this.supabase.from('api_cache').upsert(
      {
        owner_id: this.options.ownerId,
        endpoint,
        request_key: key,
        params,
        payload,
        credits_charged: credits,
        retrieved_at: retrievedAt.toISOString(),
        expires_at: resolveExpiry(endpoint, retrievedAt).toISOString(),
      },
      { onConflict: 'owner_id,endpoint,request_key' },
    )

    // A cache write failing means we pay again next time. Worth logging loudly,
    // not worth throwing away a response we have already paid for.
    if (error) log('cache_write_failed', { endpoint, message: error.message })
  }

  // -------------------------------------------------------------------------
  // Allowance
  // -------------------------------------------------------------------------

  private async assertAllowance(credits: number): Promise<void> {
    if (this.allowanceRemaining === null) {
      this.allowanceRemaining = await this.readAllowance()
    }

    if (credits <= this.allowanceRemaining) return

    // Re-read before refusing. The local figure is an optimisation and must
    // never be the reason someone is turned away.
    this.allowanceRemaining = await this.readAllowance()
    if (credits <= this.allowanceRemaining) return

    throw new CreditRefusal('allowance', credits, this.allowanceRemaining)
  }

  private async readAllowance(): Promise<number> {
    const { data, error } = await this.supabase.rpc('credits_remaining', { p_owner_id: this.options.ownerId })

    if (error) {
      throw new Error(`Could not read the credit allowance for ${this.options.ownerId}: ${error.message}`)
    }

    return typeof data === 'number' ? data : 0
  }

  // -------------------------------------------------------------------------
  // The network call
  // -------------------------------------------------------------------------

  private async fetchWithRetries(
    path: string,
    params: Record<string, string>,
  ): Promise<{ payload: unknown; httpStatus: number }> {
    let lastError: PropertyDataError | null = null

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      await this.bucket.take()

      try {
        return await this.fetchOnce(path, params)
      } catch (error) {
        if (!(error instanceof PropertyDataError) || error.kind !== 'retryable') throw error

        lastError = error

        if (attempt === MAX_ATTEMPTS) break

        // Their Retry-After if they gave one, otherwise exponential backoff.
        const wait = error.retryAfterMs ?? BASE_BACKOFF_MS * 2 ** (attempt - 1)
        log('retrying', { path, attempt, wait_ms: wait, code: error.code })
        await this.sleep(wait)
      }
    }

    throw lastError ?? new PropertyDataError({ message: `${path} failed and gave no reason` })
  }

  private async fetchOnce(
    path: string,
    params: Record<string, string>,
  ): Promise<{ payload: unknown; httpStatus: number }> {
    const url = new URL(path, this.env.PROPERTYDATA_BASE_URL)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      // The key travels in a header, never in the query string, so it cannot
      // end up in a log line or an error message alongside the URL.
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': this.env.PROPERTYDATA_API_KEY,
          Accept: 'application/json',
        },
        signal: controller.signal,
      })
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError'
      throw new PropertyDataError({
        message: aborted ? `${path} timed out after ${REQUEST_TIMEOUT_MS}ms` : `${path} could not be reached`,
        // A timeout or a dropped connection is worth one more try.
        httpStatus: 503,
      })
    } finally {
      clearTimeout(timeout)
    }

    const body = await response.text()

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new PropertyDataError({
        message: `${path} returned something that is not JSON`,
        httpStatus: response.status,
      })
    }

    const envelope = parsed as { status?: string; code?: string; message?: string } | null

    if (!response.ok || envelope?.status === 'error') {
      throw new PropertyDataError({
        message: envelope?.message ?? `${path} failed with HTTP ${response.status}`,
        code: envelope?.code ?? null,
        httpStatus: response.status,
        retryAfterMs: retryAfterMs(response.headers),
      })
    }

    return { payload: parsed, httpStatus: response.status }
  }

  // -------------------------------------------------------------------------
  // The ledger
  // -------------------------------------------------------------------------

  private async record(entry: {
    endpoint: string
    params: Record<string, string>
    outcome: 'served_from_cache' | 'fetched' | 'refused_allowance' | 'refused_run_budget' | 'error'
    credits: number
    httpStatus?: number | null
    errorCode?: string | null
    errorMessage?: string | null
    durationMs?: number | null
  }): Promise<void> {
    const { error } = await this.supabase.from('usage_events').insert({
      owner_id: this.options.ownerId,
      run_id: this.options.runId ?? null,
      endpoint: entry.endpoint,
      params: entry.params,
      outcome: entry.outcome,
      credits: entry.credits,
      http_status: entry.httpStatus ?? null,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs ?? null,
    })

    // The ledger failing must not take the run down with it, but it does mean
    // the run's reported figures are incomplete, so say so.
    if (error) log('usage_event_write_failed', { endpoint: entry.endpoint, message: error.message })
  }
}

export function createPropertyDataClient(options: ClientOptions): PropertyDataClient {
  return new PropertyDataClient(options)
}
