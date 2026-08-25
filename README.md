# Prop Signal

A £29/month subscription for UK landlords and property investors. Pick an area and a
strategy, and every Monday morning five properties are waiting in the dashboard, each
with the numbers stacked and a stated reason it is on the list this week.

The five are event-driven, not listing-driven. What has *moved* — reduced twice, back
on after a fall-through, 140 days unsold — beats what merely appeared. That comes from
our own week-on-week diffing.

## Where the build has got to

| Phase | What it covers | Status |
| --- | --- | --- |
| 1 | Schema, RLS, magic-link auth, Stripe checkout, portal and webhooks | Done |
| 2 | The credit wrapper — the only module allowed to call PropertyData | Done |
| 3 | Onboarding, and the first-run backfill | Done |
| 4 | The weekly pipeline | Done |
| 5 | Scoring | Done |
| 6 | Subscriber app — the five, timelines, archive, watchlist, calculator | Done |
| 7 | Delivery — the run date, the unseen marker, in-app only | Done |
| 8 | Admin export for the newsletter | Not started |

The pipeline is written, covered by tests, and its field names were verified against the
live API on 24 August 2026 — but it has never been run end to end. Every table is empty
except the cache. The PropertyData key on file is a 500-credit trial that does not renew,
which is enough to prove the pipeline and not enough to run it for paying subscribers.

Stripe is live: the £29 price, the webhook endpoint and the portal are all configured on
the live account, and `pnpm stripe:check` passes. A subscriber can sign up, pay, answer
the two questions and reach a dashboard that waits for the first run.

## The subscriber app

Five routes, all server-rendered, all reads against rows the Sunday run already
wrote. Nothing a subscriber can click spends a credit.

| Route | What it is |
| --- | --- |
| `/dashboard` | This week's five. The qualifying event in the headline position, the numbers stacked, the score openable line by line. |
| `/property/[id]` | One property in full: the complete event timeline, every week it has been shown to you, and the calculator. |
| `/archive` and `/archive/[runId]` | Previous weeks, exactly as they were published. |
| `/watchlist` | Starred properties, and the events on them you have not read. |
| `/account` | Plan, area, strategies, billing portal. |

### The watchlist costs nothing, by construction

Starring a property adds a row to `watchlist` and nothing else. There is no
notifications table: a notification is a material event on a starred property
observed since that row's `events_seen_at`, derived at read time from the diff
the run already wrote. It cannot fall out of step with the events because it is
the events, and it cannot start costing money because there is no call behind it.

Each starred row carries its own cut-off, so marking one property read does not
silence the rest.

### Stack it

`src/lib/stack.ts` is the BRRR and buy-to-let arithmetic: pure, tested, and
deliberately not `server-only` so it runs in the browser. Moving a number costs
nothing. It opens on the figures we hold — asking price, estimated rent,
estimated value — labelled as a starting point, and a figure we do not hold
starts empty rather than at an average. `tests/stack.test.ts` checks the
mortgage maths against the annuity formula and pins the awkward cases: a zero
rate, a refinance that pulls more out than went in, a top-up.

### Delivery, and why there is no email

Nothing is sent. The week's five appear in the dashboard when the Sunday run
completes, and everything the subscriber would have been emailed is in the app.

- The list carries the date it was published, so a returning visitor can tell a
  fresh list from the one they read last Monday.
- A week nobody has opened is marked new — on the list, on each deal, and as a
  dot in the navigation. The marker is cleared on the visit rather than on
  publish, so a list sitting unread on Monday still says so on Thursday.
- Events on watched properties surface in the watchlist, not as a push.

`weekly_selections` is the single source of truth for what was published and
when, and it carries an unused `notified_at`. An email or push channel is a
reader of that table: it can be added without the pipeline changing at all.

Clearing the marker is the one write a subscriber makes to that table, and the
database restricts it to that one column — `grant update (seen_at)`, so the
policy alone cannot be leaned on to protect the deal count or the stated reason
a week was thin. `tests/rls.test.ts` asserts both halves.

### What the interface will not do

- No photographs, anywhere. Listing images carry no rights, so we describe the
  property and link to the advert.
- No figure without the date it was observed next to it.
- No estimated stand-in for a figure we do not hold. It says "Not held" and the
  score for that factor is zero, not an assumed average.
