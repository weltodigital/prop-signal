import 'server-only'

import Stripe from 'stripe'
import { stripeEnv } from '@/lib/env'

let cached: Stripe | null = null

/** The Stripe SDK, server-side only. */
export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(stripeEnv().STRIPE_SECRET_KEY, {
      // Pinned so a Stripe-side upgrade cannot silently change response shapes
      // under a running pipeline. Raise it deliberately, with the changelog open.
      apiVersion: '2026-07-29.dahlia',
      appInfo: { name: 'Prop Signal', version: '0.1.0' },
      typescript: true,
    })
  }
  return cached
}

/**
 * The three price ids, as a map the plan functions can read.
 *
 * Assembled here so nothing else has to know which environment variable holds
 * which tier. An unset id is the empty string, which matches no real price.
 */
export function planPriceIds(): { starter: string; investor: string; portfolio: string } {
  const env = stripeEnv()
  return {
    starter: env.STRIPE_PRICE_ID,
    investor: env.STRIPE_PRICE_ID_INVESTOR,
    portfolio: env.STRIPE_PRICE_ID_PORTFOLIO,
  }
}
