# Claude Code Build Prompt — Prop Signal (v3)

> Supersedes v1 and v2. Paste everything below the line into Claude Code.

---

## What we're building

**Prop Signal** — a £29/month subscription for UK landlords and property investors. Distributed through my weekly newsletter, Property Investor Weekly, but a separate product with its own brand and domain.

The promise: pick your area and your strategy, and every Monday morning there are five properties waiting in your dashboard, each with the numbers stacked and a stated reason it's on the list this week.

The reason it's worth paying for: the five are **event-driven, not listing-driven**. Anyone can see what came onto Rightmove this week for free. Prop Signal shows what has *moved* — reduced twice, back on the market after a fall-through, 140 days unsold and the agent getting nervous. A property that appeared months ago can lead this week's list because something changed. That intelligence comes from our own week-on-week diffing and nobody else selling to this audience has it.

Data from the PropertyData API. Single operator. TypeScript. Real paying users.

## Facts already established — do not re-derive these

Checked against PropertyData's documentation. Constraints, not suggestions.

- **Multi-tenant paid SaaS is expressly permitted on every plan.** No separate licence, no tier requirement, no cap on customers. Credits are the only limit.
- **Stored API responses have a 60-day life.** Then delete or refresh. No longer option exists at any price.
- **No cross-user cache and no national index.** Showing current data to a user should broadly correspond to one call for that data. Every pull is scoped to one user's area. Do not build a searchable copy of their data.
- **Derived material may be kept indefinitely** if marked as a historical observation, carrying its retrieval date, and never used to answer a question about the present. That covers dated snapshots, derived events, aggregates and our own scores. **This is where the whole product lives.**
- **`/sourced-properties`**: 10 results per credit, max 500 per call, paginated via `results` and `page`. Takes a postcode, lat/lng or what3words, plus radius and one or more named strategy lists (comma-separated, merged, de-duplicated).
- **Listing photographs carry no rights.** Link to the original listing; never display or store images.
- Plans: £28/month for 2,000 credits up to £1,300/month for 500,000. Rate limits 4 to 24 requests per 10 seconds. Stepped monthly subscription, not per-call billing.

Read `https://propertydata.co.uk/api/documentation` for exact parameters and response shapes before writing the client. Then ask me for: API key, Supabase project, Stripe status, sending domain, brand assets.

## Stack

TypeScript. Next.js App Router. Supabase (Postgres, Auth, RLS). Stripe. Vercel with Vercel Cron. Weekly pipeline also runnable via `pnpm run:weekly`.

No email service in v1. Supabase Auth sends its own magic links. Everything the user receives, they receive in the dashboard.

## The core mechanic

Everything depends on this being right.

**Every run diffs against the previous run and writes events.** Events are permanent, dated, and marked as historical observations. Event types at minimum:

`first_seen`, `price_reduced`, `price_increased`, `returned_to_market`, `marked_sstc`, `no_longer_listed`, `days_on_market_crossed`

Each event records the property, the user's profile it was found under, the values before and after, and the retrieval date.

**A property qualifies for a user's weekly five if:**
- it has never been shown to that user and scores above threshold, or
- it has been shown before **and a new material event has fired since it was last shown to them**

**Material events** are: a price reduction above a configurable percentage, a return to market, or crossing a days-on-market threshold. Minor changes don't qualify. A property must never appear twice for the same event.

Track this in a `deal_impressions` table: user, property, date shown, and the event that justified showing it. This table is what stops the list becoming repetitive, and it's the first thing to get right.

**Ranking** combines two scores: a quality score (yield, price against comparables, condition signals) and a movement score derived from the recency and size of the qualifying event. A mediocre property that just dropped 12% can outrank a good one that hasn't moved.

## Build order

### Phase 1 — Foundations and the money path

