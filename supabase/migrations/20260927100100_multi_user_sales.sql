-- Multi-user, part 2 of 2: ADMIN + SALES on ONE book (2026-09-27).
--
-- ⛔ THE BOOK STAYS OWNED BY THE DATA ACCOUNT. Every row keeps user_id = the data account, so every
-- cron, queue, report and dashboard keeps reading one book exactly as before. Who is WORKING a lead
-- is a new column, assigned_to_user_id. A salesperson never owns rows; they are assigned leads.
--
-- ⛔ EXISTING POLICIES ARE NOT TOUCHED. Sales access is ADDED as separate permissive SELECT policies
-- (keyed to my_role() = 'sales') and SECURITY DEFINER functions. The only restriction added to an
-- existing surface is RESTRICTIVE: writes to outreach_leads and the audit tables require the admin
-- role — which the admin account holds, so its behaviour is unchanged.
--
-- ⛔ SALES NEVER READS outreach_leads. The row carries Stripe ids, amounts, refunds and delivery
-- notes; a column cannot be hidden per user. Sales reads the view sales_leads (no money columns,
-- no paid clients) and writes only through the functions below, each of which checks the role and
-- the assignment itself.
--
-- The role source is public.user_roles (deny-all writes for every signed-in role; service role only).
-- Removing a user's 'sales' row is the disable switch — my_role() answers null on the next statement.

-- ── Team ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  status text not null default 'active' check (status in ('active', 'disabled')),
  is_book_owner boolean not null default false,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  -- Per-user daily send ceiling, for the admin to set later. NULL = no per-user limit (the global
  -- WhatsApp cap still applies to everyone). Nothing enforces it yet — see docs/multi-user.md.
  daily_send_limit integer check (daily_send_limit is null or daily_send_limit >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists team_members_one_book_owner on public.team_members (is_book_owner) where is_book_owner;
alter table public.team_members enable row level security;

-- Seed the admin (the data account holds the admin role row) as the book owner.
insert into public.team_members (user_id, display_name, status, is_book_owner)
select r.user_id, 'Paul', 'active', true
from public.user_roles r
where r.role = 'admin'
order by r.created_at
limit 1
on conflict (user_id) do nothing;

-- ── Role helpers ────────────────────────────────────────────────────────────────────────────────
-- The caller's role: 'admin', 'sales', or NULL. Positive match only; admin outranks sales.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then 'admin'
    when exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'sales') then 'sales'
    else null
  end
$$;

-- The account every lead row belongs to. Explicit (team_members.is_book_owner), never guessed.
create or replace function public.book_owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.team_members where is_book_owner limit 1
$$;

-- Paid, in delivery, completed or refunded: a client, not a prospect. Sales never sees these.
create or replace function public.lead_is_client(_amount_paid numeric, _status text)
returns boolean language sql immutable as $$
  select coalesce(_amount_paid, 0) > 0
      or coalesce(_status, '') in ('payment_received', 'in_delivery', 'completed', 'refunded')
$$;

-- A phone number reduced to digits with the country/trunk prefix removed, for identity only.
-- 07700 900123, +44 7700 900123 and 0044 7700 900123 all give 7700900123. Too short → NULL.
create or replace function public.phone_key(_phone text)
returns text language sql immutable parallel safe as $$
  select case when length(d) < 7 then null else d end
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(_phone, ''), '\D', '', 'g'),
               '^00', ''),
             '^44(?=\d{10}$)', ''),
           '^0', '') as d
  ) x
$$;

