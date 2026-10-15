-- 2026-10-15 (feat/send-error-capture): store Meta's REAL send error, a per-country WhatsApp auto switch-off for
-- Malaysia / Singapore, no automatic retry of a MY / SG send, who paused the queue, and a Call-campaign confirm.
-- Additive only (new nullable columns, new functions, new triggers, one append-only log table). docs/send-error-capture.md.
--
-- WHY: on 14 Oct both cold WhatsApp sends to Malaysia and Singapore failed and nobody could see why — the app kept only
-- a "temporary failure" class and, for a delivery-report failure, nothing at all.

set local lock_timeout = '5s';

-- ── 1. the raw error, on the send row, the message row and the lead (the queue row) ──────────────────────────────
alter table public.whatsapp_sends    add column if not exists error_code integer;
alter table public.whatsapp_sends    add column if not exists error_title text;
alter table public.whatsapp_sends    add column if not exists error_details text;
alter table public.whatsapp_messages add column if not exists error_code integer;
alter table public.whatsapp_messages add column if not exists error_title text;
alter table public.whatsapp_messages add column if not exists error_details text;
alter table public.outreach_leads    add column if not exists whatsapp_error_code integer;
alter table public.outreach_leads    add column if not exists whatsapp_error_title text;
alter table public.outreach_leads    add column if not exists whatsapp_error_at timestamptz;
comment on column public.whatsapp_sends.error_code is 'Meta''s own error code for a failed send (raw, never re-mapped). Meaning: src/lib/sendErrorMeaning.ts.';
comment on column public.whatsapp_messages.error_code is 'Meta''s own error code for a failed send (raw). Meaning: src/lib/sendErrorMeaning.ts.';
comment on column public.outreach_leads.whatsapp_error_code is 'Meta''s error code on the lead''s last failed WhatsApp send from the queue (raw).';

-- ── 2. who paused the queue, and when ────────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_outreach_state add column if not exists pause_changed_at timestamptz;
alter table public.whatsapp_outreach_state add column if not exists pause_changed_by uuid;
alter table public.whatsapp_outreach_state add column if not exists pause_changed_source text;
comment on column public.whatsapp_outreach_state.pause_changed_by is 'The person who last paused / resumed the queue (NULL with source auto = the queue paused itself).';

-- Append-only record of every pause / resume / country switch-off. Service role only (no policies).
create table if not exists public.whatsapp_queue_pause_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  scope text not null default 'queue' check (scope in ('queue', 'UK', 'MY', 'SG')),
  action text not null check (action in ('paused', 'resumed', 'switched_off')),
  source text not null check (source in ('person', 'auto')),
  by_user_id uuid,
  reason text
);
alter table public.whatsapp_queue_pause_log enable row level security;
revoke all on public.whatsapp_queue_pause_log from anon, authenticated;

create or replace function public.whatsapp_state_pause_logged()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.paused is distinct from old.paused then
    if new.pause_changed_at is not distinct from old.pause_changed_at then
      new.pause_changed_at := now();   -- a writer that did not say when: now
      new.pause_changed_by := null;    -- …and did not say who: nobody we know (never a stale person)
      new.pause_changed_source := 'auto';
    end if;
    insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
    values ('queue', case when new.paused then 'paused' else 'resumed' end,
            case when new.pause_changed_source = 'person' then 'person' else 'auto' end,
            new.pause_changed_by, case when new.paused then new.auto_pause_reason end);
  end if;
  return new;
end $$;
drop trigger if exists trg_whatsapp_state_pause_logged on public.whatsapp_outreach_state;
create trigger trg_whatsapp_state_pause_logged before update on public.whatsapp_outreach_state
  for each row execute function public.whatsapp_state_pause_logged();

-- ── 3. per-country switch-off (Malaysia / Singapore). The UK keeps its own queue auto-pause, unchanged. ────────────
alter table public.outreach_country_settings add column if not exists whatsapp_on_since timestamptz;
alter table public.outreach_country_settings add column if not exists whatsapp_auto_paused_at timestamptz;
alter table public.outreach_country_settings add column if not exists whatsapp_auto_pause_reason text;
comment on column public.outreach_country_settings.whatsapp_on_since is 'When WhatsApp was last switched ON for this country: the auto switch-off counts sends from here.';

