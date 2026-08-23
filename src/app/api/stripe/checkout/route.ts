import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { getOrCreateCustomer } from '@/lib/stripe/customer'
import { getSubscriptionState } from '@/lib/subscription'
import { serverEnv, siteUrl } from '@/lib/env'

export const runtime = 'nodejs'

/**
 * Starts a Stripe Checkout session for the signed-in user and redirects them
 * to it. The price is read from the environment, never from the request, so a
 * crafted form cannot buy a different plan.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.redirect(new URL('/login?next=/subscribe', request.nextUrl.origin), { status: 303 })
  }

  const state = await getSubscriptionState()
  if (state.active) {
    return NextResponse.redirect(new URL('/dashboard', request.nextUrl.origin), { status: 303 })
  }

  const customerId = await getOrCreateCustomer(user.id, user.email)

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: serverEnv().STRIPE_PRICE_ID, quantity: 1 }],
    success_url: siteUrl('/dashboard?checkout=complete'),
    cancel_url: siteUrl('/subscribe?checkout=cancelled'),
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    client_reference_id: user.id,
    // Read back in the webhook so the subscription is attributed even if the
    // customer mapping is somehow missing.
    subscription_data: { metadata: { owner_id: user.id } },
    metadata: { owner_id: user.id },
  })

  if (!session.url) {
    return NextResponse.redirect(new URL('/subscribe?error=checkout_failed', request.nextUrl.origin), { status: 303 })
  }

  return NextResponse.redirect(session.url, { status: 303 })
}
