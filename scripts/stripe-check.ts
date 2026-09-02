/**
 * What Stripe actually has, checked against what this codebase expects.
 *
 *   pnpm stripe:check
 *
 * Read-only. Nothing is created, changed or deleted, and no secret is printed.
 * Run it after `pnpm stripe:setup`, or after configuring Stripe by hand, to
 * confirm the price, the webhook endpoint and the portal all line up with the
 * environment this app will run with.
 */
import './load-env'
import Stripe from 'stripe'
import { PLAN_LIST, type PlanTier } from '../src/lib/plans'

/** The events src/app/api/stripe/webhook/route.ts acts on. */
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

const API_VERSION = '2026-07-29.dahlia'

let problems = 0

function ok(label: string, detail: string) {
  console.log(`  ok    ${label.padEnd(18)} ${detail}`)
}

function bad(label: string, detail: string) {
  problems += 1
  console.log(`  WRONG ${label.padEnd(18)} ${detail}`)
}

function note(detail: string) {
  console.log(`                           ${detail}`)
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  const PRICE_ENV: Record<PlanTier, string | undefined> = {
    starter: process.env.STRIPE_PRICE_ID,
    investor: process.env.STRIPE_PRICE_ID_INVESTOR,
    portfolio: process.env.STRIPE_PRICE_ID_PORTFOLIO,
  }

  if (!secret) {
    console.error('STRIPE_SECRET_KEY is not set.')
    process.exit(1)
  }

  const stripe = new Stripe(secret, { apiVersion: API_VERSION })
  const live = secret.startsWith('sk_live')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  const wantUrl = `${siteUrl}/api/stripe/webhook`

  console.log(`Stripe mode: ${live ? 'LIVE' : 'test'}`)
  console.log(`Site:        ${siteUrl || '(NEXT_PUBLIC_SITE_URL is not set)'}`)

  console.log('\nAccount')
  const account = await stripe.accounts.retrieveCurrent()
  if (account.charges_enabled) ok('charges', 'enabled')
  else bad('charges', 'disabled — this account cannot take money yet')
  if (account.details_submitted) ok('onboarding', 'complete')
  else bad('onboarding', 'incomplete — finish it in the Stripe dashboard')

  console.log('\nPlans')

  // Every tier, priced on areas. Checked one at a time and by id, because the
  // map from a price to an area count is the thing being sold: a tier pointing
  // at the wrong price would hand somebody five areas for £29, and a tier with
  // no price at all would take their money and sell them nothing.
  for (const plan of PLAN_LIST) {
    const id = PRICE_ENV[plan.id]
    const label = `${plan.label} (${plan.areas} ${plan.areas === 1 ? 'area' : 'areas'})`

    if (!id) {
      // Only Starter is required. The larger tiers can be absent on a fresh
      // test account without stopping the product selling anything.
      if (plan.id === 'starter') bad(label, 'STRIPE_PRICE_ID is not set')
      else note(`${label.padEnd(24)} not configured — this tier will not be offered`)
      continue
    }

    try {
      const price = await stripe.prices.retrieve(id, { expand: ['product'] })
      const product = price.product as Stripe.Product
      const pence = plan.monthlyPrice * 100

      const amount = `${((price.unit_amount ?? 0) / 100).toFixed(2)} ${price.currency.toUpperCase()}`

      const faults: string[] = []
      if (price.livemode !== live) faults.push(`is ${price.livemode ? 'live' : 'test'} but the key is ${live ? 'live' : 'test'}`)
      if (!price.active) faults.push('is archived — checkout will fail')
      if (price.unit_amount !== pence || price.currency !== 'gbp') {
        faults.push(`is ${amount}, expected ${plan.monthlyPrice.toFixed(2)} GBP`)
      }
      if (price.recurring?.interval !== 'month') faults.push('is not monthly')

      if (faults.length) bad(label, faults.join('; '))
      else ok(label, `${amount}/month — ${product.name}${product.active ? '' : ' (ARCHIVED)'}`)
    } catch (error) {
      bad(label, error instanceof Error ? error.message : 'could not be retrieved')
    }
  }

  // Two tiers sharing a price id would be a silent entitlement bug: whichever
  // matched first in the map would decide, and the other would be unreachable.
  const configured = PLAN_LIST.map((plan) => PRICE_ENV[plan.id]).filter(Boolean)
  if (new Set(configured).size === configured.length) ok('distinct', 'each tier has its own price')
  else bad('distinct', 'two tiers share a price id — entitlement would be decided by map order')

  console.log('\nWebhook')
  if (!webhookSecret) note('STRIPE_WEBHOOK_SECRET is not set — every delivery will be rejected.')

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const match = endpoints.data.find((e) => e.url === wantUrl)

  if (!match) {
    bad('endpoint', `nothing points at ${wantUrl}`)
    for (const other of endpoints.data) note(`there is an endpoint at ${other.url}`)
    if (endpoints.data.length === 0) note('this account has no webhook endpoints at all')
  } else {
    ok('endpoint', `${match.id} → ${match.url}`)

    if (match.status === 'enabled') ok('status', 'enabled')
    else bad('status', `${match.status} — Stripe disables an endpoint that keeps failing`)

    const wildcard = match.enabled_events.includes('*')
    const missing = REQUIRED_EVENTS.filter((e) => !wildcard && !match.enabled_events.includes(e))
    if (missing.length === 0) {
      ok('events', wildcard ? 'all events (wildcard)' : `${REQUIRED_EVENTS.length} required, all subscribed`)
    } else {
      bad('events', `not subscribed to ${missing.join(', ')}`)
    }

    const extra = wildcard ? [] : match.enabled_events.filter((e) => !REQUIRED_EVENTS.includes(e))
    if (extra.length > 0) {
      note(`${extra.length} further event${extra.length === 1 ? '' : 's'} subscribed. Harmless — the route`)
      note('records anything it does not handle — but each one is a delivery Stripe retries.')
    }

    // The route reads the subscription's own fields, and where period bounds
    // live moved in 2025-03-31. An endpoint pinned older sends an older shape.
    if (match.api_version && match.api_version !== API_VERSION) {
      note(`Endpoint sends API version ${match.api_version}; the client is pinned to ${API_VERSION}.`)
      note('toSubscriptionRecord falls back to the legacy period fields, so this works either way.')
    }
  }

  console.log('\nCustomer portal')
  const configs = await stripe.billingPortal.configurations.list({ limit: 10 })
  const active = configs.data.find((c) => c.is_default && c.active) ?? configs.data.find((c) => c.active)

  if (!active) {
    bad('configuration', 'none — /api/stripe/portal will fail for every customer')
    note('Create one at https://dashboard.stripe.com/settings/billing/portal')
  } else {
    ok('configuration', `${active.id}${active.is_default ? ' (default)' : ''}`)
    if (active.features.subscription_cancel.enabled) {
      ok('cancel', active.features.subscription_cancel.mode)
    } else {
      bad('cancel', 'not allowed — a subscriber cannot cancel without emailing you')
    }
    if (active.features.payment_method_update.enabled) ok('card update', 'allowed')
    else bad('card update', 'not allowed — a past_due subscriber cannot fix their card')
  }

  console.log('')
  if (problems === 0) {
    console.log('Nothing wrong. Money path is ready.')
  } else {
    console.log(`${problems} thing${problems === 1 ? '' : 's'} to fix above.`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
