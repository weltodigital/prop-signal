import { beforeEach, describe, expect, it } from 'vitest'
import { PropertyDataClient } from '@/lib/propertydata/client'
import { CreditRefusal, PropertyDataError } from '@/lib/propertydata/errors'
import { DAY_MS } from '@/lib/propertydata/endpoints'
import { FakeSupabase } from './helpers/fake-supabase'
import { fakeFetch, jsonResponse, propertyDataError, sourcedProperties } from './helpers/fake-fetch'

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER_OWNER = '22222222-2222-4222-8222-222222222222'
const RUN = '33333333-3333-4333-8333-333333333333'

let clock = new Date('2026-06-01T12:00:00.000Z')
const now = () => clock

/** Tests never actually wait; the token bucket's clock is moved on instead. */
const sleep = async (ms: number) => {
  clock = new Date(clock.getTime() + ms)
}

function build(
  supabase: FakeSupabase,
  responses: Parameters<typeof fakeFetch>[0],
  options: { runCreditCeiling?: number } = {},
) {
  const fetch = fakeFetch(responses)
  const client = new PropertyDataClient({
    ownerId: OWNER,
    runId: RUN,
    runCreditCeiling: options.runCreditCeiling,
    supabase: supabase.asClient(),
    fetchImpl: fetch.impl,
    now,
    sleep,
  })
  return { client, fetch }
}

beforeEach(() => {
  clock = new Date('2026-06-01T12:00:00.000Z')
})

describe('spending', () => {
  it('charges one credit per ten results on sourced-properties', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(sourcedProperties(25))])

    const result = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(result.credits).toBe(3)
    expect(client.creditsSpent()).toBe(3)
    expect(db.usageByOutcome('fetched')).toHaveLength(1)
    expect(db.usageByOutcome('fetched')[0]?.credits).toBe(3)
  })

  it('costs nothing for the free account endpoint', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse({ status: 'success', credits_remaining: 1900 })])

    const result = await client.call('account/credits', {})

    expect(result.credits).toBe(0)
    expect(client.creditsSpent()).toBe(0)
  })

  it('records the run id against every event so a run can be totalled', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(db.usage.every((row) => row.run_id === RUN)).toBe(true)
  })

  it('never puts the API key in the recorded parameters', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties', key: 'secret' })

    const serialised = JSON.stringify({ usage: db.usage, cache: db.cache })
    expect(serialised).not.toContain('secret')
  })

  it('sends the API key as a header, not in the query string', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(fetch.calls[0]?.url).not.toContain('key=')
    expect(fetch.calls[0]?.headers['X-API-Key']).toBe(process.env.PROPERTYDATA_API_KEY)
  })
})

describe('the cache', () => {
  it('serves a second identical call without spending anything', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(20))])

    const first = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })
    const second = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(first.fromCache).toBe(false)
    expect(second.fromCache).toBe(true)
    expect(second.credits).toBe(0)
    expect(fetch.calls).toHaveLength(1)
    expect(client.creditsSpent()).toBe(2)
    expect(db.usageByOutcome('served_from_cache')).toHaveLength(1)
  })

  it('treats differently written versions of the same request as one call', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties,short-lease' })
    await client.call('sourced-properties', { list: 'short-lease,reduced-properties', postcode: 'm14 5tp' })

    expect(fetch.calls).toHaveLength(1)
  })

  it('goes back to the API once the TTL has run out', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(sourcedProperties(10)),
      jsonResponse(sourcedProperties(10)),
    ])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })
    clock = new Date(clock.getTime() + 4 * DAY_MS) // TTL is three days.
    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(fetch.calls).toHaveLength(2)
  })

  it('never serves one user a payload fetched for another', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    const stranger = new PropertyDataClient({
      ownerId: OTHER_OWNER,
      supabase: db.asClient(),
      fetchImpl: fakeFetch([jsonResponse(sourcedProperties(10))]).impl,
      now,
      sleep,
    })

    const result = await stranger.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    // Same postcode, same list, same moment. Still a fresh call and a fresh
    // charge, because a cross-user cache is not permitted.
    expect(result.fromCache).toBe(false)
    expect(db.cache).toHaveLength(2)
  })

  it('refuses to serve a payload older than 60 days even when it is unexpired', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(10))])

    await client.call('demand', { postcode: 'M14 5TP' })

    // Back-date the stored row past the ceiling and give it a long expiry, the
    // shape a forged or mis-migrated row would take.
    const row = db.cache[0]!
    row.retrieved_at = new Date(clock.getTime() - 61 * DAY_MS).toISOString()
    row.expires_at = new Date(clock.getTime() + 365 * DAY_MS).toISOString()

    const second = await client.call('demand', { postcode: 'M14 5TP' })

    expect(second.fromCache).toBe(false)
    expect(fetch.calls).toHaveLength(2)
  })

  it('stores an expiry inside the 60-day ceiling', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse({ status: 'success', demand_rating: 7 })])

    await client.call('demand', { postcode: 'M14 5TP' })

    const row = db.cache[0]!
    const life = new Date(row.expires_at).getTime() - new Date(row.retrieved_at).getTime()
    expect(life).toBeLessThanOrEqual(60 * DAY_MS)
  })

  it('pays again rather than throwing away a response when the cache write fails', async () => {
    const db = new FakeSupabase(now)
    db.failCacheWrite = true
    const { client } = build(db, [jsonResponse(sourcedProperties(10))])

    const result = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(result.data).toBeDefined()
    expect(db.cache).toHaveLength(0)
  })

  it('skips the cache on a forced refresh', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(sourcedProperties(10)),
      jsonResponse(sourcedProperties(10)),
    ])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })
    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' }, { forceRefresh: true })

    expect(fetch.calls).toHaveLength(2)
  })
})

