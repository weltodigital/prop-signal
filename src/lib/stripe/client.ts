import 'server-only'

import Stripe from 'stripe'
import { serverEnv } from '@/lib/env'

let cached: Stripe | null = null

/** The Stripe SDK, server-side only. */
export function stripe(): Stripe {
  if (!cached) {
    cached = new Stripe(serverEnv().STRIPE_SECRET_KEY, {
      // Pinned so a Stripe-side upgrade cannot silently change response shapes
      // under a running pipeline. Raise it deliberately, with the changelog open.
      apiVersion: '2026-07-29.dahlia',
      appInfo: { name: 'Prop Signal', version: '0.1.0' },
      typescript: true,
    })
  }
  return cached
}
