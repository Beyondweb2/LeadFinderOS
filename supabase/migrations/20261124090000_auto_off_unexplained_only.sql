-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- COUNTRY AUTO-OFF COUNTS ONLY UNEXPLAINED FAILURES (2026-10-22, fix/auto-off-counts, docs/country-auto-off.md).
--
-- 22 Oct: Australia switched itself off at 08:03 and 08:50 UTC on "5 of its last 10 sends failed". At 08:50, three of the
-- five were leads the webhook had just flagged No WhatsApp (Meta 131026 — the number is not on WhatsApp). On a cold list
-- that is normal and says nothing about the country. Re-counted without them neither switch-off would have happened.
--
-- THE RULE (one place; mirror src/lib/countryAutoPause.ts). Counted on real sends to Malaysia / Singapore / Australia since
-- the country was last switched on:
--   • NOT ON WHATSAPP — a failed send with Meta 131026, or whose lead is flagged No WhatsApp (status or delivery status
--     'no_whatsapp'), is left out entirely: not a failure, and not one of the window's sends.
--   • NOT YET SETTLED — a failed send that is the lead's current message while the lead does not yet carry a failure
--     (the live webhook writes the send row BEFORE it patches the lead) is left out until the lead is patched. A new
--     trigger on outreach_leads runs the check again at that moment, so nothing is missed and nothing is early.
--   • PATTERN — at least whatsapp_auto_off_min_fails (default 5) of the remaining failures AND at least
--     whatsapp_auto_off_fail_pct (default 50) % of the last whatsapp_auto_off_window (default 10) remaining sends.
--   • SYSTEMIC — unchanged: any failed send in that window with a Meta code about OUR account, login, quality / rating or
--     template. One is enough.
-- Same counting otherwise, same "only ever switches OFF", same three countries, same log row, same settings (editable
-- through set_outreach_country, 1-100). The UK queue pause, the rating watcher (whatsapp-number-health), the pace,
-- whatsapp_my_sg_no_auto_retry and Australia's switch / hours are NOT touched.
-- Rollback: re-create country_whatsapp_auto_pause from 20261122090000 and drop trg_outreach_leads_country_check.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';

