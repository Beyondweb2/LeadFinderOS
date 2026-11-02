-- ⛔ EVERY COUNTRY HAS ITS OWN COLD WHATSAPP CAP (2026-11-02, docs/whatsapp-safety-guard.md; the rule: src/lib/whatsappColdGuard.ts).
--   1. whatsapp_queue_pause_log takes a new action, cap_changed.
--   2. trg_country_switch_logged also logs a person changing a country's WhatsApp cap (who, when, from, to).
--   3. The UK's cap is set to 150, once, and recorded under the admin who asked for it. Malaysia, Singapore and Australia are not touched.
-- whatsapp_outreach_state.daily_cap (the old team cap) is no longer read by any code. It stays in the table, NULL.
-- Additive and idempotent. Rollback: re-create country_switch_logged and the trigger from 20261201090000, then
--   update outreach_country_settings set whatsapp_daily_cap = null where country = 'UK'.

alter table public.whatsapp_queue_pause_log drop constraint if exists whatsapp_queue_pause_log_action_check;
alter table public.whatsapp_queue_pause_log add constraint whatsapp_queue_pause_log_action_check
  check (action in ('paused', 'resumed', 'switched_off', 'switched_on', 'cooldown_started', 'cooldown_cleared', 'cold_stopped', 'cold_resumed', 'cap_changed'));

create or replace function public.country_switch_logged()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_who uuid := auth.uid();
begin
  if v_who is null then return new; end if;
  if new.whatsapp_on is distinct from old.whatsapp_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.whatsapp_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'WhatsApp');
  end if;
  if new.sms_on is distinct from old.sms_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.sms_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'SMS');
  end if;
  if new.call_on is distinct from old.call_on then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, case when new.call_on then 'switched_on' else 'switched_off' end, 'person', v_who, 'Browser calls');
  end if;
  if new.whatsapp_daily_cap is distinct from old.whatsapp_daily_cap then
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values (new.country, 'cap_changed', 'person', v_who,
            format('WhatsApp cap %s to %s', coalesce(old.whatsapp_daily_cap::text, 'default'), coalesce(new.whatsapp_daily_cap::text, 'default')));
  end if;
  return new;
end
$function$;
revoke execute on function public.country_switch_logged() from public, anon, authenticated;
drop trigger if exists trg_country_switch_logged on public.outreach_country_settings;
create trigger trg_country_switch_logged
  after update of whatsapp_on, sms_on, call_on, whatsapp_daily_cap on public.outreach_country_settings
  for each row execute function public.country_switch_logged();

-- The one data change. No auth.uid() here, so it is logged by hand, under the person who last acted on the queue on this log.
do $migration$
declare v_who uuid;
begin
  select by_user_id into v_who from public.whatsapp_queue_pause_log
   where source = 'person' and by_user_id is not null order by created_at desc limit 1;
  if exists (select 1 from public.outreach_country_settings where country = 'UK' and whatsapp_daily_cap is null) then
    update public.outreach_country_settings set whatsapp_daily_cap = 150, updated_at = now(), updated_by = v_who where country = 'UK';
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values ('UK', 'cap_changed', 'person', v_who,
            'WhatsApp cap default to 150. The UK and Malaysia now have separate caps; asked for by Paul, applied by the deploying session.');
  end if;
end
$migration$;

-- Read back:
--   select country, whatsapp_on, whatsapp_daily_cap from public.outreach_country_settings order by country;
--   select * from public.whatsapp_queue_pause_log where action = 'cap_changed' order by created_at desc limit 1;
