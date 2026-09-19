-- Durable first-reply audit intent.  The existing whatsapp_auto_replies row is already one-per-lead
-- and owns the reply lifecycle; these fields let the audit lifecycle recover independently.
alter table public.whatsapp_auto_replies
  add column if not exists audit_required boolean not null default false,
  add column if not exists audit_mode text null,
  add column if not exists audit_status text not null default 'not_required',
  add column if not exists audit_id uuid null references public.ai_audits(id) on delete set null,
  add column if not exists audit_attempts integer not null default 0,
  add column if not exists audit_last_error text null,
  add column if not exists audit_next_attempt_at timestamptz null,
  add column if not exists audit_claimed_at timestamptz null,
  add column if not exists audit_trigger_message_id text null;
