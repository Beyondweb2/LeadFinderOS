-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SALES WORKSPACE V2 (2026-10-05, Paul's post-launch salesperson rework;
-- docs/pre-sales-certification/sales-workspace-v2.md).
--
-- 1. A CAMPAIGN IS A CONTAINER, NOT A LEAD SOURCE. It is created with a name, a niche / trade, a contact
--    method (call | whatsapp) and an optional area — nothing else. Leads enter it from Find Leads (the
--    campaign selector) or are moved into it from Outreach / the lead. campaign_new and campaign_update
--    are the two writers; campaign_create(text) is left in place for any old screen still open.
-- 2. DELETE NEVER DELETES LEADS OR HISTORY. campaign_archive stops its queued openers (campaign_stop) and
--    sets archived_at. The campaign row stays (lead_claims cascades on a hard delete, and the per-campaign
--    sales history reads campaign_id), its leads keep campaign_id, nothing in lead_activity changes. An
--    archived campaign is not usable (campaign_usable), so nothing new can be added to it, and its name is
--    free again (the unique index becomes partial).
-- 3. A CALL CAMPAIGN NEVER SENDS AN OPENER. campaign_launch refuses method = 'call' (call_campaign).
--    Membership never depends on message eligibility: lead_set_campaign / sales_add_lead are unchanged.
-- 4. A REAL CONVERSATION STOPS THE COLD OPENER — A DIALLER TAP NEVER DOES. sales_queue_opener (live body,
--    read 2026-10-05) gains one reason after already_contacted: a logged contact whose outcome is a
--    conversation (CONVERSATION_OUTCOMES in src/lib/leadState.ts: spoke_to_owner, interested, call_back,
--    meeting_booked, not_interested, agency_controls_site) → contacted_by_phone (a call) or
--    contacted_logged (any other channel). No answer / voicemail / message_sent / connection_sent /
--    wrong_number are attempts and do NOT stop it. Nothing is written when someone taps Call.
-- 5. Manage Campaigns stats: _campaign_stats adds called / spoke / won beside the existing counts.
--
-- Additive and idempotent: columns add-if-missing, functions create-or-replace with unchanged signatures
-- (or new names), the index re-created partial. No row is updated.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

alter table public.campaigns add column if not exists trade text;
alter table public.campaigns add column if not exists area text;
alter table public.campaigns add column if not exists archived_at timestamptz;
alter table public.campaigns add column if not exists archived_by uuid;

comment on column public.campaigns.trade is 'The niche / trade the campaign works (free text, e.g. "Plumbers"). Sales workspace v2.';
comment on column public.campaigns.area is 'Optional area / town. Sales workspace v2.';
comment on column public.campaigns.archived_at is 'Deleted from the screens (campaign_archive). Leads keep campaign_id; nothing else is removed.';

-- The name is unique among LIVE campaigns only, so a deleted campaign's name can be used again.
drop index if exists public.campaigns_name_key_unique;
create unique index if not exists campaigns_name_key_unique on public.campaigns (public.campaign_name_key(name)) where archived_at is null;

