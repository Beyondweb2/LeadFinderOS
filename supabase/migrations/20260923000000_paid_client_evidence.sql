-- Paid Client evidence pipeline (2026-09-23).
--
-- ADDITIVE AND IDEMPOTENT. Nothing is dropped, renamed or rewritten; every existing reader keeps
-- reading exactly the columns it read before.
--
-- lead_crawl_checks stays ONE ROW PER LEAD (unique lead_id) — the canonical latest crawl. The FULL
-- manual crawl's evidence goes in its own column so the Outreach table and the Inbox, which select
-- `result` for every lead in the book, never download it.
alter table public.lead_crawl_checks add column if not exists mode text;
alter table public.lead_crawl_checks add column if not exists full_evidence jsonb;
alter table public.lead_crawl_checks add column if not exists requested_from text;

-- Onboarding answers entered by the OPERATOR on the client's behalf. The answers themselves go in
-- the same columns the customer flow writes; these two record who typed them, so an operator entry
-- is never mistaken for the customer having submitted it.
alter table public.onboarding_responses add column if not exists operator_edited_at timestamptz;
alter table public.onboarding_responses add column if not exists operator_edited_by uuid;
