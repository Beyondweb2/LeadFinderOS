-- Immutable resolved Meta template representation for Inbox transcript replay.
-- Existing rows remain null and continue using the body-text fallback.
--
-- RECORD-ONLY BACK-FILL (2026-10-10): this column is ALREADY LIVE — applied from a local
-- checkout on 2026-09-19 as version 20260919000000 (see supabase_migrations.schema_migrations)
-- but never committed. Live shape: public.whatsapp_messages.template_snapshot jsonb, nullable,
-- no default. The version number is deliberately the original one so the repo matches the
-- applied history; the statement is idempotent, so re-running it changes nothing.
alter table public.whatsapp_messages
  add column if not exists template_snapshot jsonb null;
