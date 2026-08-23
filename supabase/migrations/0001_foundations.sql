-- Prop Signal — Phase 1 foundations.
--
-- Rules that hold for every migration in this project:
--   1. Row Level Security is enabled on every table in public, in the same
--      migration that creates the table. No exceptions, no "we'll add it later".
--   2. Every user-owned row carries owner_id referencing auth.users(id).
--   3. Tables with no owner_id are service-role-only: RLS is enabled and no
--      policy is granted, which denies anon and authenticated outright.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- accounts — one row per authenticated user.
--
-- Deliberately not called "profiles": in this product a *profile* is a saved
-- search (area + strategy) and arrives in Phase 3 as search_profiles.
-- ---------------------------------------------------------------------------

create table public.accounts (
  id           uuid primary key references auth.users(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint accounts_owner_is_self check (id = owner_id)
);

create index accounts_owner_id_idx on public.accounts (owner_id);

create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function public.touch_updated_at();

alter table public.accounts enable row level security;
alter table public.accounts force row level security;

create policy accounts_select_own on public.accounts
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Users may edit their display name. id, owner_id, email and is_admin are
-- pinned by the WITH CHECK plus the column-level grant below.
create policy accounts_update_own on public.accounts
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke update on public.accounts from authenticated;
grant update (display_name) on public.accounts to authenticated;

-- No insert or delete policy: rows are created by the auth trigger below and
-- removed by the cascade from auth.users.

-- ---------------------------------------------------------------------------
-- Provision an account row whenever a user signs up.
-- ---------------------------------------------------------------------------

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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- billing_customers — the Stripe customer belonging to a user. One each.
-- ---------------------------------------------------------------------------

create table public.billing_customers (
  owner_id           uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger billing_customers_touch_updated_at
  before update on public.billing_customers
  for each row execute function public.touch_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;

create policy billing_customers_select_own on public.billing_customers
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Writes are service-role only: the Stripe customer id is set by checkout and
-- the webhook handler, never by the browser.

-- ---------------------------------------------------------------------------
-- subscriptions — a local mirror of Stripe. Stripe is the source of truth;
-- this table exists so entitlement checks are one indexed read, not a network
-- call. Every column is written from a signature-verified webhook.
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id                     text primary key,          -- Stripe subscription id
  owner_id               uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id     text not null,
  status                 text not null,             -- Stripe status, verbatim
  price_id               text,
  product_id             text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  canceled_at            timestamptz,
  trial_end              timestamptz,
  -- Guards against an out-of-order webhook overwriting newer state.
  stripe_updated_at      timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_owner_id_idx on public.subscriptions (owner_id);
create index subscriptions_owner_status_idx on public.subscriptions (owner_id, status);
create index subscriptions_customer_idx on public.subscriptions (stripe_customer_id);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- No client write policies. Only the webhook, holding the service role key,
-- may write here.

-- ---------------------------------------------------------------------------
-- stripe_webhook_events — every event Stripe sends, recorded before it is
-- acted on. Gives idempotency (the primary key is Stripe's event id) and a
-- record to reconcile against when something goes wrong.
--
-- No owner_id: service-role only. RLS on, zero policies, so authenticated and
-- anon are denied entirely.
-- ---------------------------------------------------------------------------

create table public.stripe_webhook_events (
  id           text primary key,                    -- Stripe event id (evt_...)
  type         text not null,
  api_version  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);

create index stripe_webhook_events_type_idx on public.stripe_webhook_events (type, received_at desc);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

-- ---------------------------------------------------------------------------
-- Entitlement.
--
-- "trialing" counts because Stripe reports it for a paid plan inside its trial
-- window. "past_due" does not: the card has failed and every run costs us real
-- PropertyData credits, so access stops while Stripe retries.
-- ---------------------------------------------------------------------------

create or replace function public.has_active_subscription(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.owner_id = p_owner_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Service role only. It is security definer and takes any user id, so exposing
-- it to authenticated would let one subscriber probe another's billing state.
-- The browser and server components read entitlement through RLS instead.
revoke all on function public.has_active_subscription(uuid) from public;
revoke all on function public.has_active_subscription(uuid) from authenticated, anon;
grant execute on function public.has_active_subscription(uuid) to service_role;
