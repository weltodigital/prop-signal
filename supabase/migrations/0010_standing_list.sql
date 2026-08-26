-- Prop Signal — the list stands.
--
-- This product sources deals. A deal is good because of what it is, not
-- because something happened to it, and the two rules below were built on the
-- opposite assumption: a property could be published once for never having
-- been seen, and once more per material event, and then never again.
--
-- That made the best deal in an area invisible from week two, purely because
-- the subscriber had already seen it. A sourcing product that hides its best
-- deal is not sourcing.
--
-- So a property now stays on the list while it stays good, and leaves only
-- when the subscriber removes it. Each run records the list as it stood, which
-- means the same property is written once per run rather than once per reason.

drop index if exists public.deal_impressions_once_per_event;
drop index if exists public.deal_impressions_once_unseen;

-- One row per property per run. Re-running a run is still idempotent, which is
-- what the upsert on this table relies on, but a standing property can now be
-- published again next week.
create unique index deal_impressions_once_per_run
  on public.deal_impressions (owner_id, property_id, run_id);

comment on index public.deal_impressions_once_per_run is
  'The list as it stood in one run. A property stays on the list across runs, so it is recorded once per run rather than once per qualifying event.';

-- What changed since the subscriber last looked, which is now the job the
-- event does. It no longer decides whether a property appears.
alter table public.deal_impressions
  add column changed_since_seen boolean not null default false;

comment on column public.deal_impressions.changed_since_seen is
  'True where the qualifying event landed after this property was last shown to this subscriber. Drives the "changed" marker, not whether it appears.';

-- Counting what a run left out, so a short list can be explained.
alter table public.pipeline_runs
  add column if not exists candidates_removed integer not null default 0;

comment on column public.pipeline_runs.candidates_removed is
  'Candidates left out because the subscriber had taken them off their list.';

-- Removal is the `passed` stage of deal_progress rather than a table of its
-- own. Marking a property passed and taking it off the list are the same
-- decision, and two mechanisms for one decision is how they drift apart.
comment on table public.deal_progress is
  'Append-only record of how far a subscriber got with a property. Current stage is the newest row. A newest stage of ''passed'' also takes the property off the sourced list.';
