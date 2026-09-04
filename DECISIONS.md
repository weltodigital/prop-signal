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

## Verified against the live API — 24 August 2026

Nine credits spent replacing guesses with facts. What changed as a result.

### An error costs no credits, which makes discovery cheap

A rejected call — invalid list id, radius too wide — returns 4XX and charges nothing.
That turned two problems into free ones: the maximum radius per list was found by asking
for progressively less until a call succeeded (one credit each, at the end), and the
correct id for the large-plot list was found by trying eight candidates of which seven
were rejected for nothing.

### Seven of eight guessed list ids were right

`unmodernised-properties`, `reduced-properties`, `repossessed-properties`,
`high-yield-properties`, `auction-properties`, `short-lease-properties` and
`slow-to-sell-properties` all exist. The eighth is `large-plot` — singular, no suffix,
the only one that breaks the pattern. Guessing it would not have worked.

### Lists have their own maximum radius

`unmodernised-properties` and `slow-to-sell-properties` reject anything over 30 miles
with error 1103; `large-plot` is verified to 20. The first probe reported both of the
first two as unconfirmed because it asked for 40 — the lists were fine, the question was
wrong.

A profile's radius is now clamped three ways: the form narrows the options as strategies
are ticked, a database trigger refuses a profile whose radius exceeds what its strategies
allow, and the run clamps again before calling. The last one matters because a list's
limit can change after somebody has saved.

### `price_history` is the most valuable field in the payload

Each sourced property carries PropertyData's own dated price history —
`[{date, price}, ...]`. That means a property's reductions are known the first time we
ever see it rather than only from what we happen to observe week by week.

The opening backfill can now say "reduced 20% in July" about a property it has never seen
before, instead of "new to your area". Each step becomes its own event, dated when the
change happened, with `learned_at` recording when we found out, and keyed on the two
prices so a step we learn from history and later observe ourselves is one event.

### Recency was measuring when we looked, not when the property moved

`first_seen` is dated at run time. It was feeding the recency factor, so every property
on a backfill scored full marks for the crime of being discovered. Recency is now computed
only over the events that actually earn movement points. A test comparing a two-year-old
reduction against a two-day-old one caught it.

### A property already past a days-on-market mark now says so on first sight

With no previous observation there is nothing to have crossed from, so a property 702 days
unsold produced no crossing at all — and "140 days unsold" is one of the headlines this
product exists to write. The event is now emitted on first sight, dated by working
backwards from the day count: 702 days on the market means 365 was passed 337 days ago.
Stamping it with today would have reintroduced the recency bug in another form.

### The payload carries floor area, so valuations can be about the property

`sqf` is passed to `/valuation-sale` as `internal_area`. It costs nothing and is the
difference between valuing a postcode and valuing this property. It is deliberately not
part of the enrichment cache key — including it would make almost every property unique
and turn a handful of calls back into twenty-five.

### Fields that do not exist

No bathrooms, no agent, no first-listed date. The pipeline reads them if they ever appear
and shows "Not held" rather than a guess. `lists` appears only when several lists are
queried together. `image_url` never arrives here at all, because the wrapper strips image
fields before anything is stored — which is the point of doing it there rather than at
the point of display.

### Server secrets are split by what needs them

`serverEnv()` bundled Supabase with Stripe, so the pipeline could not run without Stripe
keys it never uses. Now `supabaseAdminEnv()`, `stripeEnv()` and `propertyDataEnv()` are
separate. A missing Stripe key stops checkout and nothing else.

### The watchlist has no notifications table

A notification is a material event on a starred property, observed since that
star was last read. Storing it would mean writing a row that duplicates the
event row and can drift from it. It is derived at read time instead, from two
queries: the watchlist, and the material events on those properties since the
earliest cut-off in it.

The cut-off is per star, not per user, because "mark this one read" has to be
possible without silencing the other nine. That is why the events are filtered
in memory rather than in the query — PostgREST cannot compare a column on one
table against a column on another, and the volume is a handful of rows.

### Starring is checked against the properties table, not just the owner id

The insert policy on `watchlist` requires `exists (select 1 from properties
where id = property_id)`, which is evaluated under the caller's own read policy.
A property belonging to another subscriber is invisible to that subquery, so the
insert fails. Without it, a guessed uuid would put somebody else's row on your
watchlist — readable, because the join back out is scoped by your own id, but it
would still be their property in your list.

### An old score is shown as it was stored, never recomputed

The property page reads `quality_score`, `movement_score` and `score_version`
off the impression row rather than adding the factors back up. The factors are
what the weights produced at the time; re-adding them under today's weights
would restate history and quietly contradict the version stamp sitting next to
it.

### The sample tool derived its own idea of which fields are mapped

`propertydata:sample` kept a hand-copied list of the field names the pipeline
reads, and it went stale the moment `listing.ts` gained `price_history`, `sqf`,
`reduced_by` and the rest. It reported nine unmapped fields when four were.
`ALIASES` is now exported and the tool derives the set from it, so the report
cannot drift from the thing it is reporting on.

### The unseen marker is cleared by a server action, not during render

Marking a week seen is a write, and a page render is the wrong place for one:
pages render more than once, and `after()` in a Server Component cannot read
cookies — which is exactly what binds the write to the signed-in user. The
alternative was the service-role client, but `admin.ts` says never in a page and
it is right to.

So a component that renders nothing calls a server function once on mount. The
cookie-bound client applies row level security as usual. With JavaScript off the
marker never clears, which is the safe direction to fail: the user is told there
is something new for longer than necessary, rather than a fresh list arriving
unannounced.

The update is conditional on `seen_at` still being null, so revisiting a week
does not keep moving the date on which it was first read.

### Cashflow replaced gross yield, and it changes which properties qualify

Gross yield banded 4% to 10%, so a 4% yield scored nothing and a 5% scored a
little. At 5.5% borrowing both lose money every month. The score was rewarding
properties that cannot wash their face.

It now scores net monthly cashflow under stated finance — 25% down, 5.5%
interest only, 20% of rent in costs — computed by `stack()`, which is the same
function behind the calculator on the property page. The score and the figure a
subscriber can reproduce cannot disagree, because they are the same code.

The assumptions are versioned with the weights. Change them and the scores mean
something different, so `SCORE_VERSION` moves too. This is v2.

Recalibrating `weekly-mechanic.test.ts` showed the effect: the property that
fixture had used since Phase 4 stopped qualifying, because £1,150 rent on a
£250,000 house clears about £61 a month. That is the correct answer and the
fixture was wrong.

### Sold prices per square foot, because the valuation was double-counting

`/valuation-sale` follows the asking price. A property reduced twice reads as
"below the estimate" partly because of the reductions, so one move earned
points in quality and again in movement.

`/sold-prices-per-sqf` is completed transactions and owes nothing to what anyone
is currently asking. It costs the same one credit, is keyed on the postcode so
the whole search shares it, and it carries the tenure of each comparable sale —
the only tenure signal anywhere in this API.

The valuation is still fetched and still shown, because "8% below the estimate"
is useful context. It is no longer scored.

### Risks are stated, never scored

