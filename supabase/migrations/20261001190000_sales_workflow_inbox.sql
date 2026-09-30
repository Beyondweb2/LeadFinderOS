-- Sales workflow pass, release C (2026-09-30, docs/sales-workflow-nav.md §Release C). Paul approved.

-- 1. "Not interested" clears the star — for EVERY writer (admin status patch, the sales stage RPC, an
--    outcome, an inbound decline). The admin's path already cleared it in the browser; the sales path
--    (lead_set_stage) did not, so a star survived on a dead lead and the Inbox star and the green
--    Interested state disagreed. One rule in the database instead of one per writer. Only the moment
--    the status BECOMES not_interested; existing rows are not rewritten (history kept).
create or replace function public.trg_outreach_leads_not_interested_clears_star()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'not_interested' and old.status is distinct from 'not_interested' and coalesce(new.is_potential_work, false) then
    new.is_potential_work := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_outreach_leads_not_interested_clears_star on public.outreach_leads;
create trigger trg_outreach_leads_not_interested_clears_star
  before update of status on public.outreach_leads
  for each row execute function public.trg_outreach_leads_not_interested_clears_star();

-- 2. The assignment notice says WHO assigned it ("Paul assigned you Emergency Irlam Plumbers"). Same
--    rules as before: never for an unassign, a claim of one's own, or the book owner; one per
--    assignment (dedupe on assigned_at); the link opens the conversation.
create or replace function public.trg_notify_lead_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_by text;
begin
  begin
    if new.assigned_to_user_id is null or new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
    if new.assigned_to_user_id = auth.uid() or new.assigned_to_user_id = public.book_owner_id() then return new; end if;
    select nullif(btrim(t.display_name), '') into v_by from public.team_members t where t.user_id = auth.uid();
    perform public.notify_person(new.assigned_to_user_id, 'lead_assigned',
      coalesce(v_by, 'The admin') || ' assigned you ' || coalesce(nullif(btrim(new.business_name), ''), 'a lead'),
      'It is in your Inbox and Outreach now, with its whole conversation and next action.',
      '/inbox?lead=' || new.id, new.id, 'assigned:' || new.id || ':' || coalesce(new.assigned_at::text, now()::text), 1::smallint);
  exception when others then raise warning 'trg_notify_lead_assigned: %', sqlerrm;
  end;
  return new;
end $$;

-- 3. A salesperson may REQUEST a transfer; only the admin executes one (Paul, 2026-09-30).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request']));
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set',
  'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested',
  'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out',
  'transfer_requested']));

-- Only the lead's own salesperson (can_work_lead) may ask; every active admin is told; one request per
-- lead per person per day; recorded in the lead's History. Changes no ownership.
create or replace function public.request_lead_transfer(_lead_id uuid, _note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text; v_biz text; v_key text; v_note text := nullif(left(btrim(coalesce(_note, '')), 280), '');
  v_admin uuid;
begin
  if public.my_role() is distinct from 'sales' then return jsonb_build_object('ok', false, 'error', 'sales_only'); end if;
  perform public._require_work(_lead_id);
  select business_name into v_biz from public.outreach_leads where id = _lead_id;
  select nullif(btrim(display_name), '') into v_name from public.team_members where user_id = v_uid;
  v_key := 'transfer:' || _lead_id || ':' || v_uid || ':' || to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD');
  if exists (select 1 from public.notifications where dedupe_key = v_key) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  for v_admin in select t.user_id from public.team_members t join public.user_roles r on r.user_id = t.user_id
                 where r.role = 'admin' and t.status = 'active' loop
    perform public.notify_person(v_admin, 'transfer_request',
      coalesce(v_name, 'A salesperson') || ' asked to transfer ' || coalesce(nullif(btrim(v_biz), ''), 'a lead'),
      coalesce(v_note, 'No reason given.') || ' Open the conversation and use Assign to move it.',
      '/inbox?lead=' || _lead_id, _lead_id, v_key, 1::smallint);
  end loop;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, v_uid, 'transfer_requested', jsonb_build_object('note', v_note));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.request_lead_transfer(uuid, text) from public, anon;
grant execute on function public.request_lead_transfer(uuid, text) to authenticated;
