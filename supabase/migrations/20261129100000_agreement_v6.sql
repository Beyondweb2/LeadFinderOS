-- AGREEMENT v6 (Paul, 2026-10-29; docs/agreement-v6.md, src/lib/clientAgreement.ts V6, src/lib/paymentPlans.ts).
-- v6 is signed for the three payment plans (pay in full / 6 months / 12 months); the old £99 × 12 plan stays on v5.
-- Additive only: no row is updated or deleted. Signed v1-v5 records are untouched.

set local lock_timeout = '5s';

-- 1. The payment plan a signature was given for (v6 prints it in the agreed text too). The checkout gate requires it
--    to match the sign-up's plan. NULL on every older row (those versions never named a plan).
alter table public.client_agreement_acceptances add column if not exists payment_plan text;
alter table public.client_agreement_acceptances drop constraint if exists client_agreement_acceptances_payment_plan_check;
alter table public.client_agreement_acceptances add constraint client_agreement_acceptances_payment_plan_check
  check (payment_plan is null or payment_plan in ('full', 'six', 'twelve', 'legacy_twelve')) not valid;

-- 2. A v6 signature is agreement-first exactly like v5 (agree page, the sign-up, authority, terms, free to leave), and
--    must name its payment plan.
alter table public.client_agreement_acceptances drop constraint if exists agreement_first_acceptance_is_complete;
alter table public.client_agreement_acceptances add constraint agreement_first_acceptance_is_complete check (
  (agreement_version <> all (array['v3', 'v4', 'v5', 'v6']))
  or (
    method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null
    and (agreement_version not in ('v5', 'v6') or free_to_leave_provider is true)
    and (agreement_version <> 'v6' or payment_plan in ('full', 'six', 'twelve'))
  )
);

-- 3. The terms a v6 sale is stamped with.
alter table public.client_service_terms drop constraint if exists client_service_terms_commercial_terms_check;
alter table public.client_service_terms add constraint client_service_terms_commercial_terms_check
  check (commercial_terms in ('csa_v3_option_b', 'csa_v4_option_b', 'csa_v5_option_b', 'csa_v6_option_b'));
