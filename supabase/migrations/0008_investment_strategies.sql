-- Prop Signal — investment strategies.
--
-- Until now "strategy" meant a PropertyData sourcing list: which stock to pull
-- out of the market. That is one axis. This adds the other — what the
-- subscriber intends to do with a property, which is what decides whether it
-- is a good one. The same three-bed is an ordinary buy-to-let and an excellent
-- HMO, and only one number can tell you which.
--
-- The old name is renamed rather than reused. Two different things called
-- "strategy" would confuse the schema, the code and the subscriber, and there
-- are no profiles yet, so the rename costs nothing.

-- ---------------------------------------------------------------------------
-- 1. Say what the old thing actually is
-- ---------------------------------------------------------------------------

alter table public.strategy_lists rename to sourcing_lists;
alter table public.search_profiles rename column strategies to sourcing_lists;

comment on table public.sourcing_lists is
  'PropertyData sourcing lists — which stock a run pulls. Not to be confused with search_profiles.investment_strategies, which is how the subscriber intends to make money.';

-- Rename the policy and the helper along with it, so nothing is left pointing
-- at a name that no longer describes what it does.
alter policy strategy_lists_select on public.sourcing_lists rename to sourcing_lists_select;

drop function if exists public.max_radius_for_strategies(text[]);

create or replace function public.max_radius_for_sourcing_lists(p_lists text[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(l.max_radius_miles), 40)
  from public.sourcing_lists l
  where l.id = any(p_lists);
$$;

grant execute on function public.max_radius_for_sourcing_lists(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The new axis
-- ---------------------------------------------------------------------------

alter table public.search_profiles
  add column investment_strategies text[] not null default array['btl']::text[],
  -- Figures the subscriber supplies because we do not hold them: the refurb
  -- cost per square foot for a BRRR, and the nightly rate and occupancy for a
  -- short let. PropertyData publish none of the three. An assumed average
  -- inside a score is exactly what this product refuses everywhere else, so
  -- these are asked for instead.
  add column strategy_assumptions jsonb not null default '{}'::jsonb;

comment on column public.search_profiles.investment_strategies is
  'How the subscriber makes money: btl, hmo, brrr, r2sa. Each scores the same property differently, and a property is ranked by whichever of them suits it best.';

comment on column public.search_profiles.strategy_assumptions is
  'Subscriber-supplied figures this product does not hold: refurbCostPerSqFt, nightlyRate, occupancyPercent.';

alter table public.search_profiles
  add constraint search_profiles_investment_strategies_present
    check (cardinality(investment_strategies) between 1 and 4);

-- ---------------------------------------------------------------------------
-- 3. Validate both axes
-- ---------------------------------------------------------------------------

create or replace function public.validate_search_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  unknown text;
  allowed integer;
begin
  new.postcode := upper(regexp_replace(new.postcode, '\s+', ' ', 'g'));
  new.postcode := trim(new.postcode);

  -- Sourcing lists must exist and be enabled. A list id that is not on offer
  -- cannot be stored even by a direct database write.
  select s into unknown
  from unnest(new.sourcing_lists) as s
  where not exists (
    select 1 from public.sourcing_lists l where l.id = s and l.enabled
  )
  limit 1;

  if unknown is not null then
    raise exception 'Unknown or disabled sourcing list: %', unknown
      using errcode = '23514';
  end if;

  if cardinality(new.sourcing_lists) <> cardinality(array(select distinct unnest(new.sourcing_lists))) then
    raise exception 'Sourcing lists must not repeat' using errcode = '23514';
  end if;

  -- Investment strategies are a fixed set in the code rather than a table:
  -- each one is a scoring function, so adding a row without adding the
  -- function would store a strategy nothing can score.
  select s into unknown
  from unnest(new.investment_strategies) as s
  where s not in ('btl', 'hmo', 'brrr', 'r2sa')
  limit 1;

  if unknown is not null then
    raise exception 'Unknown investment strategy: %', unknown
      using errcode = '23514';
  end if;

  if cardinality(new.investment_strategies) <> cardinality(array(select distinct unnest(new.investment_strategies))) then
    raise exception 'Investment strategies must not repeat' using errcode = '23514';
  end if;

  allowed := public.max_radius_for_sourcing_lists(new.sourcing_lists);

  if new.radius_miles > allowed then
    raise exception 'A radius of % miles is wider than the % miles allowed by one of the chosen sourcing lists', new.radius_miles, allowed
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. What was published, per strategy
-- ---------------------------------------------------------------------------
--
-- A property scored under three strategies has three totals. The impression
-- records which one put it on the list and what the others came to, so the
-- page can say "this is a better HMO than a buy-to-let" and mean it.

alter table public.deal_impressions
  add column winning_strategy text,
  add column strategy_scores jsonb;

comment on column public.deal_impressions.winning_strategy is
  'The strategy whose total ranked this property. Null on impressions published before strategies existed.';

comment on column public.deal_impressions.strategy_scores is
  'Every strategy this property was scored under, and what each came to. Kept with the impression, so a later change of strategy does not rewrite why something was shown.';

-- ---------------------------------------------------------------------------
-- 5. The strategy-dependent area figures
-- ---------------------------------------------------------------------------
--
-- Stored with the rest of the area enrichment, and null for a run whose
-- strategies did not need them — which is also the record of what was not
-- paid for.

alter table public.area_insights
  add column hmo_room_rate_pcm numeric,
  add column registered_hmos_nearby integer,
  add column development_gdv_per_sqf numeric;

comment on column public.area_insights.hmo_room_rate_pcm is
  'Local asking rent for one room in a shared house. Null where no profile in this run had an HMO strategy, so nothing was fetched.';
