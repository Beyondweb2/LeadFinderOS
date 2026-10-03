-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- A PAID CLIENT WHO ENDS THE ENGAGEMENT EARLY (2026-10-03).
--
-- outreach_leads.service_terminated_at is the ONE terminal mark for a paid client's service: every reader
-- that stops future work keys on it (remeasure firer, results sender, weekly check, performance sync, the
-- admin counts, the delivery stage). Until now its reason allowed only Findable ending it over a domain /
-- authority dispute. This adds the second, general reason: the CLIENT chose to stop before the term ran
-- out ('client_ended_early') — what they paid is kept, nothing further is owed either way. The words for
-- each reason live in src/lib/serviceEnd.ts; the write is paid-client-hub `terminate_service`.
-- Additive: widens a CHECK. Idempotent. No row is changed here.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';
alter table public.outreach_leads drop constraint if exists outreach_leads_service_termination_check;
alter table public.outreach_leads add constraint outreach_leads_service_termination_check check (
  service_termination_reason is null or service_termination_reason in ('domain_authority_dispute', 'client_ended_early')) not valid;
alter table public.outreach_leads validate constraint outreach_leads_service_termination_check;
