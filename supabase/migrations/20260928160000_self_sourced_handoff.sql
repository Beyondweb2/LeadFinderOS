-- Self-sourced prospects + paid-client handoff (2026-09-28, docs/self-sourced-handoff.md).
-- ADDITIVE ONLY: three nullable columns on outreach_leads (metadata-only, no rewrite), a widened CHECK,
-- one immutable helper, one new table, one trigger on whatsapp_messages that can never block a message,
-- one BEFORE trigger on outreach_leads limited to amount_paid/status changes, new/replaced SECURITY
-- DEFINER functions, and the sales_leads view gaining two columns at the END.
-- Applied one statement at a time through the Management API and read back (CLAUDE.md §2).
set lock_timeout = '5s';

-- ── 1. Service areas on the lead; the salesperson who made the sale ──────────────────────────────
-- services live in the EXISTING services_included (text[]), which clientFacts / clientContext already
-- rank as the client record under onboarding. service_areas is its twin. Onboarding outranks both
-- (the resolvers' rank); nothing is copied between the two, so there is never a second truth.
alter table public.outreach_leads add column if not exists service_areas text[];
-- ⛔ Stamped ONCE, by trigger, the moment the lead becomes a client (paid / payment_received /
-- in_delivery / completed / refunded). Immutable afterwards, so a later reassignment or "move all"
-- never erases who brought the client to payment. NULL on a prospect.
alter table public.outreach_leads add column if not exists sold_by_user_id uuid;
alter table public.outreach_leads add column if not exists sold_at timestamptz;

-- ── 2. Two more places a person finds a business ─────────────────────────────────────────────────
alter table public.outreach_leads drop constraint if exists outreach_leads_lead_source_check;
alter table public.outreach_leads add constraint outreach_leads_lead_source_check check (
  lead_source is null or lead_source in (
    'linkedin', 'facebook', 'referral', 'networking', 'google_maps', 'social', 'email_research', 'ai_research',
    'cold_research', 'existing_relationship', 'other')) not valid;
alter table public.outreach_leads validate constraint outreach_leads_lead_source_check;

-- ── 3. A website's identity: its host, www. ignored — never a shared platform ────────────────────
-- facebook.com/somebusiness and checkatrade.com/trades/x are not identities (thousands of businesses
-- share the host). scripts/self-sourced-handoff.test.ts holds this list to src/lib/aggregators.ts.
create or replace function public.website_identity(_url text)
returns text language sql immutable parallel safe set search_path = public as $$
  select case
    when h is null or h = '' or position('.' in h) = 0 then null
    when exists (select 1 from unnest(array[
      'fresha.com','fresha.me','booksy.com','treatwell.com','treatwell.co.uk','vagaro.com','styleseat.com','setmore.com',
      'gettimely.com','timely.com','squareup.com','square.site','schedulicity.com','acuityscheduling.com','ovatu.com',
      'simplybook.me','mindbodyonline.com','calendly.com','phorest.com',
      'facebook.com','instagram.com','tiktok.com','x.com','twitter.com','fb.com','fb.me','fb.watch','m.me','instagr.am',
      'linkedin.com','youtube.com','pinterest.com','snapchat.com','yell.com','yell.co.uk','yelp.com','yelp.co.uk',
      'tripadvisor.com','tripadvisor.co.uk','google.com','maps.google.com','business.google.com',
      'company-information.service.gov.uk','companieshouse.gov.uk','endole.co.uk','companycheck.co.uk',
      'company-check.co.uk','companieslist.co.uk','opencorporates.com','globaldatabase.com','datanyze.com',
      'trustpilot.com','trustpilot.co.uk','reviews.io','feefo.com','checkatrade.com','bark.com','mybuilder.com',
      'ratedpeople.com','trustatrader.com','trustmark.org.uk','which.co.uk','thomsonlocal.com','cylex.co.uk',
      'cylex-uk.co.uk','scoot.co.uk','freeindex.co.uk','192.com','hotfrog.co.uk','hotfrog.com','brownbook.net',
      'misterwhat.co.uk','findopen.co.uk','opendi.co.uk','tupalo.net','nextdoor.co.uk','nextdoor.com','bizify.co.uk',
      'uk.locanto','thebestof.co.uk','freeola.com',
      'linktr.ee','goo.gl','g.page','wa.me','business.site'
    ]) d where h = d or h like '%.' || d) then null
    else h
  end
  from (select lower(regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(_url, '')),
          '^[a-z][a-z0-9+.-]*://', '', 'i'), '[/?#:].*$', ''), '^www\.', '', 'i')) as h) x
