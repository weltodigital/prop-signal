import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Statuses that entitle a user to the product.
 *
 * "past_due" is absent on purpose. Every active subscriber costs us real
 * PropertyData credits each week, so a failed card stops access while Stripe
 * retries rather than after the retries are exhausted.
 */
export const ENTITLED_STATUSES = ['active', 'trialing'] as const

export type SubscriptionSummary = {
  id: string
  status: string
  priceId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export type SubscriptionState = {
  active: boolean
  /** The subscription driving the decision, or the most recent one if none is active. */
  subscription: SubscriptionSummary | null
  /** True when a row exists but its status does not entitle — e.g. past_due. */
  needsAttention: boolean
}

function isEntitled(status: string, periodEnd: string | null): boolean {
  if (!(ENTITLED_STATUSES as readonly string[]).includes(status)) return false
  if (periodEnd && new Date(periodEnd).getTime() <= Date.now()) return false
  return true
}

/**
 * The single entitlement check. Everything that gates on "has this person
 * paid" goes through here — pages, route handlers and, later, the pipeline.
 *
 * Reads through RLS as the signed-in user, so it can only ever answer for the
 * caller. `hasActiveSubscriptionAdmin` is the service-role equivalent for
 * background jobs, which have no session to read from.
 */
export async function getSubscriptionState(): Promise<SubscriptionState> {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { active: false, subscription: null, needsAttention: false }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, status, price_id, current_period_end, cancel_at_period_end')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Could not read subscriptions: ${error.message}`)

  const rows = data ?? []
  const entitled = rows.find((r) => isEntitled(r.status, r.current_period_end))
  const chosen = entitled ?? rows[0] ?? null

  return {
    active: Boolean(entitled),
    subscription: chosen
      ? {
          id: chosen.id,
          status: chosen.status,
          priceId: chosen.price_id,
          currentPeriodEnd: chosen.current_period_end,
          cancelAtPeriodEnd: chosen.cancel_at_period_end,
        }
      : null,
    needsAttention: !entitled && rows.length > 0,
  }
}

/** Convenience wrapper for the common yes/no question about the caller. */
export async function hasActiveSubscription(): Promise<boolean> {
  return (await getSubscriptionState()).active
}

/**
 * Entitlement for an arbitrary user, for jobs that run without a session.
 * Uses the service role, so the caller is responsible for the userId it passes.
 */
export async function hasActiveSubscriptionAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('has_active_subscription', { p_owner_id: userId })
  if (error) throw new Error(`Entitlement check failed for ${userId}: ${error.message}`)
  return data === true
}
