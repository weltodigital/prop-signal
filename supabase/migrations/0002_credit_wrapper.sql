-- Prop Signal — Phase 2. The credit wrapper.
--
-- Three things live here.
--
--   api_cache        Raw PropertyData payloads, scoped to one user, with a
--                    60-day life the database itself enforces.
--   usage_events     Every call we make, what it cost, and why.
--   credit_allowances  What a user is allowed to spend in a period.
--
-- The 60-day rule comes from PropertyData's terms and is not negotiable at any
-- price. It is enforced three ways on purpose: a CHECK constraint that makes an
-- over-long expiry impossible to write, a view that hides anything past its
-- life so a stale row cannot be read as current, and a purge job that deletes
-- the rows. Derived material — events, scores, aggregates — is kept elsewhere
-- and permanently, because it is a dated historical observation rather than an
-- answer about the present.

-- ---------------------------------------------------------------------------
-- api_cache
--
-- Deliberately not searchable. The payload is opaque jsonb with no GIN index
-- and no expression indexes over its contents. This is a per-user response
-- cache, not a copy of PropertyData's database, and it must stay that way.
-- ---------------------------------------------------------------------------

create table public.api_cache (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null,
  -- Hash of the canonicalised request parameters, API key excluded.
  request_key     text not null,
  -- The parameters themselves, for debugging. Never includes the API key.
  params          jsonb not null,
  -- The response body, with image fields stripped before it ever lands here.
  payload         jsonb not null,
  credits_charged integer not null default 0,
  retrieved_at    timestamptz not null default now(),
  expires_at      timestamptz not null,

  constraint api_cache_scope unique (owner_id, endpoint, request_key),
  constraint api_cache_expiry_after_retrieval check (expires_at > retrieved_at),
  -- The ceiling. No TTL, config change or bug can produce a row that claims to
  -- be current more than 60 days after it was retrieved.
  constraint api_cache_sixty_day_ceiling check (expires_at <= retrieved_at + interval '60 days'),
  constraint api_cache_credits_non_negative check (credits_charged >= 0)
);

create index api_cache_lookup_idx on public.api_cache (owner_id, endpoint, request_key);
create index api_cache_expiry_idx on public.api_cache (expires_at);
create index api_cache_retrieved_idx on public.api_cache (retrieved_at);

alter table public.api_cache enable row level security;
alter table public.api_cache force row level security;

-- Users may look at their own cached payloads. They may not write them — only
-- the wrapper, holding the service role, puts anything here.
create policy api_cache_select_own on public.api_cache
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- The only view the wrapper reads from.
--
-- A row is readable as current data when it has not expired AND was retrieved
-- within the last 60 days. The second condition is redundant given the CHECK
-- constraint, and is here anyway: if a constraint is ever dropped or a row is
-- back-dated, the read path still refuses to serve it.
-- ---------------------------------------------------------------------------

create view public.api_cache_current
with (security_invoker = true)
as
  select id, owner_id, endpoint, request_key, params, payload, credits_charged, retrieved_at, expires_at
  from public.api_cache
  where expires_at > now()
    and retrieved_at > now() - interval '60 days';

comment on view public.api_cache_current is
  'The only route by which a stored PropertyData payload may be read as current data. Reading public.api_cache directly bypasses the 60-day life and is a bug.';

-- ---------------------------------------------------------------------------
-- Purge. Run on a schedule; also safe to run by hand at any time.
--
-- Deletes anything expired and anything older than 60 days regardless of what
-- its expiry claims. Returns the number of rows removed so the caller can log
-- an actual figure rather than "done".
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_api_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.api_cache
  where expires_at <= now()
     or retrieved_at <= now() - interval '60 days';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_expired_api_cache() from public;
revoke all on function public.purge_expired_api_cache() from authenticated, anon;
grant execute on function public.purge_expired_api_cache() to service_role;

-- ---------------------------------------------------------------------------
-- usage_events — the ledger. One row per decision the wrapper makes, including
-- the ones where it refused to spend.
-- ---------------------------------------------------------------------------

