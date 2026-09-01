-- Prop Signal — a wider search, and a per-list cap that clamps rather than refuses.
--
-- Two changes, both about the same thing: how much market a subscriber is
-- allowed to ask for.
--
-- The profile ceiling was forty miles, which was PropertyData's default rather
-- than their limit. `/sourced-properties` documents a radius of 1 to 200. Forty
-- is a reasonable area in Greater Manchester and a small one in Cumbria, and a
-- subscriber in a thin market was being handed a short list by a number nobody
-- had chosen for them. The ceiling is a hundred now: wide enough to reach a
-- second city from most of the country, and short of the 200 that stops being
-- an area at all.
--
-- The second change is what happens when a chosen list will not go that wide.
-- `unmodernised` and `slow-to-sell` reject anything over thirty miles and
-- `large-plot` over twenty, so 0005 refused to save a profile wider than the
-- narrowest list it asked for. That was the right guard when a run would have
-- failed outright on error 1103. The run clamps now — one call carries every
-- list, so it asks for the narrowest cap among them and logs `radius_clamped`
-- — which makes the refusal a second no to a question already answered.
--
-- So the trigger stops refusing and the form explains instead: a list that will
-- not go wide holds the whole search to its limit, and it says which one and
-- what the search will actually run at.

alter table public.search_profiles
  drop constraint search_profiles_radius_sane;

alter table public.search_profiles
  add constraint search_profiles_radius_sane check (radius_miles between 1 and 100);

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

  -- The radius is deliberately not checked against the chosen lists. A list
  -- that will not go as wide is searched at its own maximum by the run, which
  -- is a narrower search rather than a failed one.
  return new;
end;
$$;

comment on function public.max_radius_for_sourcing_lists(text[]) is
  'The widest radius every one of these lists accepts. The run clamps to it per list; nothing rejects a profile for exceeding it.';
