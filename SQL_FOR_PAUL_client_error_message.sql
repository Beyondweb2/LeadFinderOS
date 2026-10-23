-- client_error_reports has no `message` column, so TEN edge-function call sites that insert one
-- have been silently rejected — every refusal they were written to record wrote nothing.
-- Additive and idempotent. Run in the Supabase SQL editor.
alter table public.client_error_reports
  add column if not exists message text;
