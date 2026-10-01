-- NO NEW WRITE CAN STORE THE PRE-STAR STATUS 'interested' (2026-10-02, Paul).
--
-- Interested is the gold star (is_potential_work) and nothing else. Every current screen writes the star
-- (lead_mark_interested) and a no-turned-yes goes through lead_revive, but three routes could still store
-- the old status: lead_set_stage('interested') (both roles), a direct row write (the admin's RLS, the
-- service role, SQL), and a restore from previous_status (one archived row carries 'interested' there).
-- Rows that already hold 'interested' are history and stay as they are; screens read them through
-- pillStatusOf / salesStateOf. Normalised, not rejected, so an old caller still gets what it meant:
--
--   1. lead_set_stage('interested') sets the star through lead_mark_interested (History "Starred") and
--      leaves the status alone. The allowlist text is unchanged: SALES_SETTABLE_STATUSES still names
--      'interested', which means the star.
--   2. A BEFORE trigger turns any NEW write of 'interested' (an insert, or an update from another status)
--      into the star, keeping the lead's real status (an insert gets 'not_contacted'). A row already holding
--      'interested' is not touched. It sorts before trg_outreach_leads_not_interested_clears_star, so that
--      trigger and trg_outreach_leads_revive_clears_not_interested only ever see the real status. A raw
--      not_interested → interested write therefore stays Not interested (+ the star) and lifts no block:
--      only lead_revive revives.

create or replace function public.lead_set_stage(_lead_id uuid, _status text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_from text;
begin
  perform public._require_work(_lead_id);
  /* Interested is the star, never a status (2026-10-02). */
  if _status = 'interested' then
    return public.lead_mark_interested(_lead_id, true);
  end if;
  if _status not in ('interested', 'price_given', 'not_interested', 'won_pending_onboarding') then
    return jsonb_build_object('ok', false, 'error', 'stage_not_allowed');
  end if;
  select status into v_from from public.outreach_leads where id = _lead_id for update;
  if public.lead_is_client(null, v_from) then return jsonb_build_object('ok', false, 'error', 'client'); end if;
  if v_from is not distinct from _status then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set status = _status where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'stage_changed', jsonb_build_object('from', v_from, 'to', _status));
  return jsonb_build_object('ok', true);
end
$function$;

create or replace function public.trg_outreach_leads_no_legacy_interested()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status = 'interested' and (tg_op = 'INSERT' or old.status is distinct from 'interested') then
    new.status := case when tg_op = 'UPDATE' then old.status else 'not_contacted' end;
    new.is_potential_work := true;
  end if;
  return new;
end $function$;

drop trigger if exists trg_outreach_leads_no_legacy_interested on public.outreach_leads;
create trigger trg_outreach_leads_no_legacy_interested
  before insert or update of status on public.outreach_leads
  for each row execute function public.trg_outreach_leads_no_legacy_interested();
