-- ═══ TPS / CTPS SCREENING — the per-number cache read (2026-11-16, branch v1-tps-templates-callable) ═══════════════
-- twilio-voice-token (supabase/functions/_shared/tps-screen.ts) asks "is there a current answer for THIS NUMBER?" before
-- it pays tpsmydata for a check, so a number is never checked twice within 28 days whichever lead it belongs to.
-- Additive: one index on a table that holds 0 rows today. Writes stay service-role only; RLS / grants unchanged.
create index if not exists phone_tps_checks_phone on public.phone_tps_checks (phone, checked_at desc);
comment on table public.phone_tps_checks is
  'TPS / CTPS answers per number (docs/tps-screening.md). Written only by twilio-voice-token (service role) once the tpsmydata secrets exist; reused for 28 days.';

-- Read back:
--   select indexname from pg_indexes where tablename = 'phone_tps_checks' and indexname = 'phone_tps_checks_phone';
