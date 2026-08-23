import 'server-only'

import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Returns the Stripe customer for a user, creating it on first use.
 *
 * The mapping lives in billing_customers so a user never ends up with two
 * customers, which would split their billing history and break the portal.
 * `owner_id` is carried in customer metadata as a second route back to the
 * user if a webhook arrives before the row is written.
 */
export async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const admin = createAdminClient()

  const { data: existing, error } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Could not read billing customer: ${error.message}`)
  if (existing?.stripe_customer_id) return existing.stripe_customer_id

  const customer = await stripe().customers.create({
    email,
    metadata: { owner_id: userId },
  })

  const { error: insertError } = await admin
    .from('billing_customers')
    .insert({ owner_id: userId, stripe_customer_id: customer.id })

  if (insertError) {
    // A concurrent request won the race. Use whichever customer landed first
    // and leave the duplicate unused rather than charging against two.
    const { data: raced } = await admin
      .from('billing_customers')
      .select('stripe_customer_id')
      .eq('owner_id', userId)
      .maybeSingle()

    if (raced?.stripe_customer_id) return raced.stripe_customer_id
    throw new Error(`Could not store billing customer: ${insertError.message}`)
  }

  return customer.id
}

/** Resolves a Stripe customer id back to our user id. */
export async function ownerIdForCustomer(customerId: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('billing_customers')
    .select('owner_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (data?.owner_id) return data.owner_id

  // Fall back to the metadata we set at creation, for the case where the
  // webhook beats our own insert.
  const customer = await stripe().customers.retrieve(customerId)
  if (customer.deleted) return null

  const ownerId = customer.metadata?.owner_id
  if (!ownerId) return null

  await admin
    .from('billing_customers')
    .upsert({ owner_id: ownerId, stripe_customer_id: customerId }, { onConflict: 'owner_id' })

  return ownerId
}
