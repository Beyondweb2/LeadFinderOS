-- Sales readiness (2026-09-28, docs/sales-readiness.md). ADDITIVE ONLY: one nullable column on
-- outreach_leads (metadata-only, no rewrite), a CHECK validated on a 5k-row table, one new table,
-- one trigger on whatsapp_messages that can never block a message, new SECURITY DEFINER functions,
-- the sales_leads view gaining one column at the END, and two timestamps on onboarding_responses.
-- Applied one statement group at a time through the Management API and read back (CLAUDE.md §2).
set lock_timeout = '5s';

-- ── 1. Where a self-sourced lead came from ──────────────────────────────────────────────────────
-- NULL = found by the app's own search (Find Leads / Coverage / import). A value = a person added it
-- from somewhere the app cannot see. Never backfilled: absence means "search", which is true.
alter table public.outreach_leads add column if not exists lead_source text;
alter table public.outreach_leads drop constraint if exists outreach_leads_lead_source_check;
alter table public.outreach_leads add constraint outreach_leads_lead_source_check check (
  lead_source is null or lead_source in (
    'linkedin', 'referral', 'networking', 'google_maps', 'social', 'ai_research',
    'cold_research', 'existing_relationship', 'other')) not valid;
alter table public.outreach_leads validate constraint outreach_leads_lead_source_check;

-- The view gains lead_source at the END (create or replace may only append columns).
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
  l.lead_source
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;

-- ── 2. Activity kinds: a non-call contact ───────────────────────────────────────────────────────
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed',
  'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued',
  'marked_interested', 'details_set', 'archived_set', 'contact_logged']));

-- ── 3. Onboarding (sign-up) link: generated and SENT ────────────────────────────────────────────
-- Opens stay where they are (lead_page_hits, written by findable-onboarding prefill); a preview by
-- the operator is written as page 'onboarding_preview' and never counts.
create table if not exists public.onboarding_link_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  kind text not null check (kind in ('generated', 'sent')),
  channel text not null check (channel in ('whatsapp', 'email', 'linkedin', 'sms', 'in_person', 'other', 'copy')),
  actor_user_id uuid references auth.users(id) on delete set null,
  message_id uuid unique references public.whatsapp_messages(id) on delete set null,
  template_name text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists onboarding_link_events_lead_idx on public.onboarding_link_events (lead_id, created_at);
alter table public.onboarding_link_events enable row level security;
drop policy if exists onboarding_link_events_select on public.onboarding_link_events;
create policy onboarding_link_events_select on public.onboarding_link_events for select to authenticated
  using ((select public.my_role()) = 'admin' or lead_id in (select public.my_sales_lead_ids()));
revoke all on public.onboarding_link_events from public, anon;
revoke insert, update, delete, truncate on public.onboarding_link_events from authenticated;
grant select on public.onboarding_link_events to authenticated;

-- The link inside a message body. ONE pattern, used by the trigger and the backfill below.
-- Only a link that carries ?lead=<uuid> is trackable (an open is keyed on that id); the post-payment
-- re-entry link (&q2=) is not an onboarding offer and is excluded.
create or replace function public.onboarding_link_lead_in(_body text)
returns uuid language plpgsql immutable set search_path = public as $$
declare v text;
begin
  if _body is null or _body !~* '/onboarding/' then return null; end if;
  v := substring(_body from '(?i)/onboarding/[^[:space:]]*?[?&]lead=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})');
  if v is null then return null; end if;
  if _body ~* ('[?&]lead=' || v || '[^[:space:]]*[?&]q2=') then return null; end if;
  return v::uuid;
end $$;
revoke all on function public.onboarding_link_lead_in(text) from public, anon, authenticated;

create or replace function public.trg_onboarding_link_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_campaign uuid;
begin
  if new.direction is distinct from 'outbound' or new.status is null or new.status not in ('sent', 'delivered', 'read') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('sent', 'delivered', 'read') then return new; end if;
  begin
    v_lead := public.onboarding_link_lead_in(new.body);
    if v_lead is null then return new; end if;
    select l.campaign_id into v_campaign from public.outreach_leads l where l.id = v_lead;
    if not found then return new; end if;
    insert into public.onboarding_link_events (lead_id, kind, channel, actor_user_id, message_id, template_name, campaign_id, created_at)
    values (v_lead, 'sent', 'whatsapp', new.sent_by_user_id, new.id, new.template_name, v_campaign, coalesce(new.created_at, now()))
    on conflict (message_id) do nothing;
  exception when others then
    -- ⛔ Tracking must never cost a message. Any failure here is swallowed.
    null;
  end;
  return new;
end $$;
revoke all on function public.trg_onboarding_link_sent() from public, anon, authenticated;

drop trigger if exists trg_onboarding_link_sent on public.whatsapp_messages;
create trigger trg_onboarding_link_sent after insert or update of status on public.whatsapp_messages
  for each row execute function public.trg_onboarding_link_sent();

-- Backfill: every real WhatsApp send already on file that carried a trackable link.
insert into public.onboarding_link_events (lead_id, kind, channel, actor_user_id, message_id, template_name, campaign_id, created_at)
select x.lead, 'sent', 'whatsapp', m.sent_by_user_id, m.id, m.template_name, l.campaign_id, m.created_at
from public.whatsapp_messages m
cross join lateral (select public.onboarding_link_lead_in(m.body) as lead) x
join public.outreach_leads l on l.id = x.lead
where m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read') and x.lead is not null
on conflict (message_id) do nothing;

