-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CLEAR THE WHATSAPP QUEUE IN ONE PRESS — lead_unqueue for every waiting lead (2026-10-17).
--
-- The same act as lead_unqueue(_lead_id), done for all of them in one statement instead of one browser call
-- each. Scope is the caller's own: admin = every waiting lead; sales = only leads assigned to them (and not
-- clients) — can_work_lead decides per row, exactly as the single function does. Only a lead still WAITING
-- (status 'queued', not archived) changes; it goes back to previous_status (never a hard-coded value except
-- the same not_contacted fallback the single function uses). A row being sent right now is locked and
-- skipped, so a send in flight is never touched. Sends nothing. History records one line per lead.
-- Idempotent. No row is changed by this migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.lead_unqueue_all()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_removed int := 0; v_ids uuid[];
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  with picked as (
    select id from public.outreach_leads
     where status = 'queued' and is_archived = false and public.can_work_lead(id)
     for update skip locked
  ), upd as (
    update public.outreach_leads o
       set status = coalesce(o.previous_status, 'not_contacted'), previous_status = null, queued_at = null, contact_method = null
      from picked p where o.id = p.id
    returning o.id, o.status
  ), act as (
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    select id, auth.uid(), 'details_set', jsonb_build_object('queue', 'removed', 'status', status, 'bulk', true) from upd
    returning lead_id
  )
  select coalesce(array_agg(lead_id), '{}') into v_ids from act;
  v_removed := coalesce(array_length(v_ids, 1), 0);
  return jsonb_build_object('ok', true, 'removed', v_removed, 'lead_ids', to_jsonb(v_ids));
end $$;

revoke all on function public.lead_unqueue_all() from public, anon;
grant execute on function public.lead_unqueue_all() to authenticated;
