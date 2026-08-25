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
