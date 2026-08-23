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

## Phase 2 — the credit wrapper

### The 60-day rule is enforced three times

A `CHECK` constraint on `api_cache`, a view the read path goes through, and a purge job.
The constraint is the one that matters: it makes the bad row impossible to write rather
than merely unlikely. The view catches a row that got in some other way — a migration, a
restore, a dropped constraint. The purge deletes them. Belt, braces and a second belt,
because the cost of getting this wrong is the API licence rather than a bug report.

### `api_cache` has no index on its contents

No GIN index, no expression indexes over the payload. PropertyData permit a per-user
response cache and forbid a searchable copy of their data, and the difference between
those two things is exactly whether you can query into the payload. Keeping it opaque is
what makes the distinction real rather than a claim.

### Image fields are stripped in the wrapper, before storage

Listing photographs carry no rights. `stripImageFields` runs on every response before it
is cached, so an image URL never reaches the database at all. Doing it at the render
layer would have left the URLs sitting in `api_cache` for sixty days.

### The API key travels in a header

PropertyData accept it as a query parameter, a bearer token or `X-API-Key`. The header,
because a URL ends up in logs, error messages and stack traces, and a query parameter
would ride along with it.

### The allowance is read once per run and re-read before any refusal

Reading `credits_remaining` on every call would be a database round trip per candidate.
The wrapper reads it once and decrements locally — but if the local figure says refuse,
it re-reads before turning anyone away. An optimisation must never be the reason someone
is told no.

### Spend is derived from `usage_events`, never stored

`credit_allowances` holds the cap and the period. What has been spent is summed from the
ledger. A stored counter can drift from the ledger; a derived one cannot.

### A fatal error aborts the run rather than retrying

X04, X05, X13 and X03 mean the account is out of credits, cancelled, or the key is
wrong. Retrying costs a round trip and cannot succeed, so the first one trips
`RunBudget.abort()` and every later call in that run refuses without touching the
network. X14 and X20 are the opposite case and are retried, honouring `Retry-After`.

### The rate limiter is in-process

A token bucket inside the client, defaulting to 4 requests per 10 seconds, which is the
floor across all plans. The weekly pipeline is one run in one process, so in-process is
the right scope for v1. If a second process ever calls the API concurrently this stops
being sufficient and the X14 retry is the backstop. Noted here so the assumption is
visible when that changes.

### `/account/credits` lives inside the wrapper even though it is free

It belongs to no user and spends nothing, so it does not go through the client's cache
and ledger path. It sits in `src/lib/propertydata/account.ts` anyway, so "nothing outside
this directory touches PropertyData" stays literally true and the boundary test can be
absolute rather than having an exception in it.

### CLI scripts run with `--conditions=react-server`

`server-only` throws when imported outside a React Server Component, which is what makes
it a useful guard — and which also breaks any Node script importing a guarded module.
The `react-server` condition resolves it to its empty build. That keeps the guard intact
in the Next build instead of aliasing it away.

### TTLs are chosen around the Sunday run

`/sourced-properties` is three days: long enough to cover a retry or a re-run inside the
same window, short enough to expire before the next Sunday. Valuations and area demand
are 30 days, because they move over months and are shared across every candidate in an
area — that entry saves more credits than any other in the table.
