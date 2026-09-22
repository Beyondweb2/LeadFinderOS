-- WEBSITE BUILD WORKFLOW STATE — Section 5 of the Paid Client hub.
--
-- One additive jsonb column holding ONLY the operator's website-rebuild workflow state:
--   { repo_url, local_repo_path, preview_url, production_url, canonical_domain, status, notes }
--
-- ⛔ OPERATOR-ONLY. Nothing in here is ever rendered into a client-facing document. The public
--    Welcome Pack route selects its columns explicitly and this one is not among them
--    (scripts/welcome-pack-public-safety.test.ts pins that).
--
-- ⚠️ NOT delivery_checklist. That column is a map of booleans read by the delivery cockpit; mixing
--    a shape into it would make one column mean two things. A separate column costs nothing and
--    keeps both readable.
--
-- Backward compatible: NOT NULL with a '{}' default, so every existing row is valid immediately and
-- every reader that does not know about it is unaffected. Idempotent.
alter table public.outreach_leads
  add column if not exists website_build jsonb not null default '{}'::jsonb;

comment on column public.outreach_leads.website_build is
  'Operator-only website rebuild workflow state (repo_url, local_repo_path, preview_url, production_url, canonical_domain, status, notes). Never client-facing.';
