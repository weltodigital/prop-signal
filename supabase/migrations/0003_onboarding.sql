-- Prop Signal — Phase 3. Onboarding.
--
-- Two questions and nothing more: where, and which strategies. A third,
-- optional, narrows the payload after it arrives at no extra cost.
--
-- One area per user. That is not a UI convention — it is a unique index, and
-- the radius and strategy limits are constraints rather than form validation.

-- ---------------------------------------------------------------------------
-- strategy_lists — the sourcing lists we offer, in plain English.
--
-- A reference table rather than a TypeScript constant, so a list can be turned
-- on or off without a deploy, and so search_profiles.strategies can be checked
-- against something real.
--
-- verified_at records that the id was accepted by the live API. Nothing
-- unverified is ever offered to a user; `pnpm propertydata:lists` is what fills
-- it in.
-- ---------------------------------------------------------------------------

create table public.strategy_lists (
  id          text primary key,          -- PropertyData's list id
  label       text not null,             -- What the user reads
  description text not null,             -- One line, plain English
  sort_order  integer not null default 100,
  enabled     boolean not null default false,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger strategy_lists_touch_updated_at
  before update on public.strategy_lists
  for each row execute function public.touch_updated_at();

alter table public.strategy_lists enable row level security;
alter table public.strategy_lists force row level security;

-- A catalogue, not user data. Readable by anyone signed in; written by the
-- service role only.
create policy strategy_lists_select on public.strategy_lists
  for select to authenticated
  using (true);

-- The five ids PropertyData's own documentation names. Enabled, because they
-- are documented; verified_at stays null until the live API confirms them.
insert into public.strategy_lists (id, label, description, sort_order, enabled) values
  ('unmodernised-properties', 'Needs work',
   'Dated or unmodernised, where the value is in what you do to it.', 10, true),
  ('reduced-properties', 'Price reduced',
   'The asking price has come down since it was listed.', 20, true),
  ('repossessed-properties', 'Repossession',
   'Sold by a lender rather than an owner. Usually a motivated seller.', 30, true),
  ('high-yield-properties', 'High yield',
   'Asking price is low against the rent the area achieves.', 40, true),
  ('auction-properties', 'Going to auction',
   'Listed for auction, with a fixed date and no chain.', 50, true);

-- Named in the brief and strongly implied by the response fields PropertyData
-- documents (years_remaining, months_on_market, plot_size_acres), but the ids
-- are not published. Recorded so the probe script has something to check, and
-- left disabled so a guess never reaches a paying user or costs a credit.
insert into public.strategy_lists (id, label, description, sort_order, enabled) values
  ('short-lease-properties', 'Short lease',
   'Leasehold with few years left, where extending is the play.', 60, false),
  ('slow-to-sell-properties', 'Slow to sell',
   'On the market long enough that the seller is losing patience.', 70, false),
  ('large-plot-properties', 'Large plot',
   'More land than the house needs, with room to build or split.', 80, false);

-- ---------------------------------------------------------------------------
-- search_profiles — one per user. Where they buy and what they buy.
-- ---------------------------------------------------------------------------

create table public.search_profiles (
  id                     uuid primary key default gen_random_uuid(),
  -- Unique, not merely indexed. One area per user is a rule, not a default.
  owner_id               uuid not null unique references auth.users(id) on delete cascade,

  postcode               text not null,
  radius_miles           integer not null default 10,
  strategies             text[] not null,

  -- Optional. Applied to the payload after it arrives, which costs nothing.
  min_price              integer,
  max_price              integer,
  min_bedrooms           integer,
  property_types         text[],

  -- Null until the first run has drawn on the whole standing inventory. The
  -- opening list is the moment a subscriber decides whether they wasted £29,
  -- so it is treated differently from every run after it.
  backfill_completed_at  timestamptz,
  last_run_at            timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- Radius is capped at 40 rather than PropertyData's 200. A wider search is
  -- more credits and a worse list, and nobody drives two hundred miles to view
  -- a terrace.
  constraint search_profiles_radius_sane check (radius_miles between 1 and 40),
  constraint search_profiles_has_strategy check (cardinality(strategies) between 1 and 8),
  constraint search_profiles_price_order check (
    min_price is null or max_price is null or min_price <= max_price
  ),
  constraint search_profiles_price_positive check (
    (min_price is null or min_price >= 0) and (max_price is null or max_price > 0)
  ),
  constraint search_profiles_bedrooms_sane check (min_bedrooms is null or min_bedrooms between 0 and 10),
  -- Stored normalised and uppercase, so two spellings of one postcode cannot
  -- become two cache entries.
  constraint search_profiles_postcode_shape check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$')
);

create index search_profiles_owner_idx on public.search_profiles (owner_id);
create index search_profiles_backfill_idx on public.search_profiles (backfill_completed_at)
  where backfill_completed_at is null;

create trigger search_profiles_touch_updated_at
  before update on public.search_profiles
  for each row execute function public.touch_updated_at();

alter table public.search_profiles enable row level security;
alter table public.search_profiles force row level security;

create policy search_profiles_select_own on public.search_profiles
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy search_profiles_insert_own on public.search_profiles
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy search_profiles_update_own on public.search_profiles
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- backfill_completed_at and last_run_at are the pipeline's business. A user
-- editing their own row must not be able to tell us the backfill already ran.
revoke update on public.search_profiles from authenticated;
grant update (
  postcode, radius_miles, strategies, min_price, max_price, min_bedrooms, property_types
) on public.search_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Every strategy must be a list we actually offer.
--
-- A trigger rather than a CHECK, because a CHECK cannot see another table and
-- a foreign key cannot reach inside an array.
-- ---------------------------------------------------------------------------

create or replace function public.validate_search_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  unknown text;
begin
  new.postcode := upper(regexp_replace(new.postcode, '\s+', ' ', 'g'));
  new.postcode := trim(new.postcode);

  select s into unknown
  from unnest(new.strategies) as s
  where not exists (
    select 1 from public.strategy_lists l where l.id = s and l.enabled
  )
  limit 1;

  if unknown is not null then
    raise exception 'Unknown or disabled strategy: %', unknown
      using errcode = '23514';
  end if;

  if cardinality(new.strategies) <> cardinality(array(select distinct unnest(new.strategies))) then
    raise exception 'Strategies must not repeat' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger search_profiles_validate
  before insert or update on public.search_profiles
  for each row execute function public.validate_search_profile();

-- ---------------------------------------------------------------------------
-- Changing the search means new standing inventory, which means a new backfill,
-- which costs credits. Recorded so the quota has something to count.
-- ---------------------------------------------------------------------------

create table public.search_profile_changes (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  profile_id   uuid not null references public.search_profiles(id) on delete cascade,
  -- 'created' is not counted against the quota. Nobody pays £29 and is then
  -- told they have used up an allowance by answering the opening questions.
  kind         text not null check (kind in ('created', 'search_changed', 'filters_changed')),
  previous     jsonb,
  current      jsonb not null,
  created_at   timestamptz not null default now()
);

create index search_profile_changes_owner_idx on public.search_profile_changes (owner_id, created_at desc);

alter table public.search_profile_changes enable row level security;
alter table public.search_profile_changes force row level security;

create policy search_profile_changes_select_own on public.search_profile_changes
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Written by the server action holding the service role, so the audit trail
-- cannot be edited by the person it is about.

-- ---------------------------------------------------------------------------
-- Reset the backfill whenever the search itself changes.
--
-- A new postcode, a wider radius or another strategy all bring inventory the
-- user has never been shown. Their next list should draw on all of it, exactly
-- as their first one did. Changing only the optional price and type filters
-- does not reset anything, because it cannot surface anything new.
-- ---------------------------------------------------------------------------

create or replace function public.reset_backfill_on_search_change()
returns trigger
language plpgsql
as $$
begin
  if new.postcode is distinct from old.postcode
     or new.radius_miles is distinct from old.radius_miles
     or new.strategies is distinct from old.strategies then
    new.backfill_completed_at := null;
  end if;

  return new;
end;
$$;

create trigger search_profiles_reset_backfill
  before update on public.search_profiles
  for each row execute function public.reset_backfill_on_search_change();