EPC below E cannot legally be let. Flood risk above low shows up in the premium.
An area where nine in ten sales are leasehold hides a service charge this
product cannot see.

None of them score. A penalty needs a magnitude, and there is no defensible
answer to how many points an EPC of F is worth against a 12% reduction. They
appear next to the property under "worth knowing before you call" and the
subscriber weighs them, which is the same principle as scoring nothing for a
figure we do not hold.

### /build-cost is not called, and refurb cost is not held at all

It prices building from nothing. A refurbishment is some fraction of that, and
nobody can say which fraction without inventing it — which is the assumed
average this codebase refuses everywhere else. Feeding a guessed figure into
"room to add value" would put an invented number inside the ranking, where the
subscriber cannot see it or argue with it.

It also requires `internal_area`, despite the vendor markdown listing only a
postcode. That makes it per-property rather than per-area, so it would cost
about one credit per enriched candidate rather than one per run.

So the calculator opens `refurbCost` at zero and the subscriber types their own
number, which is the one figure in this product they know better than we do.


## Going live on Stripe — 25 August 2026

### The signing secret is written to the file, not printed

Stripe returns a webhook endpoint's secret once, in the create response, and never
again. Printing it puts the only copy in terminal scrollback. `stripe:setup` writes it
straight into `.env.local` and prints which keys it wrote, not what they are.

The same fact is why an endpoint that already exists cannot simply be re-pointed. There
is nothing to read back, so `--recreate-webhook` deletes it and issues a new secret,
deliberately and only when asked.

### Three events, because entitlement is one field

The webhook subscribes to `checkout.session.completed`,
`customer.subscription.updated` and `customer.subscription.deleted` and no others.
Access is decided by `subscriptions.status` in `src/lib/subscription.ts`, and everything
that moves that field fires one of those three. `invoice.payment_failed` is the tempting
fourth, but a failed card sets the subscription to `past_due`, which is an `updated`.

Extra subscriptions are not harmful — the route records an event it does not handle and
returns 200 — but each one is a delivery Stripe will retry if the handler ever 500s.

### `stripe:check` reads, `stripe:setup` writes

Two scripts rather than one with a flag. The money path is the part of this system that
fails silently: a price archived in the dashboard, an endpoint Stripe disabled after a
run of failures, a portal nobody configured. `stripe:check` answers "is it still right"
without the risk of changing anything to find out, and it prints no secret, so it can be
run with somebody watching.

### The live keys are on production only

Vercel preview deployments do not get `STRIPE_SECRET_KEY`. `stripeEnv()` is read at
request time, not at build time, so a preview still builds and only its checkout route
fails. That is the right failure: a live key on every preview branch is a preview branch
that can charge a real card.

### `vercel link` edits two files, and both edits were wrong here

It appends `VERCEL_OIDC_TOKEN` to `.env.local` and `.env*` to `.gitignore`. The token is
a short-lived local credential, and `scripts/vercel-env.sh` copies every line of
`.env.local` into the project — it would have pushed a credential that expires within
the hour into every deployment. The script now skips it by name. The `.gitignore` line
was reverted: `.env*` would have hidden `.env.example`, which is committed on purpose.

## Passwords replace the magic link — 25 August 2026

### Password only, not password and link

The magic link went. Keeping both would have meant two ways in to explain, two ways to
get wrong, and a link that stays a valid path into the account for anyone who reaches
the inbox. Recovery is now the forgotten-password flow, which is the same email with a
narrower blast radius: it can only set a password, and only once.

Cost of the choice: everything now leans on email delivery working, and Supabase's
built-in SMTP is rate-limited. Noted in the README rather than fixed, because at nought
subscribers it is not yet a problem.

### The signup action handles confirmation being on *or* off

Whether a new account is confirmed on creation is a Supabase dashboard setting
(`mailer_autoconfirm`), not a line in this repository. It can be changed by anyone with
the dashboard open, without a deploy and without a test failing.

So the action does not assume. A session in the response means they are in, and it goes
to checkout. No session means Supabase has sent a confirmation link, and the form says
so. Both are correct; neither depends on remembering what the toggle says.

### Errors never say whether an account exists

`Invalid login credentials` becomes "that email address and password do not match", and
the forgotten-password form reports the same outcome for an address that has no account
as for one that does. Splitting either would turn a login form into a way of testing
whether an email address is a customer here.

The exception is signing up with a taken address, which says so. The alternative is
claiming to have sent an email that was never sent, and then the person is stuck.

### Changing a password requires the current one

Supabase's `updateUser({ password })` does not ask for the old password — the session is
enough. That means a stolen session cookie is a stolen account: whoever has it can set a
new password and lock the owner out.

So the account form verifies the current password with `signInWithPassword` before
changing anything. One extra round trip. The reset flow does not ask, because there the
emailed link *is* the authentication and the person may well have arrived precisely
because they no longer know the old one.

Both then call `signOut({ scope: 'others' })`. Someone changing a password may be doing
it because somebody else has it, and a change that leaves the other session signed in
achieves nothing.

### Eight characters, and seventy-two

Supabase's floor is six. Eight is one second more at the keyboard and this account is one
step from billing details.

The ceiling is not a preference. Supabase hashes with bcrypt, which reads the first 72
bytes and ignores everything after. Without the limit a 100-character password would
quietly be a 72-character one, and the user would believe otherwise.

### `safeRedirect` rejects two things that look relative

`?next=` decides where somebody lands holding a fresh session, so it takes paths on this
site and nothing else. Two of the rejections are not obvious: `//evil.example` is a
protocol-relative URL that a browser resolves against another origin, and `/\evil.example`
is the same trick using a backslash browsers normalise into a slash. Both start with `/`
and neither is local. `tests/auth.test.ts` pins them.

### `/reset-password` is a protected route, `/forgot-password` is not

The reset page is listed in the proxy's protected prefixes, which reads oddly for a page
only signed-out people visit. But the reset link is the authentication: by the time the
page renders, the callback has exchanged it for a session. No session means no valid
link, and the proxy turning it away is exactly right.

`/forgot-password` is deliberately absent from the signed-out-only list. Somebody signed
in on a laptop can still have forgotten the password they need on their phone.

## Scoring v3 — 25 August 2026

Nine changes, from one review of v2. Most of them are the same mistake in different
places: a number that looked absolute but was only true somewhere.

### Cashflow is a percentile, because £350 a month is not a national figure

£0 to £350 net was the v2 band. Across the South East nearly every property scores zero
on it; up north nearly every property scores full. A 30-point factor that is constant in
both directions is not a factor, it is a rounding error with a weight.

It is now ranked against the other candidates in the same run. What that costs: the
cohort is a filtered, event-driven set, not a sample of the local market, so on a bad
week the best of a bad bunch takes the factor. Guarded in the one place it matters —
negative cashflow cannot take more than half the factor however well it ranks. Without
that, "everything here loses money" and "this is the best deal this week" are the same
sentence.

### Gross yield against the area was removed rather than reweighted

Cashflow and yield-against-area are both rent over price. Between them they put 45 of
100 quality points on one signal, dressed as two.

