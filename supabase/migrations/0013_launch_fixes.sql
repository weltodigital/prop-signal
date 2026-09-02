-- Prop Signal — the fixes that had to land before anybody pays.
--
-- Four things, in the order they matter:
--
--   1. A property that has left the market gets a stage of its own, so a deal
--      that died because the house sold is never confused with one the
--      subscriber turned down. Those are different problems and the funnel has
--      to keep them apart.
--   2. The strategy return is percentiled against a rolling window of an
--      area's history rather than against whichever candidates happened to
--      come back in the same run. That needs somewhere to keep the history.
--   3. Somebody should find out how many properties are in their area before
--      they pay, not after. That needs somewhere to count the probes.
--   4. Widening a search is what a subscriber with a thin list needs to do, so
--      it gets its own allowance instead of eating the one that exists to stop
--      somebody re-sourcing the country every week.

-- ---------------------------------------------------------------------------
-- 1. Delisted is a stage, not a preference
-- ---------------------------------------------------------------------------
--
-- 'passed' says the subscriber looked and said no, which is information about
-- the properties we surface. 'fell_through' says they lost it after an offer,
-- which is information about the market. 'delisted' says the seller took it
-- away while the subscriber was still working it, which is information about
-- neither and must not be counted as either.
--
-- Terminal and unsuccessful, like the other two exits. Written by the weekly
-- run under the service role rather than by the subscriber, which is why it is
-- the only stage nobody can reach from the stage control.

alter table public.deal_progress
  drop constraint deal_progress_stage_known;

alter table public.deal_progress
  add constraint deal_progress_stage_known check (
    stage in (
      'interested', 'contacted', 'viewing', 'offer', 'accepted', 'completed',
      'passed', 'fell_through', 'delisted'
    )
  );

comment on column public.deal_progress.stage is
  'One of the eight stages a subscriber can record, plus delisted, which only the run writes.';

-- ---------------------------------------------------------------------------
-- 2. The rolling window the strategy return is ranked against
-- ---------------------------------------------------------------------------
--
-- Until now the 40-point return factor was a percentile against the other
-- candidates in the same run. Two things were wrong with that once the list
-- started standing:
--
--   - A property could fall under the quality floor because other properties
--     improved, with nothing about it having changed. The subscriber is told a
--     deal stopped stacking when what actually happened is that the company it
--     keeps got better.
--   - A score meant something different every week and something different for
--     every subscriber, so nothing could be compared across either — which is
--     precisely what the deal tracking exists to measure.
--
-- So the cohort becomes the area's own history. Each run records what it
-- measured, and later runs rank against a window of that.
--
-- Keyed on the outward code rather than on a profile. Two subscribers searching
-- M14 share a window even at different radii, which is the point: a score has
-- to mean the same thing for both of them or the completion data is noise. The
-- cost of that choice is that a wide search contributes observations from
-- further out than a narrow one — worth it for a window that is dense enough
-- to be a percentile at all.
--
-- No owner_id, and none is derivable. These are dated observations of a market,
-- which is exactly the derived material the licence lets us keep, and they are
-- nobody's personal data. The service role is the only reader: the pipeline
-- writes them and the pipeline reads them back.

create table public.strategy_return_observations (
  id           uuid primary key default gen_random_uuid(),

  -- The outward code of the property's own postcode, upper case. 'M14', 'PO9'.
  area_key     text not null,
  strategy     text not null check (strategy in ('btl', 'hmo', 'brrr')),

  -- PropertyData's listing key, so the same property observed for two
  -- subscribers on the same day counts once rather than twice.
  property_key text not null,

  -- What the strategy's own measure came to: monthly cashflow for a let or an
  -- HMO, percent of money back out for a flip.
  value        numeric not null,
  -- Whether that figure was a loss. Kept because the scorer treats one
  -- differently and a window that forgot would rank a loss on its merits.
  below_water  boolean not null default false,

  observed_at  timestamptz not null,
  -- Stored rather than expressed in the index, because PostgREST names columns
  -- in an on-conflict clause and cannot name an expression. The dedupe below
  -- is the whole reason two subscribers searching the same place do not count
  -- the same house twice, so it has to be reachable from an upsert.
  observed_on  date generated always as ((observed_at at time zone 'UTC')::date) stored,

  created_at   timestamptz not null default now()
);

-- One observation per property per strategy per day, whoever was searching.
create unique index strategy_return_observations_unique_idx
  on public.strategy_return_observations (area_key, strategy, property_key, observed_on);

-- The read: the window for one area and strategy, newest first.
create index strategy_return_observations_window_idx
  on public.strategy_return_observations (area_key, strategy, observed_at desc);

alter table public.strategy_return_observations enable row level security;
alter table public.strategy_return_observations force row level security;

-- No policy for `authenticated`, deliberately. Row level security with no
-- policy denies everything, and the service role bypasses it — so the pipeline
-- can read and write this and nobody signed in can read any of it.

comment on table public.strategy_return_observations is
  'Rolling history of strategy returns per area, for percentiling. Market observations only — no owner_id, and none derivable.';

-- ---------------------------------------------------------------------------
-- 3. What the area holds, answered before the card is taken
-- ---------------------------------------------------------------------------
--
-- Somebody in a sparse area should not pay £29 to discover their list is
-- empty. One sourcing call at the end of onboarding answers it for about
-- twenty credits, and a thin area — the one this exists to catch — costs a
-- fraction of that, because the call is charged per result returned.
--
-- Recorded rather than just displayed, for two reasons: the count can be shown
-- again without paying for it twice, and an account that has not paid for
-- anything needs a bound on how many of these it can ask for.

create table public.search_probes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,

  postcode        text not null,
  radius_miles    integer not null,
  sourcing_lists  text[] not null,

  -- What came back, before and after the optional price and type filters.
  candidates      integer not null,
  matching        integer not null,
  -- True where the page size was reached, so the real number is at least this.
  capped          boolean not null default false,

  credits_spent   integer not null default 0,
  created_at      timestamptz not null default now(),

  constraint search_probes_counts_sane check (candidates >= 0 and matching >= 0 and matching <= candidates)
);

create index search_probes_owner_idx on public.search_probes (owner_id, created_at desc);

alter table public.search_probes enable row level security;
alter table public.search_probes force row level security;

create policy search_probes_select_own on public.search_probes
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Written by the route holding the service role, so the count that bounds the
-- quota cannot be edited by the person it bounds.

comment on table public.search_probes is
  'One sourcing call run before checkout to tell somebody how many properties their area actually holds.';

-- ---------------------------------------------------------------------------
-- 4. Widening a search has its own allowance
-- ---------------------------------------------------------------------------
--
-- The three-change cap exists to stop somebody re-sourcing a new part of the
-- country every week, because each change is a fresh backfill over standing
-- inventory and that is the most expensive thing this product does.
--
-- It landed hardest on exactly the subscriber it should have helped: the one
-- with a thin list, whose fix is to widen the radius, and who had three tries
-- at it before being locked out for the rest of the month. The radius is the
-- single biggest lever we tell them they control on the onboarding form, and
-- then we rationed it.
--
-- So a widening is counted separately. Still bounded — it still costs a
-- backfill — but out of its own allowance, so somebody chasing a short list is
-- never spending the allowance that exists for moving house.

alter table public.search_profile_changes
  drop constraint search_profile_changes_kind_check;

alter table public.search_profile_changes
  add constraint search_profile_changes_kind_check check (
    kind in ('created', 'search_changed', 'filters_changed', 'radius_widened')
  );

comment on column public.search_profile_changes.kind is
  'created and filters_changed are free. search_changed and radius_widened each count against their own allowance.';
