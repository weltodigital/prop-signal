-- Prop Signal — serviced accommodation comes out.
--
-- It was built on the subscriber's own nightly rate and occupancy, because
-- PropertyData publish neither and there is no short-let endpoint anywhere in
-- their API. That made it the one strategy scored entirely on figures the
-- product does not hold, and it is not a market we are ready to serve.
--
-- The scoring function is gone, so the strategy has to go with it: a stored
-- strategy that nothing can score would publish a list ranked on nothing.

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

  -- Three now, not four.
  select s into unknown
  from unnest(new.investment_strategies) as s
  where s not in ('btl', 'hmo', 'brrr')
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

-- Anybody who picked it falls back to buy to let rather than to nothing, which
-- is what every score meant before strategies existed.
update public.search_profiles
set investment_strategies = case
      when cardinality(array_remove(investment_strategies, 'r2sa')) = 0
        then array['btl']::text[]
      else array_remove(investment_strategies, 'r2sa')
    end
where 'r2sa' = any(investment_strategies);

-- The two figures it asked for are no longer read by anything.
update public.search_profiles
set strategy_assumptions = strategy_assumptions - 'nightlyRate' - 'occupancyPercent'
where strategy_assumptions ?| array['nightlyRate', 'occupancyPercent'];

comment on column public.search_profiles.investment_strategies is
  'How the subscriber makes money: btl, hmo, brrr. Each scores the same property differently, and a property is ranked by whichever of them suits it best.';

comment on column public.search_profiles.strategy_assumptions is
  'Subscriber-supplied figures this product does not hold. Currently refurbCostPerSqFt, for a BRRR.';
