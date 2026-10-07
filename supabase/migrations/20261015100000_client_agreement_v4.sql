-- 20261015100000_client_agreement_v4.sql
-- Client Service Agreement v4 (Findable_Client_Service_Agreement_v4_clean.docx, 2026-10-07).
--
-- Additive and idempotent. No existing row is changed: the one v3 acceptance and the one v3
-- client_service_terms row stay exactly as they are (v3 signers keep what they signed).
--
-- 1. A v4 signature is, like v3, ALWAYS the agreement page, ALWAYS bound to its sign-up, ALWAYS carries the
--    authority confirmation (clause 1.4) and the commercial terms. The v3-only check becomes "agreement-first
--    versions" (v3 and v4). v1 rows are unaffected (the check passes for any other version).
-- 2. client_service_terms may be stamped csa_v4_option_b (same Option B payment timing as v3; what follows the
--    minimum term differs — src/lib/clientTimeline.ts continuingModeFor).
-- 3. The client_agreement_versions row for v4 is written by the agreement function on the first acceptance
--    (ensureAgreementVersion: one row, a different template under the same id is a hard stop) — nothing here.

alter table public.client_agreement_acceptances
  drop constraint if exists v3_acceptance_is_complete;
alter table public.client_agreement_acceptances
  drop constraint if exists agreement_first_acceptance_is_complete;
alter table public.client_agreement_acceptances
  add constraint agreement_first_acceptance_is_complete check (
    agreement_version not in ('v3', 'v4')
    or (method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null)
  );

alter table public.client_service_terms
  drop constraint if exists client_service_terms_commercial_terms_check;
alter table public.client_service_terms
  add constraint client_service_terms_commercial_terms_check check (commercial_terms in ('csa_v3_option_b', 'csa_v4_option_b'));

-- Read-back (run after applying):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('agreement_first_acceptance_is_complete', 'client_service_terms_commercial_terms_check');
--   select count(*) from pg_constraint where conname = 'v3_acceptance_is_complete';   -- 0
