/**
 * The 60-day rule, asserted against a real Postgres.
 *
 * `tests/cache-policy.test.ts` proves the application code refuses a payload
 * over 60 days old. This proves the database refuses to hold one in the first
 * place, which is the guarantee that survives a bug in the application code.
 *
 * Skips with a printed reason if the project credentials are not present. It
 * must pass before anything ships. Run it against a development project.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const configured = Boolean(url && serviceKey && anonKey && !url.includes('YOUR-PROJECT'))
const suite = configured ? describe : describe.skip

if (!configured) {
  console.warn('[60-day] Skipped. Set the Supabase credentials in .env.local to run it.')
}

const DAY = 86_400_000

suite('the 60-day payload life, enforced by the database', () => {
  const stamp = Math.random().toString(36).slice(2, 10)
  let admin: SupabaseClient
  let ownerId: string

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data, error } = await admin.auth.admin.createUser({
      email: `ttl-${stamp}@propsignal.test`,
      password: `test-${stamp}-Aa1!`,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Could not create the test user: ${error?.message}`)
    ownerId = data.user.id
  })

  afterAll(async () => {
    if (!ownerId) return
    await admin.from('api_cache').delete().eq('owner_id', ownerId)
    await admin.auth.admin.deleteUser(ownerId)
  })

  function row(overrides: Record<string, unknown> = {}) {
    const retrievedAt = new Date()
    return {
      owner_id: ownerId,
      endpoint: 'demand',
      request_key: `key_${stamp}_${Math.random().toString(36).slice(2, 8)}`,
      params: { postcode: 'm14 5tp' },
      payload: { status: 'success', demand_rating: 6 },
      credits_charged: 1,
      retrieved_at: retrievedAt.toISOString(),
      expires_at: new Date(retrievedAt.getTime() + 30 * DAY).toISOString(),
      ...overrides,
    }
  }

  it('refuses to store a payload whose expiry is beyond 60 days', async () => {
    const retrievedAt = new Date()
    const { error } = await admin.from('api_cache').insert(
      row({
        retrieved_at: retrievedAt.toISOString(),
        expires_at: new Date(retrievedAt.getTime() + 61 * DAY).toISOString(),
      }),
    )

    expect(error).not.toBeNull()
    expect(error?.message).toContain('api_cache_sixty_day_ceiling')
  })

  it('accepts a payload right up to the ceiling', async () => {
    const retrievedAt = new Date()
    const { error } = await admin.from('api_cache').insert(
      row({
        retrieved_at: retrievedAt.toISOString(),
        expires_at: new Date(retrievedAt.getTime() + 60 * DAY - 1000).toISOString(),
      }),
    )

    expect(error).toBeNull()
  })

  it('hides a back-dated payload from the current view even when it is unexpired', async () => {
    // The row a bug or a dropped constraint would leave behind: retrieved 61
    // days ago, still claiming to be good. It must not be readable as current.
    const retrievedAt = new Date(Date.now() - 61 * DAY)
    const requestKey = `stale_${stamp}`

    const { error: insertError } = await admin.from('api_cache').insert(
      row({
        request_key: requestKey,
        retrieved_at: retrievedAt.toISOString(),
        expires_at: new Date(retrievedAt.getTime() + 59 * DAY).toISOString(),
      }),
    )
    expect(insertError).toBeNull()

    const { data: raw } = await admin.from('api_cache').select('id').eq('request_key', requestKey)
    expect(raw).toHaveLength(1)

    const { data: current } = await admin.from('api_cache_current').select('id').eq('request_key', requestKey)
    expect(current).toEqual([])
  })

  it('hides an expired payload from the current view', async () => {
    const retrievedAt = new Date(Date.now() - 10 * DAY)
    const requestKey = `expired_${stamp}`

    await admin.from('api_cache').insert(
      row({
        request_key: requestKey,
        retrieved_at: retrievedAt.toISOString(),
        expires_at: new Date(Date.now() - DAY).toISOString(),
      }),
    )

    const { data } = await admin.from('api_cache_current').select('id').eq('request_key', requestKey)
    expect(data).toEqual([])
  })

  it('purges everything expired or over 60 days old', async () => {
    const { data: removed, error } = await admin.rpc('purge_expired_api_cache')

    expect(error).toBeNull()
    expect(typeof removed).toBe('number')

    const { data: left } = await admin
      .from('api_cache')
      .select('retrieved_at, expires_at')
      .eq('owner_id', ownerId)

    for (const stored of left ?? []) {
      expect(new Date(stored.expires_at).getTime()).toBeGreaterThan(Date.now())
      expect(Date.now() - new Date(stored.retrieved_at).getTime()).toBeLessThan(60 * DAY)
    }
  })

  it('keeps a signed-out client out of stored payloads', async () => {
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await anon.from('api_cache').select('id').eq('owner_id', ownerId)
    expect(data ?? []).toEqual([])
  })
})