Removed rather than trimmed, because trimming keeps a redundant factor and calls it
diversification. What is lost is real and worth naming: yield-against-area anchored to
the whole local market, and a percentile only ranks within the cohort. If the cohort
turns out to be systematically unrepresentative, that anchor is the thing to bring back.

### Reduction and stale went to 35 and 10, not merged

The same correlation argument applies — a property that has been reduced has usually
been on the market a while — but not the same conclusion. A stubborn seller can be stale
without ever reducing, and a motivated one can cut hard in week two. They are correlated,
not identical, so the combined weight came down from 60 to 45 and both stayed.

### Movement sums to 85 and is scaled to 100

A consequence of the above: the weights no longer add to a round number. Rescaling keeps
the two scores sharing a ceiling, which is what stops either dominating by construction.
The alternative — inventing 15 points of weight to hand to whichever factor could absorb
them — would have moved the ranking for no reason anyone could state.

### Quality is a share of what was held, with a floor of three factors

Scoring a missing figure as zero is honest and biased. Floor area is missing far more
often on flats and new builds, so v2 pushed both down the list for a gap in
PropertyData rather than anything about the property.

Normalising over the factors held fixes that and introduces its own problem: a property
with one factor could top the list on it. So the two rules come as a pair — normalise,
but only above three of four held. In practice that means at least one of cashflow or
comparables, because demand is area-level and condition is nearly always held.

### The reduction is cumulative from peak, not the deepest single cut

Three cuts of 5% is a seller talked down three times. One cut of 14% is a seller who
repriced once. The first is the better prospect and v2 scored it at a third of the value.

Writing the test for it found a bug in the first attempt: several reductions can share an
`observedAt`, because price history read in one go dates every step to the day it
happened, and the reducer kept the first of them rather than the last. A property cut
three times in a week read as having been cut once.

### A days-on-market crossing earns no recency

Same reasoning that already excluded `first_seen`: it is dated when the calendar moved,
not when the property did. v2 let a property that merely aged past 90 days collect stale
points, full recency and qualification at once — three rewards for the passage of time.

It still qualifies, and still earns its own stale points. It just is not news.

### Risks gate instead of only annotating

Still never scored — how many points an EPC of F is worth against a 12% reduction is not
a number anybody can defend. But a note alone let a G-rated house on a flood plain lead
the week, which is the failure the note was supposed to prevent.

So severity gates instead. High flood risk excludes. EPC F or G caps the total at 120 of
200 — *unless* the subscriber picked unmodernised, auction or repossessed, in which case
an F is the reason they are looking. Capping the exact stock somebody asked for would be
answering a question they did not ask.

### Room to add value is relative to what was ticked

Every property an unmodernised-only subscriber sees is unmodernised. v2 gave every one of
them half marks for it — a constant with a weight, which cannot separate anything.

Only the lists they did not tick are counted. Tick all of them and the factor is
normalised out rather than scored zero, because for that subscriber it genuinely
distinguishes nothing.

### Short lease is a risk; leasehold-heavy area is nothing

Short lease was earning value-add points. A lease with 70 years left is a bill before it
is an opportunity, and the length — the only thing that decides which — is not a field
this product holds. It is a note now.

Leasehold-heavy area was dropped outright. In central Birmingham it fires on every
property, and a flag that fires on everything conveys nothing but noise.

### What the threshold is a total of, written down

25 of a possible 200, applied to quality plus movement, and only to a property that has
never been shown to that subscriber. One that has needs a new material event instead,
whatever it scores.

It has never been tested against real output — the number was chosen against v2's scale
and v2 never ran. It is the first thing to retune after a live run.

## Investment strategies — 25 August 2026

Scoring v4. Until now the product had one axis and called it strategy. It had two, and
was only ever scoring one of them.

### A sourcing list and a strategy are different questions

A list says which stock to pull out of the market. A strategy says what "good" means once
it is out. The same three-bed is an ordinary buy-to-let and an excellent HMO, and no
sourcing list can tell you which.

Every score before v4 was a buy-to-let score — net monthly cashflow on a single-household
rent, at 25% down and 5.5% interest only. That was never a neutral default, only an
unstated one. Making it a choice is mostly a matter of admitting what was already there.

The old column is renamed to `sourcing_lists` rather than left alone. Two different things
called strategy would confuse the schema, the code and the subscriber, and with no
profiles yet the rename costs nothing.

### Only one factor changes

Price against comparables, local demand and room to add value mean the same thing whatever
you intend to do with a property. The return does not. So the strategy swaps out that one
measurement — 40 of the 100 quality points — and leaves the rest of v3 alone.

That is what makes four strategies cheap rather than four scoring systems. It also keeps
the percentile honest: each strategy is ranked against its own cohort, so a room rate is
never compared with a refinance.

### A property is ranked by its best strategy

A subscriber who runs two strategies gets one list, not two. Each property is scored under
both and ranked by whichever suits it better, carrying the others' totals so the card can
say "best as an HMO — buy to let 96".

The alternative, a section per strategy, splits a list of five into two lists of two or
three and makes the page harder to read for no gain.

### BRRR is scored on money back out, not cashflow

The point of the strategy is to recycle the deposit. A BRRR that cashflows nicely and
leaves £40,000 stuck in the wall has failed at the thing it was for, and scoring it on
monthly cashflow would call that a success.

### We ask for the two figures we do not hold

A refurbishment cost and a nightly rate are the two numbers these strategies live on, and
PropertyData publish neither. `/build-cost` prices building from nothing — the fraction of
that a refurbishment costs is the invented number this codebase refuses everywhere else —
and across all 69 endpoints there is no nightly rate and no occupancy figure at all.

So the subscriber supplies both. That is not a workaround, it is the same decision already
made for the calculator: these are figures an investor knows better than any data feed
does. A strategy missing its figures is skipped for the run and logged, never scored on a
guess.

It also avoided a second data vendor, which would have meant reworking the rule that
exactly one module may spend money — the rule `tests/module-boundary.test.ts` enforces.
The seam is clean: swap those two inputs for a market feed and nothing else changes.

### R2SA was on the "not building" list

The original brief names R2SA analytics under "explicitly not building", with "ask before
adding any of these". It was asked about, the data gap was put plainly, and it was chosen
anyway. Recorded here so the brief and the build do not silently disagree.

### A strategy is a fixed set in code, not a row in a table

Sourcing lists are a table because they are data — an id and a radius the API enforces.
A strategy is a scoring function. A row without a function would let somebody store a
strategy nothing can score and publish a list ranked on nothing, so the trigger checks
against a literal list and the schema validation drops anything this build cannot score.

Both fall back to buy-to-let rather than to nothing, because that is what every score
meant before this change.

### Only pay for what the strategies need

`/rents-hmo`, `/national-hmo-register` and `/development-gdv` are area-level like the six
already fetched, so they cost a credit per run rather than per property. They are fetched
only for a profile whose strategies use them: a buy-to-let subscriber never pays for HMO
room rates. Worst case a run goes from six area credits to nine, against a ceiling of 100.

## Deal progress — 25 August 2026

### It is append-only, because the current stage is not the point

