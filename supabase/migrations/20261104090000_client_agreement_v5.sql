-- 20261104090000_client_agreement_v5.sql
-- Client Service Agreement v5 (Findable_Client_Service_Agreement_v5_clean.docx, Jess approved 2026-10-16).
--
-- Additive and idempotent. No existing row is changed: every v1 / v3 / v4 acceptance and every client_service_terms
-- row stays exactly as it is (a client who signed v4 or v3 keeps what they signed).
--
-- 1. Clause 1.6 ("We record your answers with your acceptance"): two new nullable columns on the write-once
--    acceptance table, the current provider (null = none) and the client's own "free to leave" answer. Older
--    versions never asked, so their rows stay null.
-- 2. A v5 signature is, like v3 and v4, ALWAYS the agreement page, bound to its sign-up, with authority and terms,
--    AND it must carry free_to_leave_provider = true: a client tied into a contract is not taken on (1.6, 7.2).
-- 3. client_service_terms may be stamped csa_v5_option_b (the same Option B payment timing as v3 and v4).
-- 4. The client_agreement_versions row for v5 is written by the agreement function on the first acceptance
--    (ensureAgreementVersion) - nothing here.

alter table public.client_agreement_acceptances
  add column if not exists current_provider text,
  add column if not exists free_to_leave_provider boolean;

alter table public.client_agreement_acceptances
  drop constraint if exists agreement_first_acceptance_is_complete;
alter table public.client_agreement_acceptances
  add constraint agreement_first_acceptance_is_complete check (
    agreement_version not in ('v3', 'v4', 'v5')
    or (
      method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null
      and (agreement_version <> 'v5' or free_to_leave_provider is true)
    )
  );

alter table public.client_service_terms
  drop constraint if exists client_service_terms_commercial_terms_check;
alter table public.client_service_terms
  add constraint client_service_terms_commercial_terms_check
  check (commercial_terms in ('csa_v3_option_b', 'csa_v4_option_b', 'csa_v5_option_b'));

-- Read-back (run after applying):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_name = 'client_agreement_acceptances' and column_name in ('current_provider', 'free_to_leave_provider');
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('agreement_first_acceptance_is_complete', 'client_service_terms_commercial_terms_check');
