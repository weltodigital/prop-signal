-- Prop Signal — sourcing lists, corrected against the live API.
--
-- Everything here replaces a guess with a verified fact. Probed on 2026-08-24;
-- see DECISIONS.md for what each finding was.
--
--   large-plot-properties  was wrong. The id is `large-plot`, singular and with
--                          no suffix, which is the only one of the eight that
--                          does not follow the pattern.
--   unmodernised, slow-to-sell
--                          exist, but reject a radius over 30 miles with error
--                          1103. They were reported unconfirmed on the first
--                          probe because it asked for 40.
--
-- Each list carries its own maximum radius, because the API enforces one and a
-- run that asks for more fails outright.

alter table public.strategy_lists
  add column max_radius_miles integer not null default 40
  constraint strategy_lists_radius_sane check (max_radius_miles between 1 and 200);

comment on column public.strategy_lists.max_radius_miles is
  'Largest radius this list accepts. The API rejects anything wider with error 1103, so a run must clamp to the smallest maximum across the lists it is asking for.';

-- The id was wrong, not the strategy. Move the row rather than dropping it, so
-- anything already pointing at it follows.
update public.strategy_lists set id = 'large-plot' where id = 'large-plot-properties';

-- Verified: these seven returned results.
update public.strategy_lists
set enabled = true, verified_at = now()
where id in (
  'unmodernised-properties',
  'reduced-properties',
  'repossessed-properties',
  'high-yield-properties',
  'auction-properties',
  'short-lease-properties',
  'slow-to-sell-properties',
  'large-plot'
);

-- Radius limits found by probing. A rejected call costs no credits, so these
-- were established by asking for progressively less until one succeeded.
update public.strategy_lists set max_radius_miles = 30
  where id in ('unmodernised-properties', 'slow-to-sell-properties');

-- Verified working at 20 miles and not yet tested above it. Conservative on
-- purpose: too small is a narrower search, too large is a failed run.
update public.strategy_lists set max_radius_miles = 20 where id = 'large-plot';

-- ---------------------------------------------------------------------------
-- A profile's radius must fit every list it asks for.
--
-- Checked here as well as in the form, because the alternative is a Sunday run
-- that fails on error 1103 for a setting the user was allowed to save.
-- ---------------------------------------------------------------------------

create or replace function public.max_radius_for_strategies(p_strategies text[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(l.max_radius_miles), 40)
  from public.strategy_lists l
  where l.id = any(p_strategies);
$$;

grant execute on function public.max_radius_for_strategies(text[]) to authenticated, service_role;

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

  allowed := public.max_radius_for_strategies(new.strategies);

  if new.radius_miles > allowed then
    raise exception 'A radius of % miles is wider than the % miles allowed by one of the chosen strategies', new.radius_miles, allowed
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fields the live payload turned out to carry.
--
-- All dated observations, like everything else on this table: they are what we
-- saw at last_observed_at, not claims about the present.
-- ---------------------------------------------------------------------------

alter table public.properties
  add column precise_address          text,
  -- Internal area in square feet. Passed to /valuation-sale, which is the
  -- difference between valuing a postcode and valuing this property.
  add column internal_area_sqft       integer,
  -- Total reduction from the original asking price, as PropertyData report it.
  add column reduced_by_percent       numeric(6, 2),
  add column days_since_price_change  integer;
