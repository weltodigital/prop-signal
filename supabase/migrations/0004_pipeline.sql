-- Prop Signal — Phase 4. The weekly pipeline.
--
-- Everything below is derived material: dated historical observations, our own
-- events, our own scores. PropertyData permit this to be kept indefinitely
-- provided it carries its retrieval date and is never used to answer a question
-- about the present. Every table here carries observed_at for that reason, and
-- the interface labels every figure with it.
--
-- Raw payloads are not here. They live in api_cache and expire at 60 days.

-- ---------------------------------------------------------------------------
-- pipeline_runs — one row per profile per run.
--
-- batch_id groups the profiles processed by a single cron invocation, so one
-- Sunday night is one batch and a failure in one profile does not lose the
-- record of the others.
-- ---------------------------------------------------------------------------

create type public.run_kind as enum ('backfill', 'weekly', 'manual');
create type public.run_status as enum ('running', 'completed', 'failed', 'aborted');

create table public.pipeline_runs (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid not null,
  owner_id            uuid not null references auth.users(id) on delete cascade,
  profile_id          uuid references public.search_profiles(id) on delete set null,

  kind                public.run_kind not null,
  status              public.run_status not null default 'running',

  -- The retrieval date every observation and event from this run carries.
  observed_at         timestamptz not null default now(),
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,

  candidates_seen     integer not null default 0,
  candidates_filtered integer not null default 0,
  candidates_enriched integer not null default 0,
  events_written      integer not null default 0,
  deals_selected      integer not null default 0,
  credits_spent       integer not null default 0,
  cache_hits          integer not null default 0,
  error               text,

  created_at          timestamptz not null default now()
);

create index pipeline_runs_owner_idx on public.pipeline_runs (owner_id, started_at desc);
create index pipeline_runs_batch_idx on public.pipeline_runs (batch_id);

alter table public.pipeline_runs enable row level security;
alter table public.pipeline_runs force row level security;

create policy pipeline_runs_select_own on public.pipeline_runs
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- usage_events.run_id now has somewhere to point.
alter table public.usage_events
  add constraint usage_events_run_fk foreign key (run_id)
  references public.pipeline_runs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- properties — identity, plus the most recent observation of each one.
--
-- Scoped by owner. There is no cross-user table of properties and no index that
-- would let one be searched: the only lookup is (owner_id, property_key), which
-- is how a per-user record stays a per-user record.
--
-- Every "current" column here is the value as observed at last_observed_at, and
-- is presented to the user with that date attached. It is a dated observation,
-- not an answer about what is true right now.
-- ---------------------------------------------------------------------------

create type public.listing_state as enum ('listed', 'sstc', 'withdrawn');

create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  -- Stable identity derived from the listing. See src/lib/pipeline/identity.ts.
  property_key        text not null,

  first_observed_at   timestamptz not null,
  last_observed_at    timestamptz not null,
  last_run_id         uuid references public.pipeline_runs(id) on delete set null,

  -- The latest observation. Every one of these is "as at last_observed_at".
  address             text,
  postcode            text,
  price               integer,
  bedrooms            integer,
  bathrooms           integer,
  property_type       text,
  listing_url         text,
  agent               text,
  state               public.listing_state not null default 'listed',
  days_on_market      integer,
  first_listed_at     date,
  lists               text[],

  -- The lowest and highest price we have ever observed, which is what makes a
  -- reduction legible without replaying every event.
  lowest_price_seen   integer,
  highest_price_seen  integer,

  -- Enrichment, also dated. Null until a candidate is enriched.
  enriched_at         timestamptz,
  estimated_value     integer,
  estimated_rent      integer,
  area_demand_rating  numeric(5, 2),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint properties_scope unique (owner_id, property_key)
);

-- The only lookup path. Deliberately no index on address, postcode or price:
-- an index over those is what would turn a per-user record into a searchable
-- copy of PropertyData's data.
create index properties_owner_run_idx on public.properties (owner_id, last_run_id);
create index properties_owner_state_idx on public.properties (owner_id, state);

create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function public.touch_updated_at();

alter table public.properties enable row level security;
alter table public.properties force row level security;

create policy properties_select_own on public.properties
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- property_events — the diff. Permanent, dated, never rewritten.
--
-- This is the product. Anyone can see what came onto the market this week; what
-- has moved since last week is what these rows record.
-- ---------------------------------------------------------------------------

