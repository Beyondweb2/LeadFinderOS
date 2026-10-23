-- Immutable resolved Meta template representation for Inbox transcript replay.
-- Existing rows remain null and continue using the body-text fallback.
alter table public.whatsapp_messages
  add column if not exists template_snapshot jsonb null;
