/**
 * Everything Stripe needs, in whichever mode the key belongs to.
 *
 *   pnpm stripe:setup
 *   pnpm stripe:setup --recreate-webhook
 *
 * Four things, each looked up before it is created so the script can be run
 * again without making a second copy of anything:
 *
 *   1. The Prop Signal product and its £29/month price.
 *   2. A webhook endpoint on this site's domain, subscribed to the three
 *      events the handler acts on.
 *   3. A customer portal configuration allowing cancellation and card changes.
 *   4. The resulting ids written into .env.local.
 *
 * The signing secret is written to the file rather than printed. Stripe returns
 * it once, at creation, and never again — a terminal is a poor place to keep
 * the only copy. That is also why re-pointing an existing endpoint needs
 * --recreate-webhook: the old one is deleted and a new secret issued, because
 * there is no way to read back the secret of an endpoint that already exists.
 */
import './load-env'
import { readFileSync, writeFileSync } from 'node:fs'
import Stripe from 'stripe'

const PRICE_LOOKUP_KEY = 'prop_signal_monthly_gbp'
const AMOUNT_PENCE = 2900
const ENV_FILE = '.env.local'

/** The events the webhook route handles. Anything else is recorded and ignored. */
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error(`STRIPE_SECRET_KEY is not set. Put it in ${ENV_FILE} and run this again.`)
    process.exit(1)
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')
  if (!siteUrl.startsWith('https://')) {
    console.error(`NEXT_PUBLIC_SITE_URL must be an https origin. Stripe will not post to ${siteUrl || 'an empty value'}.`)
    process.exit(1)
  }

  const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' })
  const mode = secret.startsWith('sk_live') ? 'LIVE' : 'test'
  const recreateWebhook = process.argv.includes('--recreate-webhook')

  console.log(`Stripe mode: ${mode}`)
  console.log('')

  const priceId = await ensurePrice(stripe)
  const webhookSecret = await ensureWebhook(stripe, `${siteUrl}/api/stripe/webhook`, recreateWebhook)
  await ensurePortal(stripe)

  const written = ['STRIPE_PRICE_ID']
  setEnv('STRIPE_PRICE_ID', priceId)
  if (webhookSecret) {
    setEnv('STRIPE_WEBHOOK_SECRET', webhookSecret)
    written.push('STRIPE_WEBHOOK_SECRET')
  }

  console.log('')
  console.log(`Wrote ${written.join(' and ')} to ${ENV_FILE}. Values are not printed here.`)

  if (mode === 'LIVE') {
    console.log('')
    console.log('Then push them to Vercel and redeploy:')
    console.log('  vercel link         # once')
    console.log('  pnpm vercel:env')
    console.log('  vercel --prod')
  }
}

/** The product and its recurring price, found by lookup key. */
async function ensurePrice(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 })
  const found = existing.data[0]

  if (found) {
    console.log(`  price     ${found.id} (already existed)`)
    return found.id
  }

  const product = await stripe.products.create({
    name: 'Prop Signal',
    description: 'Five UK property deals in your area every Monday, each with the event that qualified it.',
  })

  const price = await stripe.prices.create({
    product: product.id,
    currency: 'gbp',
    unit_amount: AMOUNT_PENCE,
    recurring: { interval: 'month' },
    lookup_key: PRICE_LOOKUP_KEY,
  })

  console.log(`  product   ${product.id} (created)`)
  console.log(`  price     ${price.id} (created, £${(AMOUNT_PENCE / 100).toFixed(2)}/month)`)
  return price.id
}

/**
 * The webhook endpoint. Returns its signing secret, or null when an endpoint
 * for this URL already exists — Stripe will not hand the secret back a second
 * time, so the existing value in .env.local is left alone.
 */
async function ensureWebhook(stripe: Stripe, url: string, recreate: boolean): Promise<string | null> {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const found = endpoints.data.find((e) => e.url === url && e.status !== 'disabled')

  if (found && !recreate) {
    const missing = EVENTS.filter((e) => !found.enabled_events.includes(e))
    if (missing.length > 0) {
      await stripe.webhookEndpoints.update(found.id, { enabled_events: EVENTS })
      console.log(`  webhook   ${found.id} (already existed, subscribed it to ${missing.join(', ')})`)
    } else {
      console.log(`  webhook   ${found.id} (already existed, events correct)`)
    }
    console.log('            Its signing secret cannot be read back. If STRIPE_WEBHOOK_SECRET is')
    console.log('            empty or stale, re-run with --recreate-webhook to issue a new one.')
    return null
  }

  if (found && recreate) {
    await stripe.webhookEndpoints.del(found.id)
    console.log(`  webhook   ${found.id} (deleted)`)
  }

  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: 'Prop Signal — subscription state',
  })

  console.log(`  webhook   ${created.id} (created, ${url})`)
  return created.secret ?? null
}

/**
 * The customer portal. One configuration is enough: cancel, and change card.
 * Nothing else is offered, because there is nothing else to change — one plan,
 * one price.
 */
async function ensurePortal(stripe: Stripe): Promise<void> {
  // Switching plan is a portal feature, and it has to name the prices it may
  // switch between — Stripe will not offer a price the configuration does not
  // list. So this is rebuilt whenever the set of tiers changes, rather than
  // skipped because a portal already exists: a portal configured before the
  // tiers existed cannot upgrade anybody.
  const products = [
    { price: process.env.STRIPE_PRICE_ID, name: 'Starter' },
    { price: process.env.STRIPE_PRICE_ID_INVESTOR, name: 'Investor' },
    { price: process.env.STRIPE_PRICE_ID_PORTFOLIO, name: 'Portfolio' },
  ].filter((entry): entry is { price: string; name: string } => Boolean(entry.price))

  const priced = await Promise.all(
    products.map(async (entry) => {
      const price = await stripe.prices.retrieve(entry.price, { expand: ['product'] })
      const product = price.product as { id: string }
      return { product: product.id, prices: [entry.price] }
    }),
  )

  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' as const },
    // Upgrades and downgrades, prorated. A downgrade does not delete anything:
    // the webhook pauses the areas the smaller plan no longer covers and the
    // account page lets the subscriber choose which one stays live.
    subscription_update: {
      enabled: priced.length > 1,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations' as const,
      products: priced,
    },
  }

  const existing = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })

  try {
    if (existing.data[0]) {
      const config = await stripe.billingPortal.configurations.update(existing.data[0].id, { features })
      console.log(`  portal    ${config.id} (updated — ${priced.length} tiers switchable)`)
      return
    }

    const config = await stripe.billingPortal.configurations.create({ features })
    console.log(`  portal    ${config.id} (created — ${priced.length} tiers switchable)`)
  } catch (error) {
    // Live mode can refuse until the account has terms and privacy URLs on
    // file. That is a dashboard setting, not something to invent here.
    const message = error instanceof Error ? error.message : 'unknown error'
    console.log(`  portal    not created — ${message}`)
    console.log('            Set it up at https://dashboard.stripe.com/settings/billing/portal')
    console.log('            allowing cancellation and payment method updates.')
  }
}

/** Replace a key in .env.local, or append it if the file does not mention it. */
function setEnv(key: string, value: string): void {
  const contents = readFileSync(ENV_FILE, 'utf8')
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')

  const next = pattern.test(contents)
    ? contents.replace(pattern, line)
    : `${contents.replace(/\n*$/, '')}\n${line}\n`

  writeFileSync(ENV_FILE, next)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
