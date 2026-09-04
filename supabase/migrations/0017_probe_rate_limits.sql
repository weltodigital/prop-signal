-- Prop Signal — bounding what a free account can spend.
--
-- The area check runs before checkout, on purpose: somebody in a sparse market
-- should find out their list would be short before they pay for it. It is the
-- only thing in this product that spends a credit for an account with no
-- subscription, and it is capped at 25 credits a call and three calls per
-- account per allowance period.
--
-- Three per account is the right shape and the wrong unit. Accounts are free,
-- unlimited, and need nothing but an email address, so "three per account" is
-- three per email address — and a hundred throwaway addresses is 7,500 credits,
-- which is more than the subscription the exercise was pretending to consider.
-- A quota counted in the one thing an attacker mints for nothing is not a
-- quota; it is a unit conversion.
--
-- So two bounds that are not the account:
--
--   origin_hash  the caller's address, hashed with the service role key as the
--                salt. Counts requests without keeping the addresses. Rotating
--                the key rotates the counter, which is a fair price for not
--                storing an IP. Null where no proxy header reached us, in which
--                case the daily ceiling below is the only thing holding.
--
--   subscribed   whether the account had paid at the time of the probe, so the
--                daily ceiling can bound unpaid spending specifically. A
--                subscriber checking a second area is not what this guards
--                against and should not be queued behind it.
--
-- Both counters ignore probes that spent nothing. A repeat of the same search
-- is served out of the stored answer and has never cost a credit, so it has
-- never been the thing worth limiting.

alter table public.search_probes
  add column origin_hash text,
  add column subscribed  boolean not null default false;

comment on column public.search_probes.origin_hash is
  'Salted SHA-256 of the caller''s IP. Bounds spending by something other than the account, which is free to create. Never the address itself.';

comment on column public.search_probes.subscribed is
  'Whether the account had an active subscription when this probe ran. The daily ceiling counts only the ones that did not.';

-- Both limits are "paid probes in the last day", counted two ways. Partial on
-- credits_spent because a probe served from cache is never counted and is much
-- the commoner row.
create index search_probes_origin_idx
  on public.search_probes (origin_hash, created_at desc)
  where credits_spent > 0;

create index search_probes_unpaid_idx
  on public.search_probes (created_at desc)
  where credits_spent > 0 and not subscribed;
