-- ══ WHY THEY SAID NO (2026-10-01) ═══════════════════════════════════════════════════════════════════
-- A lead marked Not interested may carry ONE structured reason (src/lib/lostReason.ts is the list; the
-- CHECK below and lead_set_lost_reason are its SQL twins, fenced by scripts/lost-reason.test.ts).
-- Saved and corrected only through lead_set_lost_reason: role + ownership checked (_require_work, the
-- same rule as every lead write), and every save writes History (lead_activity 'lost_reason_set' with
-- the old and new values). Nothing is backfilled: older Not interested leads read "Reason not recorded".
-- Additive only. Apply one statement block at a time (CLAUDE.md §6: never db push).

alter table public.outreach_leads
  add column if not exists lost_reason text,
  add column if not exists lost_reason_note text,
  add column if not exists lost_reason_recorded_at timestamptz,
  add column if not exists lost_reason_recorded_by uuid;

alter table public.outreach_leads drop constraint if exists outreach_leads_lost_reason_check;
alter table public.outreach_leads add constraint outreach_leads_lost_reason_check check (
  lost_reason is null or lost_reason in (
    'too_expensive', 'has_provider', 'no_value', 'bad_timing', 'not_into_ai',
    'no_more_work', 'sceptical', 'thinking', 'other'
  )
);
alter table public.outreach_leads drop constraint if exists outreach_leads_lost_reason_note_check;
alter table public.outreach_leads add constraint outreach_leads_lost_reason_note_check check (
  (lost_reason_note is null or char_length(lost_reason_note) <= 300)
  and (lost_reason is distinct from 'other' or char_length(btrim(coalesce(lost_reason_note, ''))) > 0)
);

-- History: the new kind (the CHECK is the live list of 2026-10-01 plus 'lost_reason_set').
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed',
  'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued',
  'marked_interested', 'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link',
  'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set'
]::text[]));

-- The one write. Refuses: no role / not your lead (_require_work), an unknown reason, Other without a
-- note, a note over 300 characters, and a lead that is not Not interested (a reason describes a no).
create or replace function public.lead_set_lost_reason(_lead_id uuid, _reason text, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_note text := nullif(btrim(coalesce(_note, '')), '');
  v_status text; v_from text; v_from_note text;
begin
  perform public._require_work(_lead_id);
  if _reason is null or _reason not in (
    'too_expensive', 'has_provider', 'no_value', 'bad_timing', 'not_into_ai',
    'no_more_work', 'sceptical', 'thinking', 'other'
  ) then
    return jsonb_build_object('ok', false, 'error', 'reason_not_allowed');
  end if;
  if _reason = 'other' and v_note is null then return jsonb_build_object('ok', false, 'error', 'reason_note_required'); end if;
  if v_note is not null and char_length(v_note) > 300 then return jsonb_build_object('ok', false, 'error', 'reason_note_too_long'); end if;
  select status, lost_reason, lost_reason_note into v_status, v_from, v_from_note
    from public.outreach_leads where id = _lead_id for update;
  if v_status is distinct from 'not_interested' then return jsonb_build_object('ok', false, 'error', 'not_not_interested'); end if;
  if v_from is not distinct from _reason and v_from_note is not distinct from v_note then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  update public.outreach_leads
     set lost_reason = _reason, lost_reason_note = v_note,
         lost_reason_recorded_at = now(), lost_reason_recorded_by = auth.uid()
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'lost_reason_set', jsonb_build_object(
    'reason', _reason, 'note', v_note, 'from_reason', v_from, 'from_note', v_from_note));
  return jsonb_build_object('ok', true);
end
$function$;
revoke all on function public.lead_set_lost_reason(uuid, text, text) from public, anon;
grant execute on function public.lead_set_lost_reason(uuid, text, text) to authenticated;

-- A lead that leaves Not interested (a revive, Won) is no longer a "no": its reason is cleared so a
-- later no starts blank. History keeps every reason it ever had ('lost_reason_set' rows).
create or replace function public.trg_outreach_leads_left_no_clears_lost_reason()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status = 'not_interested' and new.status is distinct from 'not_interested' and new.lost_reason is not null then
    new.lost_reason := null; new.lost_reason_note := null;
    new.lost_reason_recorded_at := null; new.lost_reason_recorded_by := null;
  end if;
  return new;
end
$function$;
drop trigger if exists trg_outreach_leads_left_no_clears_lost_reason on public.outreach_leads;
create trigger trg_outreach_leads_left_no_clears_lost_reason
  before update of status on public.outreach_leads
  for each row execute function public.trg_outreach_leads_left_no_clears_lost_reason();

-- The sales view: lost_reason + lost_reason_note appended at the END (create or replace view can only
-- add columns there). Body otherwise byte-for-byte the 20261002160100 definition (read back live with
-- pg_get_viewdef, 2026-10-01).
create or replace view public.sales_leads with (security_barrier = true) as
select
  l.id, l.business_name, l.phone, l.email, l.google_maps_url, l.address, l.category, l.status,
  l.next_action, l.next_action_date, l.next_action_note, l.call_booked_at, l.created_at, l.updated_at,
  l.country, l.list_type, l.is_archived, l.is_potential_work, l.image_url, l.facebook_url, l.instagram_url,
  l.contact_method, l.place_id, l.whatsapp_status, l.whatsapp_sent_at, l.whatsapp_delivery_status,
  l.whatsapp_template, l.queued_at, l.contact_name, l.website, l.campaign_id, l.search_keyword,
  l.search_location, l.derived_town, l.review_count, l.rating, l.lat, l.lng, l.line_type, l.product,
  l.hook_followup_queued_at, l.contact_followup_queued_at,
  l.assigned_to_user_id, l.assigned_at, l.added_by_user_id, l.website_control, l.website_control_note,
  null::numeric as amount_paid,
  l.lead_source,
  l.services_included, l.service_areas,
  l.domain_control,
  l.town_fetch_note,
  l.linkedin_url, l.facebook_status, l.instagram_status, l.linkedin_status,
  l.next_action_time,
  l.lost_reason, l.lost_reason_note
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;
