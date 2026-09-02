import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownerIdForCustomer } from '@/lib/stripe/customer'
import { toSubscriptionRecord } from '@/lib/stripe/subscription-record'
import { reconcileAreas } from '@/lib/areas'
import { stripeEnv } from '@/lib/env'

export const runtime = 'nodejs'
// The raw body is needed for signature verification, so this route is never
// cached or pre-rendered. It is also excluded from the session proxy.
export const dynamic = 'force-dynamic'

const HANDLED = new Set<string>([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ at: 'stripe.webhook', event, ...fields }))
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(raw, signature, stripeEnv().STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    // An unverified body is never parsed, stored, or acted on.
    log('signature_rejected', { message: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Record the event before acting on it. The primary key is Stripe's event id,
  // so a redelivery lands here rather than being replayed — unless the previous
  // attempt failed, in which case the retry is allowed through.
  const { error: claimError } = await admin.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    api_version: event.api_version,
    payload: event as unknown as Record<string, unknown>,
  })

  if (claimError) {
    if (claimError.code !== '23505') {
      log('claim_failed', { id: event.id, type: event.type, message: claimError.message })
      // 500 so Stripe retries. Dropping the event silently is the worse outcome.
      return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
    }

    const { data: existing } = await admin
      .from('stripe_webhook_events')
      .select('processed_at')
      .eq('id', event.id)
      .maybeSingle()

    if (existing?.processed_at) {
      log('duplicate_ignored', { id: event.id, type: event.type })
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Otherwise fall through: the first attempt failed and this is the retry.
  }

  if (!HANDLED.has(event.type)) {
    await markProcessed(event.id)
    return NextResponse.json({ received: true, handled: false })
  }

  try {
    await handle(event)
    await markProcessed(event.id)
    log('processed', { id: event.id, type: event.type })
    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    log('failed', { id: event.id, type: event.type, message })

    // Leave processed_at null so Stripe's retry is treated as a fresh attempt.
    await admin.from('stripe_webhook_events').update({ error: message }).eq('id', event.id)

    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

async function markProcessed(eventId: string): Promise<void> {
  await createAdminClient()
    .from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString(), error: null })
    .eq('id', eventId)
}

async function handle(event: Stripe.Event): Promise<void> {
  const observedAt = new Date(event.created * 1000)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !session.subscription) return

      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id

      // Re-fetch rather than trusting the embedded copy. By the time we get
      // here the subscription may already have moved on.
      const subscription = await stripe().subscriptions.retrieve(subscriptionId)
      await upsertSubscription(subscription, observedAt, session.client_reference_id ?? undefined)
      return
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertSubscription(event.data.object as Stripe.Subscription, observedAt)
      return
    }

    default:
      return
  }
}

async function upsertSubscription(
  subscription: Stripe.Subscription,
  observedAt: Date,
  hintedOwnerId?: string,
): Promise<void> {
  const metadataOwnerId = subscription.metadata?.owner_id
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const ownerId = hintedOwnerId ?? metadataOwnerId ?? (await ownerIdForCustomer(customerId))
  if (!ownerId) {
    throw new Error(`No owner for Stripe customer ${customerId} (subscription ${subscription.id})`)
  }

  const admin = createAdminClient()

  // Stripe does not promise ordered delivery. If we already hold state observed
  // at or after this event, the newer state stands.
  const { data: stored } = await admin
    .from('subscriptions')
    .select('stripe_updated_at')
    .eq('id', subscription.id)
    .maybeSingle()

  if (stored?.stripe_updated_at && new Date(stored.stripe_updated_at) >= observedAt) {
    log('stale_event_skipped', { subscription: subscription.id, observed_at: observedAt.toISOString() })
    return
  }

  const record = toSubscriptionRecord(subscription, ownerId, observedAt)
  const { error } = await admin.from('subscriptions').upsert(record, { onConflict: 'id' })
  if (error) throw new Error(`Could not upsert subscription ${subscription.id}: ${error.message}`)

  // Make sure the customer mapping exists even if checkout raced ahead of it.
  await admin
    .from('billing_customers')
    .upsert({ owner_id: ownerId, stripe_customer_id: customerId }, { onConflict: 'owner_id' })

  // The plan may have moved in either direction. An upgrade gives back the
  // areas a previous downgrade paused; a downgrade pauses the excess rather
  // than deleting it. Failing this must not fail the webhook — Stripe would
  // retry a delivery whose subscription row is already correct, and the areas
  // are reconciled again on the next event either way.
  let areas: Awaited<ReturnType<typeof reconcileAreas>> | null = null
  try {
    areas = await reconcileAreas(ownerId, admin)
  } catch (error) {
    log('area_reconcile_failed', {
      subscription: subscription.id,
      owner: ownerId,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  log('subscription_synced', {
    subscription: subscription.id,
    owner: ownerId,
    status: subscription.status,
    price: record.price_id,
    area_limit: record.area_limit,
    areas_paused: areas?.paused ?? null,
    areas_resumed: areas?.resumed ?? null,
  })
}