create type public.event_type as enum (
  'first_seen',
  'price_reduced',
  'price_increased',
  'returned_to_market',
  'marked_sstc',
  'no_longer_listed',
  'days_on_market_crossed'
);

create table public.property_events (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  profile_id     uuid references public.search_profiles(id) on delete set null,
  run_id         uuid references public.pipeline_runs(id) on delete set null,

  event_type     public.event_type not null,

  -- The retrieval date. Not the time the row was written — the time the data
  -- behind it was observed. Everything shown to a user is labelled with this.
  observed_at    timestamptz not null,

  previous_value jsonb,
  current_value  jsonb,

  -- Signed size of the move, in the natural unit for the type: percent for a
  -- price change, days for a days-on-market crossing. Null where meaningless.
  magnitude      numeric(10, 2),

  -- Whether this event on its own can justify showing the property again.
  is_material    boolean not null default false,

  -- Natural key for the event, so the same move is never recorded twice.
  dedupe_key     text not null,

  created_at     timestamptz not null default now(),

  constraint property_events_once unique (owner_id, property_id, dedupe_key)
);

create index property_events_property_idx on public.property_events (property_id, observed_at desc);
create index property_events_owner_observed_idx on public.property_events (owner_id, observed_at desc);
create index property_events_material_idx on public.property_events (owner_id, is_material, observed_at desc)
  where is_material;

alter table public.property_events enable row level security;
alter table public.property_events force row level security;

create policy property_events_select_own on public.property_events
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- deal_impressions — what we have shown each user, and why.
--
-- The table that stops the list becoming repetitive. A property may return, but
-- only on the back of an event it has not already been shown for.
-- ---------------------------------------------------------------------------

create table public.deal_impressions (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  property_id         uuid not null references public.properties(id) on delete cascade,
  run_id              uuid references public.pipeline_runs(id) on delete set null,

  shown_at            timestamptz not null default now(),

  -- The event that justified showing it. Null only for a first_seen entry on a
  -- backfill, where the justification is that the user has never seen it.
  qualifying_event_id uuid references public.property_events(id) on delete set null,

  position            integer not null,
  quality_score       numeric(6, 2) not null,
  movement_score      numeric(6, 2) not null,
  total_score         numeric(6, 2) not null,
  score_version       text not null,
  score_breakdown     jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now()
);

-- A property must never appear twice for the same event.
create unique index deal_impressions_once_per_event
  on public.deal_impressions (owner_id, property_id, qualifying_event_id)
  where qualifying_event_id is not null;

-- And never twice on the strength of having never been seen.
create unique index deal_impressions_once_unseen
  on public.deal_impressions (owner_id, property_id)
  where qualifying_event_id is null;

create index deal_impressions_owner_shown_idx on public.deal_impressions (owner_id, shown_at desc);
create index deal_impressions_run_idx on public.deal_impressions (run_id);

alter table public.deal_impressions enable row level security;
alter table public.deal_impressions force row level security;

create policy deal_impressions_select_own on public.deal_impressions
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- weekly_selections — the single source of truth for what was published, when.
--
-- Written by the run. A future email or push reads from this and nothing else,
-- so a notification channel can be added without touching the pipeline.
-- ---------------------------------------------------------------------------

create table public.weekly_selections (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  run_id         uuid not null references public.pipeline_runs(id) on delete cascade,

  kind           public.run_kind not null,
  published_at   timestamptz not null default now(),
  -- The Monday the list belongs to, so an archive reads naturally.
  week_of        date not null,

  deal_count     integer not null default 0,
  -- Fewer than five qualified. Shown to the user as such rather than padded.
  is_thin        boolean not null default false,
  -- Why it was thin, in one plain sentence, or null.
  thin_reason    text,

  -- Set when the user opens it, so an unseen marker can be cleared.
  seen_at        timestamptz,
  -- Reserved for a future notification channel. Nothing writes it yet.
  notified_at    timestamptz,

  created_at     timestamptz not null default now(),

  constraint weekly_selections_once_per_run unique (owner_id, run_id)
);

create index weekly_selections_owner_published_idx
  on public.weekly_selections (owner_id, published_at desc);

alter table public.weekly_selections enable row level security;
alter table public.weekly_selections force row level security;

create policy weekly_selections_select_own on public.weekly_selections
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- The user may mark their own list as seen. Nothing else about it.
create policy weekly_selections_update_own on public.weekly_selections
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke update on public.weekly_selections from authenticated;
grant update (seen_at) on public.weekly_selections to authenticated;
