-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- REMOVE ONE LEAD FROM THE WHATSAPP QUEUE — for whoever may work it (2026-10-03).
--
-- The admin's queue panel removes a queued lead with a direct row write (status back to previous_status,
-- queued_at cleared). A salesperson cannot write outreach_leads (restrictive RLS), so their queue panel had
-- no remove at all. This is the same act as one role-checked function: the caller must be able to work the
-- lead (admin: any; sales: assigned to them, not a client), and only a lead still WAITING (status 'queued')
-- changes. A message already sent is never touched. History records it.
-- Idempotent. No row is changed by this migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.lead_unqueue(_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_status text; v_prev text;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.can_work_lead(_lead_id) then return jsonb_build_object('ok', false, 'error', 'not_yours'); end if;
  select status, previous_status into v_status, v_prev from public.outreach_leads where id = _lead_id for update;
  if v_status is distinct from 'queued' then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads
     set status = coalesce(v_prev, 'not_contacted'), previous_status = null, queued_at = null, contact_method = null
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('queue', 'removed', 'status', coalesce(v_prev, 'not_contacted')));
  return jsonb_build_object('ok', true, 'status', coalesce(v_prev, 'not_contacted'));
end $$;

revoke all on function public.lead_unqueue(uuid) from public, anon;
grant execute on function public.lead_unqueue(uuid) to authenticated;
