/**
 * Cross-tenant isolation, asserted against a real Supabase project.
 *
 * Creates two users, gives each a subscription row, and checks that neither can
 * read or write the other's. Skips with a printed reason if the project
 * credentials are not present, so `pnpm test` still runs on a fresh checkout —
 * but this must pass before anything ships.
 *
 * Run against a development project. It creates and deletes users.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const configured = Boolean(url && anonKey && serviceKey && !url.includes('YOUR-PROJECT'))

const suite = configured ? describe : describe.skip

if (!configured) {
  console.warn('[rls] Skipped. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local to run it.')
}

type Tenant = { id: string; email: string; client: SupabaseClient }

suite('row level security', () => {
  const stamp = Math.random().toString(36).slice(2, 10)
  const password = `test-${stamp}-Aa1!`

  // Built lazily: the describe body still runs when the suite is skipped.
  let admin: SupabaseClient
  let alice: Tenant
  let bob: Tenant

  async function makeTenant(label: string): Promise<Tenant> {
    const email = `rls-${label}-${stamp}@propsignal.test`

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Could not create ${label}: ${error?.message}`)

    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(`Could not sign in ${label}: ${signInError.message}`)

    return { id: data.user.id, email, client }
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
    alice = await makeTenant('alice')
    bob = await makeTenant('bob')

    for (const tenant of [alice, bob]) {
      const { error } = await admin.from('subscriptions').upsert({
        id: `sub_rls_${tenant.id}`,
        owner_id: tenant.id,
        stripe_customer_id: `cus_rls_${tenant.id}`,
        status: 'active',
        price_id: 'price_rls_test',
        current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      if (error) throw new Error(`Could not seed subscription: ${error.message}`)

      const { error: customerError } = await admin
        .from('billing_customers')
        .upsert({ owner_id: tenant.id, stripe_customer_id: `cus_rls_${tenant.id}` })
      if (customerError) throw new Error(`Could not seed billing customer: ${customerError.message}`)
    }
  })

  afterAll(async () => {
    for (const tenant of [alice, bob]) {
      if (!tenant) continue
      await admin.from('subscriptions').delete().eq('owner_id', tenant.id)
      await admin.from('billing_customers').delete().eq('owner_id', tenant.id)
      await admin.auth.admin.deleteUser(tenant.id)
    }
  })

  it('gives each user exactly their own subscription', async () => {
    const { data, error } = await alice.client.from('subscriptions').select('id, owner_id')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.owner_id).toBe(alice.id)
  })

  it('returns nothing when one user names another user id explicitly', async () => {
    const { data, error } = await alice.client.from('subscriptions').select('id').eq('owner_id', bob.id)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('hides the other tenant billing customer row', async () => {
    const { data } = await alice.client.from('billing_customers').select('owner_id')

    expect(data?.map((r) => r.owner_id)).toEqual([alice.id])
  })

  it('refuses a client-side write to subscriptions', async () => {
    const { error } = await alice.client
      .from('subscriptions')
      .update({ status: 'active', current_period_end: '2099-01-01T00:00:00Z' })
      .eq('id', `sub_rls_${alice.id}`)

    expect(error).not.toBeNull()
  })

  it('refuses a client-side insert of a subscription for someone else', async () => {
    const { error } = await alice.client.from('subscriptions').insert({
      id: `sub_forged_${bob.id}`,
      owner_id: bob.id,
      stripe_customer_id: 'cus_forged',
      status: 'active',
    })

    expect(error).not.toBeNull()
  })

  it('denies the webhook ledger to signed-in users entirely', async () => {
    const { data, error } = await alice.client.from('stripe_webhook_events').select('id')

    // Either an explicit denial or an empty set. What must never happen is rows.
    expect(error ? true : data?.length === 0).toBe(true)
  })

  it('shows a user their own account row and nobody else', async () => {
    const { data } = await bob.client.from('accounts').select('id, email')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.id).toBe(bob.id)
  })

  it('refuses to let a user promote themselves to admin', async () => {
    const { error } = await bob.client.from('accounts').update({ is_admin: true }).eq('id', bob.id)

    expect(error).not.toBeNull()

    const { data } = await admin.from('accounts').select('is_admin').eq('id', bob.id).single()
    expect(data?.is_admin).toBe(false)
  })

  it('does not expose the entitlement function to signed-in users', async () => {
    // has_active_subscription is security definer and takes any user id, so it
    // is granted to service_role only. If this ever starts succeeding, one
    // subscriber can probe another's billing state.
    const { error } = await alice.client.rpc('has_active_subscription', { p_owner_id: bob.id })

    expect(error).not.toBeNull()
  })

  it('answers the entitlement function correctly under the service role', async () => {
    const { data, error } = await admin.rpc('has_active_subscription', { p_owner_id: alice.id })

    expect(error).toBeNull()
    expect(data).toBe(true)
  })
})
