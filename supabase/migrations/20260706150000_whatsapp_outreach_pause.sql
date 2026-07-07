-- WhatsApp outreach PAUSE flag. ADDITIVE, safe default (false), RLS unchanged
-- (whatsapp_outreach_state stays service-role only — the pause/resume flip goes
-- through process-whatsapp-queue's service client, not a client write). When paused,
-- the processor tick sends nothing (queued leads simply wait); resuming continues.
-- One shared row (id=1) → pause is global, matching the single-queue model.

alter table public.whatsapp_outreach_state
  add column if not exists paused boolean not null default false;