-- A person copied the link (generated) or sent it somewhere other than WhatsApp (sent). WhatsApp
-- sends are recorded by the trigger, so 'whatsapp' is refused here — a hand-logged WhatsApp send
-- would count the same link twice.
create or replace function public.lead_onboarding_link_event(_lead_id uuid, _kind text, _channel text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_campaign uuid;
begin
  perform public._require_work(_lead_id);
  if _kind = 'generated' then
    _channel := 'copy';
    if exists (select 1 from public.onboarding_link_events
               where lead_id = _lead_id and kind = 'generated' and actor_user_id = auth.uid()
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
  select campaign_id into v_campaign from public.outreach_leads where id = _lead_id;
  insert into public.onboarding_link_events (lead_id, kind, channel, actor_user_id, campaign_id)
  values (_lead_id, _kind, _channel, auth.uid(), v_campaign);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_onboarding_link_event(uuid, text, text) from public, anon;
grant execute on function public.lead_onboarding_link_event(uuid, text, text) to authenticated;

-- ── 4. Log a contact: a call, or LinkedIn / email / in person / other ───────────────────────────
-- Records activity ONLY. It never writes status or next action (Next Action is human-set only).
create or replace function public.lead_log_contact(_lead_id uuid, _channel text, _outcome text, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if _channel is null or _channel not in ('call', 'linkedin', 'email', 'in_person', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_channel');
  end if;
  if _outcome is null or _outcome not in ('no_answer', 'left_voicemail', 'spoke_to_owner', 'interested', 'call_back',
       'meeting_booked', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), case when _channel = 'call' then 'call_outcome' else 'contact_logged' end,
          nullif(btrim(coalesce(_note, '')), ''), jsonb_build_object('outcome', _outcome, 'channel', _channel));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_log_contact(uuid, text, text, text) from public, anon;
grant execute on function public.lead_log_contact(uuid, text, text, text) to authenticated;

-- ── 5. Add a lead by hand: source, contact name, email, a first note ────────────────────────────
-- Same identity rule as before (place id, then phone, then Maps URL, via lead_identity_lookup):
-- an existing business is refused with who has it, so a contacted lead can never be re-added or taken.
create or replace function public.sales_add_lead(_lead jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_owner uuid := public.book_owner_id();
  v_pid text := nullif(btrim(_lead->>'place_id'), '');
  v_pk text := public.phone_key(_lead->>'phone');
  v_mu text := nullif(btrim(_lead->>'google_maps_url'), '');
  v_name text := nullif(btrim(_lead->>'business_name'), '');
  v_trade text := nullif(btrim(_lead->>'search_keyword'), '');
  v_src text := nullif(btrim(_lead->>'lead_source'), '');
  v_note text := nullif(btrim(_lead->>'note'), '');
  v_hit record;
  v_id uuid;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'no_trade'); end if;
  if v_src is not null and v_src not in ('linkedin', 'referral', 'networking', 'google_maps', 'social', 'ai_research',
       'cold_research', 'existing_relationship', 'other') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
  if v_pk is not null then perform pg_advisory_xact_lock(hashtextextended('outreach_leads.phone_key:' || v_pk, 0)); end if;
  select * into v_hit from public.lead_identity_lookup(jsonb_build_array(jsonb_build_object(
    'k', '1', 'place_id', v_pid, 'phone', _lead->>'phone', 'maps_url', v_mu)));
  if v_hit.lead_id is not null then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', v_hit.state, 'lead_id', v_hit.lead_id,
                              'owner_name', v_hit.owner_name, 'added_at', v_hit.added_at);
  end if;
  begin
    insert into public.outreach_leads (
      user_id, added_by_user_id, assigned_to_user_id, assigned_at, business_name, phone, google_maps_url,
      address, category, search_keyword, search_location, website, status, next_action, country, list_type,
      campaign_id, place_id, lead_source, contact_name, email)
    values (
      v_owner, v_uid, v_uid, now(), v_name, nullif(btrim(_lead->>'phone'), ''), v_mu,
      nullif(btrim(_lead->>'address'), ''), nullif(btrim(_lead->>'category'), ''), v_trade,
      nullif(btrim(_lead->>'search_location'), ''), nullif(btrim(_lead->>'website'), ''), 'not_contacted', 'none',
      coalesce(nullif(btrim(_lead->>'country'), ''), 'UK'),
      case when _lead->>'list_type' in ('no_website', 'broken_website', 'manual') then _lead->>'list_type' else 'no_website' end,
      nullif(_lead->>'campaign_id', '')::uuid, v_pid, v_src,
      nullif(btrim(_lead->>'contact_name'), ''), nullif(btrim(_lead->>'email'), ''))
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

-- ── 6. Google Business Profile access after payment ─────────────────────────────────────────────
-- requested_at: the paid page showed the instructions. status_at: when the CLIENT last answered
-- (gbp_status = done / will_do / no_access — what they SAY). Findable's own confirmation is the
-- delivery checklist tick 'gbp_access', never inferred from either of these.
alter table public.onboarding_responses add column if not exists gbp_access_requested_at timestamptz;
alter table public.onboarding_responses add column if not exists gbp_status_at timestamptz;