$$;
revoke all on function public.website_identity(text) from public, anon;
grant execute on function public.website_identity(text) to authenticated;
-- sales_add_lead compares against this expression; 5k rows, built in well under a second.
create index if not exists idx_outreach_leads_website_identity
  on public.outreach_leads (public.website_identity(website)) where website is not null;

-- ── 4. A clean list of short labels (services / areas): trimmed, de-duplicated, capped ───────────
create or replace function public.clean_label_list(_items text[])
returns text[] language sql immutable set search_path = public as $$
  select case when _items is null then null else coalesce((
    select array_agg(v order by ord) from (
      select distinct on (lower(v)) v, ord
      from (select left(btrim(regexp_replace(x, '\s+', ' ', 'g')), 80) as v, ord
            from unnest(_items) with ordinality as u(x, ord)) s
      where v <> ''
      order by lower(v), ord
    ) d where ord is not null
  ), '{}'::text[]) end
$$;
revoke all on function public.clean_label_list(text[]) from public, anon;

-- ── 5. Add a lead by hand: + services, areas, address, and the website as an identity ──────────
create or replace function public.sales_add_lead(_lead jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  v_services text[];
  v_areas text[];
  v_hit record;
  v_id uuid;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'no_trade'); end if;
  if v_src is not null and v_src not in ('linkedin', 'facebook', 'referral', 'networking', 'google_maps', 'social',
       'email_research', 'ai_research', 'cold_research', 'existing_relationship', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
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
  select * into v_hit from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object(
    'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu)));
  if v_hit.lead_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', v_hit.state, 'lead_id', v_hit.lead_id,
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
      campaign_id, place_id, lead_source, contact_name, email, services_included, service_areas)
    values (
      v_owner, v_uid, v_uid, now(), v_name, nullif(btrim(_lead->>'phone'), ''), v_mu,
      nullif(btrim(_lead->>'address'), ''), nullif(btrim(_lead->>'category'), ''), v_trade,
      nullif(btrim(_lead->>'search_location'), ''), v_site, 'not_contacted', 'none',
      coalesce(nullif(btrim(_lead->>'country'), ''), 'UK'),
      case when _lead->>'list_type' in ('no_website', 'broken_website', 'manual') then _lead->>'list_type' else 'no_website' end,
      nullif(_lead->>'campaign_id', '')::uuid, v_pid, v_src,
      nullif(btrim(_lead->>'contact_name'), ''), nullif(btrim(_lead->>'email'), ''),
      nullif(v_services, '{}'::text[]), nullif(v_areas, '{}'::text[]))
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
end $$;
revoke all on function public.sales_add_lead(jsonb) from public, anon;
grant execute on function public.sales_add_lead(jsonb) to authenticated;

-- ── 6. Build the prospect's profile progressively: services, areas, address, website ────────────
-- NULL = leave alone; an empty array / '' = clear. Both roles, on a lead they may work.
-- ⚠️ The phone is NOT editable here: it is an identity key, and changing it could dodge the dedupe.
create or replace function public.lead_set_profile(_lead_id uuid, _services text[] default null,
  _areas text[] default null, _address text default null, _website text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_services text[] := public.clean_label_list(_services);
  v_areas text[] := public.clean_label_list(_areas);
  v_changed jsonb := '{}'::jsonb;
begin
  perform public._require_work(_lead_id);
  if coalesce(array_length(v_services, 1), 0) > 30 or coalesce(array_length(v_areas, 1), 0) > 30 then
    return jsonb_build_object('ok', false, 'error', 'too_many_items');
  end if;
  if length(coalesce(_address, '')) > 300 or length(coalesce(_website, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  if _services is not null then v_changed := v_changed || jsonb_build_object('services', to_jsonb(v_services)); end if;
  if _areas is not null then v_changed := v_changed || jsonb_build_object('service_areas', to_jsonb(v_areas)); end if;
  if _address is not null then v_changed := v_changed || jsonb_build_object('address', nullif(btrim(_address), '')); end if;
  if _website is not null then v_changed := v_changed || jsonb_build_object('website', nullif(btrim(_website), '')); end if;
  if v_changed = '{}'::jsonb then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set
    services_included = case when _services is null then services_included else nullif(v_services, '{}'::text[]) end,
    service_areas = case when _areas is null then service_areas else nullif(v_areas, '{}'::text[]) end,
    address = case when _address is null then address else nullif(btrim(_address), '') end,
    website = case when _website is null then website else nullif(btrim(_website), '') end
  where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data) values (_lead_id, auth.uid(), 'details_set', v_changed);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_set_profile(uuid, text[], text[], text, text) from public, anon;
grant execute on function public.lead_set_profile(uuid, text[], text[], text, text) to authenticated;

-- ── 7. The salesperson who brought the client to payment ────────────────────────────────────────
-- Fires only when amount_paid or status is written (and on insert). Once set, it never changes.
create or replace function public.trg_outreach_leads_sold_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.sold_by_user_id is not null then
    new.sold_by_user_id := old.sold_by_user_id;
    new.sold_at := old.sold_at;
    return new;
  end if;
  if new.sold_by_user_id is null and public.lead_is_client(new.amount_paid, new.status) then
    new.sold_by_user_id := coalesce(new.assigned_to_user_id, new.user_id);
    new.sold_at := now();
  end if;
  return new;
end $$;
revoke all on function public.trg_outreach_leads_sold_by() from public, anon, authenticated;
drop trigger if exists trg_outreach_leads_sold_by on public.outreach_leads;
create trigger trg_outreach_leads_sold_by before insert or update of amount_paid, status, sold_by_user_id, sold_at
  on public.outreach_leads for each row execute function public.trg_outreach_leads_sold_by();

-- Backfill the clients already on file (5 on 2026-09-28): whoever holds them now, at payment date.
update public.outreach_leads
   set sold_by_user_id = coalesce(assigned_to_user_id, user_id),
       sold_at = coalesce(payment_date::timestamptz, updated_at)
 where sold_by_user_id is null and public.lead_is_client(amount_paid, status);

-- ── 8. The view gains the two profile lists at the END ──────────────────────────────────────────
create or replace view public.sales_leads with (security_barrier = true) as
select
  l.id, l.business_name, l.phone, l.email, l.google_maps_url, l.address, l.category, l.status,
  l.next_action, l.next_action_date, l.next_action_note, l.call_booked_at, l.created_at, l.updated_at,
  l.country, l.list_type, l.is_archived, l.is_potential_work, l.image_url, l.facebook_url, l.instagram_url,
  l.contact_method, l.place_id, l.whatsapp_status, l.whatsapp_sent_at, l.whatsapp_delivery_status,
  l.whatsapp_template, l.queued_at, l.contact_name, l.website, l.campaign_id, l.search_keyword,
  l.search_location, l.derived_town, l.review_count, l.rating, l.lat, l.lng, l.line_type, l.product,
  l.hook_followup_queued_at, l.contact_followup_queued_at,
  l.assigned_to_user_id, l.assigned_at, l.added_by_user_id, l.website_control, l.website_control_note,
  null::numeric as amount_paid,
  l.lead_source,
  l.services_included, l.service_areas
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;

-- ── 9. Activity kinds: a crawl started, a report link shared ───────────────────────────────────
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed',
  'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued',
  'marked_interested', 'details_set', 'archived_set', 'contact_logged', 'crawl_run', 'report_link']));

