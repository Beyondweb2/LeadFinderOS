-- 2026-11-23 — ONE STRIKE: a number WhatsApp could not deliver to is never cold-WhatsApped again (docs/whatsapp-fewer-failures.md).
-- The rule's TypeScript twin is src/lib/whatsappOneStrike.ts; scripts/whatsapp-fewer-failures.test.ts keeps the two equal.
--
-- A strike = a real (test_mode false) whatsapp_sends row with delivery_status 'failed' / 'no_whatsapp' and a Meta code that is
-- absent or 131026. Struck out = a strike on the lead, no delivered / read / played send to the lead or its number, and no inbound
-- message from them. A struck-out lead:
--   · status → 'no_whatsapp' when it is '', not_contacted, queued, initial_contact, whatsapp_failed or no_whatsapp (anything further
--     along keeps its status). 'no_whatsapp' is the status the text queue accepts after a WhatsApp try (queue_sms_openers).
--   · whatsapp_delivery_status → 'no_whatsapp'; leaves the hook / contact follow-up lanes; contact_method 'whatsapp' → null.
-- _since limits which failures are looked at (the queue passes the last 3 days each tick; the one-off backfill passes null = all).
-- _dry_run true writes nothing and returns what would change.
-- Additive: one new function, service_role only. Rollback: drop function public.apply_whatsapp_one_strike(timestamptz, boolean).

create or replace function public.apply_whatsapp_one_strike(_since timestamptz default null, _dry_run boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_changed integer := 0;
  v_status_changed integer := 0;
  v_candidates integer := 0;
begin
  create temporary table if not exists _one_strike (id uuid primary key, old_status text) on commit drop;
  truncate _one_strike;

  insert into _one_strike (id, old_status)
  select l.id, l.status
  from outreach_leads l
  where l.id in (
      select ws.lead_id from whatsapp_sends ws
      where ws.test_mode = false and ws.lead_id is not null
        and ws.delivery_status in ('failed', 'no_whatsapp')
        and (ws.error_code is null or ws.error_code = 131026)
        and (_since is null or ws.created_at >= _since))
    and coalesce(l.whatsapp_ever_delivered, false) = false
    and not exists (
      select 1 from whatsapp_sends d
      where d.test_mode = false and d.delivery_status in ('delivered', 'read', 'played')
        and (d.lead_id = l.id or (l.phone is not null and d.phone = regexp_replace(l.phone, '\D', '', 'g'))))
    and not exists (select 1 from whatsapp_messages m where m.direction = 'inbound' and m.lead_id = l.id)
    and not exists (
      select 1 from whatsapp_messages m
      where m.direction = 'inbound' and l.phone is not null and m.phone = regexp_replace(l.phone, '\D', '', 'g'))
    -- only leads with something left to change
    and (coalesce(l.whatsapp_delivery_status, '') <> 'no_whatsapp'
      or coalesce(l.status, '') in ('', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed')
      or l.hook_followup_queued_at is not null or l.contact_followup_queued_at is not null
      or l.contact_method = 'whatsapp');

  select count(*) into v_candidates from _one_strike;
  select count(*) into v_status_changed from _one_strike
    where coalesce(old_status, '') in ('', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed');

  if coalesce(_dry_run, true) then
    return jsonb_build_object('ok', true, 'dry_run', true, 'leads', v_candidates, 'status_to_no_whatsapp', v_status_changed,
      'by_status', coalesce((select jsonb_object_agg(coalesce(old_status, ''), n) from (select old_status, count(*) n from _one_strike group by 1) x), '{}'::jsonb));
  end if;

  update outreach_leads l set
    status = case when coalesce(l.status, '') in ('', 'not_contacted', 'queued', 'initial_contact', 'whatsapp_failed', 'no_whatsapp')
                  then 'no_whatsapp' else l.status end,
    whatsapp_delivery_status = 'no_whatsapp',
    hook_followup_queued_at = null,
    contact_followup_queued_at = null,
    contact_method = case when l.contact_method = 'whatsapp' then null else l.contact_method end
  from _one_strike s
  where l.id = s.id;
  get diagnostics v_changed = row_count;

  return jsonb_build_object('ok', true, 'dry_run', false, 'leads', v_changed, 'status_to_no_whatsapp', v_status_changed);
end;
$function$;

revoke execute on function public.apply_whatsapp_one_strike(timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_whatsapp_one_strike(timestamptz, boolean) to service_role;
