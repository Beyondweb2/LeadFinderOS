-- CONTACT METHOD FOLLOWS THE ROUTE THE REP IS WORKING (2026-10-07). Additive and idempotent.
--
-- ⛔ A salesperson has NO direct write on outreach_leads (restrictive admin-only policy; a direct update touches
-- zero rows and answers 200). Until now a rep's contact_method edit was dropped on the floor, so pressing Call
-- could never change the pill for them. This is the one ownership-checked write for it: _require_work (a role,
-- and for sales: assigned to the caller and not a client) before the row is touched.
--
-- Only the two ROUTES the app itself chooses between — 'call' (the Call button) and 'whatsapp' (the queue) —
-- are accepted. Anything else is refused, so this is not a back door to the rest of the contact-method set.
-- It writes the column and nothing else: no lead_activity row, no status, no attempt counters, no history.
create or replace function public.lead_set_contact_method(_lead_id uuid, _method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  perform public._require_work(_lead_id);
  if _method is null or _method not in ('call', 'whatsapp') then
    return jsonb_build_object('ok', false, 'error', 'bad_method');
  end if;
  select contact_method into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from _method then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set contact_method = _method where id = _lead_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_set_contact_method(uuid, text) from public, anon;
grant execute on function public.lead_set_contact_method(uuid, text) to authenticated;
