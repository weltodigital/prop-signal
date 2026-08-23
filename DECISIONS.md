# Decisions

Cheap reversible choices, logged so they do not have to be re-argued. Newest last.

## Phase 1 — foundations and the money path

### The user table is `accounts`, not `profiles`

In this product a *profile* is a saved search — an area plus a set of strategies — and
the pipeline iterates over them. Taking `profiles` for the user record would have made
every later line about "profiles" ambiguous. Phase 3 gets `search_profiles`.

### `past_due` does not entitle

Stripe's `active` and `trialing` grant access. `past_due` does not. Every active
subscriber costs real PropertyData credits every week, so a failed card pauses access
while Stripe retries rather than after the retries are exhausted. The account page says
what happened and links to the portal. Reversible — it is one array in
`src/lib/subscription.ts`.

### Entitlement is read through RLS, not through the SQL function

`public.has_active_subscription(uuid)` exists and is security definer, which means it
answers about any user id it is handed. It is granted to `service_role` only, for jobs
that run without a session. Everything with a signed-in user goes through
`getSubscriptionState()`, which reads the `subscriptions` table under RLS and therefore
can only ever answer about the caller. `tests/rls.test.ts` pins both halves.

### Webhook events are recorded before they are handled

`stripe_webhook_events` has Stripe's event id as its primary key, so a redelivery is
recognised rather than replayed. A failed attempt leaves `processed_at` null and stores
the error, so Stripe's retry gets a real second attempt instead of being waved through
as a duplicate. The stored payload is also the reconciliation record when something
goes wrong.

### Out-of-order webhooks are dropped, not applied

Stripe does not promise ordered delivery. Each subscription row carries
`stripe_updated_at`, taken from the event's `created` timestamp. An event older than
the state we already hold is skipped and logged. Without this, a delayed
`customer.subscription.updated` can resurrect a cancelled subscription.

### The Stripe API version is pinned in code

Pinned to `2026-07-29.dahlia`, the version the installed SDK's types describe. Raising
it is a deliberate act with the changelog open, not something that happens because a
Stripe account setting changed under a running pipeline.

### Period dates are read from the subscription item

From API version 2025-03-31 Stripe moved `current_period_start` and `current_period_end`
off the subscription and onto its items. `toSubscriptionRecord` reads the first item and
falls back to the old top-level fields, so an older pinned version still works. Covered
by `tests/subscription-record.test.ts`.

### The price id comes from the environment, never from the request

Checkout reads `STRIPE_PRICE_ID` server-side. Nothing about the plan is taken from the
form, so a crafted POST cannot buy a different price.

### `server-only` guards the service role key

`src/lib/supabase/admin.ts` and the Stripe modules import `server-only`, which makes the
build fail if they are ever pulled into a client bundle. Vitest aliases it to a no-op,
because the guard is about the Next build.

### The webhook route is excluded from the session proxy

`src/proxy.ts` skips `/api/stripe/webhook`. The route needs the raw body for signature
verification and carries no session, so running the auth refresh over it is wasted work
and a chance to corrupt the body.

### Next 16 uses `proxy.ts`, not `middleware.ts`

Next 16 deprecated the `middleware` file convention. Migrated with the official codemod.
Same behaviour, new filename.

### There is no free tier and no trial in the code

The subscribe page goes straight to checkout. `trialing` is treated as entitled so a
promotional trial can be turned on in Stripe later without a code change, but nothing
here creates one.