A `stage` column on a table of tracked properties answers "where is this now". The reason
for building this is the other question: how many complete, and how long each step takes.
Neither is answerable from a column that gets overwritten.

So every transition is a row with the moment it happened, and the current stage is the
newest one. Same reasoning as the watchlist — it cannot fall out of step with the history
because it is the history.

### Two ways out, kept apart

Six forward stages and no exit means a dead deal sits at "viewing" for ever, and the
completion rate reads far higher than the truth. That is worse than not measuring it.

Passed and fell through are separate rather than one "dropped". Passing is choosing not to
proceed, which says something about the properties being surfaced. Falling through is
losing it after an offer, which says something about the market. They need different
fixes, and one label would hide which was happening.

### No UPDATE policy at all

A correction is another row. Moving backwards is a real thing that happens to real deals,
so it is allowed, and recording the same stage twice is harmless — it says somebody came
back and confirmed it.

Deleting is permitted, for a mis-click, and the wording in the app says so. A deal that
ended should be `passed` or `fell_through`. A funnel that quietly drops its failures is
not a funnel.

### The aggregate carries no owner_id, and cannot get one

`deal_progress_funnel` and `deal_progress_durations` are `security_invoker` views, so a
subscriber querying them sees their own rows aggregated and the service role sees
everyone's. Neither selects an owner and neither can be joined back to one.

The question is "do the properties we pick complete". Answering it does not require
knowing whose deals they were, and a product that quietly assembles a per-customer view of
someone's negotiations is a different product from the one being sold.

### Not called a pipeline

That word already means the Sunday run in this codebase. Two things called pipeline would
have been the second naming collision of the day, after `strategies`. It is
`deal_progress` in the schema and "Deals you're working" in the app.

### The RLS test skips rather than fails when it is not migrated

`tests/rls.test.ts` checks isolation against a real project, and a table that has not been
created yet is a deployment fact rather than a broken guarantee. It skips with a printed
reason, the same way the whole file skips without credentials.

Worth noting for the next person: PostgREST answers a missing table out of its schema
cache, so the code is `PGRST205` rather than Postgres's `42P01`. Checking only the latter
made the test fail rather than skip.

## Scoring v5, and the standing list — 26 August 2026

The product is deal sourcing. It had been built as an events feed, and the difference
turned out to be two rules rather than a rewrite.

### A deal earns its place by being a good deal

Movement was half the total. That meant a property listed yesterday, with no history and
nothing having happened to it, could reach at most 100 of 200 however good it was, and
lost to anything decent that had been reduced.

Measured on identical properties: quality 62.5 on both, one of them cut 12% and 200 days
unsold. The new listing totalled 62.5 and the mover 107.6. To beat it, an identical new
listing would have needed 45 more quality points, which is 45% of the entire quality
scale.

Movement now counts for half of what it did. A seller who has cut twice and sat a year is
telling you something worth knowing, and it is worth less than the property being a good
buy in the first place.

### Whether a property appears is decided on quality alone

The old threshold was 25 of a combined 200, which movement could carry on its own. A 20%
reduction on something that loses money every month is still something that loses money
every month, and showing it because the seller moved is the padding this codebase refuses
everywhere else.

The floor is now on quality, out of 100. It is partly relative, because 40 of those 100
come from a percentile against the rest of the run. That is a known consequence of v4's
percentile rather than a new one, and worth remembering when the floor is retuned.

### The list stands until the subscriber removes something

A property used to need a first sighting or a fresh material event to appear, enforced
twice: in `qualifies()` and by a unique index on `deal_impressions`. The best deal in an
area therefore became invisible in week two, purely because it had already been seen.

A sourcing product that hides its best deal because you looked at it once is not sourcing.
So a property stays while it stays good, and leaves when the subscriber says it is not for
them. Events keep their job of saying what changed, and `changed_since_seen` marks it.

What this costs: the list no longer refreshes itself into novelty every week, so a quiet
area shows the same properties for a while. That is honest. They are still the best deals
in it.

### Removal is the `passed` stage, not a second table

Marking a property passed in the deal tracker and taking it off the sourced list are the
same decision. Two mechanisms for one decision is how they drift apart, so removal reads
the newest `deal_progress` row and treats `passed` as off the list. Putting it back is
another row, which is why the tracker is append-only.

### The test that encoded the old guarantee was deleted, not adapted

`tests/weekly-mechanic.test.ts` asserted that a property "is shown when something happened
to it, and is not shown again until something else does", and the README called it the
guarantee the whole product rests on. That guarantee is now deliberately inverted.

`tests/standing-list.test.ts` replaces it and asserts the new one over the same fifty-two
weeks: it appears in all of them, is flagged the week it is cut and not the week after,
goes the moment the subscriber removes it, and falls off on its own when the asking price
rises far enough that it stops being a good buy.

## The first run, and one strategy fewer — 26 August 2026

### The dashboard runs the opening backfill itself

A subscriber signed up, paid, answered the questions, and got an empty dashboard with a
note saying the list would arrive on Sunday. That is a bad first five minutes for £29,
and it was avoidable: the run is a function and nothing was stopping us calling it.

`POST /api/runs/first` does it on demand. It is guarded four ways because it spends real
credits — a session, an active subscription checked with the service role, the backfill
not already done, and no run already in flight — and the last two are what make it safe
against a double-click, a refresh, or a second tab.

It runs while the subscriber watches, with a panel that says what is happening. Sourcing
a whole area is a few minutes of rate-limited calls, so this is the one place in the
product where somebody waits, and a spinner would be worse than a sentence.

The Sunday cron is unchanged and still handles everyone from then on.

### The opening list is five

Five they can act on beats twenty-five they have to triage, and the opening list is the
moment somebody decides whether they wasted their money.

### Serviced accommodation is gone

It was the one strategy scored entirely on figures this product does not hold. Across all
69 PropertyData endpoints there is no nightly rate and no occupancy, so it ran on two
numbers the subscriber typed in, and a strategy where every input is a guess is a
calculator rather than a sourcing product.

Removed from the code rather than hidden in the UI. A stored strategy that nothing can
score would publish a list ranked on nothing, so the trigger, the type and the scoring
function all go together, and anyone who had picked it falls back to buy to let.

The seam it left is clean. If a short-let feed is ever bought, the strategy comes back as
one definition and one return function.

### The rename in 0008 missed a second trigger, and it would have burned the trial

`0008` renamed `search_profiles.strategies` to `sourcing_lists`. It updated
`validate_search_profile()` and missed `reset_backfill_on_search_change()`, which fires
BEFORE UPDATE on the same table and still read `new.strategies`. Since that migration was
applied, every update to a search profile has failed with 42703.

It surfaced when `0011` tried to update a profile row. The more expensive path was quieter.
The end of a run sets `backfill_completed_at`, and that write was not error-checked, so it
failed silently and the backfill was never marked done. The dashboard runs the backfill
whenever that flag is null, so the first-run feature would have re-sourced the whole area
on every visit and spent a full run of credits each time, against a trial that does not
renew.

Three things came out of it:

- The function is fixed, and investment strategies are deliberately not in it. Changing
  how a property is scored does not mean the area has to be sourced again.
