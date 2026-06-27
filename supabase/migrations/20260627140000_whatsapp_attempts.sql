-- WhatsApp failed-delivery handling: per-lead retry counter. RUN IN THE SUPABASE
-- SQL EDITOR. The processor increments this on each attempt; after
-- MAX_WHATSAPP_ATTEMPTS temporary failures a lead is dropped from the queue as
-- 'whatsapp_failed' (vs 'no_whatsapp' for a permanent not-on-WhatsApp failure).
-- Re-queuing a lead resets it to 0 so it gets fresh retries.
alter table public.outreach_leads
  add column if not exists whatsapp_attempts integer not null default 0;
