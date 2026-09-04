-- Prop Signal — the acknowledgement that the service starts immediately.
--
-- Under the Consumer Contracts (Information, Cancellation and Additional
-- Charges) Regulations 2013, somebody buying a service at a distance has
-- fourteen days to cancel. The right survives the service starting *unless* the
-- consumer expressly requested that it start inside those fourteen days and
-- acknowledged that doing so costs them the right.
--
-- That is not a technicality for this product. The opening list is built within
-- minutes of payment, draws on the whole standing inventory of an area, and is
-- the most expensive thing we do — a backfill ceiling of 150 credits against a
-- £29 subscription. Without this on record, a subscriber can take delivery of
-- the entire first month's value and cancel for a full refund, and we have
-- already spent the money producing it.
--
-- What is stored, and why it is more than a boolean:
--
--   ack_at       when they ticked it. The clock the fourteen days runs from.
--
--   ack_version  which wording they were shown. Wording will change; old
--                records must keep meaning what they meant.
--
--   ack_wording  the exact words, copied in at the time. The version alone
--                would be enough only for as long as nobody edits the wording
--                for an existing version, and "nobody will" is not evidence.
--                This is the column a dispute actually turns on, so it is
--                stored rather than derived.
--
-- Written by the checkout route with the service role, and resolved there from
-- the version rather than read out of the form: an acknowledgement the customer
-- could have authored is worth nothing as evidence. `accounts` rather than
-- `subscriptions` because the tick happens before Stripe has created anything.

alter table public.accounts
  add column cancellation_ack_at      timestamptz,
  add column cancellation_ack_version text,
  add column cancellation_ack_wording text;

comment on column public.accounts.cancellation_ack_at is
  'When the subscriber asked for the service to start immediately, accepting the loss of the 14-day cancellation right. Null means never asked.';

comment on column public.accounts.cancellation_ack_version is
  'Which wording was shown, keyed to ACKNOWLEDGEMENT_WORDING in src/lib/consumer-rights.ts.';

comment on column public.accounts.cancellation_ack_wording is
  'The exact words shown, copied at the time. This is the evidence; the version is the index into it.';

-- All three or none. A timestamp with no wording is a record that cannot be
-- produced in a dispute, which is the same as not having one.
alter table public.accounts
  add constraint accounts_cancellation_ack_complete check (
    (cancellation_ack_at is null
      and cancellation_ack_version is null
      and cancellation_ack_wording is null)
    or
    (cancellation_ack_at is not null
      and cancellation_ack_version is not null
      and cancellation_ack_wording is not null
      and length(cancellation_ack_wording) > 0)
  );

-- Readable by the subscriber it belongs to, under the existing select policy,
-- and not writable by them. 0001 revoked UPDATE on the whole table from
-- `authenticated` and granted it back for `display_name` alone, so a column
-- added here is unwritable by default — which is the behaviour we want and is
-- worth stating, because it is the reason nobody can back-date their own
-- acknowledgement. Adding a column that a subscriber *should* be able to edit
-- means granting it explicitly; this is not one of those.