- That write is now error-checked and fails the run loudly. A silent failure there is a
  loop, so it is not allowed to be silent.
- `/api/runs/first` gained a second guard that does not depend on the flag at all: it
  refuses when a backfill run has already finished for that owner, which is a row the run
  itself wrote. One guard depending on a write that can fail is not a guard.

The lesson worth keeping: a column rename is not done when the code compiles. Postgres
function bodies are not checked until they run, so `grep` for the old name across every
function body is part of the rename.

### The cap is on the intake, not on the list

Publishing was capped at twenty-five per run, which quietly made twenty-five the size of
the list: the standing list works by re-publishing everything that still qualifies, so a
cap on the run was a cap on the total. The twenty-sixth best deal fell off, which
contradicts the rule that a property stays until the subscriber removes it.

So the two are separated. `selectForPublication` keeps every standing property and takes
at most five new ones, and there is no total ceiling at all. A property does not stop
being a good deal because a better one turned up this week.

The list is bounded by the two limits that mean something: the quality floor, and the
subscriber removing what they are done with. Neither is arbitrary, which a number like
twenty-five was.

A consequence worth watching: in a busy area the list grows by five a week and nothing
sheds it but the subscriber. If that turns out to be too much to work through, the answer
is a higher quality floor rather than a cap, because a cap silently drops good deals and
a floor says why.

### A thin week is about what arrived

`thinReason` counted everything published, so a subscriber working fourteen deals with
nothing new would have been told they had a thin week. It counts the intake now, and says
plainly that everything already on the list is still there.

### Watching and tracking were one decision asked twice

Two buttons sat side by side on every card. "Watch" added a row to `watchlist` and told
you when the property moved. "Track this" started it through the deal stages. The person
who commissioned the product asked what the difference was, which settled it: if the
answer is not obvious to them, a subscriber has no chance.

There was not really a difference worth keeping. Somebody working a deal towards an offer
wants to know when the price moves; somebody who has passed on one does not. So the watch
follows the stage — live stages watch, terminal ones stop — and the star is gone.

`/watchlist` redirects to `/deals`, and what has changed is shown there, above the deals
it changed on. The table, the derivation and the per-row cut-off are all unchanged; only
the second question is gone.

What this costs: there is no longer a way to follow a property without putting it in the
pipeline. The `interested` stage is that, and it was already the first thing the old
"Watch" button meant.

## A wider search, and saying what decides the size of a list — 1 September 2026

### The radius ceiling was PropertyData's default, not their limit

Forty miles was where the profile `CHECK` stopped, and forty was the default on
`/sourced-properties` rather than its maximum, which is two hundred. Forty miles of
Greater Manchester is a market; forty miles of Cumbria is a field. Somebody in a thin area
was being handed a short list by a number nobody had chosen on purpose.

It is a hundred now. Two hundred was available and refused: past a hundred miles a "local
area" is a region, and a subscriber who would buy three hours from home is not sourcing an
area, they are sourcing a country.

### The per-list cap clamps the search rather than refusing to save it

`unmodernised` and `slow-to-sell` reject a radius over thirty miles, `large-plot` over
twenty. `0005` refused to save a profile wider than the narrowest list it asked for,
because at the time a run that asked for more failed outright.

The run has clamped since. One call carries every list, so it asks for the smallest
maximum among them and logs `radius_clamped`. The trigger was a second no to a question
already answered, and it was the wrong no: it stopped somebody searching eighty miles for
reduced properties because they had also ticked large plots.

So the trigger stops checking and the form explains instead — which list is holding the
search, and what it will actually run at. A clamp somebody can see and undo beats a
validation error that tells them to want less.

What this costs: a mixed selection still searches at the narrowest cap, so ticking large
plots quietly narrows everything else. Splitting the run into one call per cap group would
fix it and would cost a credit per group per run, which is not worth it until somebody
actually hits it.

> **Superseded 4 September 2026.** Two claims above are wrong. "The run has clamped
> since" was never true — `allowedRadius()` read a table renamed by `0008` and had
> been silently returning the unclamped radius since 26 August. And the costing is
> wrong: the endpoint charges per result, not per call, so the tiers share one page
> rather than buying one each. See "Splitting the sourcing call, and three floors that
> were set wrong".

### The list is what qualifies, not a number we promised

The site said five, in the footer, on the sign-up page, in the metadata and twice on the
front page. The product has never guaranteed five: the intake is capped at five new a
week, the list keeps everything that still stacks, and a thin week publishes fewer and says
why.

Promising a number invites the only complaint the product cannot answer — "where are my
other three?" — and the honest answer is better marketing anyway: you get what clears the
bar, and how much that is, you control. A wide radius and loose filters fill the list; ten
miles of a quiet market may hold two.

So the number is gone from the copy and replaced with what decides it. The onboarding form
says the radius is the biggest lever, on the screen where somebody sets it. A new question
on the front page answers "how many will I get" with the levers rather than a figure.

## The refurbishment cost moves to the property — 2 September 2026

### Asking for it on the onboarding form was asking at the wrong moment

A flip is scored on what the works cost, and this product holds no such figure,
so the form asked for one: pounds per square foot, before the subscriber had
seen a single property. Almost nobody knows what a rewire costs per square foot
in the abstract. They know when they are looking at the house.

So the question is gone from the form and the decision happens on the property,
where there is a floor area, an asking price and a local end value to put it
against. Three bands, the works priced for that property in each, and a box for
their own figure. Everything recomputes in the browser: the works, the cash in,
the value after works, and what is left in after a refinance at 75%.

### The ranking assumes a full refurbishment, and says so

Something has to be assumed or a flip cannot be ranked at all, and a strategy
that silently scores nothing is worse than one that scores on a stated band. So
the run uses £75 a square foot — the middle of the full-refurbishment band — and
the score line says `£63,750 of works at £75/sq ft — a full refurbishment,
change it on the property`.

That is a stated average inside a ranking, which this codebase has refused
everywhere else, and the difference is worth being honest about: it is in the
open, it is named, it is one click from being changed, and every other factor in
the score still refuses to invent anything. A subscriber who sets their own
figure on their account is still preferred over the band.

The alternative was leaving BRRR unscorable for anybody who had not filled in a
box, which is how it behaved until today.

### `STRATEGY_FINANCE` moved to `@/lib/strategies`

The property page runs the same arithmetic in the browser as the pipeline runs
on the server. If the deposit, the rate or the refinance LTV differed between
them, the page would quietly argue with the score printed above it, so both now
read the same constant.

## The fixes before launch — 2 September 2026

Seven things, in the order they mattered. Two of them turned out to be
investigations rather than bugs, and saying which is which is the point of
writing them down.

### A delisted property was already off the list, and a delisted *deal* was not

The first question was whether a property that had left the market stayed
visible. On the list, no: the list is built from what came back in the payload,
a delisted property is not in the payload, so it falls off on its own. That part
was right by construction.

What was wrong was everything after the list. `listTrackedDeals` joins
`properties` with no filter on state, so a house somebody had marked
"interested" in and which sold two months ago sat in "deals you're working" on
the dashboard for ever, looking live. The one place a stale property does real
damage is the place the list mechanic never reached.