create type public.usage_outcome as enum (
  'served_from_cache',  -- no call made, no credits spent
  'fetched',            -- call made, credits spent
  'refused_allowance',  -- would have exceeded the user's period allowance
  'refused_run_budget', -- would have exceeded this run's ceiling
  'error'               -- call attempted and failed
);

create table public.usage_events (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  -- Set by the weekly pipeline in Phase 4 so a run's spend can be totalled.
  -- No foreign key yet; pipeline_runs does not exist until then.
  run_id       uuid,
  endpoint     text not null,
  params       jsonb not null default '{}'::jsonb,
  outcome      public.usage_outcome not null,
  credits      integer not null default 0,
  http_status  integer,
  error_code   text,
  error_message text,
  duration_ms  integer,
  created_at   timestamptz not null default now(),

  constraint usage_events_credits_non_negative check (credits >= 0)
);

create index usage_events_owner_created_idx on public.usage_events (owner_id, created_at desc);
create index usage_events_run_idx on public.usage_events (run_id) where run_id is not null;
create index usage_events_endpoint_idx on public.usage_events (endpoint, created_at desc);

alter table public.usage_events enable row level security;
alter table public.usage_events force row level security;

-- A user can see what has been spent on their behalf. Nobody but the service
-- role can write it.
create policy usage_events_select_own on public.usage_events
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- credit_allowances — what a user may spend, and over what window.
--
-- Spend is never stored here. It is summed from usage_events, so the two can
-- never drift apart.
-- ---------------------------------------------------------------------------

create table public.credit_allowances (
  owner_id                uuid primary key references auth.users(id) on delete cascade,
  -- Budget is roughly 100 credits per user per week. 500 leaves headroom for a
  -- five-week month and the manual refreshes.
  monthly_credits         integer not null default 500,
  -- Manual refreshes on top of the weekly automatic run. Small, and visible to
  -- the user. Never unlimited.
  manual_refresh_limit    integer not null default 4,
  period_start            timestamptz not null default date_trunc('month', now()),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint credit_allowances_positive check (monthly_credits >= 0 and manual_refresh_limit >= 0)
);

create trigger credit_allowances_touch_updated_at
  before update on public.credit_allowances
  for each row execute function public.touch_updated_at();

alter table public.credit_allowances enable row level security;
alter table public.credit_allowances force row level security;

create policy credit_allowances_select_own on public.credit_allowances
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Give every new user an allowance at signup, alongside their account row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (id, owner_id, email)
  values (new.id, new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  insert into public.credit_allowances (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

-- Backfill anyone who signed up before this migration.
insert into public.credit_allowances (owner_id)
select id from auth.users
on conflict (owner_id) do nothing;

-- ---------------------------------------------------------------------------
-- Allowance arithmetic.
--
-- The period runs from period_start in monthly steps, so a user who joined
-- mid-month gets their own cycle rather than a stub first month.
-- ---------------------------------------------------------------------------

create or replace function public.current_period_start(p_owner_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.period_start is null then date_trunc('month', now())
    else a.period_start + (
      floor(extract(epoch from age(now(), a.period_start)) / extract(epoch from interval '30 days'))::integer
      * interval '30 days'
    )
  end
  from public.credit_allowances a
  where a.owner_id = p_owner_id;
$$;

create or replace function public.credits_spent_this_period(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(u.credits), 0)::integer
  from public.usage_events u
  where u.owner_id = p_owner_id
    and u.created_at >= public.current_period_start(p_owner_id);
$$;

create or replace function public.credits_remaining(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce((select a.monthly_credits from public.credit_allowances a where a.owner_id = p_owner_id), 0)
      - public.credits_spent_this_period(p_owner_id)
  );
$$;

-- Service role only. These are security definer and take any user id, so
-- exposing them would let one subscriber read another's usage.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.current_period_start(uuid)',
    'public.credits_spent_this_period(uuid)',
    'public.credits_remaining(uuid)'
  ] loop
    execute format('revoke all on function %s from public, authenticated, anon', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
