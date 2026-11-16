-- ═══ SALESPEOPLE QUEUE EVERY APPROVED WHATSAPP TEMPLATE (2026-11-16, Paul, branch v1-tps-templates-callable) ═══════
-- Until today sales_queue_opener (the ONLY way a salesperson queues WhatsApp — they cannot write lead rows) accepted the
-- three openers and the report offer, and refused everything else with 'not_an_initial_opener'. Paul: every approved
-- template he can use, his salespeople can use too, with the same rules.
--
-- WHAT CHANGES
--   · COLD templates (src/lib/coldOutreach.ts isColdOutreachTemplate — openers, video_template, competitor_hook, book_call,
--     ai_visibility_report_offer): the cold branch below is the live definition read back 2026-11-16 (identical to
--     20261123090000), only its allowlist is wider.
--   · FOLLOW-UPS (continuations): a new branch. A follow-up goes only to a lead we have ALREADY had a WhatsApp conversation
--     with (never cold), never twice to the same lead (THIS template already sent → skipped), never to an opted-out /
--     Do Not Contact / not-interested lead, and counts against the person's daily limit. contact_followup keeps its own
--     lane (contact_followup_queued_at, status "2nd attempt") exactly as the admin's Outreach button queues it.
--   · explain_offer / explain_offer_v2 stay BLOCKED (old price) → 'template_blocked'. Anything else → 'not_a_queue_template'.
--   · Tenancy is unchanged: can_work_lead, lead_is_client, guard_action, the person's daily limit.
-- The drip (process-whatsapp-queue) checks the same two follow-up rules again at send time, and sends a follow-up as free
-- text when their 24-hour window is open. scripts/sales-templates-parity.test.ts fences these lists against the code.
--
-- Additive: CREATE OR REPLACE of one function, same signature, same grants. Roll back = re-run the function from
-- 20261123090000_phone_prefix_country.sql.

CREATE OR REPLACE FUNCTION public.sales_queue_opener(_lead_ids uuid[], _template text, _confirm_call_campaign boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_template text := btrim(coalesce(_template, ''));
  /* ⛔ Mirrors of src/types/outreach.ts WHATSAPP_TEMPLATES split by src/lib/coldOutreach.ts (parity test). */
  v_cold text[] := array['initial_contact', 'initial_opener_v2', 'initial_contact_short', 'ai_visibility_report_offer',
                         'video_template', 'competitor_hook', 'book_call'];
  v_followups text[] := array['initial_question', 'webdev_report', 'webdev_hook', 'webdev_example', 'polite_hook', 'polite_hook2',
                              'audit_reply', 'audit_reply_warm', 'audit_followup', 'audit_followup_call', 'audit_followup_fault',
                              'ai_site_findings_v2', 'onboarding_followup', 'contact_followup', 're_engage_49'];
  v_blocked text[] := array['explain_offer', 'explain_offer_v2'];
  v_is_cold boolean;
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
  if v_template = any(v_blocked) then return jsonb_build_object('ok', false, 'error', 'template_blocked'); end if;
  if not (v_template = any(v_cold) or v_template = any(v_followups)) then return jsonb_build_object('ok', false, 'error', 'not_a_queue_template'); end if;
  v_is_cold := v_template = any(v_cold);
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
    select id, status, is_archived, amount_paid, phone, country, assigned_to_user_id, campaign_id,
           whatsapp_ever_delivered, whatsapp_sent_at, contact_followup_queued_at into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif not v_is_cold then
      /* ── FOLLOW-UP: only to a lead already in a WhatsApp conversation, never twice, never after a no ── */
      v_pk := public.phone_key(v_lead.phone);
      if v_pk is null then v_reason := 'no_phone';
      elsif coalesce(v_lead.status, '') in ('opted_out') then v_reason := 'opted_out';
      elsif coalesce(v_lead.status, '') in ('not_interested') then v_reason := 'not_interested';
      elsif coalesce(v_lead.status, '') = 'queued' then v_reason := 'already_queued';
      elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
      elsif not (coalesce(v_lead.whatsapp_ever_delivered, false)
                 or exists (select 1 from public.whatsapp_messages m where m.lead_id = v_id
                             and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read')) and coalesce(m.test_mode, false) = false)) then
        v_reason := 'follow_up_needs_contact';
      elsif exists (select 1 from public.whatsapp_sends w where w.lead_id = v_id and w.template = v_template and w.test_mode = false
                     and (w.delivery_status is null or w.delivery_status not in ('failed', 'failed_temporary', 'simulated')))
         or exists (select 1 from public.whatsapp_messages m where m.lead_id = v_id and m.direction = 'outbound' and m.template_name = v_template
                     and coalesce(m.test_mode, false) = false and m.status in ('sent', 'delivered', 'read')) then
        v_reason := 'template_already_sent';
      elsif v_template = 'contact_followup' and (coalesce(v_lead.status, '') <> 'initial_contact' or v_lead.contact_followup_queued_at is not null
             or v_lead.whatsapp_sent_at is null or v_lead.whatsapp_sent_at > now() - interval '3 days') then
        /* The no-reply chase: a Contacted lead whose opener went 3+ days ago (CONTACT_FOLLOWUP_MIN_DAYS), not already in that lane. */
        v_reason := case when v_lead.contact_followup_queued_at is not null then 'already_queued'
                         when coalesce(v_lead.status, '') <> 'initial_contact' then 'not_awaiting_reply' else 'too_recent' end;
      elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
      end if;
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
        elsif public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk) is null then v_reason := 'not_a_uk_mobile';
        elsif not public.outreach_channel_on(public.mobile_market(public.phone_market_country(v_lead.country, v_lead.phone), v_pk), 'whatsapp') then v_reason := 'country_off';
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

    if v_template = 'contact_followup' then
      /* Its own lane, as the admin's button: the marker + the "2nd attempt" pill; previous_status restores it on cancel. */
      update public.outreach_leads
         set contact_followup_queued_at = now(), status = 'second_attempt', previous_status = v_lead.status
       where id = v_id;
    else
      update public.outreach_leads
         set status = 'queued', queued_at = now(), whatsapp_attempts = 0, whatsapp_template = v_template,
             previous_status = v_lead.status, contact_method = 'whatsapp', queued_by_user_id = v_uid
       where id = v_id;
    end if;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template, 'call_campaign_confirmed', coalesce(_confirm_call_campaign, false)));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;

-- Read back:
--   select pg_get_functiondef('public.sales_queue_opener(uuid[],text,boolean)'::regprocedure) ~ 'v_followups' as new_def;
--   select public.sales_queue_opener(array[]::uuid[], 'explain_offer');   -- as a signed-in user → template_blocked