So `no_longer_listed` now closes the deal out, into a terminal stage of its own:

- **`delisted` is not `passed`.** Passing is a judgement the subscriber made
  about a property we surfaced, and counting a seller's withdrawal as one would
  put a fault in exactly the numbers the deal tracking exists to produce. It is
  not `fell_through` either, which is losing it *after* an offer and says
  something about the market rather than about the property going.
- **Only deals below an offer are closed.** A property under offer to you comes
  off the portals — that is what an accepted offer looks like from the outside —
  so a run that marked those delisted would record somebody's own purchase as a
  lost deal. Those keep their stage and the row says "No longer listed" instead,
  which is the honest version of what we actually know.
- **It is the one stage the subscriber cannot enter.** `systemOnly` on the
  definition, refused in the server action, and shown in the select as the
  current value rather than offered as a choice. Nobody chooses to have a
  property withdrawn.
- **It is out of the completion denominator.** A deal that ended because the
  seller left is not a deal that failed, and dragging the rate down with it would
  make the rate mean less, not more.

Two things came out of it that were not asked for and are the same bug:

**Sold subject to contract was still on the list.** SSTC properties *do* come
back in the payload, and nothing filtered them, so the most common route to
"this house sold months ago" was untouched by fixing the rarer one. It is now
`under_offer` and off the live list — kept apart from `delisted` because a
collapse fires `returned_to_market`, which puts the property straight back with
one of the best headlines this product has.

**The progress meter read a dead deal as nearly complete.** All three exits sit
at step six so a mixed list sorts sensibly, and the meter took that as the reach
— drawing a deal abandoned at "interested" as five-sixths done. It reads the
furthest forward stage out of the history now.

### The EPC cap was right in the code and wrong in the README

The README said the cap was 120 of 200. `RISK_CAPPED_TOTAL` is 90, and the
ceiling has been 150 since scoring v5 halved movement. The 200 was left over from
the era when quality and movement were each worth 100 and both counted in full.

Nothing to fix in the pipeline. 90 of 150 binds, and binds about where it should:
a property with an EPC of F cannot lead a week on the strength of a seller who
has been cutting, and can still appear on a thin one.

The same 200 was still in the score breakdown the subscriber reads, in a sentence
that also said the two scores were "added, not blended" and that movement "is
what puts it on the list" — one stale number and two statements the product had
since reversed. Documentation drift in a README is a nuisance; the same drift on
the page explaining the score is the product lying about how it works.

### The score is displayed as a band. The score is unchanged

A strong new listing — perfect on quality, no movement because nothing has
happened to it yet — comes to about 100 of 150. Printed as a fraction that reads
as 67%, which is a C, on the best property in somebody's area. The ceiling needs
a property to be *both* an excellent buy and to have a seller who has been
cutting for a year, which is rare by construction, so most of a good list sat in
the sixties and presented as mediocre.

The arithmetic is untouched and the breakdown still shows every point out of 150.
The card, the dashboard tile and the appearance history show a band —
Modest, Fair, Good, Strong, Exceptional — and the meter fills by band rather than
by score, because a bar two-thirds full is a percentage by another route.

The bands are set against what the scale can produce rather than against 150:
50 is the real floor, since nothing qualifies below that on quality; 100 is a
property with nothing wrong with it; above that is a good buy whose seller is
moving too.

### The strategy return is percentiled against the area, not against the Sunday

Forty of the hundred quality points were a percentile against the other
candidates in the same run. Right in principle — an absolute band does not
survive leaving one part of the country — and wrong in what it ranked against,
in two ways that a standing list makes serious:

- A property could fall under the quality floor because *other* properties
  improved. Nothing about it changed. A standing list is a promise that a
  property leaves for a reason, and a reason has to be about the property.
- A score meant something different every week and something different for every
  subscriber, so nothing was comparable across either — which is the ground the
  completion figures are supposed to stand on.

`strategy_return_observations` is the fix: every run records what it measured,
and later runs percentile against a ninety-day window of that. The run's own
values are folded in with the window, so today's market is represented and the
property being scored is present in its own cohort, which is what `percentile`
assumes. Below thirty observations the window is ignored and the run is the
cohort, exactly as before — thirty values is enough for a place in an order to
mean something and a dozen is not.

**Keyed on the outward code of the search postcode, not the property's own.** A
window is read for the search that is running, so it has to be written for the
search that found the property; keying on the property would file a Portsmouth
house found from Southampton under Portsmouth and then never read it back for
either. Radius is deliberately not in the key, so two subscribers on M14 at ten
and forty miles share a window — a score has to mean the same thing for both of
them or nothing can be compared. The cost is that the wider search contributes
values from further out, which is a fair trade for a window dense enough to be a
percentile at all.

**Every measured property goes in, not only the published ones.** The window is
what the area offered, not what we chose out of it. Filtering it to the winners
would make every later percentile a percentile against a list of winners.

No owner_id and none derivable. These are dated observations of a market, which
is the derived material the licence lets us keep, and the table has no policy for
`authenticated` at all — the pipeline writes it and the pipeline reads it.

A side effect worth having: a lone candidate in a quiet week used to score half
the factor by definition, because a cohort of one has no ranking to give. It now
gets a real place. That is also the first thing that makes the quality floor
tunable, since the floor was previously being compared against a scale that moved
every week.

### The area is counted before the card, not after

Somebody in a sparse area could pay £29 and then discover their list would be
two. One `/sourced-properties` call answers it, so it now runs at the end of
onboarding and before Stripe.

The flow is reordered: signup goes to the questions, the questions end on the
count, and the count has the button to checkout. `requireSubscriber` checks the
profile before the subscription for the same reason.

- **It costs about twenty credits at the very most**, at one credit per ten
  results, and a thin area — the case this exists for — costs a fraction of that,
  because there is little to charge for. That is the right way round.
- **A repeat of the same search is free.** The answer is stored and handed back,
  so a refresh, a back button or a second tab buys nothing.
- **Three per allowance period**, so it cannot become a free market search for
  somebody who never intends to subscribe. *(Not sufficient on its own — accounts
  are free, so this is three per email address. Two limits that are not the account
  were added on 4 September.)*
- **It never blocks the subscription.** A failed check says so and offers the way
  on. Somebody who wants to subscribe without the number is entitled to.
- **The wording refuses to let a stock count read as a promise.** It says plainly
  that this is what the search has to work with before scoring throws most of it
  away.

### Widening the radius has its own allowance

The three-change cap exists so nobody re-sources a different part of the country
every week. It was landing hardest on the subscriber it should have been helping:
the one with a thin list, whose fix is to widen — which the onboarding form tells
them, in the sentence next to the control. We rationed our own advice, three
tries and then locked out for the month.

A widening is now counted separately, three of its own. Still bounded, because it
still costs a backfill; bounded by something only widening can spend. A narrowing
is not exempt: it resets the backfill like any other move, and nobody widening a
thin search narrows it on the way. Neither is a postcode change that happens to
widen at the same time, or the exemption would pay for the move.

### The dashboard leads with what moved