update public.outreach_country_settings set whatsapp_on_since = updated_at
 where whatsapp_on and whatsapp_on_since is null;

create or replace function public.country_whatsapp_on_since()
returns trigger language plpgsql as $$
begin
  if new.whatsapp_on and not coalesce(old.whatsapp_on, false) then
    new.whatsapp_on_since := now();
    new.whatsapp_auto_paused_at := null;
    new.whatsapp_auto_pause_reason := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_country_whatsapp_on_since on public.outreach_country_settings;
create trigger trg_country_whatsapp_on_since before update on public.outreach_country_settings
  for each row execute function public.country_whatsapp_on_since();

-- THE RULE (one place; mirrored in src/lib/countryAutoPause.ts), counted on real WhatsApp sends to the country since it
-- was last switched on:
--   • TRIAL — while 5 or fewer sends have gone: ANY failure switches it off, except Meta 131026 (that one number is not
--     on WhatsApp — a fact about the number, not about sending to the country).
--   • AFTER — 2 or more failures among the last 5 sends switch it off (131026 counts here).
-- 14 Oct showed why the trial is strict: each country failed its ONLY send, which "2 of 5" alone never catches.
-- A send is one message: the send row and the message row of the same Meta id are ONE send (a delivery-report
-- failure may land on either). Test and simulated sends never count. Mirrored in src/lib/countryAutoPause.ts.
create or replace function public.country_whatsapp_auto_pause(_market text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record;
  v_since timestamptz;
  v_total integer;
  v_failed integer;
  v_trial_fail integer;
  v_all integer;
  v_code integer;
  v_reason text;
  v_name text := case _market when 'MY' then 'Malaysia' when 'SG' then 'Singapore' end;
begin
  if _market is null or _market not in ('MY', 'SG') then return null; end if;
  select * into s from public.outreach_country_settings where country = _market for update;
  if not found or not s.whatsapp_on then return null; end if;
  v_since := coalesce(s.whatsapp_on_since, s.updated_at);
  with sends as (
    select coalesce(ws.message_id, 'send:' || ws.id::text) as k, ws.created_at as at,
           (ws.delivery_status in ('failed', 'failed_temporary')) as failed, ws.error_code as code
      from public.whatsapp_sends ws
     where ws.created_at >= v_since and ws.test_mode is not true
       and coalesce(ws.delivery_status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(ws.phone)) = _market
    union all
    select m.wa_message_id, m.created_at, (m.status = 'failed'), m.error_code
      from public.whatsapp_messages m
     where m.direction = 'outbound' and m.wa_message_id is not null
       and m.created_at >= v_since and m.test_mode is not true
       and coalesce(m.status, '') <> 'simulated'
       and public.mobile_market(null, public.phone_key(m.phone)) = _market
  ), per as (
    select k, min(at) as at, bool_or(failed) as failed, max(code) as code from sends group by k
  ), last5 as (
    select * from per order by at desc limit 5
  )
  select count(*), count(*) filter (where failed), count(*) filter (where failed and code is distinct from 131026),
         max(code) filter (where failed), (select count(*) from per)
    into v_total, v_failed, v_trial_fail, v_code, v_all from last5;

  if not ((v_all <= 5 and v_trial_fail >= 1) or v_failed >= 2) then
    return jsonb_build_object('market', _market, 'sends', v_all, 'failed', v_failed, 'switched_off', false);
  end if;

  v_reason := format('WhatsApp to %s switched itself off: %s of its %s %s sends failed%s. Test a handful by hand before switching it back on.',
                     v_name, v_failed, case when v_all <= 5 then 'first' else 'last' end, v_total,
                     case when v_code is not null then format(' (Meta error %s)', v_code) else ' (Meta gave no error code)' end);
  update public.outreach_country_settings
     set whatsapp_on = false, whatsapp_auto_paused_at = now(), whatsapp_auto_pause_reason = v_reason,
         updated_at = now(), updated_by = null
   where country = _market;
  insert into public.whatsapp_queue_pause_log (scope, action, source, by_user_id, reason)
  values (_market, 'switched_off', 'auto', null, v_reason);
  return jsonb_build_object('market', _market, 'sends', v_total, 'failed', v_failed, 'switched_off', true, 'reason', v_reason);
end $$;
revoke execute on function public.country_whatsapp_auto_pause(text) from public, anon, authenticated;

-- Fired by every failed WhatsApp write, whoever wrote it (the queue, the Inbox, the delivery-report webhook).
-- ⛔ It can never break the write it rides on: any error is a warning only.
create or replace function public.whatsapp_failure_country_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_market text;
begin
  begin
    v_market := public.mobile_market(null, public.phone_key(new.phone));
    if v_market in ('MY', 'SG') then perform public.country_whatsapp_auto_pause(v_market); end if;
  exception when others then
    raise warning 'country auto-pause check failed (non-fatal): %', sqlerrm;
  end;
  return null;
end $$;
drop trigger if exists trg_whatsapp_sends_country_check on public.whatsapp_sends;
create trigger trg_whatsapp_sends_country_check after insert or update of delivery_status on public.whatsapp_sends
  for each row when (new.delivery_status in ('failed', 'failed_temporary') and new.test_mode is not true)
  execute function public.whatsapp_failure_country_check();
drop trigger if exists trg_whatsapp_messages_country_check on public.whatsapp_messages;
create trigger trg_whatsapp_messages_country_check after insert or update of status on public.whatsapp_messages
  for each row when (new.status = 'failed' and new.direction = 'outbound' and new.test_mode is not true)
  execute function public.whatsapp_failure_country_check();

-- ── 4. a Malaysia / Singapore send is NEVER retried automatically ─────────────────────────────────────────────────
-- Both failure routes (the queue's own answer AND the delivery-report webhook) re-queue a temporary failure with one
-- more attempt. For a MY / SG mobile that lead is handed back instead: out of the queue as 'whatsapp_failed', for a
-- person to decide. A person re-queueing (attempts reset to 0) is not touched.
create or replace function public.whatsapp_my_sg_no_auto_retry()
returns trigger language plpgsql as $$
begin
  if coalesce(new.whatsapp_attempts, 0) > coalesce(old.whatsapp_attempts, 0)
     and public.mobile_market(new.country, public.phone_key(new.phone)) in ('MY', 'SG') then
    new.status := 'whatsapp_failed';
    new.whatsapp_delivery_status := 'failed';
    new.queued_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_whatsapp_my_sg_no_auto_retry on public.outreach_leads;
create trigger trg_whatsapp_my_sg_no_auto_retry before update on public.outreach_leads
  for each row when (new.status = 'queued' and new.whatsapp_delivery_status = 'failed_temporary')
  execute function public.whatsapp_my_sg_no_auto_retry();

-- ── 5. sales_queue_opener: a lead in a CALL campaign needs the person's confirmation ───────────────────────────────
-- The live definition (read 2026-10-15, identical to 20261026090000) with ONE change: a lead whose campaign is a Call
-- campaign is skipped as 'call_campaign' unless _confirm_call_campaign is true. Same name and argument names, so the
-- existing two-argument calls still work (the new argument defaults to false).
drop function if exists public.sales_queue_opener(uuid[], text);
CREATE OR REPLACE FUNCTION public.sales_queue_opener(_lead_ids uuid[], _template text, _confirm_call_campaign boolean default false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  v_limit integer;
  v_today integer;
  v_room integer;
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_basis text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template = '' then return jsonb_build_object('ok', false, 'error', 'template_required'); end if;
  if v_template not in ('initial_contact', 'initial_opener_v2', 'ai_visibility_report_offer') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  /* 2026-09-29: a suspended salesperson queues nothing. Already-queued leads are left for the admin. */
  v_g := public.guard_action(v_uid, 'whatsapp_queue', null, 0, array_length(_lead_ids, 1), 'sales_queue_opener');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
  end if;

  /* 2026-10-14 (test day): a salesperson with no limit of their own gets the admin default
     (whatsapp_outreach_state.person_daily_limit_default, NULL = none). The admin is never limited by the default. */
  v_limit := coalesce((select daily_send_limit from public.team_members where user_id = v_uid),
                      case when public.my_role() = 'sales' then (select person_daily_limit_default from public.whatsapp_outreach_state where id = 1) end);
  if v_limit is not null then
    select count(*) into v_today from public.lead_activity
     where actor_user_id = v_uid and kind = 'bulk_queued'
       and created_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
    v_room := greatest(v_limit - v_today, 0);
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    select id, status, is_archived, amount_paid, phone, country, assigned_to_user_id, campaign_id into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif coalesce(v_lead.status, '') <> 'not_contacted' then v_reason := 'not_new';
    elsif not coalesce(_confirm_call_campaign, false) and v_lead.campaign_id is not null
          and exists (select 1 from public.campaigns c where c.id = v_lead.campaign_id and c.method = 'call') then
      /* 2026-10-15: a Call campaign's lead gets a WhatsApp opener only when the person confirmed it. */
      v_reason := 'call_campaign';
    elsif public.lead_first_contact_at(v_id) is not null then
      /* WHICH contact? (see the header). Only a lead's OWN real message reconciles its status. */
      v_basis := public.lead_contact_basis(v_id);
      v_reason := case v_basis
        when 'own_message' then 'already_contacted'
        when 'sign_up' then 'sign_up_started'
        when 'attempt' then 'whatsapp_app_opened'
        else 'number_already_contacted' end;
      if v_basis = 'own_message' then
        update public.outreach_leads set status = 'initial_contact' where id = v_id and status = 'not_contacted';
      end if;
    else
      /* The ONE real-contact guard (opener_contact_block): a logged conversation means a cold opener is wrong.
         The lead stays in its campaign; only the opener is not queued. A logged conversation IS genuine contact. */
      v_reason := public.opener_contact_block(v_id);
      if v_reason is not null then
        update public.outreach_leads set status = 'initial_contact' where id = v_id and status = 'not_contacted';
      else
        v_pk := public.phone_key(v_lead.phone);
        if v_pk is null then v_reason := 'no_phone';
        -- Cold WhatsApp: a mobile in a market whose WhatsApp switch is on (2026-10-14: the UK exactly as before; Malaysia /
        -- Singapore by outreach_country_settings). A real MY / SG mobile in a market switched off is 'country_off' and is
        -- never marked No mobile. Anything else is genuinely not a mobile we message: 'not_a_uk_mobile' (stored token).
        elsif public.mobile_market(v_lead.country, v_pk) is null then v_reason := 'not_a_uk_mobile';
        elsif not public.outreach_channel_on(public.mobile_market(v_lead.country, v_pk), 'whatsapp') then v_reason := 'country_off';
        elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
        elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
        end if;
        /* Learned for certain that WhatsApp cannot reach this lead: say so on the lead (the existing marker). */
        if v_reason in ('no_phone', 'not_a_uk_mobile') then
          update public.outreach_leads set status = 'no_whatsapp_needs_sms', whatsapp_delivery_status = v_reason
           where id = v_id and status = 'not_contacted';
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    update public.outreach_leads
       set status = 'queued', queued_at = now(), whatsapp_attempts = 0, whatsapp_template = v_template,
           previous_status = v_lead.status, contact_method = 'whatsapp', queued_by_user_id = v_uid
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template, 'call_campaign_confirmed', coalesce(_confirm_call_campaign, false)));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;
revoke execute on function public.sales_queue_opener(uuid[], text, boolean) from public, anon;
grant execute on function public.sales_queue_opener(uuid[], text, boolean) to authenticated;

-- ── 6. apply the rule once to what already happened (14 Oct: Malaysia 1 of 1 failed, Singapore 1 of 1 failed) ──────
-- It can only switch a country OFF, never on.
select public.country_whatsapp_auto_pause('MY');
select public.country_whatsapp_auto_pause('SG');