- No padding. A thin week publishes fewer and says why.

## Stack

TypeScript, Next.js App Router, Supabase (Postgres, Auth, RLS), Stripe, Vercel. No
email service — Supabase Auth sends its own magic links, and everything else the user
receives, they receive in the dashboard.

## Local setup

Requires Node 22 and pnpm 11.

```bash
pnpm install
cp .env.example .env.local
```

### 1. Supabase

Create a project, then apply the migration. Either paste
`supabase/migrations/0001_foundations.sql` into the SQL editor, or use the CLI:

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

From **Project Settings → API**, copy the project URL and the `anon` key into
`.env.local`, and the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY`.

Under **Authentication → URL Configuration**, set the site URL to
`http://localhost:3000` and add `http://localhost:3000/auth/callback` as a redirect
URL. Do the same for the production domain when you deploy.

### 2. Stripe

Put the secret key in `STRIPE_SECRET_KEY` — test mode first — then:

```bash
pnpm stripe:setup    # product, price, webhook endpoint, portal
pnpm stripe:check    # read-only: does Stripe match what the code expects
```

`stripe:setup` creates four things and looks each one up before creating it, so it can
be run again without making a second copy of anything: the product and its £29/month
price, a webhook endpoint at `NEXT_PUBLIC_SITE_URL/api/stripe/webhook` subscribed to the
three events the handler acts on, and a customer portal allowing cancellation and card
changes. `STRIPE_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` are written into `.env.local`
rather than printed — Stripe returns a signing secret once, at creation, and never
again. That is also why re-pointing an endpoint that already exists needs
`--recreate-webhook`: the old one is deleted and a new secret issued, because there is
no way to read back the secret of an endpoint Stripe already has.

`stripe:check` changes nothing and prints no secret. It confirms the account can take
money, the price is £29 monthly in the same mode as the key, the endpoint is enabled and
subscribed to all three events, and the portal allows both cancellation and a card
change. Run it after setting Stripe up by hand, too.

Only three events matter, because entitlement is derived from one field —
`subscriptions.status`, checked in `src/lib/subscription.ts`. Everything that moves that
field fires one of them.

| Event | Why |
| --- | --- |
| `checkout.session.completed` | The signup, and the only event carrying `client_reference_id` — the fallback that attributes a subscription when the customer mapping is missing. |
| `customer.subscription.updated` | Renewal, a failed card moving it to `past_due`, recovery, cancel-at-period-end. |
| `customer.subscription.deleted` | The end of it. |

`invoice.payment_failed` and `invoice.paid` are not needed: both move the subscription,
which fires `updated`. Subscribing to more breaks nothing — the route records what it
does not handle — but each one is a delivery Stripe retries on a 500.

For webhooks against a local server, forward them with the Stripe CLI instead of
creating an endpoint:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Put the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.

### 3. PropertyData

Put the key in `PROPERTYDATA_API_KEY`, then check it:

```bash
pnpm propertydata:check
```

That calls `/account/credits`, which is free, and prints the account's credit position
alongside the limits configured locally. Raise `PROPERTYDATA_RATE_LIMIT_PER_10S` only to
match the plan you are actually on; the default of 4 is the floor across all plans.

### 4. Sourcing lists

PropertyData publish five list ids by way of example and not the rest. `strategy_lists`
carries those five enabled, and the three the brief names — short lease, slow to sell,
large plot — disabled, because their ids are a guess until the API says otherwise.

```bash
pnpm propertydata:lists                              # dry run, spends nothing
pnpm propertydata:lists --spend --email you@example.com
```

Probing costs about one credit per list, recorded against the account you name. A
confirmed list is enabled and appears on the onboarding form; one the API rejects is
disabled, so it fails here rather than in the middle of a Sunday run.

### 5. Run it

```bash
pnpm dev
```