By week twenty the list is largely the list the subscriber already worked
through, and the reason to open the page is not the list — it is what changed on
it. That was a dot on a nav item, which is where you put something you do not
mind being missed.

`WhatMoved` is now the first thing on the page: "three properties on your list
moved this week, one you are working". Two sources merged into one lede — a
standing property whose qualifying event landed since they last looked, and an
unread event on a deal in the pipeline — with the worked ones first, because a
price cut on something you have an offer in on is the most time-sensitive thing
in this product. One row per property, or the count above it would be a lie.

Both come from rows the run already wrote. Nothing here costs a credit and there
is still no notifications table.

## Splitting the sourcing call, and three floors that were set wrong — 4 September 2026

### `allowedRadius()` had never once run

The clamp described in the 1 September entry above — "the run has clamped since" —
was not true and had not been true since 26 August. `allowedRadius()` read
`strategy_lists`. `0008` renamed that table to `sourcing_lists`. The query has
returned an error ever since, and the line under it was

```ts
if (error || !data?.length) return profile.radius_miles
```

which reads a missing table and a list with no cap as the same thing: no clamp
needed. So the guard reported success by returning the unclamped radius, every
time, for three weeks.

What that cost: any profile above thirty miles with `unmodernised-properties` or
`slow-to-sell-properties` ticked — or above twenty with `large-plot` — sent a
radius the API rejects. `/sourced-properties` answers 1103, which is
`call_failed` rather than fatal, so the run for that subscriber ended at step one
and the batch walked on. No list that week. No list the following week either,
because nothing about the profile had changed. The subscriber saw an empty
dashboard and the only signal anywhere was a `pipeline_runs` row with status
`failed`.

Two things are worth taking from this beyond the fix. The first is that a
fallback which returns *the value that means "no problem"* cannot report a
problem, and this one was three lines long and looked defensive. The second is
that a rename in a migration is not finished when the SQL is: `0008` renamed the
table in Postgres and in `validate_search_profile()`, `0011` found and fixed a
second function it had missed, and this was the third caller — in TypeScript,
where no migration was ever going to find it. Grep for the old name across the
repo, not across the schema.

### The call is split by cap, not clamped to the narrowest

This supersedes the trade recorded on 1 September, which was "splitting the run
into one call per cap group would cost a credit per group per run, which is not
worth it until somebody actually hits it". The costing was wrong, and once the
clamp was actually working the behaviour would have been bad anyway.

The costing first. `/sourced-properties` charges one credit per ten *results*,
not per call, so three calls only cost three times as much if you ask each of
them for a full page. `planSourcingTiers` splits one page between the tiers
instead, in proportion to how many lists each carries — at forty miles that is
60 results across the five uncapped lists, 30 across the two capped at thirty,
and 10 for `large-plot`. Same page size, same credits, three calls instead of
one. Shares are rounded to whole tens because a tier asking for seven results is
charged the same credit as one asking for ten.

The behaviour second. Clamping means one ticked box silently changes the radius
of every other box: tick `large-plot` at forty miles and the seven lists that
would happily have searched forty are searched at twenty. The form said so, which
is better than not saying so, but "your search will run at 20 miles, not 40" is a
strange thing to make somebody accept when only one eighth of it needed to.

Each list is now searched at the widest radius it accepts and the results are
merged on `listing.key`, unioning the `lists` arrays — a house that comes back
from two tiers is one candidate that was found in two situations, and dropping
half of that would both under-describe it on the card and under-score it on
`Room to add value`. A subscriber whose lists all reach their radius is one call,
exactly as before. Three is the worst case there is.

### The data floor is a weight, not a count

`MIN_QUALITY_FACTORS = 3` meant three of the four quality factors had to have data
behind them. The trouble is that the fourth factor is not equally available to
everybody. `Room to add value` scores a property against the value-add lists its
owner did *not* ask for, so for a subscriber who ticked all three it can never
discriminate and is normalised out of every score they ever see. Three of four
then quietly became three of three — for that subscriber only.

The effect is that one missing floor area dropped their property entirely rather
than ranking it on what was held, which is precisely the outcome normalising over
the factors held exists to prevent. The strictness of the gate moved with a
checkbox on the onboarding form, and nothing about that checkbox suggested it
would.

`MIN_QUALITY_WEIGHT = 45` does not move. In practice it is one of cashflow or
comparables plus the area-level demand figure — the same bar the count was
reaching for, stated in something that means the same thing for every subscriber
whatever they ticked. Demand is area-level and held for every property in a run
or none of them, so the real content of the rule is "cashflow or comparables",
which is what the old comment claimed the count meant.

### A percentile needs a cohort, and below thirty values there isn't one

Forty of the hundred quality points are a percentile: where this property's
cashflow sits against the same measure taken in the same area. `return-window.ts`
supplies ninety days of history for that and falls back to the run's own
candidates where the area has less than `MIN_WINDOW_SAMPLE` of it.

That fallback is fine on a backfill, which draws five hundred properties and is a
large cohort by itself — so the cold start is not, as it first looks, a problem
with everybody's first run. It is a problem with thin ones. A weekly run in a
quiet market can produce four scorable candidates, and `percentile` over four
values is not a measurement: it is one property's rank among three others, worth
up to forty of a hundred points, deciding which of them clears the quality floor.
A single property arriving or leaving moved everyone else's score.

Below `MIN_RANKING_COHORT = 30` combined values the factor is no longer ranked.
It scores evenly and the detail line says why, so the breakdown cannot imply a
precision that was not there. Three properties in that order:

- **It keeps its availability.** Withholding the factor instead would cost the
  property forty points of available weight and push it under the floor above,
  which is the opposite of not penalising a thin area.
- **A property below water still scores zero.** Losing money is a fact about the
  property; no amount of missing company makes it half true.
- **The run is then ordered by comparables, demand and movement**, which is
  honest — those are the factors that actually have data behind them that week.

### The top band was empty rather than rare

`Exceptional` began at 120 of 150. Movement counts for half, so it contributes at
most 50 — and a movement score of 100 needs a property cut by a fifth, returned
from a fall-through, unsold for over a year *and* moved this week, all at once.
120 therefore asked for a near-flawless property with every one of those true. A
five-band scale that behaves like four is worse than a four-band scale, because
the band that never appears is the one people look for.

`Strong` had the same problem one step down. A flawless property that nothing has
happened to scores 100 — the best thing this product can find in a quiet week —
and sat five points inside a band starting at 95.

Strong now starts at 90 and Exceptional at 112, so a flawless-and-settled property
is comfortably Strong, and Exceptional is that property with a seller who has
genuinely moved: quality in the mid-eighties with a movement score around 55.
Rare, and reachable. The arithmetic behind the total has not changed and the
breakdown still shows every point of it; only the words over it moved.

### A quota counted per account is not a quota when accounts are free

The area check spends a credit before anybody has paid. It is capped at 25 credits
a call and three calls per account per allowance period, and the 1 September entry
recorded that as sufficient. It is not: accounts are free, unlimited, and need
nothing but an email address, so "three per account" is three per email address. A
hundred throwaway signups is 7,500 credits — more than the subscription the
exercise was pretending to consider. Counting a quota in the one unit an attacker
mints for nothing is a unit conversion, not a limit.

