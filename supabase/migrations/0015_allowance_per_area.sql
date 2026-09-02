-- Prop Signal — the credit allowance follows the plan.
--
-- `credit_allowances.monthly_credits` was sized for a subscriber with one
-- area: 500, against a measured 172 and a structural ceiling of 376 for a
-- single search. Left alone, a Portfolio subscriber with five areas would have
-- had the same 500 to share between them — so their first two areas would run
-- normally, their third would abort part way through, and their fourth and
-- fifth would produce nothing at all.
--
-- Worse, it would fail the way this codebase least likes: quietly. The wrapper
-- refuses a call it cannot afford and records the refusal, the run aborts and
-- writes its row, and the subscriber sees an empty list with no explanation
-- for an area they are paying for.
--
-- So the column becomes what it always was in spirit — an allowance per area —
-- and the entitled area count multiplies it. A Starter subscriber is unchanged
-- at 500. Investor gets 1,500, Portfolio 2,500, which at ~200 credits an area
-- leaves the same headroom the single-area plan had.

create or replace function public.credits_remaining(p_owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    0,
    coalesce(
      (select a.monthly_credits from public.credit_allowances a where a.owner_id = p_owner_id),
      0
    ) * public.area_limit_for(p_owner_id)
      - public.credits_spent_this_period(p_owner_id)
  );
$$;

revoke all on function public.credits_remaining(uuid) from public, authenticated, anon;
grant execute on function public.credits_remaining(uuid) to service_role;

comment on column public.credit_allowances.monthly_credits is
  'Credits per area per period. Multiplied by the plan''s area limit — see credits_remaining().';

-- ---------------------------------------------------------------------------
-- The run ceiling is already per profile and needs no change
-- ---------------------------------------------------------------------------
--
-- Checked rather than assumed: `runProfile` builds one PropertyData client per
-- profile with its own `runCreditCeiling`, so a subscriber with five areas
-- gets five independent ceilings of 100 or 150 rather than one shared between
-- them. That is the behaviour we want and it already holds. Recorded here so
-- the next person does not have to re-derive it.