Supabase schema with RLS on every table in the first migration, every row scoped by `owner_id`. Magic-link auth. Stripe checkout, customer portal, webhooks for `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. A `subscriptions` table mirroring Stripe and a single `hasActiveSubscription(userId)` helper.

No free tier. Every subscriber costs real credits. PIW is the free tier.

Done when a stranger can sign up, pay, and reach an empty dashboard.

### Phase 2 — The credit wrapper

Build before anything that spends money. One module is the only code permitted to call PropertyData. It:

- checks the caller's remaining allowance and refuses when exhausted
- checks a per-user cache first, TTL per data type, hard 60-day ceiling
- writes to `usage_events`: user, endpoint, parameters, credits, timestamp
- enforces a per-run credit ceiling that aborts rather than overspends
- respects the plan rate limit with a token bucket

A scheduled job deletes or refreshes payloads at 60 days. Write a test that fails if any payload older than 60 days is readable as current data.

### Phase 3 — Onboarding

Two questions, nothing more:

1. **Where** — postcode plus radius. Anywhere in the UK, one area per user.
2. **Strategy** — pick from PropertyData's named lists, presented in plain English (needs work, price reduced, repossession, short lease, slow to sell, large plot). Multiple selectable.

Optional third: budget range and property type, used to pre-filter the payload at no credit cost.

**The first run is a backfill.** A new subscriber's opening list draws on the entire standing inventory in their area, not just this week's flow. Flag it as such, and allow it to be longer than five — this is the moment they decide whether they've wasted £29.

### Phase 4 — Weekly pipeline

Sunday 22:00, one cron.

Per profile: call `/sourced-properties` with the profile's lists, postcode and radius. Pre-filter on price, beds and type from the returned payload — those fields cost nothing extra. Enrich the top ~25 candidates with sale valuation, rent valuation and area-level demand. Diff against the previous run, write events, score, rank, select five.

Budget roughly 100 credits per user per week. Log actuals per run.

### Phase 5 — Scoring

Pure functions. `quality(listing, enrichment, weights)` and `movement(events)`. Versioned weights; every stored score records its version. Human-readable breakdown per factor. **No LLM anywhere in this path.**

### Phase 6 — Subscriber app

- **This week**: the five. Each shows the qualifying event in the headline position, the stacked numbers, the score breakdown, stated assumptions for refurb and rent, and a link to the original listing.
- **Timeline** per property: the full event history, every entry labelled with its observation date.
- **Archive**: previous weeks.
- **Watchlist**: star a property; when an event fires against it, it appears in an in-app notification list. Reads the weekly diff, costs nothing.
- **Stack it**: BRRR/BTL calculator, client-side, against stored figures. Purchase price, refurb, rate, term, rent. Zero credits.
- **Account**: plan, area, strategy, billing portal.

Tailwind. Real empty, loading and error states. Never display listing photographs.

### Phase 7 — Delivery

**No email in v1.** The week's five appear in the dashboard when the Sunday run completes. Everything below is in-app.

- A clear marker on "this week" showing the run date, so the user knows the list is fresh rather than the one they saw last time.
- An unseen indicator on deals published since their last visit, cleared when viewed.
- Watchlist events surface as an in-app notification list, not a push.

Design the publish step so a notification channel can be added later without touching the pipeline: the run writes a `weekly_selections` row per user and that row is the single source of truth for what was published, when. A future email or push reads from it.

### Phase 8 — Admin (my account only)

Cross-user view of the week's highest scoring deals, for pulling into the PIW issue. Select, add a written rationale, export a Beehiiv block: one-line description, headline numbers, my note, link to the listing.

Copy constraints: plain English, dry register, short sentences, UK spelling. No colon-drop lists. No "It's not just X, it's Y". No "The pattern is clear". **A validation step must hard-fail the export if any placeholder pattern survives** — `PLACEHOLDER`, `TODO`, `[insert]`, lorem ipsum. Every figure traces to a stored field; omit rather than estimate.

## Thin weeks

Some weeks a quiet area won't produce five that qualify. **Show fewer and say so.** Never pad the list with properties that don't meet threshold — the entire product is that we filtered. A short honest list builds more trust than five with two duds.

## Usage limits — enforce at the pipeline, not the UI

One area per user. Weekly automatic refresh only. A small monthly quota of manual refreshes with the counter visible. Fixed cap on candidates enriched per run. Never unlimited anything.

## Explicitly not building

Off-market sourcing. National or multi-area search. R2SA analytics. A full calculator suite. Address-lookup comps. Negative equity engine. Programmatic city pages. Teams. A public API. A free tier.

Ask before adding any of these.

## Cross-cutting

Exactly one module can spend money. Events, scores and aggregates permanent and dated; raw payloads expire at 60 days. Structured logs per run: profiles processed, credits spent, cache hits, events written, deals selected, errors. RLS tested. Stripe webhooks signature-verified. Service-role key unreachable from client code. A test asserting one user cannot read another's rows.

## Working style

Small runnable commits. Ask before adding a dependency. Ask before expanding scope. Cheap reversible choices over expensive thorough ones, logged in `DECISIONS.md`. A `README.md` covering local setup, running the weekly pipeline, and deploying. Stop at the end of each phase and show me what works.

## First deliverable

Phase 1 only. A stranger can sign up, pay, and land on an empty dashboard. Nothing sources yet.
