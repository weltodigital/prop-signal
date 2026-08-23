import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A small in-memory stand-in for the parts of Supabase the credit wrapper uses.
 *
 * Enough to exercise cache hits and misses, the usage ledger and the allowance
 * RPC, without a database. The RLS and 60-day behaviour this cannot model is
 * covered against a real project in `tests/credit-wrapper.db.test.ts`.
 */

export type CacheRow = {
  owner_id: string
  endpoint: string
  request_key: string
  params: Record<string, string>
  payload: unknown
  credits_charged: number
  retrieved_at: string
  expires_at: string
}

export type UsageRow = {
  owner_id: string
  run_id: string | null
  endpoint: string
  params: Record<string, string>
  outcome: string
  credits: number
  http_status: number | null
  error_code: string | null
  error_message: string | null
  duration_ms: number | null
}

const SIXTY_DAYS_MS = 60 * 86_400_000

export class FakeSupabase {
  cache: CacheRow[] = []
  usage: UsageRow[] = []
  creditsRemaining = 1_000
  rpcCalls: string[] = []
  /** Set to make the next cache write fail, to prove the run survives it. */
  failCacheWrite = false

  constructor(private readonly now: () => Date = () => new Date()) {}

  usageByOutcome(outcome: string): UsageRow[] {
    return this.usage.filter((row) => row.outcome === outcome)
  }

  from(table: string) {
    if (table === 'api_cache_current') return this.currentCacheQuery()
    if (table === 'api_cache') return this.cacheWriter()
    if (table === 'usage_events') return this.usageWriter()
    throw new Error(`FakeSupabase has no table ${table}`)
  }

  async rpc(name: string, _args: Record<string, unknown>) {
    this.rpcCalls.push(name)

    if (name === 'credits_remaining') return { data: this.creditsRemaining, error: null }

    if (name === 'purge_expired_api_cache') {
      const now = this.now()
      const before = this.cache.length
      this.cache = this.cache.filter(
        (row) =>
          new Date(row.expires_at) > now && new Date(row.retrieved_at).getTime() > now.getTime() - SIXTY_DAYS_MS,
      )
      return { data: before - this.cache.length, error: null }
    }

    return { data: null, error: { message: `FakeSupabase has no function ${name}` } }
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient
  }

  /**
   * Mirrors the api_cache_current view: only rows that have not expired and
   * were retrieved inside the last 60 days are visible at all.
   */
  private currentCacheQuery() {
    const filters: Record<string, string> = {}

    const builder = {
      select: () => builder,
      eq: (column: string, value: string) => {
        filters[column] = value
        return builder
      },
      maybeSingle: async () => {
        const now = this.now()
        const match = this.cache.find(
          (row) =>
            Object.entries(filters).every(
              ([key, value]) => (row as unknown as Record<string, string>)[key] === value,
            ) &&
            new Date(row.expires_at) > now &&
            new Date(row.retrieved_at).getTime() > now.getTime() - SIXTY_DAYS_MS,
        )
        return { data: match ?? null, error: null }
      },
    }

    return builder
  }

  private cacheWriter() {
    return {
      upsert: async (row: CacheRow) => {
        if (this.failCacheWrite) return { error: { message: 'simulated cache write failure' } }

        // The database rejects an expiry more than 60 days after retrieval.
        const retrieved = new Date(row.retrieved_at).getTime()
        const expires = new Date(row.expires_at).getTime()
        if (expires > retrieved + SIXTY_DAYS_MS) {
          return { error: { message: 'api_cache_sixty_day_ceiling violated' } }
        }

        const index = this.cache.findIndex(
          (existing) =>
            existing.owner_id === row.owner_id &&
            existing.endpoint === row.endpoint &&
            existing.request_key === row.request_key,
        )

        if (index >= 0) this.cache[index] = row
        else this.cache.push(row)

        return { error: null }
      },
    }
  }

  private usageWriter() {
    return {
      insert: async (row: UsageRow) => {
        this.usage.push(row)
        return { error: null }
      },
    }
  }
}
