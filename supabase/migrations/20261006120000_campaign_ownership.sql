-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- CAMPAIGNS: OWNED, PRIVATE, GLOBALLY UNIQUE BY NAME — and a salesperson can run their own (2026-10-03).
--
-- Before: every signed-in user READ every campaign (SELECT policy `true`), only the admin could create /
-- edit / delete one, and a salesperson could put a lead into ANY campaign by id (lead_set_campaign,
-- leads_set_campaign, sales_add_lead). Names were not unique.
--
-- After:
--  1. campaign_name_key(name) — trimmed, inner whitespace collapsed to one space, case-folded — is UNIQUE
--     (an index, so two concurrent creates of one name: exactly one wins, the other gets 23505 →
--     'name_taken'). Audited first, 2026-10-03: 19 campaigns, no two share a key, none blank — no
--     grandfathering, nothing renamed.
--  2. The owner is created_by (already NOT NULL on every row — 18 the admin data account, 1 the Test
--     salesperson; nothing reassigned). READ: the admin sees all; anyone else sees ONLY their own.
--     Direct table writes stay admin-only (the restrictive policies); a salesperson acts only through the
--     role-checked SECURITY DEFINER functions below, which set the owner from auth.uid() and answer a
--     campaign that is not yours exactly like one that does not exist ('not_found').
--  3. A salesperson's lead may only go into a campaign they own (lead_set_campaign, leads_set_campaign,
--     sales_add_lead) — 'unknown_campaign' otherwise, never a name.
--  4. Launch = the EXISTING sales_queue_opener (every safeguard: own lead, not a client, never contacted, UK
--     mobile, opt-out suppression, daily limit, spend guard) with the CURRENT approved opener
--     (whatsapp_outreach_state.initial_opener_template) only. Stop = the campaign's still-queued leads go back
--     to the status they had (the per-lead "remove from queue", for the whole campaign). The queue itself is
--     unchanged.
-- Idempotent. No row is changed by this migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

