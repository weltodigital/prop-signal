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
| 1 | Schema, RLS, email-and-password auth, Stripe checkout, portal and webhooks | Done |
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
| `/deals` | Every property you have tracked and how far it got, finished ones included. |
| `/account` | Plan, area, strategies, billing portal. |

### The watchlist costs nothing, by construction

Starring a property adds a row to `watchlist` and nothing else. There is no
notifications table: a notification is a material event on a starred property
observed since that row's `events_seen_at`, derived at read time from the diff
the run already wrote. It cannot fall out of step with the events because it is
the events, and it cannot start costing money because there is no call behind it.

Each starred row carries its own cut-off, so marking one property read does not
silence the rest.

### Deals you're working

The product's job ends when five properties are on the dashboard. This is what happens
after: **Interested → Contacted → Viewing → Offer made → Offer accepted → Completed**,
plus two ways out — **Passed** and **Fell through**.

The exits are not decoration. Without them a dead deal sits at "viewing" for ever and the
completion rate reads far higher than the truth. Passed and fell through are kept apart
because they are different problems: passing says something about the properties being
surfaced, falling through says something about the market, and merging them would hide
whichever is happening.

Live deals appear above the week's five, because a deal at "offer accepted" wants
attention today and a new listing can wait. The section renders nothing when it is empty.

`deal_progress` is **append-only**, and the current stage is the newest row rather than a
column beside it. A `stage` column would answer "where is this now" and nothing else, and
the reason for recording any of this is the other question — how many complete, and how
long each step takes. That needs every transition and the moment it happened.

Moving backwards is allowed, because it happens to real deals. There is no UPDATE policy
at all: a correction is another row, so the history cannot be quietly tidied. Untracking
deletes, and the wording says it is for a mis-click — a deal that ended should be passed
or marked fallen through, because a funnel that drops its failures is not a funnel.

Nothing here costs a credit. It is the subscriber's record of their own actions and
touches no API.

#### The aggregate is counts, never people

`deal_progress_funnel` and `deal_progress_durations` are views with `security_invoker`,
so a subscriber reading them sees only their own rows aggregated. The cross-subscriber
picture belongs to the service role, which is the admin.

Neither view carries an `owner_id` and neither can be joined back to one. The question
being answered is "do the properties we pick complete", which does not need to know whose
they were. A subscriber's deal flow is theirs.

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
  factor takes no part in the score, rather than counting as an assumed average
  or as a zero the property did not earn.
- No padding. A thin week publishes fewer and says why.

## Stack

TypeScript, Next.js App Router, Supabase (Postgres, Auth, RLS), Stripe, Vercel. No
email service — Supabase Auth sends the two emails this product has, and everything else
the user receives, they receive in the dashboard.

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

Create an account at `http://localhost:3000/signup`, then sign in at `/login`. In local
development Supabase writes any email it sends to its own logs — find it under
**Authentication → Logs** in the dashboard, or use Inbucket if you are running Supabase
locally.

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

## Signing in

Email and password. There is no magic link and no social login.

| Route | What it is |
| --- | --- |
| `/signup` | Create an account. Costs nothing; the £29 is charged at the next step by Stripe. |
| `/login` | Email and password. |
| `/forgot-password` | Sends a reset link. Reports the same thing whether or not the address has an account. |
| `/reset-password` | Reached from that link, which the callback has already turned into a session. |
| `/account` | Change password, current one required. |

`src/lib/auth.ts` holds the rules the five forms share — the password bounds, the
address normalising, the error wording and the redirect guard — and
`tests/auth.test.ts` pins them.

Passwords are eight characters at minimum and seventy-two at most. The floor is ours;
Supabase would take six. The ceiling is bcrypt's: it reads the first 72 bytes and ignores
the rest, so a longer password would silently be a 72-character one and it is better to
say so than to pretend.

### What the forms will not tell you

"Invalid login credentials" is shown as *that email address and password do not match*,
never split into "no account here" and "wrong password". The forgotten-password form says
the same thing whether or not the address is a customer. Either distinction would let
anyone check an email address against the user table.

Signing up with an address that already has an account is the one place that says so —
otherwise the only alternative is to claim an email was sent that never was.

### Two things live in the Supabase dashboard, not here

**Confirm email**, under Authentication → Sign In / Providers. With it **on**, a new
account gets no session until the link in the confirmation email is clicked, so signup
stops at "check your inbox" and Stripe is one email round trip away. With it **off**,
signup returns a session and goes straight to checkout — the card is a stronger check on
a real customer than an email click is. `src/app/signup/actions.ts` handles both, because
that setting can change without a deploy.