-- ── 10. Report link: generated (copied) and SENT ────────────────────────────────────────────────
-- Opens are ai_audits.first_opened_at / open_count (bump_audit_open, non-bot loads). The app's own
-- opens carry preview=1 and are not counted (render-audit-report). Same shape as onboarding_link_events.
create table if not exists public.report_link_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  audit_id uuid not null references public.ai_audits(id) on delete cascade,
  kind text not null check (kind in ('generated', 'sent')),
  channel text not null check (channel in ('whatsapp', 'email', 'linkedin', 'sms', 'in_person', 'other', 'copy')),
  actor_user_id uuid references auth.users(id) on delete set null,
  message_id uuid unique references public.whatsapp_messages(id) on delete set null,
  template_name text,
  created_at timestamptz not null default now()
);
create index if not exists report_link_events_lead_idx on public.report_link_events (lead_id, created_at);
alter table public.report_link_events enable row level security;
drop policy if exists report_link_events_select on public.report_link_events;
create policy report_link_events_select on public.report_link_events for select to authenticated
  using ((select public.my_role()) = 'admin' or lead_id in (select public.my_sales_lead_ids()));
revoke all on public.report_link_events from public, anon;
revoke insert, update, delete, truncate on public.report_link_events from authenticated;
grant select on public.report_link_events to authenticated;

