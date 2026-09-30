-- Lead state audit (2026-09-30, docs/lead-state-model.md): History shows the SALES STATE change a
-- logged outcome made ("Status: Contacted → Interested"). The sales state is derived (src/lib/leadState.ts
-- salesStateOf), so there is no stored column whose change a trigger could see; the Work panel records
-- the reading before and after its own writes, and only when they differ.
-- ⛔ A NEW function on purpose: lead_log_contact is not redefined here (another branch redefines it).
-- ⛔ Role + ownership checked (_require_work); from / to must be states the engine knows; the outcome
-- that caused it rides along for the History line. Writes activity only — never a status, never a
-- next action. Applied live 2026-09-30 and read back.
-- The activity kind CHECK gains 'state_changed' (found by the rolled-back live QA: without it every call
-- was refused). One ALTER, both actions, atomic — the list is the live one read back 2026-09-30 + one value.
alter table public.lead_activity
  drop constraint lead_activity_kind_check,
  add constraint lead_activity_kind_check check (kind = any (array['lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note',
    'stage_changed', 'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested',
    'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link', 'state_changed']));

create or replace function public.lead_log_state_change(_lead_id uuid, _from text, _to text, _outcome text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_states text[] := array['new', 'contacted', 'replied', 'interested', 'meeting_booked', 'won', 'client', 'not_interested', 'wrong_number', 'other'];
begin
  perform public._require_work(_lead_id);
  if _from is null or _to is null or not (_from = any (v_states)) or not (_to = any (v_states)) then
    return jsonb_build_object('ok', false, 'error', 'bad_state');
  end if;
  if _from = _to then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'state_changed',
          jsonb_build_object('from', _from, 'to', _to, 'outcome', nullif(btrim(coalesce(_outcome, '')), '')));
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.lead_log_state_change(uuid, text, text, text) from public, anon;
grant execute on function public.lead_log_state_change(uuid, text, text, text) to authenticated;