**Email delivery.** Supabase's built-in SMTP is rate-limited to a handful of messages an
hour and Supabase document it as unsuitable for production. Two flows depend on it:
confirmation, and password reset. That is survivable at nought subscribers and will not
be at a launch spike. Custom SMTP is the fix, under Project Settings → Authentication.

## Onboarding

Three questions, and an optional fourth.

**Where** — a full UK postcode and a radius.

**Your strategy** — how the subscriber makes money, which is what decides whether a
property is any good. Buy to let, HMO, flip/BRRR, serviced accommodation. Pick as many
as you actually run: each property is scored under all of them and ranked by whichever
suits it best.

**What to look for** — the PropertyData sourcing lists, which decide what stock gets
pulled out of the market at all. Needs work, price reduced, repossession, high yield,
auction, short lease, slow to sell, large plot.

**Narrow it down**, optional — price, bedrooms and type, applied to the payload after it
arrives, so it costs nothing and can be changed as often as the subscriber likes.

### Two axes, deliberately

A sourcing list says *which stock*. A strategy says *what good means*. They are
independent — an HMO investor can still want repossessions — so they are asked
separately rather than one implying the other.

Until scoring v4 there was only one axis, and the word "strategy" meant a sourcing list.
It is now `sourcing_lists`, in the schema and in the code, because two different things
called strategy would confuse the subscriber and everyone reading this.

### The figures we ask for, and why

Two strategies need numbers PropertyData do not publish. Rather than invent them or drop
the strategy, the subscriber supplies their own:

| Strategy | Asked for | Why |
| --- | --- | --- |
| Flip / BRRR | Refurb cost per square foot | `/build-cost` prices building from nothing, and what fraction of that a refurbishment costs is exactly the invented number this codebase refuses. See DECISIONS.md. |
| Serviced accommodation | Nightly rate and occupancy | There is no nightly-rate or occupancy endpoint anywhere in PropertyData's API — all 69 were checked. |

A strategy whose figures are missing is skipped for that run and logged, rather than
being scored on a guess. The seam is deliberate: buy a short-let data feed later and only
those two inputs change.

### The limits are constraints, not form validation

One area per user is a unique index on `owner_id`. The radius is capped at 40 miles by a
`CHECK`, well short of the 200 the API would allow, and clamped again per sourcing list
because PropertyData reject a wider call outright. Sourcing lists are checked against the
`sourcing_lists` table by a trigger and investment strategies against a fixed set in the
same trigger, so neither an unknown list nor an unscorable strategy can be stored even by
a direct database write.

A strategy is a scoring function, not a row in a table — which is why it is a fixed set.
Storing a name nothing can score would publish a list ranked on nothing.

Changing the postcode, radius or sourcing lists resets `backfill_completed_at`, because a
new area's standing inventory has never been shown to that user and their next list
should draw on all of it. That costs credits, so it is capped at three changes per
allowance period and the counter is visible on the account page. Changing only the
optional filters is uncapped, because it cannot surface anything new.

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

Three more are fetched only for a profile whose strategies need them, so a buy-to-let
subscriber never pays a credit for HMO room rates.

| Endpoint | For | What it gives |
| --- | --- | --- |
| `/rents-hmo` | HMO | Local asking rent for one room |
| `/national-hmo-register` | HMO | Licensed HMOs nearby — saturation, stated not scored |
| `/development-gdv` | Flip / BRRR | What finished space is worth per square foot |

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

Pure functions in `src/lib/pipeline/scoring.ts`. Versioned weights, `v3`, and no LLM
anywhere in this path.

Quality cannot be scored one property at a time any more, because cashflow is ranked
against the rest of the run. So it comes in two phases: `measureQuality` per property,
then `qualityScores` over the whole cohort. `movement` stays per property.

**Quality — out of 100, over the factors held.**

| Factor | Weight | How |
| --- | --- | --- |
| Whatever the strategy is judged on | 40 | Percentile against the other candidates in this run, **under the same strategy** |
| Asking £/sq ft against nearby completed sales | 30 | 0% → 25% below scores nothing → everything |
| Local sales demand | 15 | Rated 20 → 80 out of 100 |
| Value-add lists the subscriber did *not* ask for | 15 | One scores half, two scores all |

**Movement — out of 100.** The weights below sum to 85 and are scaled, which is how
reduction and stale can be 35 and 10 while both scores still share a ceiling. Equal
ceilings are what stop either dominating by construction.