-- The report inside a message body → its audit. ONE function, used by the trigger and the backfill.
create or replace function public.report_link_audit_in(_body text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v text; a uuid;
begin
  if _body is null or _body !~* 'findable\.live/(r|report)/' then return null; end if;
  v := substring(_body from '(?i)findable\.live/report/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
  if v is not null then select id into a from public.ai_audits where id = v::uuid; return a; end if;
  v := substring(_body from '(?i)findable\.live/r/([23456789a-hjkmnp-z]{6})(?![0-9a-z])');
  if v is null then return null; end if;
  select id into a from public.ai_audits where short_code = lower(v);
  return a;
end $$;
revoke all on function public.report_link_audit_in(text) from public, anon, authenticated;

create or replace function public.trg_report_link_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_audit uuid; v_lead uuid;
begin
  if new.direction is distinct from 'outbound' or new.status is null or new.status not in ('sent', 'delivered', 'read') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('sent', 'delivered', 'read') then return new; end if;
  begin
    v_audit := public.report_link_audit_in(new.body);
    if v_audit is null then return new; end if;
    select coalesce(a.lead_id, new.lead_id) into v_lead from public.ai_audits a where a.id = v_audit;
    if v_lead is null or not exists (select 1 from public.outreach_leads where id = v_lead) then return new; end if;
    insert into public.report_link_events (lead_id, audit_id, kind, channel, actor_user_id, message_id, template_name, created_at)
    values (v_lead, v_audit, 'sent', 'whatsapp', new.sent_by_user_id, new.id, new.template_name, coalesce(new.created_at, now()))
    on conflict (message_id) do nothing;
  exception when others then
    -- ⛔ Tracking must never cost a message. Any failure here is swallowed.
    null;
  end;
  return new;
end $$;
revoke all on function public.trg_report_link_sent() from public, anon, authenticated;
drop trigger if exists trg_report_link_sent on public.whatsapp_messages;
create trigger trg_report_link_sent after insert or update of status on public.whatsapp_messages
  for each row execute function public.trg_report_link_sent();

-- Backfill: every real WhatsApp send already on file that carried a report link.
insert into public.report_link_events (lead_id, audit_id, kind, channel, actor_user_id, message_id, template_name, created_at)
select coalesce(a.lead_id, m.lead_id), a.id, 'sent', 'whatsapp', m.sent_by_user_id, m.id, m.template_name, m.created_at
from public.whatsapp_messages m
cross join lateral (select public.report_link_audit_in(m.body) as aid) x
join public.ai_audits a on a.id = x.aid
join public.outreach_leads l on l.id = coalesce(a.lead_id, m.lead_id)
where m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read') and m.body ~* 'findable\.live/(r|report)/'
on conflict (message_id) do nothing;

-- A person copied the report link (generated) or sent it somewhere other than WhatsApp (sent).
-- WhatsApp sends are recorded by the trigger, so 'whatsapp' is refused here (it would count twice).
create or replace function public.lead_report_link_event(_lead_id uuid, _audit_id uuid, _kind text, _channel text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if not exists (select 1 from public.ai_audits where id = _audit_id and lead_id = _lead_id) then
    return jsonb_build_object('ok', false, 'error', 'not_this_leads_report');
  end if;
  if _kind = 'generated' then
    _channel := 'copy';
    if exists (select 1 from public.report_link_events
               where lead_id = _lead_id and audit_id = _audit_id and kind = 'generated' and actor_user_id = auth.uid()
                 and created_at > now() - interval '10 minutes') then
      return jsonb_build_object('ok', true, 'deduped', true);
    end if;
  elsif _kind = 'sent' then
    if _channel is null or _channel not in ('email', 'linkedin', 'sms', 'in_person', 'other') then
      return jsonb_build_object('ok', false, 'error', 'bad_channel');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  insert into public.report_link_events (lead_id, audit_id, kind, channel, actor_user_id)
  values (_lead_id, _audit_id, _kind, _channel, auth.uid());
  if _kind = 'sent' then
    insert into public.lead_activity (lead_id, actor_user_id, kind, data)
    values (_lead_id, auth.uid(), 'report_link', jsonb_build_object('audit_id', _audit_id, 'channel', _channel));
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_report_link_event(uuid, uuid, text, text) from public, anon;
grant execute on function public.lead_report_link_event(uuid, uuid, text, text) to authenticated;