describe('images', () => {
  it('never stores a listing photograph', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(sourcedProperties(5))])

    const result = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(JSON.stringify(db.cache)).not.toContain('image_url')
    expect(JSON.stringify(result.data)).not.toContain('image_url')
    // The link to the original advert is what we keep instead.
    expect(JSON.stringify(result.data)).toContain('rightmove.co.uk/properties')
  })
})

describe('refusing to spend', () => {
  it('stops at the run ceiling instead of going over it', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(10))], { runCreditCeiling: 2 })

    // 50 results is an estimate of 5 credits, over a ceiling of 2.
    await expect(
      client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties', results: 50 }),
    ).rejects.toBeInstanceOf(CreditRefusal)

    expect(fetch.calls).toHaveLength(0)
    expect(db.usageByOutcome('refused_run_budget')).toHaveLength(1)
  })

  it('stops when the user has exhausted their monthly allowance', async () => {
    const db = new FakeSupabase(now)
    db.creditsRemaining = 1
    const { client, fetch } = build(db, [jsonResponse(sourcedProperties(10))])

    await expect(
      client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties', results: 100 }),
    ).rejects.toBeInstanceOf(CreditRefusal)

    expect(fetch.calls).toHaveLength(0)
    expect(db.usageByOutcome('refused_allowance')).toHaveLength(1)
  })

  it('re-reads the allowance before turning anyone away', async () => {
    const db = new FakeSupabase(now)
    db.creditsRemaining = 40
    const { client } = build(db, [jsonResponse(sourcedProperties(10)), jsonResponse(sourcedProperties(10))])

    await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    // The local figure now says 39, and the next call estimates 50. Topping the
    // account up between the two must be noticed rather than refused on stale
    // arithmetic.
    db.creditsRemaining = 500
    const rpcsBefore = db.rpcCalls.filter((n) => n === 'credits_remaining').length

    await client.call('sourced-properties', { postcode: 'OX4 1AA', list: 'reduced-properties', results: 500 })

    expect(db.rpcCalls.filter((n) => n === 'credits_remaining').length).toBeGreaterThan(rpcsBefore)
  })

  it('refuses everything after the account itself fails', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(propertyDataError('X04', 'Monthly plan or bolt-on credit limit exceeded'), 403),
    ])

    await expect(client.call('demand', { postcode: 'M14 5TP' })).rejects.toBeInstanceOf(PropertyDataError)
    expect(client.abortedReason()).toContain('X04')

    // The second call must not reach the network. Retrying a dead account costs
    // a round trip and cannot succeed.
    await expect(client.call('demand', { postcode: 'OX4 1AA' })).rejects.toBeInstanceOf(CreditRefusal)
    expect(fetch.calls).toHaveLength(1)
  })
})

describe('failures', () => {
  it('retries a rate limit and honours the Retry-After it was given', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(propertyDataError('X14', 'Too many calls'), 429, { 'retry-after': '2' }),
      jsonResponse(sourcedProperties(10)),
    ])

    const result = await client.call('sourced-properties', { postcode: 'M14 5TP', list: 'reduced-properties' })

    expect(result.credits).toBe(1)
    expect(fetch.calls).toHaveLength(2)
  })

  it('retries a busy server, which costs no credits at their end either', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(propertyDataError('X20', 'Server busy'), 503, { 'retry-after': '60' }),
      jsonResponse({ status: 'success', demand_rating: 5 }),
    ])

    await client.call('demand', { postcode: 'M14 5TP' })
    expect(fetch.calls).toHaveLength(2)
  })

  it('gives up after three attempts', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [jsonResponse(propertyDataError('X20', 'Server busy'), 503)])

    await expect(client.call('demand', { postcode: 'M14 5TP' })).rejects.toBeInstanceOf(PropertyDataError)
    expect(fetch.calls).toHaveLength(3)
  })

  it('does not retry a location it cannot find', async () => {
    const db = new FakeSupabase(now)
    const { client, fetch } = build(db, [
      jsonResponse(propertyDataError('X08', 'Insufficient data found for this location'), 404),
    ])

    await expect(client.call('demand', { postcode: 'ZZ99 9ZZ' })).rejects.toBeInstanceOf(PropertyDataError)
    expect(fetch.calls).toHaveLength(1)
    expect(db.usageByOutcome('error')[0]?.error_code).toBe('X08')
  })

  it('charges nothing for a failed call', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(propertyDataError('X08', 'No data'), 404)])

    await expect(client.call('demand', { postcode: 'ZZ99 9ZZ' })).rejects.toThrow()
    expect(client.creditsSpent()).toBe(0)
    expect(db.usageByOutcome('error')[0]?.credits).toBe(0)
  })

  it('treats a non-JSON body as a failed call rather than crashing', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [new Response('<html>gateway timeout</html>', { status: 504 })])

    await expect(client.call('demand', { postcode: 'M14 5TP' })).rejects.toBeInstanceOf(PropertyDataError)
  })

  it('catches an error envelope returned with a 200', async () => {
    const db = new FakeSupabase(now)
    const { client } = build(db, [jsonResponse(propertyDataError('X07', 'Invalid input: postcode'), 200)])

    await expect(client.call('demand', { postcode: 'nonsense' })).rejects.toBeInstanceOf(PropertyDataError)
    expect(db.cache).toHaveLength(0)
  })
})
