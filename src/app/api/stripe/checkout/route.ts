import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/client'
import { getOrCreateCustomer } from '@/lib/stripe/customer'
import { getSubscriptionState } from '@/lib/subscription'
import { planPriceIds } from '@/lib/stripe/client'
import { DEFAULT_TIER, PLAN_TIERS, PLANS, type PlanTier } from '@/lib/plans'
import { absoluteUrl } from '@/lib/origin'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACKNOWLEDGEMENT_FIELD, checkAcknowledgement } from '@/lib/consumer-rights'

export const runtime = 'nodejs'

/**
 * Starts a Stripe Checkout session for the signed-in user and redirects them
 * to it.
 *
 * The request names a *tier*, and the price id for it is read from the
 * environment. A crafted form can therefore ask for a plan we sell and cannot
 * ask for one we do not — the difference matters, because the alternative is a
 * price id in a form field and somebody buying five areas at the £29 price.
 *
 * An unknown or absent tier is the Starter plan rather than an error. Somebody
 * arriving with a mangled form should end up buying something sensible.
 *
 * The cancellation acknowledgement is the one thing here that is *not* forgiving
 * about a mangled form. A missing tier can be defaulted because every default is
 * something we sell; a missing acknowledgement cannot be defaulted, because the
 * whole value of it is that the customer did it. The checkbox on /subscribe
 * disables the buttons without it, but a POST does not have to come from that
 * page, so this is where the rule actually holds.
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

  const form = await request.formData().catch(() => null)
  const asked = String(form?.get('tier') ?? '')
  const tier: PlanTier = (PLAN_TIERS as readonly string[]).includes(asked) ? (asked as PlanTier) : DEFAULT_TIER

  // Consumer Contracts Regulations 2013. The first list is built within minutes
  // of payment, so without an express request to start now and an acknowledged
  // loss of the 14-day right, a subscriber can take the whole first month's
  // value and unwind the purchase. Checked before Stripe is touched: no session,
  // no customer, nothing to reconcile afterwards.
  const acknowledgement = checkAcknowledgement({
    ticked: form?.get(ACKNOWLEDGEMENT_FIELD) !== null && form?.get(ACKNOWLEDGEMENT_FIELD) !== '',
    version: String(form?.get(`${ACKNOWLEDGEMENT_FIELD}Version`) ?? ''),
  })

  if (!acknowledgement.ok) {
    console.error(
      JSON.stringify({
        at: 'stripe.checkout',
        event: 'acknowledgement_refused',
        reason: acknowledgement.reason,
        owner_id: user.id,
      }),
    )

    return NextResponse.redirect(
      new URL('/subscribe?error=acknowledgement_required', request.nextUrl.origin),
      { status: 303 },
    )
  }

  // Recorded before the session, so the evidence exists even if Stripe fails
  // afterwards. The wording is the one this server resolved from the version,
  // never the one that arrived in the request — an acknowledgement the customer
  // could have authored is not evidence of anything.
  //
  // Service role, because a subscriber cannot be allowed to write their own
  // acknowledgement date. A write that fails must not sell them the plan
  // anyway: the record is the reason we are allowed to keep the money.
  const { error: ackError } = await createAdminClient()
    .from('accounts')
    .update({
      cancellation_ack_at: new Date().toISOString(),
      cancellation_ack_version: acknowledgement.version,
      cancellation_ack_wording: acknowledgement.wording,
    })
    .eq('id', user.id)

  if (ackError) {
    console.error(
      JSON.stringify({
        at: 'stripe.checkout',
        event: 'acknowledgement_not_recorded',
        owner_id: user.id,
        message: ackError.message,
      }),
    )

    return NextResponse.redirect(new URL('/subscribe?error=checkout_failed', request.nextUrl.origin), {
      status: 303,
    })
  }

  const priceId = planPriceIds()[tier]
  if (!priceId) {
    // The tier exists in the code and not in this environment's Stripe account.
    // Better to say so than to quietly sell them the wrong plan.
    return NextResponse.redirect(new URL('/subscribe?error=unknown_tier', request.nextUrl.origin), { status: 303 })
  }

  const customerId = await getOrCreateCustomer(user.id, user.email)

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: await absoluteUrl('/dashboard?checkout=complete'),
    cancel_url: await absoluteUrl('/subscribe?checkout=cancelled'),
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    client_reference_id: user.id,
    // Read back in the webhook so the subscription is attributed even if the
    // customer mapping is somehow missing.
    subscription_data: { metadata: { owner_id: user.id, tier, areas: String(PLANS[tier].areas) } },
    metadata: { owner_id: user.id, tier, cancellation_ack_version: acknowledgement.version },
  })

  if (!session.url) {
    return NextResponse.redirect(new URL('/subscribe?error=checkout_failed', request.nextUrl.origin), { status: 303 })
  }

  return NextResponse.redirect(session.url, { status: 303 })
}
