-- Prop Signal — area-level enrichment.
--
-- One row per run per profile. Every candidate in a search shares these, so a
-- run pays one credit per endpoint however many properties it scores. That is
-- the whole reason they are kept apart from `properties`.
--
-- Derived, dated material like everything else in this schema: what the area
-- looked like at observed_at, not a claim about today.

create table public.area_insights (
  id                        uuid primary key default gen_random_uuid(),
  owner_id                  uuid not null references auth.users(id) on delete cascade,
  profile_id                uuid references public.search_profiles(id) on delete set null,
  run_id                    uuid not null references public.pipeline_runs(id) on delete cascade,

  postcode                  text not null,
  observed_at               timestamptz not null,

  -- Completed sales per square foot. Preferred to a sale valuation because it
  -- owes nothing to what anyone is currently asking.
  sold_price_per_sqf        integer,
  sold_price_per_sqf_low    integer,
  sold_price_per_sqf_high   integer,
  sold_transactions         integer,
  sold_latest               date,
  -- Share of nearby sales that were leasehold, 0 to 1. The only tenure signal
  -- this API offers, and it is about the area rather than the property.
  leasehold_share           numeric(4, 3),

  local_gross_yield_pct     numeric(6, 2),
  flood_risk                text,
  council                   text,
  council_rating            text,
  council_tax_band_d        numeric(10, 2),
  growth_1y_pct             numeric(6, 2),
  growth_5y_pct             numeric(6, 2),

  created_at                timestamptz not null default now(),

  constraint area_insights_once_per_run unique (owner_id, run_id)
);

create index area_insights_owner_observed_idx on public.area_insights (owner_id, observed_at desc);

alter table public.area_insights enable row level security;
alter table public.area_insights force row level security;

create policy area_insights_select_own on public.area_insights
  for select to authenticated
  using (owner_id = (select auth.uid()));

comment on table public.area_insights is
  'Area-level enrichment, one row per run. Shared by every candidate in the search, which is why it is not on properties.';
