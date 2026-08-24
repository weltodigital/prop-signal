/**
 * Creates the Prop Signal product and its £29/month price, or reports the one
 * that already exists. Run once per Stripe mode (test, then live).
 *
 *   pnpm stripe:setup
 *
 * Prints the price id to put in STRIPE_PRICE_ID. Idempotent — it looks the
 * product up by lookup key before creating anything.
 */
import './load-env'
import Stripe from 'stripe'

const PRICE_LOOKUP_KEY = 'prop_signal_monthly_gbp'
const AMOUNT_PENCE = 2900

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('STRIPE_SECRET_KEY is not set. Copy .env.example to .env.local and fill it in.')
    process.exit(1)
  }

  const stripe = new Stripe(secret, { apiVersion: '2026-07-29.dahlia' })
  const mode = secret.startsWith('sk_live') ? 'LIVE' : 'test'

  const existing = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 })
  const found = existing.data[0]

  if (found) {
    console.log(`[${mode}] Price already exists.`)
    console.log(`STRIPE_PRICE_ID=${found.id}`)
    return
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

  console.log(`[${mode}] Created product ${product.id}.`)
  console.log(`STRIPE_PRICE_ID=${price.id}`)
  console.log('')
  console.log('Next: enable the customer portal at')
  console.log('  https://dashboard.stripe.com/settings/billing/portal')
  console.log('and allow cancellation and payment method updates.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
