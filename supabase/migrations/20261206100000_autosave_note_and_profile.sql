-- SAVING WHILE TYPING (Paul, 2026-11-03, docs/commission-owed.md). Additive and idempotent.
--
-- Saving about 800ms after typing stops would otherwise write a new History row on every pause.
--  1. lead_note_draft: one internal note is one row, however many pauses it took to type. It creates the row, then updates that row.
--  2. lead_set_profile: repeated edits by the same person within ten minutes update their one details_set row. What it writes to the lead is unchanged.
--
-- ⛔ Same door as lead_add_note and lead_set_profile: _require_work decides who may write. A person can only change or remove a note row
--    they wrote on that lead within the last hour. Older notes and other people's are never touched.

set local lock_timeout = '5s';

create or replace function public.lead_note_draft(_lead_id uuid, _note_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_body text := btrim(coalesce(_body, ''));
  v_id uuid;
begin
  perform public._require_work(_lead_id);
  if length(v_body) > 4000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if _note_id is not null then
    if v_body = '' then
      -- They erased what they had just typed.
      delete from public.lead_activity
       where id = _note_id and lead_id = _lead_id and actor_user_id = auth.uid() and kind = 'note' and created_at > now() - interval '1 hour';
      return jsonb_build_object('ok', true, 'id', null);
    end if;
    update public.lead_activity set body = v_body
     where id = _note_id and lead_id = _lead_id and actor_user_id = auth.uid() and kind = 'note' and created_at > now() - interval '1 hour'
     returning id into v_id;
    if v_id is not null then return jsonb_build_object('ok', true, 'id', v_id); end if;
  end if;
  if v_body = '' then return jsonb_build_object('ok', true, 'id', null); end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (_lead_id, auth.uid(), 'note', v_body) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;
revoke all on function public.lead_note_draft(uuid, uuid, text) from public, anon;
grant execute on function public.lead_note_draft(uuid, uuid, text) to authenticated, service_role;

create or replace function public.lead_set_profile(_lead_id uuid, _services text[] DEFAULT NULL::text[], _areas text[] DEFAULT NULL::text[], _address text DEFAULT NULL::text, _website text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_services text[] := public.clean_label_list(_services);
  v_areas text[] := public.clean_label_list(_areas);
  v_changed jsonb := '{}'::jsonb;
  v_recent uuid;
begin
  perform public._require_work(_lead_id);
  if coalesce(array_length(v_services, 1), 0) > 30 or coalesce(array_length(v_areas, 1), 0) > 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items');
  end if;
  if length(coalesce(_address, '')) > 300 or length(coalesce(_website, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if _services is not null then v_changed := v_changed || jsonb_build_object('services', to_jsonb(v_services)); end if;
  if _areas is not null then v_changed := v_changed || jsonb_build_object('service_areas', to_jsonb(v_areas)); end if;
  if _address is not null then v_changed := v_changed || jsonb_build_object('address', nullif(btrim(_address), '')); end if;
  if _website is not null then v_changed := v_changed || jsonb_build_object('website', nullif(btrim(_website), '')); end if;
  if v_changed = '{}'::jsonb then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set
    services_included = case when _services is null then services_included else nullif(v_services, '{}'::text[]) end,
    service_areas = case when _areas is null then service_areas else nullif(v_areas, '{}'::text[]) end,
    address = case when _address is null then address else nullif(btrim(_address), '') end,
    website = case when _website is null then website else nullif(btrim(_website), '') end
  where id = _lead_id;
  select id into v_recent from public.lead_activity
   where lead_id = _lead_id and actor_user_id = auth.uid() and kind = 'details_set' and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_recent is not null then
    update public.lead_activity set data = coalesce(data, '{}'::jsonb) || v_changed where id = v_recent;
  else
    insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (_lead_id, auth.uid(), 'details_set', v_changed);
  end if;
  return jsonb_build_object('ok', true);
end $function$;
