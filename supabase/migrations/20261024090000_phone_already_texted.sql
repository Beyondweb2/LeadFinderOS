-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- A NUMBER ALREADY TEXTED NEVER GETS A COLD WHATSAPP OPENER (2026-10-14, test-day roles check).
--
-- The text queue already refuses a number tried on WhatsApp (queue_sms_openers 'already_texted' /
-- 'whatsapp_messaged', 20261023090000). The WhatsApp side never looked at sms_messages, so a number cold-texted
-- on lead row Y could get a WhatsApp opener on its duplicate row X — possibly owned by someone else.
--
-- ONE rule, asked by BOTH WhatsApp senders (send-whatsapp-message for a cold template, process-whatsapp-queue at
-- send time): an outbound text to the same phone key that did not fail. Same predicate as queue_sms_openers.
-- Service role only (the senders run as service role). Additive: a new function, nothing else changes.
-- Rollback: drop function public.phone_already_texted(text);
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.phone_already_texted(_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.phone_key(_phone) is not null and exists (
    select 1 from public.sms_messages m
     where m.direction = 'outbound'
       and public.phone_key(m.phone) = public.phone_key(_phone)
       and coalesce(m.status, '') not in ('failed', 'undelivered', 'simulated'));
$$;

revoke all on function public.phone_already_texted(text) from public, anon, authenticated;
grant execute on function public.phone_already_texted(text) to service_role;

-- Read back:
--   select public.phone_already_texted('+447700900123');   -- false for an untexted number
