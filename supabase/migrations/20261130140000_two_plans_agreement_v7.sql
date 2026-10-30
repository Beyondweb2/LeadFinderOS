-- TWO PLANS + AGREEMENT v7 (Paul, 2026-10-30; docs/two-plans.md, docs/agreement-v7.md, src/lib/paymentPlans.ts).
-- Findable Complete (plan id 'complete', £99 x 12) is sold beside Findable Essential (the v6 plans 'full', 'six', 'twelve').
-- New sign-ups for both are signed on v7; v6 is archived (its signed rows stay valid). The old 'legacy_twelve' stays on v5.
-- Additive only: each check is widened to accept the new values. No row is updated or deleted.

set local lock_timeout = '5s';

-- 1. The new plan id, everywhere a plan is stored.
alter table public.onboarding_responses drop constraint if exists onboarding_responses_payment_plan_check;
alter table public.onboarding_responses add constraint onboarding_responses_payment_plan_check
  check (payment_plan is null or payment_plan in ('complete', 'full', 'six', 'twelve', 'legacy_twelve')) not valid;

alter table public.outreach_leads drop constraint if exists outreach_leads_payment_plan_check;
alter table public.outreach_leads add constraint outreach_leads_payment_plan_check
  check (payment_plan is null or payment_plan in ('complete', 'full', 'six', 'twelve', 'legacy_twelve')) not valid;

alter table public.client_agreement_acceptances drop constraint if exists client_agreement_acceptances_payment_plan_check;
alter table public.client_agreement_acceptances add constraint client_agreement_acceptances_payment_plan_check
  check (payment_plan is null or payment_plan in ('complete', 'full', 'six', 'twelve', 'legacy_twelve')) not valid;

-- The 9A.5 Plan Period reminder (fn plan-period-reminder) covers Complete too.
alter table public.plan_period_reminders drop constraint if exists plan_period_reminders_payment_plan_check;
alter table public.plan_period_reminders add constraint plan_period_reminders_payment_plan_check
  check (payment_plan in ('complete', 'full', 'six', 'twelve'));

-- 2. A v7 signature is agreement-first exactly like v6, and must name one of the two plans' payment plans.
alter table public.client_agreement_acceptances drop constraint if exists agreement_first_acceptance_is_complete;
alter table public.client_agreement_acceptances add constraint agreement_first_acceptance_is_complete check (
  (agreement_version <> all (array['v3', 'v4', 'v5', 'v6', 'v7']))
  or (
    method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null
    and (agreement_version not in ('v5', 'v6', 'v7') or free_to_leave_provider is true)
    and (agreement_version <> 'v6' or payment_plan in ('full', 'six', 'twelve'))
    and (agreement_version <> 'v7' or payment_plan in ('complete', 'full', 'six', 'twelve'))
  )
);

-- 3. The terms a v7 sale is stamped with.
alter table public.client_service_terms drop constraint if exists client_service_terms_commercial_terms_check;
alter table public.client_service_terms add constraint client_service_terms_commercial_terms_check
  check (commercial_terms in ('csa_v3_option_b', 'csa_v4_option_b', 'csa_v5_option_b', 'csa_v6_option_b', 'csa_v7_two_plans'));