-- ── 1. the one name rule ────────────────────────────────────────────────────────────────────────
create or replace function public.campaign_name_key(_name text)
returns text language sql immutable parallel safe
as $$ select lower(regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g')) $$;

create unique index if not exists campaigns_name_key_unique on public.campaigns (public.campaign_name_key(name));

-- ── 2. who may read a campaign ──────────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can view all campaigns" on public.campaigns;
drop policy if exists "campaigns read own or admin" on public.campaigns;
create policy "campaigns read own or admin" on public.campaigns for select to authenticated
  using ((select public.my_role()) = 'admin' or created_by = (select auth.uid()));

/* May the caller act on this campaign? The admin: any that exists. A salesperson: only their own.
   Anything else is indistinguishable from "does not exist". */
create or replace function public.campaign_usable(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case public.my_role()
    when 'admin' then exists (select 1 from public.campaigns where id = _campaign_id)
    when 'sales' then exists (select 1 from public.campaigns where id = _campaign_id and created_by = auth.uid())
    else false end
$$;

-- ── 3. the counts, from the leads the caller may see ────────────────────────────────────────────
/* One row per campaign: leads (unarchived), ready (new, never messaged), queued, contacted (a real
   outbound WhatsApp: sent / delivered / read), replied (any inbound), interested (the star). For a
   salesperson only THEIR leads count (a lead moved to someone else leaves their numbers). */
create or replace function public._campaign_counts(_ids uuid[])
returns table (campaign_id uuid, leads bigint, ready bigint, queued bigint, contacted bigint, replied bigint, interested bigint)
language sql stable security definer set search_path = public
as $$
  with l as (
    select o.id, o.campaign_id, o.status, o.is_potential_work,
           exists (select 1 from public.whatsapp_messages m where m.lead_id = o.id and m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read')) as sent,
           exists (select 1 from public.whatsapp_messages m where m.lead_id = o.id and m.direction = 'inbound') as replied
      from public.outreach_leads o
     where o.campaign_id = any(_ids) and not coalesce(o.is_archived, false)
       and (public.my_role() = 'admin' or o.assigned_to_user_id = auth.uid())
  )
  select c.id,
         count(l.id),
         count(l.id) filter (where l.status = 'not_contacted' and not l.sent),
         count(l.id) filter (where l.status = 'queued'),
         count(l.id) filter (where l.sent),
         count(l.id) filter (where l.replied),
         count(l.id) filter (where l.is_potential_work)
    from unnest(_ids) as c(id) left join l on l.campaign_id = c.id
   group by c.id
$$;

create or replace function public._campaign_json(_c public.campaigns, _k jsonb, _admin boolean)
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', _c.id, 'name', _c.name, 'created_at', _c.created_at, 'default_template', _c.default_template,
    'is_mine', _c.created_by = auth.uid(),
    'leads', coalesce((_k->>'leads')::bigint, 0), 'ready', coalesce((_k->>'ready')::bigint, 0), 'queued', coalesce((_k->>'queued')::bigint, 0),
    'contacted', coalesce((_k->>'contacted')::bigint, 0), 'replied', coalesce((_k->>'replied')::bigint, 0), 'interested', coalesce((_k->>'interested')::bigint, 0))
  || case when _admin then jsonb_build_object(
       'owner_id', _c.created_by,
       'owner_name', (select t.display_name from public.team_members t where t.user_id = _c.created_by),
       'owner_role', (select r.role from public.user_roles r where r.user_id = _c.created_by limit 1))
     else '{}'::jsonb end
$$;

-- ── 4. list / detail / leads ────────────────────────────────────────────────────────────────────
create or replace function public.my_campaigns()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.my_role(); v_ids uuid[]; v_out jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.campaigns
   where v_role = 'admin' or created_by = auth.uid();
  select coalesce(jsonb_agg(public._campaign_json(c, to_jsonb(k), v_role = 'admin') order by c.created_at desc), '[]'::jsonb) into v_out
    from public.campaigns c join public._campaign_counts(v_ids) k on k.campaign_id = c.id;
  return jsonb_build_object('ok', true, 'admin', v_role = 'admin', 'campaigns', v_out,
    'opener', (select initial_opener_template from public.whatsapp_outreach_state limit 1));
end $$;

create or replace function public.campaign_detail(_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.my_role(); v_c public.campaigns; v_k jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into v_c from public.campaigns where id = _campaign_id;
  select to_jsonb(k) into v_k from public._campaign_counts(array[_campaign_id]) k;
  return jsonb_build_object('ok', true, 'campaign', public._campaign_json(v_c, v_k, v_role = 'admin'),
    'opener', (select initial_opener_template from public.whatsapp_outreach_state limit 1));
end $$;

create or replace function public.campaign_leads(_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.my_role();
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'leads', coalesce((
    select jsonb_agg(x order by x->>'business_name') from (
      select jsonb_build_object('id', o.id, 'business_name', o.business_name, 'status', o.status,
        'town', coalesce(nullif(o.derived_town, ''), o.search_location), 'trade', coalesce(nullif(o.search_keyword, ''), o.category),
        'interested', coalesce(o.is_potential_work, false),
        'contacted', exists (select 1 from public.whatsapp_messages m where m.lead_id = o.id and m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read')),
        'replied', exists (select 1 from public.whatsapp_messages m where m.lead_id = o.id and m.direction = 'inbound')) x
        from public.outreach_leads o
       where o.campaign_id = _campaign_id and not coalesce(o.is_archived, false)
         and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
       limit 2000) s), '[]'::jsonb));
end $$;

/* The leads the caller may put into a campaign: ones they can work (a salesperson: assigned to them, not a
   client), unarchived. `sendable` mirrors sales_queue_opener's own refusals so the count before launch is
   honest; the launch itself still decides. Another owner's campaign is a boolean, never a name. */
create or replace function public.campaign_candidates(_campaign_id uuid, _search text default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.my_role(); v_q text := nullif(btrim(coalesce(_search, '')), '');
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _campaign_id is not null and not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'leads', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('id', o.id, 'business_name', o.business_name, 'status', o.status,
        'town', coalesce(nullif(o.derived_town, ''), o.search_location), 'trade', coalesce(nullif(o.search_keyword, ''), o.category),
        'in_this', o.campaign_id is not distinct from _campaign_id and _campaign_id is not null,
        'campaign_id', case when o.campaign_id is not null and public.campaign_usable(o.campaign_id) then o.campaign_id end,
        'campaign_name', case when o.campaign_id is not null and public.campaign_usable(o.campaign_id) then (select c.name from public.campaigns c where c.id = o.campaign_id) end,
        'in_other_campaign', o.campaign_id is not null and o.campaign_id is distinct from _campaign_id,
        'sendable', o.status = 'not_contacted' and public.lead_first_contact_at(o.id) is null
          and public.phone_key(o.phone) is not null
          and ((coalesce(o.country, 'UK') = 'UK' and public.phone_key(o.phone) ~ '^7[0-9]{9}$') or public.phone_key(o.phone) ~ '^91[6-9][0-9]{9}$')
          and not exists (select 1 from public.contact_suppressions s where public.phone_key(s.phone_e164) = public.phone_key(o.phone))) x
        from public.outreach_leads o
       where not coalesce(o.is_archived, false) and not public.lead_is_client(o.amount_paid, o.status)
         and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
         and (v_q is null or o.business_name ilike '%' || v_q || '%' or o.search_keyword ilike '%' || v_q || '%'
              or o.category ilike '%' || v_q || '%' or o.derived_town ilike '%' || v_q || '%' or o.search_location ilike '%' || v_q || '%')
       order by o.created_at desc
       limit 1000) s), '[]'::jsonb));
end $$;

-- ── 5. create / rename / delete ─────────────────────────────────────────────────────────────────
create or replace function public.campaign_name_available(_name text, _except uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_key text := public.campaign_name_key(_name);
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_key = '' then return jsonb_build_object('ok', true, 'available', false, 'reason', 'name_required'); end if;
  if char_length(btrim(_name)) > 80 then return jsonb_build_object('ok', true, 'available', false, 'reason', 'name_too_long'); end if;
  /* Says only "taken" — never whose (the other campaign may be one the caller may not see). */
  return jsonb_build_object('ok', true, 'available', not exists (
    select 1 from public.campaigns where public.campaign_name_key(name) = v_key and id is distinct from _except),
    'reason', 'name_taken');
end $$;

create or replace function public.campaign_create(_name text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g'); v_id uuid;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if char_length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'name_too_long'); end if;
  begin
    /* The owner is the signed-in account, never a parameter. Defaults are the approved ones: an audit
       campaign, WhatsApp, the current approved opener. */
    insert into public.campaigns (name, created_by, campaign_type, method, default_sale_type, default_template)
    values (v_name, auth.uid(), 'audit', 'whatsapp', 'website', (select initial_opener_template from public.whatsapp_outreach_state limit 1))
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name);
end $$;

create or replace function public.campaign_rename(_campaign_id uuid, _name text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g');
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_name = '' then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if char_length(v_name) > 80 then return jsonb_build_object('ok', false, 'error', 'name_too_long'); end if;
  begin
    update public.campaigns set name = v_name where id = _campaign_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'name_taken');
  end;
  return jsonb_build_object('ok', true, 'name', v_name);
end $$;

/* A salesperson deletes only an EMPTY campaign of theirs (a campaign with leads holds their history; take
   the leads out first). The admin keeps the existing behaviour: leads go to "No campaign" (FK SET NULL). */
create or replace function public.campaign_delete(_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if public.my_role() <> 'admin' and exists (select 1 from public.outreach_leads where campaign_id = _campaign_id) then
    return jsonb_build_object('ok', false, 'error', 'has_leads');
  end if;
  delete from public.campaigns where id = _campaign_id;
  return jsonb_build_object('ok', true);
end $$;

-- ── 6. leads in, launch, stop ───────────────────────────────────────────────────────────────────
create or replace function public.campaign_add_leads(_campaign_id uuid, _lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return public.leads_set_campaign(_lead_ids, _campaign_id);
end $$;

/* Launch: the campaign's new (never contacted) leads go into the EXISTING queue through
   sales_queue_opener — every safeguard is that function's — with the current approved opener only.
   It walks ALL of them in chunks of that function's cap (200), up to c_max per press, so a
   chunk of unsendable leads never hides the sendable ones behind it. Skips are summed by reason. */
create or replace function public.campaign_launch(_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.my_role(); v_template text; v_all uuid[]; v_chunk uuid[]; v_r jsonb;
  v_queued integer := 0; v_skip jsonb := '{}'::jsonb; v_k text; v_n integer; i integer := 1; v_total integer;
  c_max constant integer := 2000;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
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
end $$;

/* Stop: every lead of this campaign still WAITING in the queue goes back to the status it had (the per-lead
   "remove from queue", for the whole campaign). Messages already sent are not touched. */
create or replace function public.campaign_stop(_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.my_role(); v_n integer := 0; v_name text;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select name into v_name from public.campaigns where id = _campaign_id;
  with un as (
    update public.outreach_leads o
       set status = coalesce(o.previous_status, 'not_contacted'), previous_status = null, queued_at = null, contact_method = null
     where o.campaign_id = _campaign_id and o.status = 'queued'
       and (v_role = 'admin' or o.assigned_to_user_id = auth.uid())
    returning o.id)
  , logged as (
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    select un.id, auth.uid(), 'details_set', jsonb_build_object('queue', 'removed', 'campaign_id', _campaign_id, 'campaign_name', v_name) from un
    returning 1)
  select count(*) into v_n from logged;
  return jsonb_build_object('ok', true, 'stopped', v_n);
end $$;

-- ── 7. a salesperson's lead goes only into a campaign they own ──────────────────────────────────
create or replace function public.lead_set_campaign(_lead_id uuid, _campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from uuid;
  v_name text;
begin
  perform public._require_work(_lead_id);
  if _campaign_id is not null then
    /* ⛔ 2026-10-03: only a campaign the caller may use (admin: any; sales: their own). Another owner's
       campaign answers exactly like one that does not exist. */
    if not public.campaign_usable(_campaign_id) then return jsonb_build_object('ok', false, 'error', 'unknown_campaign'); end if;
    select name into v_name from public.campaigns where id = _campaign_id;
  end if;
  select campaign_id into v_from from public.outreach_leads where id = _lead_id for update;
  if v_from is not distinct from _campaign_id then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set campaign_id = _campaign_id where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set',
          jsonb_build_object('campaign_id', _campaign_id, 'campaign_name', v_name, 'from_campaign_id', v_from));
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.leads_set_campaign(_lead_ids uuid[], _campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_r jsonb;
  v_moved integer := 0;
  v_unchanged integer := 0;
  v_skip jsonb := '{}'::jsonb;
  v_reason text;
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if _lead_ids is null or array_length(_lead_ids, 1) is null then return jsonb_build_object('ok', false, 'error', 'no_leads'); end if;
  if array_length(_lead_ids, 1) > 500 then return jsonb_build_object('ok', false, 'error', 'too_many'); end if;
  if _campaign_id is not null and not public.campaign_usable(_campaign_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_campaign');
  end if;

  foreach v_id in array _lead_ids loop
    v_reason := null;
    begin
      v_r := public.lead_set_campaign(v_id, _campaign_id);
      if (v_r ->> 'ok')::boolean is not true then v_reason := coalesce(v_r ->> 'error', 'refused');
      elsif (v_r ->> 'unchanged')::boolean is true then v_unchanged := v_unchanged + 1;
      else v_moved := v_moved + 1;
      end if;
    exception when insufficient_privilege then
      v_reason := 'not_yours';
    end;
    if v_reason is not null then
      v_skip := jsonb_set(v_skip, array[v_reason], to_jsonb(coalesce((v_skip ->> v_reason)::int, 0) + 1));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'moved', v_moved, 'unchanged', v_unchanged, 'skipped', v_skip);
end $function$;

-- ── grants ──────────────────────────────────────────────────────────────────────────────────────
revoke all on function public.campaign_usable(uuid) from public, anon;
revoke all on function public._campaign_counts(uuid[]) from public, anon, authenticated;
revoke all on function public._campaign_json(public.campaigns, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.my_campaigns() from public, anon;
revoke all on function public.campaign_detail(uuid) from public, anon;
revoke all on function public.campaign_leads(uuid) from public, anon;
revoke all on function public.campaign_candidates(uuid, text) from public, anon;
revoke all on function public.campaign_name_available(text, uuid) from public, anon;
revoke all on function public.campaign_create(text) from public, anon;
revoke all on function public.campaign_rename(uuid, text) from public, anon;
revoke all on function public.campaign_delete(uuid) from public, anon;
revoke all on function public.campaign_add_leads(uuid, uuid[]) from public, anon;
revoke all on function public.campaign_launch(uuid) from public, anon;
revoke all on function public.campaign_stop(uuid) from public, anon;
grant execute on function public.campaign_usable(uuid) to authenticated;
grant execute on function public.my_campaigns() to authenticated;
grant execute on function public.campaign_detail(uuid) to authenticated;
grant execute on function public.campaign_leads(uuid) to authenticated;
grant execute on function public.campaign_candidates(uuid, text) to authenticated;
grant execute on function public.campaign_name_available(text, uuid) to authenticated;
grant execute on function public.campaign_create(text) to authenticated;
grant execute on function public.campaign_rename(uuid, text) to authenticated;
grant execute on function public.campaign_delete(uuid) to authenticated;
grant execute on function public.campaign_add_leads(uuid, uuid[]) to authenticated;
grant execute on function public.campaign_launch(uuid) to authenticated;
grant execute on function public.campaign_stop(uuid) to authenticated;

-- ── 8. sales_add_lead: the live definition (read 2026-10-03) with the campaign check added ─────
CREATE OR REPLACE FUNCTION public.sales_add_lead(_lead jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_owner uuid := public.book_owner_id();
  v_pid text := nullif(btrim(_lead->>'place_id'), '');
  v_pk text := public.phone_key(_lead->>'phone');
  v_mu text := nullif(btrim(_lead->>'google_maps_url'), '');
  v_site text := nullif(btrim(_lead->>'website'), '');
  v_name text := nullif(btrim(_lead->>'business_name'), '');
  v_trade text := nullif(btrim(_lead->>'search_keyword'), '');
  v_src text := nullif(btrim(_lead->>'lead_source'), '');
  v_note text := nullif(btrim(_lead->>'note'), '');
  v_rating numeric;
  v_reviews integer;
  v_town text := nullif(btrim(_lead->>'derived_town'), '');
  v_town_note text := nullif(btrim(_lead->>'town_fetch_note'), '');
  v_town_checked boolean := coalesce((_lead->>'town_checked')::boolean, false);
  v_services text[];
  v_areas text[];
  v_hit record;
  v_id uuid;
  v_g jsonb;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  /* ⛔ 2026-09-29: suspended → refused; adds per hour (actions.lead_add). */
  v_g := public.guard_action(v_uid, 'lead_add', null, 0, 1, 'sales_add_lead');
  if not coalesce((v_g ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'usage_paused', 'detail', 'Usage temporarily paused — contact Paul');
  end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'no_trade'); end if;
  /* ⛔ 2026-10-03: a lead goes only into a campaign the caller may use (sales: their own). */
  if nullif(_lead->>'campaign_id', '') is not null and not public.campaign_usable(nullif(_lead->>'campaign_id', '')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'unknown_campaign');
  end if;
  if v_src is not null and v_src not in ('linkedin', 'facebook', 'referral', 'networking', 'google_maps', 'social',
       'email_research', 'ai_research', 'cold_research', 'existing_relationship', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
  /* The lookup's numbers, only when they ARE numbers — a bad value is dropped, never a failed add. */
  if jsonb_typeof(_lead->'rating') = 'number' and (_lead->>'rating')::numeric between 0 and 5 then
    v_rating := (_lead->>'rating')::numeric;
  end if;
  if jsonb_typeof(_lead->'review_count') = 'number' and (_lead->>'review_count')::numeric between 0 and 10000000 then
    v_reviews := floor((_lead->>'review_count')::numeric)::integer;
  end if;
  if length(v_town) > 200 then v_town := null; end if;
  if length(v_town_note) > 100 then v_town_note := null; end if;
  if jsonb_typeof(_lead->'services') = 'array' then
    v_services := public.clean_label_list(array(select jsonb_array_elements_text(_lead->'services')));
  end if;
  if jsonb_typeof(_lead->'service_areas') = 'array' then
    v_areas := public.clean_label_list(array(select jsonb_array_elements_text(_lead->'service_areas')));
  end if;
  if coalesce(array_length(v_services, 1), 0) > 30 or coalesce(array_length(v_areas, 1), 0) > 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items');
  end if;
  if v_pk is not null then perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || v_pk, 0)); end if;
  select * into v_hit from public._lead_identity_rows(jsonb_build_array(jsonb_build_object(
    'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu)));
  if v_hit.lead_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', v_hit.state,
                              'lead_id', case when v_hit.state in ('yours', 'claimable') then v_hit.lead_id end,
                              'owner_name', v_hit.owner_name, 'added_at', v_hit.added_at);
  end if;
  /* ⚠️ THE WEBSITE IS A WARNING, NEVER A REFUSAL. Chains share one domain (measured 2026-09-28: 149
     own-site hosts on 2+ leads — lockfit.co.uk 24 branches, cityplumbing.co.uk 20), so a hard match
     would refuse a genuine second branch; ambiguity creates a new record rather than matching wrongly
     (CLAUDE.md §6). The person is told who has that website and may confirm it is a different branch.
     Place id, phone and Maps link above stay hard refusals. */
  if public.website_identity(v_site) is not null and coalesce((_lead->>'confirm_site_match')::boolean, false) is not true then
    select l.id, l.created_at, t.display_name as owner_name,
           case when l.assigned_to_user_id = v_uid then 'yours' when l.assigned_to_user_id is not null then 'owned' else 'unassigned' end as state
      into v_hit
      from public.outreach_leads l left join public.team_members t on t.user_id = l.assigned_to_user_id
     where l.website is not null and public.website_identity(l.website) = public.website_identity(v_site)
     order by l.created_at limit 1;
    if v_hit.id is not null then
      return jsonb_build_object('ok', false, 'error', 'site_match', 'state', v_hit.state,
                                'owner_name', v_hit.owner_name, 'added_at', v_hit.created_at);
    end if;
  end if;
  begin
    insert into public.outreach_leads (
      user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, phone, google_maps_url,
      address, category, search_keyword, search_location, website, status, next_action, country, list_type,
      campaign_id, place_id, lead_source, contact_name, email, services_included, service_areas,
      rating, review_count, derived_town, town_fetched_at, town_fetch_note)
    values (
      v_owner, v_uid, v_uid, now(), v_name, nullif(btrim(_lead->>'phone'), ''), v_mu,
      nullif(btrim(_lead->>'address'), ''), nullif(btrim(_lead->>'category'), ''), v_trade,
      nullif(btrim(_lead->>'search_location'), ''), v_site, 'not_contacted', 'none',
      coalesce(nullif(btrim(_lead->>'country'), ''), 'UK'),
      case when _lead->>'list_type' in ('no_website', 'broken_website', 'manual') then _lead->>'list_type' else 'no_website' end,
      nullif(_lead->>'campaign_id', '')::uuid, v_pid, v_src,
      nullif(btrim(_lead->>'contact_name'), ''), nullif(btrim(_lead->>'email'), ''),
      nullif(v_services, '{}'::text[]), nullif(v_areas, '{}'::text[]),
      v_rating, v_reviews, v_town,
      /* Stamped ONLY when the lookup actually reported on the town — the admin's rule
         (applyPlaceDetailsToLead): a stamp without a lookup would poison place-town's 30-day cache. */
      case when v_town_checked then now() end,
      case when v_town_checked then v_town_note end)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', 'owned');
  end;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (v_id, v_uid, 'lead_added', case when v_src is null then '{}'::jsonb else jsonb_build_object('source', v_src) end);
  if v_note is not null then
    insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (v_id, v_uid, 'note', left(v_note, 4000));
  end if;
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end $function$;