Sign in at `http://localhost:3000/login`. In local development Supabase writes the
magic link to its own logs — find it under **Authentication → Logs** in the dashboard,
or use Inbucket if you are running Supabase locally.

Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0341` fails after
attaching, which is a useful way to see the `past_due` handling.

## Checks

```bash
pnpm typecheck   # tsc
pnpm test        # vitest
pnpm build       # production build
```

`tests/rls.test.ts` proves one user cannot read another user's rows. It skips unless
Supabase credentials are present, so point it at a **development** project and run it
before anything ships — it creates and deletes users.

## Onboarding

Two questions: where (a full UK postcode and a radius), and which strategies. A third,
optional, narrows the results by price, bedrooms and type — applied to the payload after
it arrives, so it costs nothing and can be changed as often as the user likes.

The limits are constraints rather than form validation. One area per user is a unique
index on `owner_id`. The radius is capped at 40 miles by a `CHECK`, well short of the 200
the API would allow. Strategies are checked against `strategy_lists` by a trigger, so an
id that is not on offer cannot be stored even by a direct database write.

Changing the postcode, radius or strategies resets `backfill_completed_at`, because a new
area's standing inventory has never been shown to that user and their next list should
draw on all of it. That costs credits, so it is capped at three changes per allowance
period and the counter is visible on the account page. Changing only the optional filters
is uncapped, because it cannot surface anything new.

## The credit wrapper

`src/lib/propertydata` is the only place in this codebase that may call PropertyData.
Everything imports from `@/lib/propertydata`, never from a file inside it.
`tests/module-boundary.test.ts` walks `src/` and `scripts/` and fails if the API host,
the API key or the wrapper's internals are reachable from anywhere else.

Every call, in order:

1. Check the per-user cache. A hit costs nothing and is still recorded.
2. Check this run's credit ceiling, then the user's remaining monthly allowance.
   Refuse rather than overspend, and record the refusal.
3. Wait for a rate-limit token.
4. Call, retrying only what is worth retrying. A dead account aborts the whole run
   rather than being retried into the ground.
5. Strip image fields, store the payload with an expiry capped at 60 days, record what
   it actually cost.

### The 60-day rule

PropertyData allows a stored response a 60-day life. There is no longer option at any
price. It is enforced in three places, and all three are tested.

- A `CHECK` constraint makes a row with a longer expiry impossible to insert.
- `api_cache_current` is the only view the wrapper reads from, and it hides anything
  expired or over 60 days old whatever its expiry claims.
- `pnpm run:purge` deletes them, and `/api/cron/purge` does the same daily on Vercel.

Derived material — events, scores, aggregates — is kept permanently and is not touched
by any of this. It is a dated historical observation, not an answer about the present.

## The weekly pipeline

Sunday 22:00, one cron, one profile at a time.

```bash
pnpm run:weekly              # every subscriber
pnpm run:weekly --owner <id> # one of them
pnpm run:weekly --dry        # list what would run, spend nothing
```

Per profile: call `/sourced-properties` with the profile's lists, postcode and radius;
filter on price, bedrooms and type from the returned payload; diff against what was last
observed and write the events; enrich a capped number of candidates with sale valuation,
rent valuation and area demand; score, rank, select, publish.

Budget is roughly 100 credits per profile per week and the ceiling aborts rather than
overspending. Actuals are logged per run and stored on `pipeline_runs`.

### The core mechanic

Every run diffs against the last one and writes events. Events are permanent, dated, and
marked as historical observations. A property qualifies for a user's five when either it
has never been shown to them and scores above threshold, or a new material event has
fired since it was last shown to them.

Material means a price reduction of at least 5%, a return to market, or crossing a
days-on-market mark. A £500 trim on a £250,000 house is recorded and is not material.
Going under offer is recorded and is not material — it is going, not coming.

`deal_impressions` records what was shown and the event that justified it, with a unique
index on `(owner_id, property_id, qualifying_event_id)`. That is what stops the same
property returning on the strength of a move it was already shown for.

`tests/weekly-mechanic.test.ts` runs fifty-two weeks against one property and asserts it
appears exactly when something happened to it.

### Area-level enrichment

Six endpoints, one credit each, called once per run and shared by every
candidate in the search. Twenty-five properties cost the same as one.

| Endpoint | What it gives |
| --- | --- |
| `/sold-prices-per-sqf` | Completed £/sq ft nearby, and the tenure of each sale |
| `/yields` | The local gross yield to judge this property against |
| `/energy-efficiency` | EPC per address, matchable to the property |
| `/council-tax` | Band per address, and the band D reference |
| `/flood-risk` | The band, worded |
| `/growth` | Capital growth over one year and five |

Field names were confirmed against live responses on 2026-08-24. PropertyData
document the parameters for these and not the response bodies, so
`pnpm propertydata:area --spend` prints what actually comes back and
`src/lib/pipeline/area.ts` reads through alias-tolerant helpers, the same way
`listing.ts` does.

`/build-cost` is deliberately not called. It requires an internal area, which
makes it per-property rather than per-area, and at one credit each that is the
wrong side of the budget.

EPC and council tax arrive as a list of addresses within the postcode, so they
are matched to the property by reducing both sides to letters and digits and
requiring one to contain the other in order. A near miss matches nothing — a
wrong EPC is worse than none.

### Scoring

Pure functions in `src/lib/pipeline/scoring.ts`. `quality()` takes the listing, its
enrichment and the area figures; `movement()` takes the events.

Quality asks whether the property makes money, not whether it looks respectable.

| Factor | Weight |
| --- | --- |
| Net monthly cashflow, at 25% down and 5.5% interest only, after 20% of rent in costs | 30 |
| Asking £/sq ft against nearby completed sales | 25 |
| This property's gross yield against the local benchmark | 15 |
| Local sales demand | 15 |
| On a list that implies work | 15 |

Cashflow replaced gross yield in v2. A 4% gross yield reads as unremarkable and
loses money every month at 5.5% borrowing, and the old score rewarded it. The
figure comes from `stack()`, the same arithmetic as the calculator on the
property page, so the score and the number a subscriber can reproduce cannot
disagree.

Sold prices per square foot replaced the sale valuation for the same reason a
reduction should only be counted once. A property reduced twice is "below the
estimate" partly because the estimate follows the asking price down, which let
one reduction earn points in quality and again in movement.

Risks are stated rather than scored. An EPC of F or G, flood risk above low, or
an area where most sales are leasehold appear next to the property and do not
move the ranking. Working out how many points an EPC of F is worth against a
12% reduction would mean inventing a number. They are added rather than blended, so a
mediocre property that just dropped 12% can outrank a good one that has not moved. Both
have the same ceiling, so neither dominates by construction. Weights are versioned and
every stored score records its version. No LLM anywhere in this path.

A factor with no data behind it scores nothing rather than an assumed average, and the
breakdown says which. Omitting beats estimating.

### Thin weeks

Some weeks a quiet area will not produce five that qualify. The run publishes fewer and
`weekly_selections.thin_reason` says so in one sentence. The list is never padded — the
entire product is that we filtered.

### Field names

PropertyData do not publish a full example `/sourced-properties` response, so
`src/lib/pipeline/listing.ts` reads every field through an alias list rather than a single
guessed key.

```bash
pnpm propertydata:sample --email you@example.com --postcode "M1 1AE"
```

That prints the field names a real response contains and flags any the pipeline does not
read. Correct the alias lists from its output, in one place. One credit.

## Deploying

Vercel, connected to this repository. Set every variable from `.env.example` in the
project settings, with `NEXT_PUBLIC_SITE_URL` pointing at the real domain.

`vercel.json` declares two crons: the weekly run at Sunday 22:00, and the cache purge
daily at 03:00. Both authenticate against `CRON_SECRET`, which Vercel sends as a bearer
token once you add it as an environment variable.

`pnpm stripe:setup` already created the webhook endpoint against `NEXT_PUBLIC_SITE_URL`,
so there is nothing to add by hand. `pnpm stripe:check` confirms it.

The live Stripe keys are set on **production only**, not on preview. `stripeEnv()` is
read at request time rather than at build time, so a preview deployment still builds —
only its checkout route fails, which is the intended outcome. A live secret key on every
preview branch is a preview branch that can charge a real card.

## Rules this codebase holds to

- Row Level Security is enabled on every table in the migration that creates it, and
  every user-owned row carries `owner_id`.
- The service role key is reachable only from server code. `src/lib/supabase/admin.ts`
  imports `server-only`, so the build fails if it is ever pulled into a client bundle.
- Stripe webhooks are signature-verified before the body is parsed or stored.
- Listing photographs carry no rights. We link to the original advert and never
  display or store an image.
- Exactly one module may call PropertyData. Nothing else spends money, and a test
  enforces it rather than a convention.
- Stored payloads expire at 60 days, enforced by the database and not only by code.

## Decisions

Choices worth remembering are logged in [DECISIONS.md](./DECISIONS.md).
