import 'server-only'

import type Stripe from 'stripe'
import { areaLimitForPrice } from '@/lib/plans'
import { planPriceIds } from '@/lib/stripe/client'

/**
 * Flattens a Stripe subscription into the shape of our `subscriptions` row.
 *
 * Note on periods: from API version 2025-03-31 the period bounds live on the
 * subscription *item*, not the subscription. We read the first item and fall
 * back to the legacy top-level fields so an older pinned version still works.
 */

export type SubscriptionRecord = {
  id: string
  owner_id: string
  stripe_customer_id: string
  status: string
  price_id: string | null
  product_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  trial_end: string | null
  /**
   * Areas this subscription buys, from the price id and an explicit map.
   *
   * Stored on the row rather than looked up on read, so a change to the map
   * later cannot retroactively alter what somebody was sold. The database
   * enforces the count against this column.
   */
  area_limit: number
  stripe_updated_at: string
}

function toIso(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

export function toSubscriptionRecord(
  subscription: Stripe.Subscription,
  ownerId: string,
  observedAt: Date = new Date(),
): SubscriptionRecord {
  const item = subscription.items.data[0]
  const legacy = subscription as unknown as {
    current_period_start?: number | null
    current_period_end?: number | null
  }

  return {
    id: subscription.id,
    owner_id: ownerId,
    stripe_customer_id: idOf(subscription.customer) ?? '',
    status: subscription.status,
    price_id: item?.price.id ?? null,
    product_id: idOf(item?.price.product),
    current_period_start: toIso(item?.current_period_start ?? legacy.current_period_start),
    current_period_end: toIso(item?.current_period_end ?? legacy.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: toIso(subscription.canceled_at),
    trial_end: toIso(subscription.trial_end),
    area_limit: areaLimitForPrice(item?.price.id ?? null, planPriceIds()),
    stripe_updated_at: observedAt.toISOString(),
  }
}
