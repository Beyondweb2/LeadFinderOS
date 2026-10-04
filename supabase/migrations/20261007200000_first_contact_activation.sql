-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- FIRST CONTACT — THE ACTIVATION STAMP (wave 1 integration, 2026-10-04; Paul's decision 3).
-- docs/pre-sales-certification/wave1-integration.md has the why.
--
-- Fix 03 made "Paul introduces himself and sends the setup link within two working days" the paid
-- client's first next step, but switched it on with a hard-coded day (FIRST_CONTACT_SINCE =
-- 2026-10-05). Paul ruled that out: the rule must start when the feature is actually live, and no
-- historical client may suddenly read "overdue".
--
-- outreach_leads.first_contact_owed_since is that start, PER CLIENT. stripe-webhook writes it on the
-- payment that made the lead a client (_shared/payment-state.ts stampFirstContactOwed) — only the new
-- code does, so the rule applies from the first payment it processes and never to a client paid
-- before. src/lib/firstContact.ts reads it: no stamp → "not recorded before this existed".
--
-- ⚠️ SORTS AFTER 20261007030000_payment_client_state.sql (which adds client_contacted_at, read by the
--    same select list). Run it with that file, BEFORE stripe-webhook / paid-client-hub / quick-close
--    are deployed: _shared/client-setup.ts selects this column for every Paid Client view.
-- ADDITIVE AND IDEMPOTENT. Nothing is back-filled, no row changes.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.outreach_leads add column if not exists first_contact_owed_since timestamptz;

comment on column public.outreach_leads.first_contact_owed_since is
  'When first contact became owed: stamped by stripe-webhook on the payment that made this lead a client (wave 1 integration). NULL = the first-contact rule never applied (src/lib/firstContact.ts).';

-- Read back:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'outreach_leads' and column_name = 'first_contact_owed_since';
--   select count(*) from public.outreach_leads where first_contact_owed_since is not null;   -- 0 right after