create or replace function public.country_whatsapp_auto_pause(_market text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s record;
  v_since timestamptz;
  v_min_fails integer;
  v_window integer;
  v_pct integer;
  v_total integer;
  v_failed integer;
  v_all integer;
  v_code integer;
  v_sys_code integer;
  v_skipped integer;
  v_reason text;
  -- Meta codes about OUR account or template, never one number (src/lib/countryAutoPause.ts COUNTRY_SYSTEMIC_CODES).
  v_systemic integer[] := array[0, 3, 10, 190, 200, 368, 130497, 131031, 131042, 131045, 131048, 131057, 131063, 131064,
                                132001, 132007, 132015, 132016, 133010];
  v_name text := case _market when 'MY' then 'Malaysia' when 'SG' then 'Singapore' when 'AU' then 'Australia' end;
begin
  if _market is null or _market not in ('MY', 'SG', 'AU') then return null; end if;
  select * into s from public.outreach_country_settings where country = _market for update;
  if not found or not s.whatsapp_on then return null; end if;
  v_since := coalesce(s.whatsapp_on_since, s.updated_at);
  v_min_fails := coalesce(s.whatsapp_auto_off_min_fails, 5);
  v_window := coalesce(s.whatsapp_auto_off_window, 10);
  v_pct := coalesce(s.whatsapp_auto_off_fail_pct, 50);
  with sends as (
    select coalesce(ws.message_id, 'send:' || ws.id::text) as k, ws.created_at as at,
           (ws.delivery_status in ('failed', 'failed_temporary')) as failed, ws.error_code as code,
           ws.lead_id, ws.message_id as wamid
      from public.whatsapp_sends ws
     where ws.created_at >= v_since and ws.test_mode is not true
       and coalesce(ws.delivery_status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(ws.phone)) = _market
    union all
    select m.wa_message_id, m.created_at, (m.status = 'failed'), m.error_code, m.lead_id, m.wa_message_id
      from public.whatsapp_messages m
     where m.direction = 'outbound' and m.wa_message_id is not null
       and m.created_at >= v_since and m.test_mode is not true
       and coalesce(m.status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(m.phone)) = _market
  ), per as (
    select k, min(at) as at, bool_or(failed) as failed, max(code) as code, max(lead_id::text)::uuid as lead_id, max(wamid) as wamid
      from sends group by k
  ), judged as (
    select p.*,
           -- 2026-10-22: the number is not on WhatsApp — Meta 131026, or the lead is flagged No WhatsApp.
           -- ⛔ coalesce(…, false): a NULL code or a missing lead must read as "no", never drop the row (NULL is not false).
           coalesce(p.failed and (p.code = 131026 or l.status = 'no_whatsapp' or l.whatsapp_delivery_status = 'no_whatsapp'), false) as not_on_wa,
           -- 2026-10-22: the webhook has not patched the lead yet (this is the lead's current message, no failure on it).
           coalesce(p.failed and p.code is null and p.wamid is not null and l.whatsapp_message_id = p.wamid
              and coalesce(l.whatsapp_delivery_status, '') not in ('failed', 'failed_temporary', 'no_whatsapp')
              and coalesce(l.status, '') not in ('no_whatsapp', 'whatsapp_failed'), false) as unsettled
      from per p left join public.outreach_leads l on l.id = p.lead_id
  ), counted as (
    select * from judged where not not_on_wa and not unsettled
  ), lastn as (
    select * from counted order by at desc limit v_window
  )
  select count(*), count(*) filter (where failed),
         (array_agg(code order by at desc) filter (where failed and code is not null))[1],
         (array_agg(code order by at desc) filter (where failed and code = any(v_systemic)))[1],
         (select count(*) from per),
         (select count(*) from judged where not_on_wa or unsettled)
    into v_total, v_failed, v_code, v_sys_code, v_all, v_skipped from lastn;

  if v_sys_code is null and not (v_failed >= v_min_fails and v_failed * 100 >= v_pct * v_total) then
    return jsonb_build_object('market', _market, 'sends', v_all, 'counted', v_total, 'failed', v_failed,
                              'not_counted', v_skipped, 'switched_off', false);
  end if;

  if v_sys_code is not null then
    v_reason := format('WhatsApp to %s switched itself off: a send failed with Meta error %s, which is about our WhatsApp account or template, not one number. Check the failed sends before switching it back on.',
                       v_name, v_sys_code);
  else
    v_reason := format('WhatsApp to %s switched itself off: %s of its last %s sends failed for a reason other than the number not being on WhatsApp%s. Check the failed sends before switching it back on.',
                       v_name, v_failed, v_total,
                       case when v_code is not null then format(' (latest Meta error %s)', v_code) else ' (Meta gave no error code)' end);
  end if;
  update public.outreach_country_settings
     set whatsapp_on = false, whatsapp_auto_paused_at = now(), whatsapp_auto_pause_reason = v_reason,
         updated_at = now(), updated_by = null
   where country = _market;
  insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
  values (_market, 'switched_off', 'auto', null, v_reason);
  return jsonb_build_object('market', _market, 'sends', v_total, 'failed', v_failed, 'not_counted', v_skipped,
                            'switched_off', true, 'reason', v_reason);
end $function$;
revoke execute on function public.country_whatsapp_auto_pause(text) from public, anon, authenticated;

-- ── the check runs again when the webhook marks the lead (the failure is settled then) ─────────────────────
-- whatsapp_failure_country_check reads new.phone, which outreach_leads has. It never breaks the write.
drop trigger if exists trg_outreach_leads_country_check on public.outreach_leads;
create trigger trg_outreach_leads_country_check
  after update of whatsapp_delivery_status, status on public.outreach_leads
  for each row
  when ((new.whatsapp_delivery_status in ('failed', 'failed_temporary') or new.status = 'whatsapp_failed')
        and (new.whatsapp_delivery_status is distinct from old.whatsapp_delivery_status or new.status is distinct from old.status))
  execute function public.whatsapp_failure_country_check();

-- Read back:
--   select pg_get_functiondef('public.country_whatsapp_auto_pause(text)'::regprocedure) ~ 'not_on_wa';
--   select tgname from pg_trigger where tgname = 'trg_outreach_leads_country_check';
