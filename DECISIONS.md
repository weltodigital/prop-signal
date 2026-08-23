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

## Phase 3 — onboarding

### Unverified list ids are stored but not offered

PropertyData's documentation names five sourcing lists by way of example and does not
publish the rest, and the marketing copy mentions thirty-six. The five documented ids are
enabled. Short lease, slow to sell and large plot — named in the brief, and strongly
implied by the conditional response fields PropertyData document (`years_remaining`,
`months_on_market`, `plot_size_acres`) — are stored disabled with a guessed id.
`pnpm propertydata:lists` probes them against the live API and enables what is confirmed.
A guessed slug that reaches a subscriber's Sunday run is a failed run; a guessed slug
sitting disabled in a table costs nothing.

### The user table is not the profile table

`accounts` is the person. `search_profiles` is what they are looking for. Naming the
first one `profiles` in Phase 1 would have made every later sentence ambiguous, which is
why it was not.

### One area per user is a unique index

Not a check in a server action. `search_profiles.owner_id` is `unique`, the radius is a
`CHECK` capped at 40 miles, and the strategies are validated by a trigger against
`strategy_lists`. The brief asks for usage limits enforced at the pipeline rather than
the UI, and the database is one better than either.

### Radius stops at 40 miles

The API allows 200. Nobody drives two hundred miles to view a terrace, and a wider search
is both more credits and a worse list. Forty is generous for the stated audience.

### Changing the search resets the backfill, and is therefore capped

A new postcode, a wider radius or another strategy all bring inventory the user has never
been shown, so the next run should draw on all of it exactly as their first did. That is
the most expensive thing this product does, so it is capped at three per allowance period
with the counter shown. Changing only the price, bedroom or type filters resets nothing
and is uncapped — those are applied to the payload after it arrives and cannot surface
anything new.

The reset happens in a database trigger rather than in application code, so a search
change made any other way still schedules the backfill it implies.

### `backfill_completed_at` is not writable by the user

RLS lets a subscriber update their own search profile, but the column grant covers only
the seven fields the form owns. The backfill and last-run timestamps belong to the
pipeline. Without that, a user could tell us the backfill had already run.

### Optional filters are applied after the payload arrives

`/sourced-properties` accepts `standardised_type`, so filtering at the API would return
fewer results and cost fewer credits. We do not, because the weekly diff needs to see
everything in the area to detect events — a property filtered out at the API is a
property whose price reduction we never observe. The saving is not worth the blind spot.

### Types the browser needs live in their own module

`search-profile.ts` imports `server-only`, so the form cannot import from it.
`search-profile.types.ts` holds the constants and types with no guard, and the server
module re-exports them. The alternative was dropping the guard from a module that talks
to the database with the service role.

## Phase 4 and 5 — the pipeline and scoring

### The diff is pure, and takes its own observation time

`diffListing` has no database and no clock. The observation time is passed in, because
what an event carries is the retrieval date of the data behind it, not the moment the
code ran. That is also what makes fifty-two weeks of runs testable in a few milliseconds,
which is what `tests/weekly-mechanic.test.ts` does.

### Events carry a dedupe key made from the values, not the date

A price reduction's key is `price:250000:220000`. Observe the same move in two runs and
it is one event, because it is one thing that happened. A days-on-market crossing keys on
the mark rather than the day count, so a property sitting at 130 days does not generate a
fresh event every Sunday. Only the events with no natural value — a return to market,
going under offer, disappearing — key on the date, because those genuinely can recur.

### Material is a short list

A price reduction of at least 5%, a return to market, or crossing a days-on-market mark.
A £500 trim on a £250,000 house is recorded and is not material. Going under offer is
recorded and is not material: it is going, not coming. First sighting is material,
because the user has never been shown it.

Everything is recorded either way. The timeline needs the full history; the list needs
only the part worth interrupting someone for.

### "Never twice for the same event" is enforced in two places

`qualifies()` refuses an event id that already appears against an impression, and
`deal_impressions` has a unique index on `(owner_id, property_id, qualifying_event_id)`
plus a partial unique index for the never-seen case. The application rule is the one that
runs; the index is the one that holds if the rule is ever wrong.

### Quality and movement are added, and share a ceiling

Both weight sets total 100. Adding rather than blending is what lets a mediocre property
that just dropped 12% outrank a good one that has not moved. Giving them the same ceiling
means neither wins by construction — an exceptional property still beats a small move,
and there is a test asserting that too, because it is the honest limit of the premise.

### A missing figure scores zero, not an average

No rent estimate means no yield points and a factor that says "No rent estimate held".
Substituting an average would invent a number and hide that we do not have one. Omitting
rather than estimating is the rule everywhere in this product.

### Enrichment is capped, and the cap is logged

Twenty-five candidates, two credits each, which makes it the largest line in a run. They
are chosen by how much the property moved rather than by how good it looks, because a
property that moved is the one we might actually publish. When the cap truncates, the run
logs how many were dropped — a short list must never read as full coverage.

### Enrichment is keyed on postcode, type and bedrooms

Every property sharing those three shares one valuation call. In a dense area that turns
twenty-five properties into a handful of calls, and the cache does the rest for thirty
days. It is the single largest credit saving in the design.

### `properties` is per-owner and has no index on its contents

The only lookup is `(owner_id, property_key)`. No index on address, postcode or price. An
index over those is exactly what would turn a per-user record into the searchable copy of
PropertyData's data that their terms forbid.

### Every stored figure carries its observation date

`properties` holds the latest observation, not the current truth, and the dashboard
prints "Observed 7 June 2026" beside the price. That is the condition under which derived
material may be kept indefinitely, and it is also just honest — we know what we saw and
when, not what is true now.

### A Sunday run publishes into Monday; everything else publishes into its own week

`weekOf` sends a Sunday-night run to the Monday after it, because that is when the
subscriber reads it, and every other day to the Monday of its own week. The first version
pushed a midweek manual refresh into next week, which a test caught.

### One profile failing does not take the batch down

`runWeekly` catches per profile. Each profile's `pipeline_runs` row records its own
status, credits and error, so a batch of thirty with one failure is twenty-nine published
lists and one recorded failure rather than nothing.

### The field names are read through alias lists

PropertyData publish neither a full example response nor the list of sourcing lists.
Rather than guess one key per field, `listing.ts` reads each through an ordered alias
list and keeps the raw payload. `pnpm propertydata:sample` prints what a real response
actually contains and flags anything unmapped. Correcting it is a one-file change.

This is the largest piece of guesswork in the build. It is contained on purpose.
