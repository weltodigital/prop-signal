import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { toSubscriptionRecord } from '@/lib/stripe/subscription-record'

const PERIOD_START = 1_760_000_000
const PERIOD_END = 1_762_678_400

function subscriptionFixture(overrides: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_test',
    customer: 'cus_test',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    trial_end: null,
    metadata: {},
    items: {
      data: [
        {
          id: 'si_test',
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          price: { id: 'price_test', product: 'prod_test' },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe('toSubscriptionRecord', () => {
  it('reads the period from the subscription item', () => {
    const record = toSubscriptionRecord(subscriptionFixture(), 'user-1')

    expect(record.owner_id).toBe('user-1')
    expect(record.stripe_customer_id).toBe('cus_test')
    expect(record.price_id).toBe('price_test')
    expect(record.product_id).toBe('prod_test')
    expect(record.current_period_start).toBe(new Date(PERIOD_START * 1000).toISOString())
    expect(record.current_period_end).toBe(new Date(PERIOD_END * 1000).toISOString())
  })

  it('falls back to the legacy top-level period fields', () => {
    const legacy = subscriptionFixture({
      items: { data: [] },
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
    })

    const record = toSubscriptionRecord(legacy, 'user-1')

    expect(record.current_period_end).toBe(new Date(PERIOD_END * 1000).toISOString())
    expect(record.price_id).toBeNull()
  })

  it('expands an embedded customer object to its id', () => {
    const record = toSubscriptionRecord(subscriptionFixture({ customer: { id: 'cus_expanded' } }), 'user-1')
    expect(record.stripe_customer_id).toBe('cus_expanded')
  })

  it('stamps the observation time it was given', () => {
    const observedAt = new Date('2026-01-02T03:04:05.000Z')
    const record = toSubscriptionRecord(subscriptionFixture(), 'user-1', observedAt)
    expect(record.stripe_updated_at).toBe(observedAt.toISOString())
  })
})
