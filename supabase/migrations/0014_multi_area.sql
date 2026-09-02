-- Prop Signal — one area per user becomes one area per plan.
--
-- Three tiers priced on how many areas a subscriber searches: Single £29,
-- Portfolio £59 for three, Regional £99 for five. Somebody buying across a
-- region gets more, pays more, and costs us proportionally more in credits,
-- which is the honest shape for a product whose marginal cost is data.
--
-- This migration is the structure only. Every subscription is set to one area,
-- so behaviour is unchanged until the Stripe prices exist and the code reads
-- them. That is deliberate: the schema is the part that is expensive to get
-- wrong later.
--
-- The rule this file has to enforce is "no more active areas than the plan
-- allows", and it enforces it in a trigger. An entitlement check in
-- application code alone drifts — there is always one more route, one more
-- script, one more admin fix — and the count is the thing we are selling.

-- ---------------------------------------------------------------------------
-- 1. More than one area per owner
-- ---------------------------------------------------------------------------
--
-- The old rule was a unique constraint on owner_id, with a comment saying one
-- area per user is a rule rather than a default. It was right to make it a
-- constraint. It is now the wrong constraint.

alter table public.search_profiles
  drop constraint search_profiles_owner_id_key;

-- What the subscriber calls this area. Null falls back to the postcode, which
-- is what every existing row will read as.
alter table public.search_profiles
  add column if not exists label text;

-- Set when a downgrade leaves more areas than the plan allows.
--
-- Not a deletion. Somebody dropping from three areas to one has not asked us
-- to throw away two searches and their entire deal history, and doing it
-- anyway is how a downgrade becomes a chargeback. The excess is paused: kept
-- whole, skipped by the weekly run, shown on the account page with the reason,
-- and reactivated the moment they upgrade again or choose a different one.
alter table public.search_profiles
  add column if not exists paused_at timestamptz;

alter table public.search_profiles
  add column if not exists paused_reason text;

create index if not exists search_profiles_owner_active_idx
  on public.search_profiles (owner_id)
  where paused_at is null;

comment on column public.search_profiles.paused_at is
  'Set when a downgrade leaves more areas than the plan allows. The area is kept whole and skipped by the run.';

-- The label is theirs to set. The pause is not — a subscriber who could clear
-- their own paused_at would have bought the higher tier for nothing.
grant update (label) on public.search_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. How many areas the plan buys
-- ---------------------------------------------------------------------------
--
-- On the subscription rather than on the account, because it is a fact about
-- what was bought. It is derived from the Stripe price id by the webhook and
-- mapped explicitly in code — never inferred from the amount, so re-pricing a
-- tier later cannot silently change what somebody is entitled to.

alter table public.subscriptions
  add column if not exists area_limit integer not null default 1;

alter table public.subscriptions
  add constraint subscriptions_area_limit_sane check (area_limit between 1 and 20);

comment on column public.subscriptions.area_limit is
  'Areas this subscription entitles. Derived from price_id by an explicit map in code, never from the amount.';

-- Every existing subscription is a single-area one. Stated rather than left to
-- the default, so the intent survives someone reading this later.
update public.subscriptions set area_limit = 1;

-- ---------------------------------------------------------------------------
-- 3. The entitled limit, and the rule
-- ---------------------------------------------------------------------------

/*
 * How many areas this owner may have active.
 *
 * The best entitled subscription decides it. A user with a lapsed Regional and
 * a current Single gets one, because entitlement is about what is being paid
 * for now — the same rule `has_active_subscription` already applies.
 *
 * The floor is one, for everybody, subscribed or not. Onboarding happens
 * before checkout so that we can tell somebody how many properties their area
 * holds before they pay for it, which means a profile has to be creatable with
 * no subscription at all. One area is what that person gets.
 */
create or replace function public.area_limit_for(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    1,
    coalesce(
      (
        select max(s.area_limit)
        from public.subscriptions s
        where s.owner_id = p_owner_id
          and s.status in ('active', 'trialing')
          and (s.current_period_end is null or s.current_period_end > now())
      ),
      0
    )
  );
$$;

revoke all on function public.area_limit_for(uuid) from public, anon;
grant execute on function public.area_limit_for(uuid) to authenticated, service_role;

/*
 * Refuses an area the plan does not cover.
 *
 * Counts only unpaused rows, so the paused excess left by a downgrade does not
 * block somebody from choosing which of their areas is the live one.
 *
 * Fires on insert, and on the update that clears a pause — those are the two
 * ways the active count can go up. An ordinary edit to a live area cannot
 * change it and is not checked.
 */
create or replace function public.enforce_area_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  allowed integer;
begin
  if tg_op = 'UPDATE' and not (old.paused_at is not null and new.paused_at is null) then
    return new;
  end if;

  select count(*) into active_count
  from public.search_profiles p
  where p.owner_id = new.owner_id
    and p.paused_at is null
    and p.id <> new.id;

  allowed := public.area_limit_for(new.owner_id);

  if active_count + 1 > allowed then
    raise exception 'Your plan covers % %, and you already have % active.',
      allowed,
      case when allowed = 1 then 'area' else 'areas' end,
      active_count
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger search_profiles_enforce_area_limit
  before insert or update on public.search_profiles
  for each row execute function public.enforce_area_limit();

-- ---------------------------------------------------------------------------
-- 4. A published list belongs to an area, not just to a person
-- ---------------------------------------------------------------------------
--
-- `weekly_selections` was keyed on the owner and the run, which was enough
-- while an owner had one area. With three, "the current week" read as
-- whichever area happened to run last — so the dashboard would show a
-- Portsmouth list under a Manchester heading.
--
-- The run already knows which profile it was for. This carries it forward so
-- the read does not have to join to find out.

alter table public.weekly_selections
  add column if not exists profile_id uuid references public.search_profiles(id) on delete cascade;

update public.weekly_selections w
set profile_id = r.profile_id
from public.pipeline_runs r
where r.id = w.run_id
  and w.profile_id is null;

create index if not exists weekly_selections_profile_idx
  on public.weekly_selections (profile_id, published_at desc);

comment on column public.weekly_selections.profile_id is
  'Which area this list was published for. Null only on rows written before areas could be plural.';

-- ---------------------------------------------------------------------------
-- 5. Impressions likewise
-- ---------------------------------------------------------------------------
--
-- Reachable through run_id, but every dashboard read would be a join to get
-- there and the column costs nothing.

alter table public.deal_impressions
  add column if not exists profile_id uuid references public.search_profiles(id) on delete cascade;

update public.deal_impressions d
set profile_id = r.profile_id
from public.pipeline_runs r
where r.id = d.run_id
  and d.profile_id is null;

create index if not exists deal_impressions_profile_idx
  on public.deal_impressions (profile_id, shown_at desc);