-- ⛔ CONTACTED = GENUINE STORED HISTORY, EITHER DIRECTION. The earliest of: an outbound WhatsApp
-- that was sent/delivered/read, any inbound message, a successful send row (by lead or by the same
-- phone), the lead's own legacy send stamps, or a questionnaire on file. NULL = never contacted.
-- Being found, crawled, audited or added is NOT contact.
create or replace function public.lead_first_contact_at(_lead_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  with l as (
    select id, public.phone_key(phone) as pk, whatsapp_sent_at, sms_sent_at, instantly_pushed_at, last_outreach_attempt_at
    from public.outreach_leads where id = _lead_id
  )
  select least(
    (select min(m.created_at) from public.whatsapp_messages m, l
      where m.lead_id = l.id and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read'))),
    (select min(m.created_at) from public.whatsapp_messages m, l
      where l.pk is not null and public.phone_key(m.phone) = l.pk
        and (m.direction = 'inbound' or m.status in ('sent', 'delivered', 'read'))),
    (select min(s.created_at) from public.whatsapp_sends s, l
      where s.lead_id = l.id and s.delivery_status in ('sent', 'delivered', 'read')),
    (select min(o.created_at) from public.onboarding_responses o, l where o.lead_id = l.id),
    (select least(whatsapp_sent_at, sms_sent_at, instantly_pushed_at, last_outreach_attempt_at) from l)
  )
$$;

-- ── Lead columns ────────────────────────────────────────────────────────────────────────────────
alter table public.outreach_leads
  add column if not exists assigned_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists added_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists website_control text
    check (website_control is null or website_control in ('client_controls', 'agency_controls', 'third_party_profile_only', 'no_website', 'unknown')),
  add column if not exists website_control_note text check (website_control_note is null or length(website_control_note) <= 500),
  add column if not exists next_action_note text check (next_action_note is null or length(next_action_note) <= 500);

create index if not exists idx_outreach_leads_assigned on public.outreach_leads (assigned_to_user_id) where assigned_to_user_id is not null;
create index if not exists idx_outreach_leads_phone_key on public.outreach_leads (public.phone_key(phone));
create index if not exists idx_outreach_leads_maps_url on public.outreach_leads (google_maps_url);
create index if not exists idx_whatsapp_messages_lead on public.whatsapp_messages (lead_id);
create index if not exists idx_whatsapp_messages_phone_key on public.whatsapp_messages (public.phone_key(phone));
create index if not exists idx_whatsapp_sends_lead on public.whatsapp_sends (lead_id);

-- May the caller WORK this lead? admin: any lead. sales: a prospect assigned to them.
create or replace function public.can_work_lead(_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'admin' then exists (select 1 from public.outreach_leads where id = _lead_id)
    when 'sales' then exists (
      select 1 from public.outreach_leads
      where id = _lead_id and assigned_to_user_id = auth.uid() and not public.lead_is_client(amount_paid, status))
    else false
  end
$$;

-- May a SALES caller see messages on this phone? Only when it is the phone of a lead they work.
create or replace function public.sales_can_see_phone(_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() = 'sales' and public.phone_key(_phone) is not null and exists (
    select 1 from public.outreach_leads
    where assigned_to_user_id = auth.uid()
      and public.phone_key(phone) = public.phone_key(_phone)
      and not public.lead_is_client(amount_paid, status))
$$;

-- ── ONE BUSINESS = ONE RECORD: the insert guard ─────────────────────────────────────────────────
-- ⛔ INSERT ONLY, AND ON place_id ONLY. Google's place id is the one unambiguous identity. The 83
-- place ids that already appear on more than one row (measured 2026-09-27) are left as they are —
-- Paul's decision: block new duplicates, merge old ones later if ever. Updates are not checked, so
-- no existing enrichment or backfill write can start failing. Phone identity is enforced for sales
-- adds in sales_add_lead (a shared number can be ambiguous; the free-check lane keeps its town rule).
-- The advisory lock makes two simultaneous adds of one place id queue behind each other.
create or replace function public.guard_lead_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
begin
  if new.place_id is not null and btrim(new.place_id) <> '' then
    perform pg_advisory_xact_lock(hashtextextended('outreach_leads.place_id:' || new.place_id, 0));
    select id into v_existing from public.outreach_leads where place_id = new.place_id order by created_at limit 1;
    if v_existing is not null then
      raise exception 'lead_already_exists' using errcode = '23505', detail = v_existing::text, hint = 'place_id';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists trg_outreach_leads_identity on public.outreach_leads;
create trigger trg_outreach_leads_identity before insert on public.outreach_leads
  for each row execute function public.guard_lead_identity();

-- ── Activity log (append-only) ──────────────────────────────────────────────────────────────────
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in (
    'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed',
    'follow_up_set', 'call_booked', 'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued')),
  body text check (body is null or length(body) <= 4000),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_activity_lead on public.lead_activity (lead_id, created_at desc);
create index if not exists idx_lead_activity_actor on public.lead_activity (actor_user_id, created_at desc);
alter table public.lead_activity enable row level security;

-- ── Auto-assign on first contact ────────────────────────────────────────────────────────────────
-- A message on an UNASSIGNED lead makes it someone's: the team member who sent it, else the book
-- owner (the queue and inbound replies). Never reassigns an owned lead. Never blocks the message:
-- any failure here is swallowed, because losing a message row is worse than a missing owner.
create or replace function public.assign_lead_on_contact()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if new.lead_id is null then return new; end if;
  if not (new.direction = 'inbound' or new.status in ('sent', 'delivered', 'read')) then return new; end if;
  begin
    select case when exists (select 1 from public.team_members t where t.user_id = new.user_id and t.status = 'active')
                then new.user_id else public.book_owner_id() end
      into v_owner;
    if v_owner is not null then
      update public.outreach_leads
         set assigned_to_user_id = v_owner, assigned_at = now()
       where id = new.lead_id and assigned_to_user_id is null;
    end if;
  exception when others then
    raise warning 'assign_lead_on_contact: %', sqlerrm;
  end;
  return new;
end
$$;
drop trigger if exists trg_whatsapp_messages_assign on public.whatsapp_messages;
create trigger trg_whatsapp_messages_assign after insert or update of status on public.whatsapp_messages
  for each row execute function public.assign_lead_on_contact();

-- ── Backfill: contacted and client leads belong to the book owner ───────────────────────────────
-- Filling a NEW, empty column; no existing value is changed. updated_at is left alone (the trigger
-- that stamps it is paused for this one statement) so no list re-sorts because of the migration.
alter table public.outreach_leads disable trigger update_outreach_leads_updated_at;
update public.outreach_leads l
   set assigned_to_user_id = l.user_id,
       assigned_at = coalesce(public.lead_first_contact_at(l.id), l.payment_date::timestamptz, now())
 where l.assigned_to_user_id is null
   and (public.lead_first_contact_at(l.id) is not null or public.lead_is_client(l.amount_paid, l.status));
alter table public.outreach_leads enable trigger update_outreach_leads_updated_at;

-- ── The sales view: no money columns, no clients, only the caller's leads ───────────────────────
-- ⛔ security_barrier, SELECT-only grant. The view runs as its owner (it must: sales has no read on
-- outreach_leads), so its WHERE clause IS the access rule. amount_paid is a literal NULL so shared
-- screens that read it compile — and it is true: a client never appears here.
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
  null::numeric as amount_paid
from public.outreach_leads l
where public.my_role() in ('sales', 'admin')
  and (public.my_role() = 'admin' or l.assigned_to_user_id = auth.uid())
  and not public.lead_is_client(l.amount_paid, l.status);

revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;

-- ── Sales RLS (additive permissive SELECTs) ─────────────────────────────────────────────────────
drop policy if exists sales_select_hook_audits on public.ai_audits;
create policy sales_select_hook_audits on public.ai_audits for select to authenticated
  using ((select public.my_role()) = 'sales' and public.can_work_lead(lead_id)
         and coalesce(audit_purpose, 'audit') = 'audit' and is_measurement is not true);

drop policy if exists sales_select_audit_runs on public.ai_audit_runs;
create policy sales_select_audit_runs on public.ai_audit_runs for select to authenticated
  using ((select public.my_role()) = 'sales' and exists (select 1 from public.ai_audits a where a.id = audit_id));

drop policy if exists sales_select_audit_queue on public.ai_audit_queue;
create policy sales_select_audit_queue on public.ai_audit_queue for select to authenticated
  using ((select public.my_role()) = 'sales' and exists (select 1 from public.ai_audits a where a.id = audit_id));

drop policy if exists sales_select_messages on public.whatsapp_messages;
create policy sales_select_messages on public.whatsapp_messages for select to authenticated
  using ((select public.my_role()) = 'sales' and (public.can_work_lead(lead_id) or public.sales_can_see_phone(phone)));

drop policy if exists sales_select_crawl_checks on public.lead_crawl_checks;
create policy sales_select_crawl_checks on public.lead_crawl_checks for select to authenticated
  using ((select public.my_role()) = 'sales' and public.can_work_lead(lead_id));

drop policy if exists sales_select_page_hits on public.lead_page_hits;
create policy sales_select_page_hits on public.lead_page_hits for select to authenticated
  using ((select public.my_role()) = 'sales' and public.can_work_lead(lead_id));

drop policy if exists sales_select_templates on public.templates;
create policy sales_select_templates on public.templates for select to authenticated
  using ((select public.my_role()) = 'sales' and user_id = public.book_owner_id());

drop policy if exists lead_activity_select on public.lead_activity;
create policy lead_activity_select on public.lead_activity for select to authenticated
  using ((select public.my_role()) = 'admin' or public.can_work_lead(lead_id));

drop policy if exists team_members_admin_select on public.team_members;
create policy team_members_admin_select on public.team_members for select to authenticated
  using ((select public.my_role()) = 'admin');
drop policy if exists team_members_self_select on public.team_members;
create policy team_members_self_select on public.team_members for select to authenticated
  using (user_id = auth.uid());

-- ── Restrictive: only the admin writes the book directly ────────────────────────────────────────
-- ⛔ Without these, the existing "auth.uid() = user_id" policies would let a sales login INSERT its
-- own leads (bypassing the one-record rule) or its own audit-queue rows (spending Apify money on any
-- question). Restrictive policies AND with the permissive ones; the admin passes every one.
drop policy if exists admin_only_outreach_leads on public.outreach_leads;
create policy admin_only_outreach_leads on public.outreach_leads as restrictive for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

drop policy if exists admin_only_insert_ai_audits on public.ai_audits;
create policy admin_only_insert_ai_audits on public.ai_audits as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_update_ai_audits on public.ai_audits;
create policy admin_only_update_ai_audits on public.ai_audits as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_delete_ai_audits on public.ai_audits;
create policy admin_only_delete_ai_audits on public.ai_audits as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

drop policy if exists admin_only_insert_ai_audit_runs on public.ai_audit_runs;
create policy admin_only_insert_ai_audit_runs on public.ai_audit_runs as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_update_ai_audit_runs on public.ai_audit_runs;
create policy admin_only_update_ai_audit_runs on public.ai_audit_runs as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_delete_ai_audit_runs on public.ai_audit_runs;
create policy admin_only_delete_ai_audit_runs on public.ai_audit_runs as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

drop policy if exists admin_only_insert_ai_audit_queue on public.ai_audit_queue;
create policy admin_only_insert_ai_audit_queue on public.ai_audit_queue as restrictive for insert to authenticated
  with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_update_ai_audit_queue on public.ai_audit_queue;
create policy admin_only_update_ai_audit_queue on public.ai_audit_queue as restrictive for update to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_delete_ai_audit_queue on public.ai_audit_queue;
create policy admin_only_delete_ai_audit_queue on public.ai_audit_queue as restrictive for delete to authenticated
  using ((select public.my_role()) = 'admin');

-- Dead multi-user tables that still answer SELECT true to every signed-in role.
drop policy if exists admin_only_lead_claims on public.lead_claims;
create policy admin_only_lead_claims on public.lead_claims as restrictive for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');
drop policy if exists admin_only_lead_notes on public.lead_notes;
create policy admin_only_lead_notes on public.lead_notes as restrictive for all to authenticated
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin');

-- ── Functions the app calls ─────────────────────────────────────────────────────────────────────
-- Every one: role checked inside, assignment checked inside, activity written inside.

create or replace function public._require_work(_lead_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is null then raise exception 'no_role' using errcode = '42501'; end if;
  if not public.can_work_lead(_lead_id) then raise exception 'not_your_lead' using errcode = '42501'; end if;
end
$$;

-- The team, for owner markers. Names and avatars only. Any role may read it.
create or replace function public.team_directory()
returns table (user_id uuid, display_name text, role text, status text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select t.user_id, t.display_name,
         case when exists (select 1 from public.user_roles r where r.user_id = t.user_id and r.role = 'admin') then 'admin'
              when exists (select 1 from public.user_roles r where r.user_id = t.user_id and r.role = 'sales') then 'sales'
              else null end,
         t.status, p.avatar_url
  from public.team_members t
  left join public.profiles p on p.user_id = t.user_id
  where public.my_role() is not null
$$;

-- Find Leads: for each search result, is it new, yours, claimable, or already someone's?
-- Match order: place id, then phone, then Maps URL. Name alone never matches (chains share names).
-- Returns only what prevents a duplicate: the state, the owner's display name, the add date.
create or replace function public.lead_identity_lookup(_items jsonb)
returns table (k text, lead_id uuid, state text, owner_id uuid, owner_name text, added_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if jsonb_typeof(_items) is distinct from 'array' or jsonb_array_length(_items) > 500 then
    raise exception 'bad_items' using errcode = '22023';
  end if;
  return query
  with it as (
    select x->>'k' as ik,
           nullif(btrim(x->>'place_id'), '') as pid,
           public.phone_key(x->>'phone') as pk,
           nullif(btrim(x->>'maps_url'), '') as mu
    from jsonb_array_elements(_items) x
  ), m as (
    select it.ik, coalesce(
      (select l.id from public.outreach_leads l where it.pid is not null and l.place_id = it.pid order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.pk is not null and public.phone_key(l.phone) = it.pk order by l.created_at limit 1),
      (select l.id from public.outreach_leads l where it.mu is not null and l.google_maps_url = it.mu order by l.created_at limit 1)
    ) as lid
    from it
  )
  select m.ik, l.id,
         case
           when l.id is null then 'new'
           when l.assigned_to_user_id = v_uid then 'yours'
           when l.assigned_to_user_id is not null then 'owned'
           when l.is_archived is true or public.lead_is_client(l.amount_paid, l.status)
                or public.lead_first_contact_at(l.id) is not null then 'protected'
           else 'claimable'
         end,
         l.assigned_to_user_id, t.display_name, l.created_at
  from m
  left join public.outreach_leads l on l.id = m.lid
  left join public.team_members t on t.user_id = l.assigned_to_user_id;
end
$$;

-- ⛔ CLAIM IS ATOMIC. The row is locked (FOR UPDATE) before it is read, so of two simultaneous claims
-- exactly one sees it unassigned; the other waits, then sees it owned. Contacted, archived or client
-- leads are never claimable, whatever their assignment says.
create or replace function public.claim_lead(_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.my_role();
  v_uid uuid := auth.uid();
  v_lead record;
  v_owner text;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  select id, assigned_to_user_id, is_archived, amount_paid, status into v_lead
    from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_lead.assigned_to_user_id = v_uid then return jsonb_build_object('ok', true, 'already_yours', true); end if;
  if v_lead.assigned_to_user_id is not null then
    select display_name into v_owner from public.team_members where user_id = v_lead.assigned_to_user_id;
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'owner_name', v_owner);
  end if;
  if v_lead.is_archived is true then return jsonb_build_object('ok', false, 'error', 'archived'); end if;
  if public.lead_is_client(v_lead.amount_paid, v_lead.status) then return jsonb_build_object('ok', false, 'error', 'client'); end if;
  if public.lead_first_contact_at(_lead_id) is not null then return jsonb_build_object('ok', false, 'error', 'already_contacted'); end if;
  update public.outreach_leads set assigned_to_user_id = v_uid, assigned_at = now() where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind) values (_lead_id, v_uid, 'lead_claimed');
  return jsonb_build_object('ok', true);
end
$$;

-- Admin: assign, reassign or unassign. Same record; nothing sent; the previous owner is logged.
create or replace function public.assign_lead(_lead_id uuid, _to_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only' using errcode = '42501'; end if;
  if _to_user_id is not null and not exists (
    select 1 from public.team_members t join public.user_roles r on r.user_id = t.user_id
    where t.user_id = _to_user_id and t.status = 'active' and r.role in ('admin', 'sales')) then
    return jsonb_build_object('ok', false, 'error', 'not_an_active_member');
  end if;
  select assigned_to_user_id into v_from from public.outreach_leads where id = _lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_from is not distinct from _to_user_id then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads
     set assigned_to_user_id = _to_user_id, assigned_at = case when _to_user_id is null then null else now() end
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, v_uid, case when _to_user_id is null then 'lead_unassigned' else 'lead_assigned' end,
          jsonb_build_object('from', v_from, 'to', _to_user_id));
  return jsonb_build_object('ok', true);
end
$$;

-- Sales: add a NEW business from Find Leads/Coverage. Refuses an existing one (by place id, phone
-- or Maps URL) and says whose it is. The row belongs to the book owner and is assigned to the rep.
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
  v_hit record;
  v_id uuid;
begin
  if v_role is null then raise exception 'no_role' using errcode = '42501'; end if;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'no_book_owner'); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'no_name'); end if;
  if v_trade is null then return jsonb_build_object('ok', false, 'error', 'no_trade'); end if;
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
      campaign_id, place_id)
    values (
      v_owner, v_uid, v_uid, now(), v_name, nullif(btrim(_lead->>'phone'), ''), v_mu,
      nullif(btrim(_lead->>'address'), ''), nullif(btrim(_lead->>'category'), ''), v_trade,
      nullif(btrim(_lead->>'search_location'), ''), nullif(btrim(_lead->>'website'), ''), 'not_contacted', 'none',
      coalesce(nullif(btrim(_lead->>'country'), ''), 'UK'),
      case when _lead->>'list_type' in ('no_website', 'broken_website', 'manual') then _lead->>'list_type' else 'no_website' end,
      nullif(_lead->>'campaign_id', '')::uuid, v_pid)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'exists', 'state', 'owned');
  end;
  insert into public.lead_activity (lead_id, actor_user_id, kind) values (v_id, v_uid, 'lead_added');
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end
$$;

-- Sales-settable stages. Money stages (paid, in delivery, refunded, completed) are the admin's.
-- 'won_pending_onboarding' = the rep closed it; the admin onboards. It grants nothing.
create or replace function public.lead_set_stage(_lead_id uuid, _status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_from text;
begin
  perform public._require_work(_lead_id);
  if _status not in ('interested', 'price_given', 'not_interested', 'won_pending_onboarding') then
    return jsonb_build_object('ok', false, 'error', 'stage_not_allowed');
  end if;
  select status into v_from from public.outreach_leads where id = _lead_id for update;
  if public.lead_is_client(null, v_from) then return jsonb_build_object('ok', false, 'error', 'client'); end if;
  if v_from is not distinct from _status then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.outreach_leads set status = _status where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'stage_changed', jsonb_build_object('from', v_from, 'to', _status));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.lead_set_follow_up(_lead_id uuid, _next_action text, _date date, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if coalesce(_next_action, 'none') not in ('none', 'call', 'follow_up', 'send_follow_up') then
    return jsonb_build_object('ok', false, 'error', 'bad_next_action');
  end if;
  update public.outreach_leads
     set next_action = coalesce(_next_action, 'none')::public.next_action_type,
         next_action_date = _date,
         next_action_note = nullif(btrim(coalesce(_note, '')), '')
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'follow_up_set',
          jsonb_build_object('next_action', coalesce(_next_action, 'none'), 'date', _date, 'note', nullif(btrim(coalesce(_note, '')), '')));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.lead_set_call_booked(_lead_id uuid, _at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  update public.outreach_leads set call_booked_at = _at where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'call_booked', jsonb_build_object('at', _at));
  return jsonb_build_object('ok', true);
end
$$;

-- ⛔ INTERNAL NOTES ARE APPEND-ONLY AND NEVER SENT. A note is an activity row; there is no update or
-- delete path, so nobody can silently overwrite a colleague's note.
create or replace function public.lead_add_note(_lead_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_body text := btrim(coalesce(_body, ''));
begin
  perform public._require_work(_lead_id);
  if v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  if length(v_body) > 4000 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body) values (_lead_id, auth.uid(), 'note', v_body);
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.lead_record_call(_lead_id uuid, _outcome text, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if _outcome not in ('no_answer', 'spoke_to_owner', 'interested', 'call_back', 'not_interested', 'wrong_number', 'agency_controls_site') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;
  insert into public.lead_activity (lead_id, actor_user_id, kind, body, data)
  values (_lead_id, auth.uid(), 'call_outcome', nullif(btrim(coalesce(_note, '')), ''), jsonb_build_object('outcome', _outcome));
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.lead_set_website_control(_lead_id uuid, _value text, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if _value is not null and _value not in ('client_controls', 'agency_controls', 'third_party_profile_only', 'no_website', 'unknown') then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  end if;
  update public.outreach_leads
     set website_control = _value, website_control_note = nullif(btrim(coalesce(_note, '')), '')
   where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'website_control_set', jsonb_build_object('value', _value));
  return jsonb_build_object('ok', true);
end
$$;

-- The unassigned pool: never contacted, not archived, not a client, not closed out. Business
-- details only — no history, because there is none.
create or replace function public.sales_pool(_q text, _limit integer, _offset integer)
returns table (id uuid, business_name text, trade text, town text, website text, rating numeric,
               review_count integer, has_phone boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.business_name, coalesce(l.search_keyword, l.category), coalesce(l.derived_town, l.search_location),
         l.website, l.rating, l.review_count, public.phone_key(l.phone) is not null, l.created_at
  from public.outreach_leads l
  where public.my_role() in ('sales', 'admin')
    and l.assigned_to_user_id is null
    and l.is_archived is not true
    and not public.lead_is_client(l.amount_paid, l.status)
    and coalesce(l.status, '') not in ('not_interested', 'opted_out', 'closed', 'bounced')
    and (coalesce(btrim(_q), '') = ''
         or l.business_name ilike '%' || btrim(_q) || '%'
         or coalesce(l.search_keyword, l.category, '') ilike '%' || btrim(_q) || '%'
         or coalesce(l.derived_town, l.search_location, '') ilike '%' || btrim(_q) || '%')
    and public.lead_first_contact_at(l.id) is null
  order by l.created_at desc
  limit least(greatest(coalesce(_limit, 50), 1), 200)
  offset greatest(coalesce(_offset, 0), 0)
$$;

-- ── Grants: signed-in only; anon can call none of these ─────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.my_role()', 'public.book_owner_id()', 'public.can_work_lead(uuid)', 'public.sales_can_see_phone(text)',
    'public.lead_first_contact_at(uuid)', 'public._require_work(uuid)', 'public.team_directory()',
    'public.lead_identity_lookup(jsonb)', 'public.claim_lead(uuid)', 'public.assign_lead(uuid, uuid)',
    'public.sales_add_lead(jsonb)', 'public.lead_set_stage(uuid, text)', 'public.lead_set_follow_up(uuid, text, date, text)',
    'public.lead_set_call_booked(uuid, timestamptz)', 'public.lead_add_note(uuid, text)',
    'public.lead_record_call(uuid, text, text)', 'public.lead_set_website_control(uuid, text, text)',
    'public.sales_pool(text, integer, integer)', 'public.guard_lead_identity()', 'public.assign_lead_on_contact()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  foreach f in array array[
    'public.my_role()', 'public.book_owner_id()', 'public.can_work_lead(uuid)', 'public.sales_can_see_phone(text)',
    'public.lead_first_contact_at(uuid)', 'public.team_directory()', 'public.lead_identity_lookup(jsonb)',
    'public.claim_lead(uuid)', 'public.assign_lead(uuid, uuid)', 'public.sales_add_lead(jsonb)',
    'public.lead_set_stage(uuid, text)', 'public.lead_set_follow_up(uuid, text, date, text)',
    'public.lead_set_call_booked(uuid, timestamptz)', 'public.lead_add_note(uuid, text)',
    'public.lead_record_call(uuid, text, text)', 'public.lead_set_website_control(uuid, text, text)',
    'public.sales_pool(text, integer, integer)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
revoke all on public.team_members from anon;
revoke all on public.lead_activity from anon;
