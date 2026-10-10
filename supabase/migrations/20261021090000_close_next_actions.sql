-- ══ CLOSE A DASHBOARD ITEM (2026-10-10, Paul: "let the salesperson tidy What to do next and Follow-ups") ══════════
-- A salesperson (or the admin) closes items on the Sales dashboard — one, several or a whole list.
--   · Done, no action needed → this function only: the Next Action is cleared through the EXISTING
--     lead_set_follow_up (History "completed", the meeting mirror cleared with it), and the lead is stamped
--     work_closed_at / work_closed_by. Status, the star and the campaign are never touched.
--   · Dead lead → the browser first records the EXISTING outcome (Not interested / Wrong number) through the same
--     lead functions the Call tab uses (src/lib/leadOutcome.ts), then calls this with _reason 'dead'.
-- The dashboard (src/lib/salesWorkspace.ts) hides an item that was there when the lead was closed; a NEW inbound
-- reply (WhatsApp or SMS) after work_closed_at brings it back. Nothing here sends anything.
-- ⛔ Permission is can_work_lead: the admin any lead; a salesperson only a lead assigned to them (not a client).
--    A refused lead is reported back by id and nothing is written for it.
set local lock_timeout = '5s';

alter table public.outreach_leads add column if not exists work_closed_at timestamptz;
alter table public.outreach_leads add column if not exists work_closed_by uuid;
comment on column public.outreach_leads.work_closed_at is 'When a person last closed this lead''s dashboard items (lead_close_work). A newer inbound reply re-opens them.';
comment on column public.outreach_leads.work_closed_by is 'Who last closed this lead''s dashboard items (lead_close_work).';

-- ── History kind ────────────────────────────────────────────────────────────────────────────────────────
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared', 'client_info_requested', 'client_info_answered',
  'client_contact_opened', 'handoff_sent', 'client_intake', 'client_fact_set', 'onboarding_link_sent',
  'onboarding_form_submitted', 'whatsapp_facts_found', 'sms_sent', 'call_made', 'work_closed'])) not valid;
alter table public.lead_activity validate constraint lead_activity_kind_check;

-- ── The function ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.lead_close_work(_lead_ids uuid[], _reason text, _outcome text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_closed int := 0;
  v_refused jsonb := '[]'::jsonb;
  v_na text;
  v_r jsonb;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _reason is null or _reason not in ('done', 'dead') then return jsonb_build_object('ok', false, 'error', 'bad_reason'); end if;
  /* 'dead' names the existing outcome the browser already recorded — never a new status. */
  if _reason = 'dead' and coalesce(_outcome, '') not in ('not_interested', 'wrong_number') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  if _reason = 'done' then _outcome := null; end if;
  if _lead_ids is null or cardinality(_lead_ids) = 0 then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if cardinality(_lead_ids) > 500 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(_lead_ids) x) loop
    if not public.can_work_lead(v_id) then
      v_refused := v_refused || jsonb_build_object('lead_id', v_id, 'error', 'not_your_lead');
      continue;
    end if;
    select next_action::text into v_na from public.outreach_leads where id = v_id for update;
    /* The Next Action is cleared ONLY through its own function (History "completed"; the meeting mirror with it). */
    if coalesce(v_na, 'none') <> 'none' then
      v_r := public.lead_set_follow_up(v_id, 'none', null, null, null, true, null);
      if coalesce((v_r ->> 'ok')::boolean, false) is not true then
        v_refused := v_refused || jsonb_build_object('lead_id', v_id, 'error', coalesce(v_r ->> 'error', 'next_action_not_cleared'));
        continue;
      end if;
    end if;
    update public.outreach_leads set work_closed_at = now(), work_closed_by = auth.uid() where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, auth.uid(), 'work_closed', jsonb_build_object('reason', _reason, 'outcome', _outcome,
      'cleared_next_action', case when coalesce(v_na, 'none') <> 'none' then v_na end));
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('ok', true, 'closed', v_closed, 'refused', v_refused);
end $function$;

revoke all on function public.lead_close_work(uuid[], text, text) from public, anon;
grant execute on function public.lead_close_work(uuid[], text, text) to authenticated, service_role;
