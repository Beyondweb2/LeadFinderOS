-- Sales: "Remove from my leads" + "Move to campaign" from Outreach (2026-09-28).
-- Additive only: two new functions, their grants. No table, column, policy or CHECK changes.
-- Apply ONE statement at a time (numbered), read back.

-- 1. sales_remove_leads — a salesperson takes leads out of THEIR pipeline. Never a delete.
--    ⛔ WHAT "REMOVE" MEANS DEPENDS ON THE LEAD'S HISTORY, DECIDED HERE, UNDER THE ROW LOCK:
--      · never genuinely contacted (lead_contact_attempt_at is null — the claim rule's own test) →
--        UNASSIGNED (assigned_to_user_id / assigned_at cleared, logged 'lead_unassigned' with the
--        reason). The record and every activity row stay. The pool's own rules then decide whether it
--        is claimable again (not archived, not a client, not a closed status) — nothing here marks it
--        contacted or untouched.
--      · genuinely contacted on ANY channel → ARCHIVED, OWNER KEPT (the existing lead_set_archived
--        state: out of the active pipeline, out of both queues, history attributed to the person who
--        made the contact). It is NOT unassigned, so it can never look untouched; and claim_lead /
--        sales_pool refuse a contacted lead whatever its owner, so it never becomes claimable.
--    ⛔ REFUSED (nothing written): not a salesperson ('sales_only'); a lead not assigned to the caller,
--    or a client ('not_yours' — _require_work's rule); an opener waiting in the queue ('queued' — it
--    would still send after the lead left them); a won / onboarding lead ('onboarding': the
--    won_pending_onboarding stage or a questionnaire on file).
--    One call takes one or many ids (the workspace sends one, the Outreach selection many).
create or replace function public.sales_remove_leads(_lead_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_lead record;
  v_reason text;
  v_released integer := 0;
  v_archived integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if public.my_role() is distinct from 'sales' then return jsonb_build_object('ok', false, 'error', 'sales_only'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 500 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    select id, assigned_to_user_id, is_archived, amount_paid, status into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif v_lead.assigned_to_user_id is distinct from v_uid or not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'not_yours';
    elsif coalesce(v_lead.status, '') = 'queued' then v_reason := 'queued';
    elsif coalesce(v_lead.status, '') = 'won_pending_onboarding'
       or exists (select 1 from public.onboarding_responses o where o.lead_id = v_id) then v_reason := 'onboarding';
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      v_results := v_results || jsonb_build_object('id', v_id, 'outcome', 'refused', 'reason', v_reason);
      continue;
    end if;

    if public.lead_contact_attempt_at(v_id) is null then
      update public.outreach_leads set assigned_to_user_id = null, assigned_at = null where id = v_id;
      insert into public.lead_activity (lead_id, actor_user_id, kind, data)
      values (v_id, v_uid, 'lead_unassigned', jsonb_build_object('from', v_uid, 'to', null, 'reason', 'removed_from_my_leads'));
      v_released := v_released + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'outcome', 'released');
    else
      if v_lead.is_archived is not true then
        update public.outreach_leads set is_archived = true where id = v_id;
        insert into public.lead_activity (lead_id, actor_user_id, kind, data)
        values (v_id, v_uid, 'archived_set', jsonb_build_object('archived', true, 'reason', 'removed_from_my_leads'));
      end if;
      v_archived := v_archived + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'outcome', 'archived');
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'released', v_released, 'archived', v_archived, 'skipped', v_skip, 'results', v_results);
end $function$;

-- 2.
revoke all on function public.sales_remove_leads(uuid[]) from public, anon;

-- 3.
grant execute on function public.sales_remove_leads(uuid[]) to authenticated;

-- 4. leads_set_campaign — the Outreach selection's "Move to campaign", for a salesperson.
--    ⛔ NOT A SECOND CAMPAIGN PATH: every lead goes through lead_set_campaign itself (the workspace's
--    Campaign card), so the rule is one rule — _require_work (a salesperson: assigned to them, not a
--    client), the campaign must already exist, the ONE column outreach_leads.campaign_id, one
--    'details_set' activity row per lead that changed. A lead the caller may not work is counted and
--    skipped; the others still move. The campaign is checked once, first, so an unknown campaign
--    moves nothing.
create or replace function public.leads_set_campaign(_lead_ids uuid[], _campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_r jsonb;
  v_moved integer := 0;
  v_unchanged integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 500 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  if _campaign_id is not null and not exists (select 1 from public.campaigns where id = _campaign_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_campaign');
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    begin
      v_r := public.lead_set_campaign(v_id, _campaign_id);
      if (v_r ->> 'ok')::boolean is not true then v_reason := coalesce(v_r ->> 'error', 'refused');
      elsif (v_r ->> 'unchanged')::boolean is true then v_unchanged := v_unchanged + 1;
      else v_moved := v_moved + 1;
      end if;
    exception when insufficient_privilege then
      v_reason := 'not_yours';
    end;
    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'moved', v_moved, 'unchanged', v_unchanged, 'skipped', v_skip);
end $function$;

-- 5.
revoke all on function public.leads_set_campaign(uuid[], uuid) from public, anon;

-- 6.
grant execute on function public.leads_set_campaign(uuid[], uuid) to authenticated;