Two bounds that are not the account, then:

- **`PROBE_IP_DAILY_LIMIT = 6`**, per origin per rolling day. Catches the cheap
  version — one script, one machine, many addresses — and is loose enough that a
  household or an office behind one address is never the one it stops.
- **`PROBE_DAILY_CEILING = 60`** unpaid probes across the whole product per
  rolling day. The backstop, which does not care how the probes were spread. Worst
  case is about 1,500 credits a day and the realistic case is far below it,
  because a sparse area — the case the feature exists for — returns almost nothing
  and is charged for almost nothing.

Both count only probes that actually spent something, so a repeat of the same
search, which is served from the stored answer, is never rate limited. A
subscriber skips both: they have paid, and the ceiling exists to bound what people
who have not can spend. Origins are stored as SHA-256 salted with the service role
key — enough to tell two requests apart, and not a table of IP addresses.
Rotating the key rotates the counter, which is a fair price. The 429 does not say
which limit was hit, because that tells somebody probing it exactly what to spread
their signups across.

### Considered and reversed: dropping the fourth question

The fourth onboarding question — which situations to look for — was removed for
about an hour, on the argument that it makes people narrow their own pool before
they have seen a property, and that the answer is more useful on the card than on
the form. It is written down because the argument is a reasonable one and will be
made again.

It was reversed. The question stays. What survived from the attempt is the part
that was never contingent on it: each property now carries the situations it was
found in as badges on the card, ordered by how much they say about the seller
rather than alphabetically — repossession and auction before price reduced — with
the full set on the property page. The reasons underneath say why a property
scored well; the badges say why it was looked at, and on a list built from four
ticked boxes those are different questions.

Note for anyone reviving the removal: `Room to add value` scores a property
against the lists its owner did *not* tick, so searching every list for everybody
makes that factor carry no information for anybody and normalises it out of every
score in the product. The data floor above already survives that. It was written
that way for this reason.

## Trading disclosures, legal routes and the cancellation acknowledgement — 4 September 2026

### The product is research, not an introduction

A deal sourcer introduces a specific property to a specific buyer and is paid
when that buyer completes. That is estate agency work under the Estate Agents
Act 1979, and it brings anti-money-laundering supervision, redress scheme
membership and a set of disclosure duties with it. None of which we have, and
none of which we need — because it is not what this does.

What this does is analyse everything publicly listed in an area against the way
somebody invests, publish the arithmetic, and charge the same £29 whether they
buy four properties or none. Nobody is introduced to anybody. No fee ever turns
on a completion.

The trouble was that the site said otherwise in a handful of places, and the
thing a regulator reads is the website. The page title was "Sourced deals for
how you invest". The README opened "a £29/month deal sourcing subscription".
Those describe an activity we do not carry out and are not registered for, and
the fix costs nothing because the accurate description is also the better sales
copy: we sell research, and research you can check.

Kept deliberately: the comparison table and the FAQ both name a deal sourcer, in
order to say we are not one. Those are protective, and removing them would
remove the clearest statement on the site of what we are not. `tests/positioning.test.ts`
encodes that distinction — it fails on a self-description and ignores a line that
is drawing the contrast.

Also kept: `sourcingLists` and its relatives, which are the internal name for
which PropertyData endpoints a search draws on. That is a variable name, not a
claim about what the business does.

### The disclosures are a component, not a page

Companies Act 2006 trading disclosures and the E-Commerce Regulations 2002 both
require the registered name, number, registered office and a contact address on
the website. "On the website" means every page, which is why `LegalFooter` is a
component rendered by all three frames — the marketing footer, the signed-in
`AppShell`, and the signed-out `AuthShell` — rather than a `/legal` page somebody
can find if they look. `/legal` exists as well, because the footer is a line and
the disclosures deserve to be stated properly once.

The values live in `src/lib/company.ts` and not in the environment. None of it is
secret — publication is the entire point — and a legal requirement that must
appear on every page of a live site should not be able to vanish because a
variable was not copied into a new deployment.

`Prop Signal` is a trading name. `Welto Limited` is the company, and the
disclosures name the company. That distinction is the one the rules exist to
make, so the constants keep the two apart and a test fails if they are ever
collapsed into one.

### The legal routes block the build while they are scaffolds

`/terms` and `/privacy` exist, are linked from every footer and from checkout,
and render placeholder content. The wording is coming from the business owner.

A terms page reading "sample text" in production is worse than no terms page,
because it looks like the question was answered. So `scripts/check-legal.ts` runs
as `prebuild` and exits non-zero while either document has `placeholder: true`.
`next build` therefore cannot complete and Vercel cannot deploy.

**This is a deliberate deploy block and it is currently active.** Until the real
wording lands, production stays on whatever was last deployed. That is the
intended trade — it is better to sit still than to publish an unapproved
agreement — but it does mean the trading disclosures above are also waiting
behind it. To release: put the wording in `src/lib/legal.ts`, set `lastUpdated`,
set `placeholder: false`.

The check reads a flag the documents set about themselves rather than grepping
for a phrase, so it cannot be defeated by rewording the placeholder.
`tests/legal.test.ts` pins the same rule for anybody who removes the prebuild
step.

### The cancellation acknowledgement is stored as words, not as a boolean

Under the Consumer Contracts Regulations 2013 a consumer buying at a distance has
fourteen days to cancel. The right survives the service starting *unless* they
expressly requested it start inside those fourteen days and acknowledged what
that costs them.

That is not a technicality here. The opening list is built within minutes of
payment, draws on the whole standing inventory of an area, and is the most
expensive thing this product does — a 150 credit backfill ceiling against a £29
subscription. Without the acknowledgement on record, somebody can take delivery
of the entire first month's value and unwind the purchase, and we have already
spent the money producing it.

Three choices in how it is recorded, each of which is the difference between
evidence and a flag:

- **The exact wording is stored, not just a timestamp.** What matters in a
  dispute is what the person was shown. "They ticked a box" is not an answer to
  that. Wording changes get a new version and old records keep saying what they
  said, so `ACKNOWLEDGEMENT_WORDING` is append-only.
- **The wording is resolved on the server from a posted version**, never read out
  of the form. A form that carries its own wording can be edited before it is
  submitted, and an acknowledgement the customer could have authored is worth
  nothing.
- **It is written before the Stripe session and with the service role.** Before,
  so the evidence exists even if Stripe fails afterwards; service role, because
  0001 revoked column updates on `accounts` from `authenticated` and nobody
  should be able to back-date their own acknowledgement. A failed write refuses
  the checkout rather than selling the plan anyway — the record is the reason we
  are allowed to keep the money.

The tick lives above the three plan cards rather than beside each button,
because a term discovered after the decision is a term nobody really made. The
buttons disable without it, but that is a courtesy: the rule that holds is in
`/api/stripe/checkout`, which refuses a POST that does not carry a valid
acknowledgement — and a POST does not have to come from a page that has the
checkbox on it.

Stored on `accounts` rather than `subscriptions` because the tick happens before
Stripe has created anything. The version is also written into the Stripe
subscription metadata, so the two records can be reconciled.
