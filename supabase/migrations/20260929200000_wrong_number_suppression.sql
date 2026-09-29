-- WRONG NUMBER SUPPRESSES FUTURE OUTREACH (Paul, 2026-09-29).
--
-- ⛔ ONE CANONICAL STATE: public.contact_suppressions — the table every automated WhatsApp sender
-- already checks through supabase/functions/_shared/suppression.ts (the drip queue, the hook and
-- contact follow-up lanes, the first-reply audit lane, auto-replies, the free-check result) and that
-- sales_queue_opener and the admin queue's contact_check exclude. A wrong number is a row there, keyed
-- on the PHONE, carrying wrong_number_at. Manual template sends (send-whatsapp-message) now read the
-- same row through the same module (checkWrongNumber). Nothing is deleted: the lead, its messages and
-- its history stay; only future sends to that number are refused.
--
-- ⛔ PHONE ONLY, NEVER lead_id: a lead_id row suppresses EVERY channel for the lead (email too), and a
-- wrong number says nothing about their email.
-- ⛔ A number already suppressed for another reason (archived, not interested, a decline) keeps that
-- row and reason; the wrong-number mark rides on it (wrong_number_at). Clearing the mark removes only
-- what the mark added: the whole row if the mark created it, otherwise just wrong_number_at.
--
-- lead_mark_wrong_number(lead)   both roles, own leads (_require_work). Called by the "Wrong number"
--                                outcome button.
-- lead_clear_wrong_number(lead)  ADMIN ONLY — the correction for a mark made in error.
-- lead_wrong_number(lead)        read for the lead popup (the table has no browser policies).

alter table public.contact_suppressions add column if not exists wrong_number_at timestamptz;

alter table public.contact_suppressions add column if not exists wrong_number_by uuid;

-- The canonical '+<country><number>' key the edge senders compare against ('+' + toWhatsAppNumber):
-- a UK national number gets 44 back; anything else keeps its own code (phone_key keeps +91).
create or replace function public.phone_e164_key(_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when public.phone_key(_phone) is null then null
    when length(public.phone_key(_phone)) = 10 and public.phone_key(_phone) ~ '^[1-9]' then '+44' || public.phone_key(_phone)
    else '+' || public.phone_key(_phone)
  end
$$;

create or replace function public.lead_mark_wrong_number(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_phone text; v_key text;
begin
  perform public._require_work(_lead_id);
  select phone into v_phone from public.outreach_leads where id = _lead_id;
  v_key := public.phone_e164_key(v_phone);
  if v_key is null then return jsonb_build_object('ok', false, 'error', 'no_phone'); end if;
  insert into public.contact_suppressions (phone_e164, reason, source, wrong_number_at, wrong_number_by)
  values (v_key, 'wrong_number', 'lead_outcome', now(), auth.uid())
  on conflict (phone_e164) do update
     set wrong_number_at = coalesce(public.contact_suppressions.wrong_number_at, excluded.wrong_number_at),
         wrong_number_by = coalesce(public.contact_suppressions.wrong_number_by, excluded.wrong_number_by);
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('wrong_number', true));
  return jsonb_build_object('ok', true, 'phone', v_key);
end $$;

create or replace function public.lead_clear_wrong_number(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_phone text; v_key text; v_removed int := 0; v_unmarked int := 0;
begin
  if public.my_role() is distinct from 'admin' then return jsonb_build_object('ok', false, 'error', 'admin_only'); end if;
  select phone into v_phone from public.outreach_leads where id = _lead_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  v_key := public.phone_e164_key(v_phone);
  if v_key is null then return jsonb_build_object('ok', false, 'error', 'no_phone'); end if;
  -- The mark created this row: remove it. Any other suppression on the number is left alone.
  delete from public.contact_suppressions where phone_e164 = v_key and reason = 'wrong_number';
  get diagnostics v_removed = row_count;
  -- The mark rode on an existing suppression (archived, declined…): take the mark off, keep the row.
  update public.contact_suppressions set wrong_number_at = null, wrong_number_by = null
   where phone_e164 = v_key and wrong_number_at is not null;
  get diagnostics v_unmarked = row_count;
  if v_removed + v_unmarked > 0 then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('wrong_number', false));
  end if;
  return jsonb_build_object('ok', true, 'cleared', v_removed + v_unmarked > 0, 'still_suppressed', v_unmarked > 0);
end $$;

create or replace function public.lead_wrong_number(_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_phone text; v_key text; v_row record;
begin
  perform public._require_work(_lead_id);
  select phone into v_phone from public.outreach_leads where id = _lead_id;
  v_key := public.phone_e164_key(v_phone);
  if v_key is null then return jsonb_build_object('ok', true, 'wrong_number', false); end if;
  select wrong_number_at, wrong_number_by into v_row from public.contact_suppressions
   where phone_e164 = v_key and wrong_number_at is not null limit 1;
  if not found then return jsonb_build_object('ok', true, 'wrong_number', false); end if;
  return jsonb_build_object('ok', true, 'wrong_number', true, 'at', v_row.wrong_number_at, 'by', v_row.wrong_number_by);
end $$;

revoke all on function public.lead_mark_wrong_number(uuid) from public, anon;

grant execute on function public.lead_mark_wrong_number(uuid) to authenticated;

revoke all on function public.lead_clear_wrong_number(uuid) from public, anon;

grant execute on function public.lead_clear_wrong_number(uuid) to authenticated;

revoke all on function public.lead_wrong_number(uuid) from public, anon;

grant execute on function public.lead_wrong_number(uuid) to authenticated;
