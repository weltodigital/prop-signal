-- Prop Signal — Phase 6. The watchlist.
--
-- Starring a property costs nothing and can never cost anything. There is no
-- new sourcing behind it: the weekly diff already writes every event for every
-- property in the user's area, and a notification is a row that was going to be
-- written anyway, read back through this table.
--
-- That is why there is no notifications table. A notification is not a thing we
-- store — it is a material event on a watched property, observed since the user
-- last looked. Derived, so it can never fall out of step with the events.

create table public.watchlist (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,

  created_at     timestamptz not null default now(),

  -- Everything material observed up to here has been read. Defaults to the
  -- moment of starring, so the history the user could already see on the
  -- property page does not arrive as a stack of unread notifications.
  events_seen_at timestamptz not null default now(),

  constraint watchlist_once unique (owner_id, property_id)
);

create index watchlist_owner_idx on public.watchlist (owner_id, created_at desc);
create index watchlist_property_idx on public.watchlist (property_id);

alter table public.watchlist enable row level security;
alter table public.watchlist force row level security;

create policy watchlist_select_own on public.watchlist
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- The exists() is evaluated under the caller's own row level security, so a
-- property belonging to somebody else is not visible to it and the insert
-- fails. Starring is scoped to your own record by the same rule that scopes
-- reading it.
create policy watchlist_insert_own on public.watchlist
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.properties p where p.id = property_id)
  );

create policy watchlist_delete_own on public.watchlist
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Marking notifications read is the only update a user makes here.
create policy watchlist_update_own on public.watchlist
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

comment on table public.watchlist is
  'Properties a user has starred. Notifications are derived from property_events observed after events_seen_at, never stored.';