| Factor | Weight | How |
| --- | --- | --- |
| Cumulative reduction from peak asking | 35 | 2% → 20% scores nothing → everything |
| Back on the market | 25 | All or nothing |
| Slow to sell | 10 | 60 → 365 days |
| Recency | 15 | Moved today → 28 days ago |

**The total is quality plus movement, on 0 to 200.** Straight addition, so a mediocre
property that just dropped twelve per cent can outrank a good one that has not moved.
A tie goes to the one that moved. The qualification threshold of 25 is 25 of that 200,
and it applies only to a property that has never been shown to this subscriber — one
that has needs a new material event instead, whatever it scores.

#### The strategy decides what the 40 points measure

Only that one factor changes. Price against comparables, demand and room to add value
mean the same thing whatever you intend to do with a property; the return does not.

| Strategy | Judged on |
| --- | --- |
| Buy to let | Net monthly cashflow on a single-household rent |
| HMO | Net monthly cashflow at local room rates, bills and licensing in the costs |
| Flip / BRRR | How much of your money comes back out on the refinance |
| Serviced accommodation | Net monthly cashflow at your own nightly rate and occupancy |

Running costs differ by strategy and are stated rather than buried — 20% of rent for a
let, 35% for an HMO, 40% for a short let. A property is scored under every strategy the
subscriber runs and ranked by whichever suits it best, and the card says which.

Each strategy is percentiled against its own cohort, so a room rate is never ranked
against a refinance.

#### Why the return is a percentile

An absolute band does not survive leaving one part of the country. £0 to £350 a month
scores nearly nothing across the South East and nearly everything up north, and a
40-point factor that is constant either way is not a factor at all.

The price of the change: a percentile ranks within a filtered, event-driven cohort that
is not a sample of the local market. The one place that matters is a run where every
property loses money, so a property with negative cashflow cannot take more than half
the factor however well it ranks against the rest.

Gross yield against the local benchmark was removed rather than reweighted. It and
cashflow are both rent over price, so between them they put 45 of 100 quality points on
one signal.

#### Why the score is a share rather than a sum

Scoring a missing figure as zero is honest but biased: floor area is absent far more
often on flats and new builds, so those were systematically pushed down the list for a
gap in PropertyData rather than anything about the property.

So a factor with no data behind it is normalised out, and the score is the share of the
points that were actually available. On its own that would let a property top the list
on two factors, so it comes paired with a floor: at least **three of the four** quality
factors must be held or the property is dropped. In practice that means at least one of
cashflow or comparables, since demand is area-level and condition is nearly always held.

#### Why "room to add value" is relative

Every property an unmodernised-only subscriber sees is unmodernised. Scoring the list
itself gave every one of them half marks for a constant. Only the value-add lists they
did *not* tick carry information, so those are what is counted — and a subscriber who
ticked all of them gets the factor normalised out, because for them it separates
nothing.

#### Why the reduction is cumulative

Three cuts of 5% is a seller who has been talked down three times, which is a better
prospect than one 14% cut. Taking the deepest single step scored it at a third of the
value. `cumulativeReduction` reads the peak asking price out of the reduction events and
compares it with the most recent one — not the lowest ever seen, because a property can
be reduced, raised, and reduced again.

#### What earns recency, and what does not

Only a reduction or a return to market. `first_seen` is dated when *we* looked, and a
days-on-market crossing is the calendar moving rather than the property — ageing past 90
days was collecting stale points, full recency and qualification all at once. It still
qualifies a property and still earns its own stale points. It just cannot also be news.

#### Risks gate, and are still never scored

Working out how many points an EPC of F is worth against a 12% reduction would mean
inventing a number. But a note alone let a G-rated house on a flood plain lead the week,
so a risk now carries a severity instead. None of them adjusts a factor.

| Risk | Severity |
| --- | --- |
| Flood risk high | **Exclude** — never reaches the subscriber |
| EPC F or G | **Cap** at 120 of 200 — unless the subscriber picked unmodernised, auction or repossessed, where it is what they came for |
| EPC D or E, middling flood risk, short lease | Note |

Short lease moved out of value-add and into risks. A lease with 70 years left is a bill
before it is an opportunity, and the length — the only thing that decides which — is not
a field we hold.

Leasehold-heavy area was dropped entirely. In central Birmingham it fired on everything,
and a flag that fires on everything is not information.

Sold prices per square foot are used rather than the sale valuation, because a property
reduced twice is "below the estimate" partly because the estimate follows the asking
price down — which let one reduction earn points in quality and again in movement.

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
