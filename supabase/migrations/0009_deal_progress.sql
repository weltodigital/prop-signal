-- Prop Signal — what the subscriber did next.
--
-- The product's job ends when five properties are on the dashboard. This is
-- what happens after: interested, contacted, viewed, offered, accepted, done.
--
-- Append-only, on purpose. A single `stage` column would answer "where is this
-- now" and nothing else, and the reason for building this is the other
-- question — how many of these complete, and how long each step takes. That
-- needs every transition and the moment it happened, so the current stage is
-- derived from the newest row rather than stored beside it. Same reasoning as
-- the watchlist: it cannot fall out of step with the history because it is the
-- history.
--
-- Not called a pipeline. That word already means the Sunday run.

create table public.deal_progress (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,

  -- Six forward stages and two ways out. The exits matter as much as the
  -- stages: without them a dead deal sits at "viewing" for ever and the
  -- completion rate reads far higher than it is. Passed and fell_through are
  -- kept apart because they are different problems — one is picking badly,
  -- the other is losing deals late.
  stage       text not null,

  -- When the subscriber says it happened, which is not always when they got
  -- round to recording it. Defaults to now, and is what the ordering and every
  -- time-in-stage figure is measured against.
  entered_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint deal_progress_stage_known check (
    stage in ('interested', 'contacted', 'viewing', 'offer', 'accepted', 'completed', 'passed', 'fell_through')
  )
);

-- The read this table exists for: the newest row per property, for one owner.
create index deal_progress_current_idx
  on public.deal_progress (owner_id, property_id, entered_at desc);

-- The read the aggregate needs: everything in a stage, in time order.
create index deal_progress_stage_idx on public.deal_progress (stage, entered_at);

alter table public.deal_progress enable row level security;
alter table public.deal_progress force row level security;

create policy deal_progress_select_own on public.deal_progress
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- The exists() runs under the caller's own row level security, so a property
-- on somebody else's record is invisible to it and the insert fails. Progress
-- is scoped to your own deals by the same rule that scopes reading them.
create policy deal_progress_insert_own on public.deal_progress
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.properties p where p.id = property_id)
  );

-- Deleting is for a mis-click, not for tidying away a deal that died. The
-- honest exit is 'passed' or 'fell_through', and the wording in the app says
-- so. There is deliberately no update policy: a correction is another row,
-- and moving backwards is a real thing that happens to real deals.
create policy deal_progress_delete_own on public.deal_progress
  for delete to authenticated
  using (owner_id = (select auth.uid()));

comment on table public.deal_progress is
  'Append-only record of how far a subscriber got with a property. Current stage is the newest row; never stored separately.';

-- ---------------------------------------------------------------------------
-- The aggregate
-- ---------------------------------------------------------------------------
--
-- Counts, never people. There is no owner_id in here and no way to get one
-- back out of it: a subscriber's deal flow is theirs, and the question this
-- answers is "do the properties we pick complete", which does not need to know
-- whose they were.

create or replace view public.deal_progress_funnel
with (security_invoker = true) as
  with newest as (
    select distinct on (owner_id, property_id)
      owner_id, property_id, stage, entered_at
    from public.deal_progress
    order by owner_id, property_id, entered_at desc
  )
  select
    stage,
    count(*) as deals,
    count(distinct owner_id) as subscribers
  from newest
  group by stage;

comment on view public.deal_progress_funnel is
  'How many tracked deals currently sit at each stage. Aggregate only — no owner_id, by design.';

-- Time in stage, for "how long does an offer take to be accepted". Again
-- counts and durations, never a row that identifies anybody.
create or replace view public.deal_progress_durations
with (security_invoker = true) as
  with steps as (
    select
      owner_id,
      property_id,
      stage,
      entered_at,
      lead(entered_at) over (partition by owner_id, property_id order by entered_at) as left_at
    from public.deal_progress
  )
  select
    stage,
    count(*) filter (where left_at is not null) as transitions,
    avg(left_at - entered_at) filter (where left_at is not null) as average_time_in_stage,
    percentile_cont(0.5) within group (
      order by extract(epoch from (left_at - entered_at))
    ) filter (where left_at is not null) as median_seconds_in_stage
  from steps
  group by stage;

comment on view public.deal_progress_durations is
  'How long a tracked deal sits at each stage before moving. Aggregate only.';

-- security_invoker means these views are read under the caller's own row level
-- security, so a subscriber querying them sees only their own rows aggregated.
-- The cross-subscriber picture is the service role's, which is the admin.
grant select on public.deal_progress_funnel to authenticated, service_role;
grant select on public.deal_progress_durations to authenticated, service_role;