-- ── campaign_usable: + not archived ─────────────────────────────────────────────────────────────
create or replace function public.campaign_usable(_campaign_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case public.my_role()
    when 'admin' then exists (select 1 from public.campaigns where id = _campaign_id and archived_at is null)
    when 'sales' then exists (select 1 from public.campaigns where id = _campaign_id and created_by = auth.uid() and archived_at is null)
    else false end
$function$;

-- ── campaign_name_available: live names only ────────────────────────────────────────────────────
create or replace function public.campaign_name_available(_name text, _except uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_key text := public.campaign_name_key(_name);
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_key = '' then return jsonb_build_object('ok', true, 'available', false, 'reason', 'name_required'); end if;
  if char_length(btrim(_name)) > 80 then return jsonb_build_object('ok', true, 'available', false, 'reason', 'name_too_long'); end if;
  /* Says only "taken" - never whose (the other campaign may be one the caller may not see). */
  return jsonb_build_object('ok', true, 'available', not exists (
    select 1 from public.campaigns where public.campaign_name_key(name) = v_key and id is distinct from _except and archived_at is null),
    'reason', 'name_taken');
end $function$;

-- ── The conversation-reached test (one rule; mirrors CONVERSATION_OUTCOMES) ──────────────────────
create or replace function public.lead_conversation_outcomes()
 returns text[] language sql immutable as $$
  select array['spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'agency_controls_site']
$$;

/* When a logged contact first REACHED the business, and on which channel. A dialler tap writes nothing,
   so it can never appear here; no-answer / voicemail outcomes are excluded by the outcome list. */
create or replace function public.lead_reached_contact(_lead_id uuid)
 returns table (at timestamptz, by_phone boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select a.created_at, (a.kind = 'call_outcome' or coalesce(a.data ->> 'channel', 'call') = 'call')
    from public.lead_activity a
   where a.lead_id = _lead_id and a.kind in ('call_outcome', 'contact_logged')
     and (a.data ->> 'outcome') = any (public.lead_conversation_outcomes())
   order by (a.kind = 'call_outcome' or coalesce(a.data ->> 'channel', 'call') = 'call') desc, a.created_at
   limit 1
$function$;

-- ── sales_queue_opener: live body + the reached-contact reason ───────────────────────────────────
create or replace function public.sales_queue_opener(_lead_ids uuid[], _template text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_g jsonb;
  v_reached record;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_template = '' then return jsonb_build_object('ok', false, 'error', 'template_required'); end if;
  if v_template not in ('initial_contact', 'initial_opener_v2') then return jsonb_build_object('ok', false, 'error', 'not_an_initial_opener'); end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 200 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  /* 2026-09-29: a suspended salesperson queues nothing. Already-queued leads are left for the admin. */
  v_g := public.guard_action(v_uid, 'whatsapp_queue', null, 0, array_length(_lead_ids, 1), 'sales_queue_opener');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused - contact Paul');
  end if;

  select daily_send_limit into v_limit from public.team_members where user_id = v_uid;
  if v_limit is not null then
    select count(*) into v_today from public.lead_activity
     where actor_user_id = v_uid and kind = 'bulk_queued'
       and created_at >= (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
    v_room := greatest(v_limit - v_today, 0);
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    select id, status, is_archived, amount_paid, phone, country, assigned_to_user_id into v_lead
      from public.outreach_leads where id = v_id for update;
    if not found then v_reason := 'not_found';
    elsif not public.can_work_lead(v_id) then v_reason := 'not_yours';
    elsif v_lead.is_archived is true then v_reason := 'archived';
    elsif public.lead_is_client(v_lead.amount_paid, v_lead.status) then v_reason := 'client';
    elsif coalesce(v_lead.status, '') <> 'not_contacted' then v_reason := 'not_new';
    elsif public.lead_first_contact_at(v_id) is not null then v_reason := 'already_contacted';
    else
      /* Sales workspace v2: a real logged conversation means a cold "is this the right business?" opener is
         wrong. The lead stays in its campaign; only the opener is not queued. */
      select * into v_reached from public.lead_reached_contact(v_id);
      if v_reached.at is not null then
        v_reason := case when v_reached.by_phone then 'contacted_by_phone' else 'contacted_logged' end;
      else
        v_pk := public.phone_key(v_lead.phone);
        if v_pk is null then v_reason := 'no_phone';
        -- A UK mobile (UK/blank country, 07... key), OR an Indian mobile judged from the NUMBER.
        elsif not ((coalesce(v_lead.country, 'UK') = 'UK' and v_pk ~ '^7[0-9]{9}$') or v_pk ~ '^91[6-9][0-9]{9}$') then v_reason := 'not_a_uk_mobile';
        elsif exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = v_pk) then v_reason := 'opted_out';
        elsif v_room is not null and v_queued >= v_room then v_reason := 'daily_limit';
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
      continue;
    end if;

    update public.outreach_leads
       set status = 'queued', queued_at = now(), whatsapp_attempts = 0, whatsapp_template = v_template,
           previous_status = v_lead.status, contact_method = 'whatsapp'
     where id = v_id;
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (v_id, v_uid, 'bulk_queued', jsonb_build_object('template', v_template));
    v_queued := v_queued + 1;
  end loop;

  return jsonb_build_object('ok', true, 'queued', v_queued, 'template', v_template, 'skipped', v_skip);
end $function$;

-- ── Manage Campaigns stats ───────────────────────────────────────────────────────────────────────
create or replace function public._campaign_stats(_ids uuid[])
 returns table (campaign_id uuid, called bigint, spoke bigint, won bigint)
 language sql stable security definer set search_path to 'public'
as $function$
  with l as (
    select o.id, o.campaign_id, o.amount_paid, o.status,
           exists (select 1 from public.lead_activity a where a.lead_id = o.id
                    and (a.kind = 'call_outcome' or (a.kind = 'contact_logged' and coalesce(a.data ->> 'channel', '') = 'call'))) as called,
           (exists (select 1 from public.lead_activity a where a.lead_id = o.id and a.kind in ('call_outcome', 'contact_logged')
                     and (a.data ->> 'outcome') = any (public.lead_conversation_outcomes()))
            or exists (select 1 from public.whatsapp_messages m where m.lead_id = o.id and m.direction = 'inbound')) as spoke
      from public.outreach_leads o
     where o.campaign_id = any(_ids) and not coalesce(o.is_archived, false)
       and (public.my_role() = 'admin' or o.assigned_to_user_id = auth.uid())
  )
  select c.id,
         count(l.id) filter (where l.called),
         count(l.id) filter (where l.spoke),
         count(l.id) filter (where public.lead_is_client(l.amount_paid, l.status))
    from unnest(_ids) as c(id) left join l on l.campaign_id = c.id
   group by c.id
$function$;

-- _campaign_json: + trade / area / method / the new stats (same signature, keys only added).
create or replace function public._campaign_json(_c public.campaigns, _k jsonb, _admin boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', _c.id, 'name', _c.name, 'created_at', _c.created_at, 'default_template', _c.default_template,
    'is_mine', _c.created_by = auth.uid(),
    'trade', _c.trade, 'area', _c.area, 'method', case when _c.method = 'call' then 'call' else 'whatsapp' end,
    'leads', coalesce((_k->>'leads')::bigint, 0), 'ready', coalesce((_k->>'ready')::bigint, 0), 'queued', coalesce((_k->>'queued')::bigint, 0),
    'contacted', coalesce((_k->>'contacted')::bigint, 0), 'replied', coalesce((_k->>'replied')::bigint, 0), 'interested', coalesce((_k->>'interested')::bigint, 0),
    'called', coalesce((_k->>'called')::bigint, 0), 'spoke', coalesce((_k->>'spoke')::bigint, 0), 'won', coalesce((_k->>'won')::bigint, 0))
  || case when _admin then jsonb_build_object(
       'owner_id', _c.created_by,
       'owner_name', (select t.display_name from public.team_members t where t.user_id = _c.created_by),
       'owner_role', (select r.role from public.user_roles r where r.user_id = _c.created_by limit 1))
     else '{}'::jsonb end
$function$;

create or replace function public.my_campaigns()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_role text := public.my_role(); v_ids uuid[]; v_out jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.campaigns
   where archived_at is null and (v_role = 'admin' or created_by = auth.uid());
  select coalesce(jsonb_agg(public._campaign_json(c, to_jsonb(k) || to_jsonb(s), v_role = 'admin') order by c.created_at desc), '[]'::jsonb) into v_out
    from public.campaigns c
    join public._campaign_counts(v_ids) k on k.campaign_id = c.id
    join public._campaign_stats(v_ids) s on s.campaign_id = c.id;
  return jsonb_build_object('ok', true, 'admin', v_role = 'admin', 'campaigns', v_out,
    'opener', (select initial_opener_template from public.whatsapp_outreach_state limit 1));
end $function$;

create or replace function public.campaign_detail(_campaign_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_role text := public.my_role(); v_c public.campaigns; v_k jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_c from public.campaigns where id = _campaign_id;
  select to_jsonb(k) || to_jsonb(s) into v_k from public._campaign_counts(array[_campaign_id]) k join public._campaign_stats(array[_campaign_id]) s on s.campaign_id = k.campaign_id;
  return jsonb_build_object('ok', true, 'campaign', public._campaign_json(v_c, v_k, v_role = 'admin'),
    'opener', (select initial_opener_template from public.whatsapp_outreach_state limit 1));
end $function$;

-- ── Create / edit / delete ───────────────────────────────────────────────────────────────────────
create or replace function public.campaign_new(_name text, _trade text, _method text, _area text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g');
  v_trade text := nullif(regexp_replace(btrim(coalesce(_trade, '')), '\s+', ' ', 'g'), '');
  v_area text := nullif(regexp_replace(btrim(coalesce(_area, '')), '\s+', ' ', 'g'), '');
  v_method text := lower(btrim(coalesce(_method, '')));
  v_id uuid;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if char_length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'name_too_long'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'trade_required'); end if;
  if char_length(v_trade) > 60 or char_length(coalesce(v_area, '')) > 60 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if v_method not in ('call', 'whatsapp') then return jsonb_build_object('ok', false, 'error', 'method_required'); end if;
  begin
    /* The owner is the signed-in account, never a parameter. A WhatsApp campaign carries the current
       approved opener; a call campaign carries none (it never sends one). */
    insert into public.campaigns (name, created_by, campaign_type, method, default_sale_type, default_template, trade, area)
    values (v_name, auth.uid(), 'audit', v_method, 'website',
            case when v_method = 'whatsapp' then (select initial_opener_template from public.whatsapp_outreach_state limit 1) end,
            v_trade, v_area)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name);
end $function$;

create or replace function public.campaign_update(_campaign_id uuid, _name text, _trade text, _method text, _area text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g');
  v_trade text := nullif(regexp_replace(btrim(coalesce(_trade, '')), '\s+', ' ', 'g'), '');
  v_area text := nullif(regexp_replace(btrim(coalesce(_area, '')), '\s+', ' ', 'g'), '');
  v_method text := lower(btrim(coalesce(_method, '')));
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if char_length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'name_too_long'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'trade_required'); end if;
  if char_length(v_trade) > 60 or char_length(coalesce(v_area, '')) > 60 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if v_method not in ('call', 'whatsapp') then return jsonb_build_object('ok', false, 'error', 'method_required'); end if;
  /* Turning a WhatsApp campaign into a call campaign while openers wait to send would leave them sending
     under a call campaign: pause sending first. */
  if v_method = 'call' and exists (select 1 from public.outreach_leads where campaign_id = _campaign_id and status = 'queued') then
    return jsonb_build_object('ok', false, 'error', 'stop_sending_first');
  end if;
  begin
    update public.campaigns
       set name = v_name, trade = v_trade, area = v_area, method = v_method,
           default_template = case when v_method = 'whatsapp' then coalesce(default_template, (select initial_opener_template from public.whatsapp_outreach_state limit 1)) else default_template end
     where id = _campaign_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'name', v_name);
end $function$;

create or replace function public.campaign_archive(_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_stop jsonb; v_role text := public.my_role();
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  /* Openers still waiting to send go back to where they were (campaign_stop's own rule). */
  v_stop := public.campaign_stop(_campaign_id);
  update public.campaigns set archived_at = now(), archived_by = auth.uid() where id = _campaign_id and archived_at is null;
  return jsonb_build_object('ok', true, 'stopped', coalesce((v_stop ->> 'stopped')::int, 0),
    'leads_kept', (select count(*) from public.outreach_leads where campaign_id = _campaign_id));
end $function$;

-- ── campaign_launch: live body + a call campaign never sends ─────────────────────────────────────
create or replace function public.campaign_launch(_campaign_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_role text := public.my_role(); v_template text; v_all uuid[]; v_chunk uuid[]; v_r jsonb;
  v_queued integer := 0; v_skip jsonb := '{}'::jsonb; v_k text; v_n integer; i integer := 1; v_total integer;
  c_max constant integer := 2000;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if exists (select 1 from public.campaigns where id = _campaign_id and method = 'call') then
    return jsonb_build_object('ok', false, 'error', 'call_campaign');
  end if;
  select initial_opener_template into v_template from public.whatsapp_outreach_state limit 1;
  if v_template is null or v_template not in ('initial_contact', 'initial_opener_v2') then
    return jsonb_build_object('ok', false, 'error', 'no_approved_opener');
  end if;
  select coalesce(array_agg(id order by created_at), '{}') into v_all from (
    select o.id, o.created_at from public.outreach_leads o
     where o.campaign_id = _campaign_id and o.status = 'not_contacted' and not coalesce(o.is_archived, false)
       and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
     order by o.created_at limit c_max) s;
  v_total := coalesce(array_length(v_all, 1), 0);
  while i <= v_total loop
    v_chunk := v_all[i : least(i + 199, v_total)];
    v_r := public.sales_queue_opener(v_chunk, v_template);
    if not coalesce((v_r ->> 'ok')::boolean, false) then return v_r; end if;
    v_queued := v_queued + coalesce((v_r ->> 'queued')::int, 0);
    for v_k, v_n in select key, value::int from jsonb_each_text(coalesce(v_r -> 'skipped', '{}'::jsonb)) loop
      v_skip := jsonb_set(v_skip, array[v_k], to_jsonb(coalesce((v_skip ->> v_k)::int, 0) + v_n));
    end loop;
    exit when (v_r -> 'skipped' ->> 'daily_limit') is not null;
    i := i + 200;
  end loop;
  if v_queued > 0 then
    update public.campaigns set default_template = v_template where id = _campaign_id and default_template is distinct from v_template;
  end if;
  return jsonb_build_object('ok', true, 'queued', v_queued, 'skipped', v_skip, 'template', v_template, 'considered', v_total);
end $function$;

revoke all on function public.lead_reached_contact(uuid) from public, anon, authenticated;
revoke all on function public._campaign_stats(uuid[]) from public, anon, authenticated;
revoke all on function public.campaign_new(text, text, text, text) from public, anon;
revoke all on function public.campaign_update(uuid, text, text, text, text) from public, anon;
revoke all on function public.campaign_archive(uuid) from public, anon;
grant execute on function public.campaign_new(text, text, text, text) to authenticated;
grant execute on function public.campaign_update(uuid, text, text, text, text) to authenticated;
grant execute on function public.campaign_archive(uuid) to authenticated;
grant execute on function public.lead_conversation_outcomes() to authenticated, service_role;

-- Read back:
--   select column_name from information_schema.columns where table_name = 'campaigns' and column_name in ('trade','area','archived_at','archived_by');
--   select indexdef from pg_indexes where indexname = 'campaigns_name_key_unique';   -- ... WHERE (archived_at IS NULL)
--   select proname from pg_proc where proname in ('campaign_new','campaign_update','campaign_archive','_campaign_stats','lead_reached_contact','lead_conversation_outcomes');
--   select pg_get_functiondef('public.sales_queue_opener(uuid[],text)'::regprocedure) like '%contacted_by_phone%';
