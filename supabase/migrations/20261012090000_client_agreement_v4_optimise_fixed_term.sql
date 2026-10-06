-- 20261012090000_client_agreement_v4_optimise_fixed_term.sql
-- Client Service Agreement v4 (Paul, 2026-10-06): Findable Optimise is a FIXED TERM — six £99 payments in
-- total, then the payments stop; only Findable Build continues at £29.99 a month (clause 9A). Branch
-- improve/sales-script-commercial-alignment. NOT APPLIED — run by the integration session, one block at a
-- time, read back, BEFORE deploying any function that writes 'csa_v4_option_b' (client-agreement,
-- findable-checkout, stripe-webhook) — the live check refuses that value until block 1 runs.
--
-- Additive only. Checked live 2026-10-06 before writing: client_agreement_acceptances holds 8 rows, all v1
-- (no v3 or v4 row exists); client_service_terms holds 0 rows. So every constraint below validates against
-- the existing data, and no existing row changes.

-- ── 1. The terms a client is stamped with: v3 OR v4 ─────────────────────────────────────────────────
alter table public.client_service_terms
  drop constraint if exists client_service_terms_commercial_terms_check;
alter table public.client_service_terms
  add constraint client_service_terms_commercial_terms_check
  check (commercial_terms in ('csa_v3_option_b', 'csa_v4_option_b'));

-- ── 2. A v4 Optimise client can never be given a Continuing Service state ────────────────────────────
-- Defence in depth behind paid-client-hub (which refuses the three continuing actions for them) and
-- clientTimeline.continuingServiceApplies (which raises no reminder or decision for them).
alter table public.client_service_terms
  drop constraint if exists v4_optimise_has_no_continuing_service;
alter table public.client_service_terms
  add constraint v4_optimise_has_no_continuing_service check (
    not (commercial_terms = 'csa_v4_option_b' and service_route = 'optimise')
    or (continuing_prepared_at is null and continuing_reminder_sent_at is null and continuing_decision is null)
  );

-- ── 3. A v4 acceptance is complete in the same way a v3 one is ───────────────────────────────────────
-- The agreement page only, bound to one sign-up, with the authority tick and the terms.
alter table public.client_agreement_acceptances
  drop constraint if exists v4_acceptance_is_complete;
alter table public.client_agreement_acceptances
  add constraint v4_acceptance_is_complete check (
    agreement_version <> 'v4'
    or (method = 'agree_page' and onboarding_id is not null and authority_confirmed is true and commercial_terms is not null)
  );

-- ── 4. An agreement-first signature names the terms ITS version puts a sale on ──────────────────────
-- (clientAgreement.ts AGREEMENT_FIRST_TERMS). A v4 signature can never carry v3's terms, or the reverse.
alter table public.client_agreement_acceptances
  drop constraint if exists agreement_first_terms_match_version;
alter table public.client_agreement_acceptances
  add constraint agreement_first_terms_match_version check (
    (agreement_version <> 'v3' or commercial_terms = 'csa_v3_option_b')
    and (agreement_version <> 'v4' or commercial_terms = 'csa_v4_option_b')
  );

-- The one-signature-per-sign-up index (onboarding_id, agreement_version) already covers v4: a sign-up can
-- hold at most one v4 signature. client_agreement_versions gets its 'v4' row from the first v4 acceptance
-- (ensureAgreementVersion), exactly as v3 would have.

-- Read back (run after applying):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'client_service_terms_commercial_terms_check';
--     → CHECK ((commercial_terms = ANY (ARRAY['csa_v3_option_b'::text, 'csa_v4_option_b'::text])))
--   select conname from pg_constraint where conname in ('v4_optimise_has_no_continuing_service', 'v4_acceptance_is_complete', 'agreement_first_terms_match_version');
--     → 3 rows
--   select agreement_version, count(*) from public.client_agreement_acceptances group by 1;   -- unchanged (v1: 8)
