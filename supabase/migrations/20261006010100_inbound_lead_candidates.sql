-- Which leads carry the number an inbound WhatsApp came from — on the canonical phone key.
-- 2026-10-04, pre-sales certification M-005 (E-07); docs/pre-sales-certification/fixes-01-security-inbound.md.
--
-- THE FAULT. When a prospect WhatsApps a number we never messaged (the call-first case: the rep
-- phones, the prospect replies on WhatsApp), _shared/whatsapp-inbound.ts looked the lead up with
-- ilike '%<last 9 digits>%' on the stored phone. Stored phones are typed by people and almost all
-- contain a space ("07700 900123"), so the substring never matched: the reply landed with no lead,
-- no unread count and no notification. Measured 2026-10-04: 5,474 of 5,476 stored phones are spaced.
--
-- THE FIX. Compare public.phone_key() on BOTH sides: the key the database already uses for this
-- (idx_outreach_leads_phone_key; my_sales_message_phones, which decides which numbers a rep may read).
-- "07700 900123", "+44 7700 900123", "07700900123" and Meta's "447700900123" all have the same key.
-- This function only LISTS the candidates; src/lib/inboundMatch.ts decides (one lead → that lead;
-- several → ambiguous, never a guess). Index-backed: phone_key(phone) = <constant>.
--
-- SECURITY. Service role only (the webhook). It returns lead ids and holders for any number, so it
-- must never be callable by a browser: EXECUTE is revoked from public, anon and authenticated.
-- SECURITY INVOKER: the service role already bypasses RLS; nobody else can execute it.
--
-- Idempotent. Read back with:
--   select proname, prosecdef, proacl from pg_proc where proname = 'inbound_lead_candidates';

create or replace function public.inbound_lead_candidates(_phone text)
returns table (id uuid, user_id uuid, assigned_to_user_id uuid, is_archived boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.user_id, l.assigned_to_user_id, l.is_archived
  from public.outreach_leads l
  where public.phone_key(_phone) is not null
    and public.phone_key(l.phone) = public.phone_key(_phone)
  order by l.id
  limit 50
$$;

revoke all on function public.inbound_lead_candidates(text) from public;
revoke all on function public.inbound_lead_candidates(text) from anon;
revoke all on function public.inbound_lead_candidates(text) from authenticated;
grant execute on function public.inbound_lead_candidates(text) to service_role;

comment on function public.inbound_lead_candidates(text) is
  'Leads whose phone has the same phone_key as an inbound WhatsApp sender. Service role only (whatsapp-status). The choice is src/lib/inboundMatch.ts; several candidates = ambiguous, never a guess. M-005, 2026-10-04.';
