-- 2026-10-13 — Queue for text: never text a business already tried on WhatsApp; honest counts; one limit.
--
-- What changes in queue_sms_openers (everything else is 20261019120000, unchanged):
--   · _dry_run (default false): runs EVERY check and writes NOTHING (no queue mark, no No SMS mark, no activity, no guard row), and
--     returns the ids that would be queued. The Queue for text popup asks this first, so its count is the server's own answer.
--   · Three WhatsApp reasons, checked BEFORE the generic "not new", so the popup says why in plain words:
--       in_whatsapp_queue        waiting in any WhatsApp queue lane (opener / no-reply follow-up / hook follow-up), on this row
--                                OR on another lead row with the same phone (not sent yet still counts)
--       whatsapp_messaged        a WhatsApp message really went to them (a send stamp that is not a failed attempt, or a non-failed
--                                outbound message on the phone)
--       in_whatsapp_conversation any other non-failed WhatsApp message on the phone (they wrote to us)
--       whatsapp_failed          we tried WhatsApp and the send failed for a reason other than "not on WhatsApp" — they may
--                                well be on WhatsApp, so it counts as tried (the safe default; 9 leads on 2026-10-13)
--     A mobile WhatsApp turned down as "not on WhatsApp" (status no_whatsapp) is still fine for a text.
--   · ONE limit: a real queue press takes at most 100 leads (SMS_QUEUE_MAX_PER_ACTION = SMS_QUEUE_DAILY_CAP, the most the
--     drip sends in a day). A dry run may check up to 1000 at once. The popup queues the first 100 that pass and says the rest
--     were over the limit — it never sends more than 100 and never answers "Nothing queued" for a big selection.
-- The old two-argument function is dropped in the same transaction so a two-argument call resolves to this one (no overload).
-- Rollback: drop this function and re-run 20261019120000's queue_sms_openers.

begin;
set local lock_timeout = '5s';

drop function if exists public.queue_sms_openers(uuid[], text);

create or replace function public.queue_sms_openers(_lead_ids uuid[], _template text, _dry_run boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  v_dry boolean := coalesce(_dry_run, false);
  v_id uuid;
  v_lead record;
  v_pk text;
  v_queued integer := 0;
  v_ids jsonb := '[]'::jsonb;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  -- the per-press limit (100 = SMS_QUEUE_MAX_PER_ACTION, pinned by scripts/sms-queue-rules.test.ts); a check-only call may look at more
  if array_length(_lead_ids, 1) > (case when v_dry then 1000 else 100 end) then
    return jsonb_build_object('ok', false, 'error', 'too_many', 'limit', case when v_dry then 1000 else 100 end);
  end if;
  if not v_dry then
    v_g := public.guard_action(v_uid, 'sms_send', null, 0, array_length(_lead_ids, 1), 'queue_sms_openers');
    if not coalesce((v_g ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
    end if;
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    if v_dry then
      select id, status, is_archived, amount_paid, phone, country, sms_queued_at, whatsapp_sent_at,
             contact_followup_queued_at, hook_followup_queued_at into v_lead
        from public.outreach_leads where id = v_id;
    else
      select id, status, is_archived, amount_paid, phone, country, sms_queued_at, whatsapp_sent_at,
             contact_followup_queued_at, hook_followup_queued_at into v_lead
        from public.outreach_leads where id = v_id for update;
    end if;
    v_pk := case when found then public.phone_key(v_lead.phone) end;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif v_lead.sms_queued_at is not null then v_reason := 'already_queued';
    elsif v_lead.status = 'queued' or v_lead.contact_followup_queued_at is not null or v_lead.hook_followup_queued_at is not null
       or (v_pk is not null and exists (select 1 from public.outreach_leads o
                                         where public.phone_key(o.phone) = v_pk and o.id <> v_id and o.status = 'queued'
                                           and coalesce(o.is_archived, false) = false)) then v_reason := 'in_whatsapp_queue';
    elsif (v_lead.whatsapp_sent_at is not null
           and coalesce(v_lead.status, '') not in ('', 'not_contacted', 'queued', 'no_whatsapp', 'whatsapp_failed', 'no_whatsapp_needs_sms'))
       or (v_pk is not null and exists (select 1 from public.whatsapp_messages w where public.phone_key(w.phone) = v_pk
                                         and w.direction = 'outbound'
                                         and (w.status is null or w.status not in ('failed', 'failed_temporary', 'simulated')))) then v_reason := 'whatsapp_messaged';
    elsif v_pk is not null and exists (select 1 from public.whatsapp_messages w where public.phone_key(w.phone) = v_pk
                                         and (w.status is null or w.status not in ('failed', 'failed_temporary', 'simulated'))) then v_reason := 'in_whatsapp_conversation';
    elsif v_lead.status = 'whatsapp_failed' then v_reason := 'whatsapp_failed';
    elsif coalesce(v_lead.status, '') not in ('not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms') then v_reason := 'not_new';
    elsif v_pk is null then v_reason := 'no_phone';
    elsif not (coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') then v_reason := 'not_a_uk_mobile';
    elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
    elsif exists (select 1 from public.sms_messages m where m.direction = 'outbound' and public.phone_key(m.phone) = v_pk
                   and m.status not in ('failed', 'undelivered', 'simulated')) then v_reason := 'already_texted';
    else v_reason := public.opener_contact_block(v_id);
    end if;

    if not v_dry and v_reason in ('no_phone', 'not_a_uk_mobile') then
      -- a number that can never be a UK mobile is No SMS the moment we look (the SMS twin of "not on WhatsApp"); a delivered text is never overwritten
      update public.outreach_leads set sms_delivery_status = 'no_sms'
       where id = v_id and coalesce(sms_delivery_status, '') <> 'delivered';
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    if v_dry then
      v_ids := v_ids || to_jsonb(v_id);
    else
      update public.outreach_leads
         set sms_queued_at = now(), sms_queued_by_user_id = v_uid, sms_queued_template = v_template, sms_attempts = 0, contact_method = 'sms'
       where id = v_id;
      insert into public.lead_activity (lead_id, actor_user_id, kind, data)
      values (v_id, v_uid, 'bulk_queued', jsonb_build_object('channel', 'sms', 'template', v_template));
    end if;
    v_queued := v_queued + 1;
  end loop;

  if v_dry then
    return jsonb_build_object('ok', true, 'dry_run', true, 'would_queue', v_queued, 'ids', v_ids, 'template', v_template, 'skipped', v_skip);
  end if;
  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;
revoke all on function public.queue_sms_openers(uuid[], text, boolean) from public, anon;
grant execute on function public.queue_sms_openers(uuid[], text, boolean) to authenticated;

commit;
