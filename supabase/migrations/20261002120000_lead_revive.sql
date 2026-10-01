-- A NO TURNED YES LEAVES THE LEAD IN A REAL WORKFLOW STATUS (2026-10-02, Paul).
--
-- Logging "Interested" / "Meeting booked" on a lead that said no used lead_set_stage('interested'): the
-- pre-star status, which whatsapp-inbound protects from a downgrade — so a later reply never moved it to
-- Replied, and an Inbox reply never produced "You replied" (send-whatsapp-message moves only 'replied').
-- lead_revive moves it out of Not interested / Closed to the status its own WhatsApp history proves:
--   they have replied → their message last ? 'replied' : 'awaiting_reply' ("You replied");
--   an opener really went out (lead_opener_really_sent) → 'initial_contact';
--   otherwise → 'not_contacted' (a phone-only lead: the pill still reads Contacted from the logged call).
-- The ⭐ is not touched here (lead_mark_interested owns it). 'interested' is never written.
--
-- The Not interested block: ONE rule, _lift_not_interested_block, called by the existing trigger (its
-- behaviour unchanged: leaving not_interested for interested / won) and by lead_revive (leaving
-- not_interested). It removes only reason 'not_interested' rows without a wrong-number mark — never an
-- opt-out, a wrong number or any other block — and records "suppression_cleared" in History.

create or replace function public._lift_not_interested_block(_lead_id uuid, _phone text, _email text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_key text := public.phone_e164_key(_phone); v_n int := 0;
begin
  delete from public.contact_suppressions s
   where s.reason = 'not_interested' and s.wrong_number_at is null
     and ((v_key is not null and s.phone_e164 = v_key)
       or s.lead_id = _lead_id
       or (nullif(btrim(coalesce(_email, '')), '') is not null and s.email = lower(btrim(_email))));
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('suppression_cleared', 'not_interested'));
  end if;
  return v_n;
end $function$;
revoke all on function public._lift_not_interested_block(uuid, text, text) from public, anon, authenticated;

create or replace function public.trg_outreach_leads_revive_clears_not_interested()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status is distinct from 'not_interested' or new.status not in ('interested', 'won_pending_onboarding') then
    return new;
  end if;
  perform public._lift_not_interested_block(new.id, new.phone, new.email);
  return new;
end $function$;

create or replace function public.lead_revive(_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.outreach_leads%rowtype;
  v_pk text;
  v_inbound int;
  v_last text;
  v_to text;
  v_lifted int := 0;
begin
  perform public._require_work(_lead_id);
  select * into l from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if coalesce(l.status, '') not in ('not_interested', 'closed') then
    return jsonb_build_object('ok', true, 'unchanged', true, 'status', l.status);
  end if;
  v_pk := public.phone_key(l.phone);
  select count(*) filter (where m.direction = 'inbound') into v_inbound
    from public.whatsapp_messages m
   where m.lead_id = l.id or (v_pk is not null and public.phone_key(m.phone) = v_pk);
  select m.direction into v_last
    from public.whatsapp_messages m
   where (m.lead_id = l.id or (v_pk is not null and public.phone_key(m.phone) = v_pk))
     and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read'))
   order by m.created_at desc limit 1;
  v_to := case
    when v_inbound > 0 then case when v_last = 'inbound' then 'replied' else 'awaiting_reply' end
    when public.lead_opener_really_sent(l.status, l.whatsapp_sent_at, l.whatsapp_ever_delivered) then 'initial_contact'
    else 'not_contacted'
  end;
  update public.outreach_leads set status = v_to where id = l.id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (l.id, auth.uid(), 'stage_changed', jsonb_build_object('from', l.status, 'to', v_to, 'revived', true));
  if l.status = 'not_interested' then
    v_lifted := public._lift_not_interested_block(l.id, l.phone, l.email);
  end if;
  return jsonb_build_object('ok', true, 'from', l.status, 'status', v_to, 'block_lifted', v_lifted > 0);
end $function$;
revoke all on function public.lead_revive(uuid) from public, anon;
grant execute on function public.lead_revive(uuid) to authenticated;
