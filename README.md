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
| 3 | Onboarding, and the first-run backfill | Not started |
| 4 | The weekly pipeline | Not started |
| 5 | Scoring | Not started |
| 6 | Subscriber app | Not started |
| 7 | Publishing the week's five | Not started |
| 8 | Admin export for the newsletter | Not started |

Nothing sources yet. A subscriber can sign up, pay, and reach an empty dashboard. The
wrapper that will do the sourcing is built and tested, but nothing calls it — the
pipeline that does arrives in Phase 4.

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

```bash
pnpm stripe:setup
```

This creates the product and the £29/month price, and prints the price id for
`STRIPE_PRICE_ID`. Run it once in test mode and again in live mode. Then enable the
customer portal at **Settings → Billing → Customer portal**, allowing cancellation and
payment method updates.

For webhooks locally:

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

### 4. Run it

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

## Running the weekly pipeline

Arrives in Phase 4. It will run as `pnpm run:weekly`, and on Vercel Cron at Sunday
22:00. The daily cache purge is already wired up in `vercel.json`.

## Deploying

Vercel, connected to this repository. Set every variable from `.env.example` in the
project settings, with `NEXT_PUBLIC_SITE_URL` pointing at the real domain. `CRON_SECRET` is what the cron endpoints authenticate against; Vercel sets it for you
when you add it as an environment variable. Add a
Stripe webhook endpoint for `https://YOUR_DOMAIN/api/stripe/webhook` subscribed to
`checkout.session.completed`, `customer.subscription.updated` and
`customer.subscription.deleted`, and copy its signing secret into
`STRIPE_WEBHOOK_SECRET`.

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
