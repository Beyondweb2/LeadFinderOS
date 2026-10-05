-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SALESPERSON ONBOARDING + THE READY-TO-SELL GATE (2026-10-05, docs/salesperson-onboarding.md).
-- Additive and idempotent, except ONE replaced function: public.guard_action (the live body, unchanged,
-- plus the 'not_onboarded' refusal — section 7). No WhatsApp function, template, queue rule or opt-out is
-- changed; a salesperson who is not Ready to Sell is refused the way a suspended one already is.
--
-- 1. salesperson_document_versions — every contractor agreement / privacy notice / team guide version,
--    with status draft / approved / superseded. Only the ONE approved version of a kind counts.
-- 2. salesperson_onboarding (+ _log) — what Paul has on file per salesperson. ⛔ ADMIN ONLY BY HAVING NO
--    POLICY: fn admin-users (service role) is the only reader/writer. No bank, passport or birth data.
-- 3. salesperson_onboarding_missing() / salesperson_ready_to_sell() — THE rule (src/lib/salespersonOnboarding.ts
--    mirrors it for display; scripts/salesperson-onboarding.test.ts fences the keys).
-- 4. The gate, enforced server-side:
--    · guard_action refuses 'not_onboarded' (claims, searches, prospect checks, hook audits, WhatsApp
--      sends and queueing, every guarded action) — section 7;
--    · lead_activity: a not-ready salesperson acting in their own session may only write notes, opt-outs,
--      give leads back, and finish handoffs for sales already made (calls, contacts, stages… refused);
--    · outreach_leads: a lead cannot be assigned to a not-ready salesperson by a signed-in session;
--    · attribution: a sale stamped to a not-ready salesperson is credited to the book owner instead.
--    The admin is never gated.
-- 5. phone_tps_checks — DORMANT groundwork (TPS/CTPS postponed by Paul 2026-10-05): nothing writes it,
--    nothing reads it to allow or block anything.
-- 6. lead_business_type_records — display / evidence only.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. document versions ────────────────────────────────────────────────────────────────────────────
create table if not exists public.salesperson_document_versions (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  kind text not null check (kind in ('contractor_agreement', 'privacy_notice', 'team_guide')),
  label text not null check (char_length(label) between 3 and 200),
  status text not null default 'draft' check (status in ('draft', 'approved', 'superseded')),
  document_ref text check (char_length(document_ref) <= 300),
  outstanding text[] not null default '{}',
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  superseded_at timestamptz,
  constraint salesperson_document_versions_approved_complete check (status <> 'approved' or cardinality(outstanding) = 0)
);
create unique index if not exists salesperson_document_versions_one_approved
  on public.salesperson_document_versions (kind) where status = 'approved';
alter table public.salesperson_document_versions enable row level security;
revoke all on public.salesperson_document_versions from public, anon, authenticated;

/* The versions in the pack of 5 Oct 2026. NEITHER the agreement nor the notice is approved: the agreement
   is "draft v2" and its WhatsApp clause will be amended; the notice still has its brackets. No final
   version number is invented — Paul adds the approved versions himself (Team → Documents). */
insert into public.salesperson_document_versions (id, kind, label, status, document_ref, outstanding, note) values
  ('contractor-agreement-draft-v2', 'contractor_agreement', 'Independent Sales Contractor Agreement — draft v2', 'draft',
   'Findable_Sales_Contractor_Agreement_v2.docx (pack of 5 Oct 2026)',
   array['Clause 4.3(c) (WhatsApp first contact) is to be amended before use.'],
   'Draft. May be recorded for history; never satisfies the onboarding requirement.'),
  ('salesperson-privacy-notice-draft-2026-10-05', 'privacy_notice', 'Privacy Notice for Salespeople — draft with blanks', 'draft',
   'Findable_Salesperson_Privacy_Notice.docx (pack of 5 Oct 2026)',
   array[
     'Section 1: the ICO registration number.',
     'Section 5: name the right to work checking provider, or delete the bracket if none is used.',
     'Section 5: confirm the overseas-transfer safeguard for each provider (Supabase, Cloudflare, Meta, the email provider).',
     'Section 6: confirm 6 years for payment, commission and tax records.',
     'Section 6: confirm 6 years for the agreement and related correspondence.',
     'Section 6: set the retention period for sales and activity records in LeadFinderOS.',
     'Section 6: confirm 12 months for login and access logs.',
     'Section 9: the "Last updated" date.',
     'Remove the opening line "Words in [square brackets] are for Paul to complete before use".',
     'Sections 2 and 3 mention "WhatsApp permission records" and "the WhatsApp permission process" from the clause being amended; make them match how WhatsApp is actually used.'
   ],
   'Draft / provided for review. Never satisfies the onboarding requirement.'),
  ('team-guide-2026-10-02', 'team_guide', 'Team guide dated 2 October 2026', 'approved',
   'Team guide, 2 Oct 2026', '{}',
   'Current guide. The change notes of 5 Oct 2026 are not in it yet.')
on conflict (id) do nothing;

/* Approve a draft: the previous approved version of the same kind becomes superseded in the same
   transaction (one approved per kind, the unique index). Refused while anything is outstanding.
   Service role only (fn admin-users, after its admin check). Returns how many salespeople had signed /
   been given / acknowledged the version that was just superseded — they stop being Ready to Sell. */
create or replace function public.approve_salesperson_document(_id text, _actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.salesperson_document_versions%rowtype;
  v_prev text;
  v_affected integer := 0;
begin
  select * into d from public.salesperson_document_versions where id = _id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if d.status <> 'draft' then return jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  /* ⛔ A version NAMED a draft (the seeded draft v2 agreement, the draft notice) is never approved: the
     final document is added as its own version. Stops "clear the note, approve draft v2". */
  if d.id ~ '(^|-)draft(-|$)' then return jsonb_build_object('ok', false, 'error', 'draft_named_version'); end if;
  if cardinality(d.outstanding) > 0 then return jsonb_build_object('ok', false, 'error', 'has_outstanding'); end if;
  select id into v_prev from public.salesperson_document_versions where kind = d.kind and status = 'approved' for update;
  if v_prev is not null then
    update public.salesperson_document_versions set status = 'superseded', superseded_at = now() where id = v_prev;
    select count(*) into v_affected from public.salesperson_onboarding o
     where (d.kind = 'contractor_agreement' and o.agreement_version = v_prev)
        or (d.kind = 'privacy_notice' and o.privacy_notice_version = v_prev)
        or (d.kind = 'team_guide' and o.team_guide_version = v_prev);
  end if;
  update public.salesperson_document_versions set status = 'approved', approved_at = now(), approved_by = _actor where id = _id;
  return jsonb_build_object('ok', true, 'superseded', v_prev, 'affected', v_affected);
end $$;
revoke all on function public.approve_salesperson_document(text, uuid) from public, anon, authenticated;
grant execute on function public.approve_salesperson_document(text, uuid) to service_role;

-- ── 2. salesperson_onboarding ──────────────────────────────────────────────────────────────────────
create table if not exists public.salesperson_onboarding (
  user_id uuid primary key references auth.users(id) on delete restrict,
  agreement_version text references public.salesperson_document_versions(id) on delete restrict,
  agreement_signed_on date,
  agreement_ref text check (char_length(agreement_ref) <= 200),
  privacy_notice_version text references public.salesperson_document_versions(id) on delete restrict,
  privacy_notice_given_on date,
  age_18_confirmed_on date,
  rtw_method text check (rtw_method in ('manual_video_call', 'manual_in_person', 'certified_provider', 'home_office_share_code')),
  rtw_checked_on date,
  rtw_checked_by text check (char_length(rtw_checked_by) <= 200),
  rtw_result text check (rtw_result in ('pass', 'fail')),
  rtw_evidence_ref text check (char_length(rtw_evidence_ref) <= 200),
  rtw_provider text check (char_length(rtw_provider) <= 200),
  rtw_recheck_due date,
  rtw_notes text check (char_length(rtw_notes) <= 1000),
  bank_details_received_on date,
  vat_registered boolean,
  vat_number text check (vat_number ~ '^GB([0-9]{9}|[0-9]{12}|(GD|HA)[0-9]{3})$'),
  contractor_type text check (contractor_type in ('individual', 'limited_company')),
  company_name text check (char_length(company_name) <= 200),
  company_number text check (company_number ~ '^([0-9]{8}|[A-Z]{2}[0-9]{6})$'),
  company_contract_confirmed_on date,
  start_date date,
  schedule2_status text check (schedule2_status in ('received', 'none')),
  schedule2_on date,
  team_guide_version text references public.salesperson_document_versions(id) on delete restrict,
  team_guide_acknowledged_on date,
  end_date date,
  end_reason text check (end_reason in ('resigned', 'ended_on_notice', 'misconduct')),
  end_note text check (char_length(end_note) <= 1000),
  misconduct_notified_on date,
  data_deletion_confirmed_on date,
  notes text check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint salesperson_onboarding_end_pair check ((end_date is null) = (end_reason is null)),
  constraint salesperson_onboarding_vat_pair check (vat_number is null or vat_registered is true),
  constraint salesperson_onboarding_company_fields check (
    contractor_type = 'limited_company' or (company_name is null and company_number is null and company_contract_confirmed_on is null))
);
alter table public.salesperson_onboarding enable row level security;
revoke all on public.salesperson_onboarding from public, anon, authenticated;

create table if not exists public.salesperson_onboarding_log (
  id bigserial primary key,
  user_id uuid not null,
  actor_user_id uuid,
  changed jsonb not null,
  at timestamptz not null default now()
);
create index if not exists salesperson_onboarding_log_user_at on public.salesperson_onboarding_log (user_id, at);
alter table public.salesperson_onboarding_log enable row level security;
revoke all on public.salesperson_onboarding_log from public, anon, authenticated;

/* Touch + log every change; and a version column must name a version of ITS kind. */
create or replace function public.salesperson_onboarding_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'updated_by' - 'user_id';
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' - 'updated_by' - 'user_id' else '{}'::jsonb end;
  v_changed jsonb;
begin
  if new.agreement_version is not null and not exists (select 1 from public.salesperson_document_versions where id = new.agreement_version and kind = 'contractor_agreement') then
    raise exception 'agreement_version must be a contractor agreement' using errcode = '23514';
  end if;
  if new.privacy_notice_version is not null and not exists (select 1 from public.salesperson_document_versions where id = new.privacy_notice_version and kind = 'privacy_notice') then
    raise exception 'privacy_notice_version must be a privacy notice' using errcode = '23514';
  end if;
  if new.team_guide_version is not null and not exists (select 1 from public.salesperson_document_versions where id = new.team_guide_version and kind = 'team_guide') then
    raise exception 'team_guide_version must be a team guide' using errcode = '23514';
  end if;
  new.updated_at := now();
  select coalesce(jsonb_object_agg(k, v_new -> k), '{}'::jsonb) into v_changed
    from jsonb_object_keys(v_new) k
   where (v_new -> k) is distinct from (v_old -> k)
     and not (tg_op = 'INSERT' and (v_new -> k) = 'null'::jsonb);
  if v_changed <> '{}'::jsonb then
    insert into public.salesperson_onboarding_log (user_id, actor_user_id, changed) values (new.user_id, new.updated_by, v_changed);
  end if;
  return new;
end $$;
revoke all on function public.salesperson_onboarding_touch() from public, anon, authenticated;
drop trigger if exists salesperson_onboarding_touch on public.salesperson_onboarding;
create trigger salesperson_onboarding_touch before insert or update on public.salesperson_onboarding
  for each row execute function public.salesperson_onboarding_touch();

create or replace function public.salesperson_onboarding_log_server_time()
returns trigger language plpgsql as $$
begin
  new.at := now();
  return new;
end $$;
create or replace function public.salesperson_onboarding_log_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'salesperson_onboarding_log is append-only';
end $$;
drop trigger if exists salesperson_onboarding_log_server_time on public.salesperson_onboarding_log;
create trigger salesperson_onboarding_log_server_time before insert on public.salesperson_onboarding_log
  for each row execute function public.salesperson_onboarding_log_server_time();
drop trigger if exists salesperson_onboarding_log_no_change on public.salesperson_onboarding_log;
create trigger salesperson_onboarding_log_no_change before update or delete on public.salesperson_onboarding_log
  for each row execute function public.salesperson_onboarding_log_append_only();
drop trigger if exists salesperson_onboarding_log_no_truncate on public.salesperson_onboarding_log;
create trigger salesperson_onboarding_log_no_truncate before truncate on public.salesperson_onboarding_log
  for each statement execute function public.salesperson_onboarding_log_append_only();

-- ── 3. THE RULE ─────────────────────────────────────────────────────────────────────────────────────
/* What stands between this person and READY TO SELL, as keys (empty = ready). The keys are the ones the
   Team page shows (src/lib/salespersonOnboarding.ts ChecklistKey + the inactive reasons). TPS/CTPS is NOT
   part of it (postponed by Paul, 2026-10-05). Schedule 2 is optional and never listed. */
create or replace function public.salesperson_onboarding_missing(_user_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  r public.salesperson_onboarding%rowtype;
  m text[] := '{}';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_member record;
  nb text := '';
begin
  if _user_id is null then return array['not_sales']; end if;
  if not exists (select 1 from public.user_roles where user_id = _user_id and role = 'sales') then return array['not_sales']; end if;
  select status, suspended_at into v_member from public.team_members where user_id = _user_id;
  if not found then
    m := m || 'login'::text;
  else
    if v_member.status is distinct from 'active' then m := m || 'login'::text; end if;
    if v_member.suspended_at is not null then m := m || 'suspended'::text; end if;
  end if;
  select * into r from public.salesperson_onboarding where user_id = _user_id;
  if not exists (select 1 from public.salesperson_document_versions d where d.id = r.agreement_version and d.kind = 'contractor_agreement' and d.status = 'approved')
     or r.agreement_signed_on is null or coalesce(btrim(r.agreement_ref), nb) = nb then m := m || 'agreement'::text; end if;
  if not exists (select 1 from public.salesperson_document_versions d where d.id = r.privacy_notice_version and d.kind = 'privacy_notice' and d.status = 'approved')
     or r.privacy_notice_given_on is null then m := m || 'privacy_notice'::text; end if;
  if r.age_18_confirmed_on is null then m := m || 'age_18'::text; end if;
  if r.rtw_result is distinct from 'pass' or r.rtw_method is null or r.rtw_checked_on is null
     or coalesce(btrim(r.rtw_checked_by), nb) = nb or coalesce(btrim(r.rtw_evidence_ref), nb) = nb
     or (r.rtw_method = 'certified_provider' and coalesce(btrim(r.rtw_provider), nb) = nb)
     or (r.rtw_recheck_due is not null and r.rtw_recheck_due <= v_today) then m := m || 'right_to_work'::text; end if;
  if r.bank_details_received_on is null then m := m || 'bank_details'::text; end if;
  if not (r.vat_registered is false or (r.vat_registered is true and r.vat_number is not null)) then m := m || 'vat'::text; end if;
  if not (r.contractor_type = 'individual' or (r.contractor_type = 'limited_company' and coalesce(btrim(r.company_name), nb) <> nb
          and r.company_number is not null and r.company_contract_confirmed_on is not null)) then m := m || 'contractor_status'::text; end if;
  if r.start_date is null then m := m || 'start_date'::text; end if;
  if not exists (select 1 from public.salesperson_document_versions d where d.id = r.team_guide_version and d.kind = 'team_guide' and d.status = 'approved')
     or r.team_guide_acknowledged_on is null then m := m || 'team_guide'::text; end if;
  if r.end_date is not null and r.end_date <= v_today then m := m || 'ended'::text; end if;
  return m;
end $$;

create or replace function public.salesperson_ready_to_sell(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cardinality(public.salesperson_onboarding_missing(_user_id)) = 0
$$;
revoke all on function public.salesperson_onboarding_missing(uuid) from public, anon, authenticated;
revoke all on function public.salesperson_ready_to_sell(uuid) from public, anon, authenticated;
grant execute on function public.salesperson_onboarding_missing(uuid) to service_role;
grant execute on function public.salesperson_ready_to_sell(uuid) to service_role;

/* The signed-in salesperson's OWN status: ready + the missing keys, and the current team guide to
   acknowledge. Never another person's, never a stored value (no dates, versions or evidence). */
create or replace function public.my_onboarding_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_missing text[];
begin
  if public.my_role() is distinct from 'sales' then return jsonb_build_object('ok', true, 'gated', false, 'ready', true, 'missing', '[]'::jsonb); end if;
  v_missing := public.salesperson_onboarding_missing(auth.uid());
  return jsonb_build_object('ok', true, 'gated', true, 'ready', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing),
    'team_guide', (select jsonb_build_object('id', id, 'label', label) from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved'));
end $$;
revoke all on function public.my_onboarding_status() from public, anon;
grant execute on function public.my_onboarding_status() to authenticated;

/* The one onboarding step a salesperson completes themselves: "I have read the current team guide". */
create or replace function public.my_acknowledge_team_guide()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_guide text;
begin
  if public.my_role() is distinct from 'sales' then return jsonb_build_object('ok', false, 'error', 'not_a_salesperson'); end if;
  select id into v_guide from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved';
  if v_guide is null then return jsonb_build_object('ok', false, 'error', 'no_current_guide'); end if;
  insert into public.salesperson_onboarding (user_id, team_guide_version, team_guide_acknowledged_on, updated_by)
  values (auth.uid(), v_guide, (now() at time zone 'Europe/London')::date, auth.uid())
  on conflict (user_id) do update set team_guide_version = excluded.team_guide_version,
    team_guide_acknowledged_on = excluded.team_guide_acknowledged_on, updated_by = excluded.updated_by;
  return jsonb_build_object('ok', true, 'version', v_guide);
end $$;
revoke all on function public.my_acknowledge_team_guide() from public, anon;
grant execute on function public.my_acknowledge_team_guide() to authenticated;

-- ── 4. THE GATE ─────────────────────────────────────────────────────────────────────────────────────
/* lead_activity: a not-ready salesperson acting in THEIR OWN session (auth.uid() = actor) may write only
   these kinds. Everything else — calls, contacts, stages, follow-ups, claims, queueing, audits, links —
   is refused. Service-role writers (edge functions, the WhatsApp paths) are not touched here: they are
   gated by guard_action and quick-close before they act. The admin is never gated. */
create or replace function public.trg_lead_activity_ready_to_sell()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.actor_user_id is null or auth.uid() is null or new.actor_user_id is distinct from auth.uid() then return new; end if;
  if public.my_role() is distinct from 'sales' then return new; end if;
  if new.kind in ('note', 'opted_out', 'lead_unassigned', 'archived_set', 'handoff_saved', 'details_set',
                  'delivery_submitted', 'client_info_answered') then
    return new;
  end if;
  if not public.salesperson_ready_to_sell(new.actor_user_id) then
    raise exception 'not_ready_to_sell' using errcode = '42501', hint = 'Finish onboarding with Paul before selling.';
  end if;
  return new;
end $$;
revoke all on function public.trg_lead_activity_ready_to_sell() from public, anon, authenticated;
drop trigger if exists trg_lead_activity_ready_to_sell on public.lead_activity;
create trigger trg_lead_activity_ready_to_sell before insert on public.lead_activity
  for each row execute function public.trg_lead_activity_ready_to_sell();

/* outreach_leads: no signed-in session (a rep claiming or adding, the admin assigning) can put a lead in
   the hands of a not-ready salesperson. Service-role moves (admin-users) check the same rule themselves. */
create or replace function public.trg_outreach_leads_assign_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to_user_id is null or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
  if not exists (select 1 from public.user_roles where user_id = new.assigned_to_user_id and role = 'sales') then return new; end if;
  if exists (select 1 from public.user_roles where user_id = new.assigned_to_user_id and role = 'admin') then return new; end if;
  if not public.salesperson_ready_to_sell(new.assigned_to_user_id) then
    raise exception 'not_ready_to_sell' using errcode = '42501', hint = 'That salesperson has not finished onboarding.';
  end if;
  return new;
end $$;
revoke all on function public.trg_outreach_leads_assign_ready() from public, anon, authenticated;
drop trigger if exists trg_outreach_leads_assign_ready on public.outreach_leads;
create trigger trg_outreach_leads_assign_ready before insert or update of assigned_to_user_id on public.outreach_leads
  for each row execute function public.trg_outreach_leads_assign_ready();

/* Attribution: when a lead first becomes a client (trg_outreach_leads_sold_by stamps sold_by_user_id —
   it fires first, by name), a not-ready salesperson does not get the commission-bearing credit; the sale
   is credited to the book owner and a security event says why. Historic stamps never move (only a stamp
   made in THIS statement is looked at). Commission itself is not changed here. */
create or replace function public.trg_outreach_leads_sold_by_ready()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sold_by_user_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.sold_by_user_id is not null then return new; end if;
  if not exists (select 1 from public.user_roles where user_id = new.sold_by_user_id and role = 'sales') then return new; end if;
  if exists (select 1 from public.user_roles where user_id = new.sold_by_user_id and role = 'admin') then return new; end if;
  if public.salesperson_ready_to_sell(new.sold_by_user_id) then return new; end if;
  insert into public.security_events (actor_user_id, actor_role, kind, severity, action, lead_id, detail, alert_key, alert_wanted)
  values (new.sold_by_user_id, 'sales', 'attribution_withheld_not_onboarded', 'warning', 'sale_attribution', new.id,
          jsonb_build_object('withheld_from', new.sold_by_user_id, 'credited_to', new.user_id,
                             'missing', to_jsonb(public.salesperson_onboarding_missing(new.sold_by_user_id))),
          'attribution_withheld:' || new.id::text, true)
  on conflict (alert_key) do nothing;
  new.sold_by_user_id := new.user_id;
  return new;
end $$;
revoke all on function public.trg_outreach_leads_sold_by_ready() from public, anon, authenticated;
drop trigger if exists trg_outreach_leads_sold_by_ready on public.outreach_leads;
create trigger trg_outreach_leads_sold_by_ready before insert or update of amount_paid, status, sold_by_user_id, sold_at on public.outreach_leads
  for each row execute function public.trg_outreach_leads_sold_by_ready();

-- ── 5. phone_tps_checks — DORMANT (TPS/CTPS postponed by Paul, 2026-10-05) ──────────────────────────
-- Groundwork only: no provider, nothing writes it, nothing reads it to allow or block a call.
create table if not exists public.phone_tps_checks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.outreach_leads(id) on delete set null,
  phone text not null check (char_length(btrim(phone)) >= 7),
  register text not null check (register in ('tps', 'ctps')),
  result text not null check (result in ('registered', 'not_registered')),
  provider text not null check (char_length(btrim(provider)) > 0),
  provider_reference text not null check (char_length(btrim(provider_reference)) > 0),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists phone_tps_checks_lead on public.phone_tps_checks (lead_id, checked_at desc);
alter table public.phone_tps_checks enable row level security;
revoke all on public.phone_tps_checks from public, anon, authenticated;
grant select on public.phone_tps_checks to authenticated;
drop policy if exists phone_tps_checks_admin_read on public.phone_tps_checks;
create policy phone_tps_checks_admin_read on public.phone_tps_checks for select to authenticated
  using ((select public.my_role()) = 'admin');
drop policy if exists phone_tps_checks_sales_read on public.phone_tps_checks;
create policy phone_tps_checks_sales_read on public.phone_tps_checks for select to authenticated
  using ((select public.my_role()) = 'sales' and lead_id in (select public.my_sales_lead_ids()));

-- ── 6. lead_business_type_records — display / evidence only ─────────────────────────────────────────
create table if not exists public.lead_business_type_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  business_type text not null check (business_type in ('limited_company', 'llp', 'sole_trader', 'partnership', 'unknown')),
  source text not null check (source in ('stated_by_business', 'website', 'companies_house_confirmed', 'other_document')),
  evidence_note text check (char_length(evidence_note) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists lead_business_type_records_lead on public.lead_business_type_records (lead_id, recorded_at desc);
alter table public.lead_business_type_records enable row level security;
revoke all on public.lead_business_type_records from public, anon, authenticated;
grant select on public.lead_business_type_records to authenticated;
drop policy if exists lead_business_type_records_admin_read on public.lead_business_type_records;
create policy lead_business_type_records_admin_read on public.lead_business_type_records for select to authenticated
  using ((select public.my_role()) = 'admin');
drop policy if exists lead_business_type_records_sales_read on public.lead_business_type_records;
create policy lead_business_type_records_sales_read on public.lead_business_type_records for select to authenticated
  using ((select public.my_role()) = 'sales' and lead_id in (select public.my_sales_lead_ids()));

create or replace function public.lead_business_type_records_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'lead_business_type_records is append-only';
end $$;
drop trigger if exists lead_business_type_records_no_change on public.lead_business_type_records;
create trigger lead_business_type_records_no_change before update or delete on public.lead_business_type_records
  for each row execute function public.lead_business_type_records_append_only();

/* Record a lead's legal form. Anyone who may work the lead (admin: any lead; sales: their own, never a
   client — public._require_work). A type other than unknown needs a note of the evidence. */
create or replace function public.lead_record_business_type(_lead_id uuid, _type text, _source text, _note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_note text := nullif(btrim(coalesce(_note, '')), '');
begin
  perform public._require_work(_lead_id);
  if _type is null or _type not in ('limited_company', 'llp', 'sole_trader', 'partnership', 'unknown') then
    return jsonb_build_object('ok', false, 'error', 'bad_type');
  end if;
  if _source is null or _source not in ('stated_by_business', 'website', 'companies_house_confirmed', 'other_document') then
    return jsonb_build_object('ok', false, 'error', 'bad_source');
  end if;
  if _type <> 'unknown' and v_note is null then
    return jsonb_build_object('ok', false, 'error', 'evidence_needed');
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;
  insert into public.lead_business_type_records (lead_id, business_type, source, evidence_note, recorded_by, recorded_at)
  values (_lead_id, _type, _source, v_note, auth.uid(), now());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_record_business_type(uuid, text, text, text) from public, anon;
grant execute on function public.lead_record_business_type(uuid, text, text, text) to authenticated;

-- ── 7. guard_action — the live body (2026-10-05) + ONE refusal: 'not_onboarded' ─────────────────────
-- Every guarded action a salesperson starts (claims, searches, prospect checks, hook audits, enrichment,
-- WhatsApp sends and queueing, copies…) is refused while they are not Ready to Sell, exactly as for a
-- suspended account (same severity, one alert per person per day). Nothing else in the body changed.
create or replace function public.guard_action(_actor uuid, _action text, _lead uuid DEFAULT NULL::uuid, _est_cost numeric DEFAULT 0, _units integer DEFAULT 1, _fn text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
declare
  s public.protection_settings%rowtype;
  a jsonb;
  v_role text;
  v_susp boolean := false;
  v_unready boolean := false;
  v_paid boolean;
  v_over timestamptz;
  v_reason text;
  v_warn text;
  v_units integer := greatest(coalesce(_units, 1), 1);
  v_n numeric;
  v_h numeric := 0;
  v_d numeric := 0;
  v_team numeric := 0;
  w record;
  v_outcome text;
  v_day text := to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD');
begin
  if _actor is null or _action is null then return jsonb_build_object('ok', false, 'reason', 'no_actor'); end if;
  select * into s from public.protection_settings where id = 1;
  -- ⛔ FAIL CLOSED: no settings row = nothing is allowed (absence is never "unlimited").
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_settings'); end if;
  select case when bool_or(role::text = 'admin') then 'admin' when bool_or(role::text = 'sales') then 'sales' end
    into v_role from public.user_roles where user_id = _actor;
  if v_role is null then return jsonb_build_object('ok', false, 'reason', 'no_role'); end if;
  select (t.suspended_at is not null) into v_susp from public.team_members t where t.user_id = _actor;
  v_susp := coalesce(v_susp, false) and v_role = 'sales';
  -- ⛔ READY TO SELL (2026-10-05): a salesperson who has not finished onboarding is refused like a suspended one.
  v_unready := v_role = 'sales' and not v_susp and not public.salesperson_ready_to_sell(_actor);
  a := coalesce(s.limits -> 'actions' -> _action, '{}'::jsonb);
  -- An action the row does not know is PAID (the pause modes and spend caps apply to it).
  v_paid := coalesce((a ->> 'paid')::boolean, true);
  begin
    v_over := nullif(s.overrides ->> _actor::text, '')::timestamptz;
  exception when others then v_over := null;
  end;

  if v_susp then v_reason := 'suspended';
  elsif v_unready then v_reason := 'not_onboarded';
  elsif v_paid and s.mode = 'all_stop' then v_reason := 'all_stop';
  elsif v_paid and s.mode = 'prospecting_paused' then v_reason := 'paused';
  elsif v_role = 'sales' and coalesce((a ->> 'sales_allowed')::boolean, true) is false then v_reason := 'not_allowed';
  elsif v_role = 'sales' and a ? 'max_rows' and v_units > (a ->> 'max_rows')::numeric then v_reason := 'too_many_rows';
  elsif v_role = 'sales' and (v_over is null or v_over <= now()) then
    if v_paid then
      -- The whole team's REAL spend (every provider row, background jobs included; estimates excluded).
      select coalesce(sum(estimated_cost_usd), 0) into v_team from public.api_usage_log
       where created_at > now() - interval '24 hours' and api_type is distinct from 'guard';
      if v_team >= (s.limits ->> 'team_day_cap_usd')::numeric then v_reason := 'team_cap'; end if;
    end if;
    if v_reason is null then
      for w in select * from (values ('per_min', interval '1 minute'), ('per_10min', interval '10 minutes'),
                                     ('per_hour', interval '1 hour'), ('per_day', interval '24 hours')) t(k, span) loop
        if a ? w.k then
          select count(*) into v_n from public.api_usage_log
           where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
             and created_at > now() - w.span;
          if v_n + 1 > (a ->> w.k)::numeric then v_reason := 'rate_limit'; exit; end if;
        end if;
      end loop;
    end if;
    if v_reason is null and a ? 'rows_per_day' then
      select coalesce(sum(calls_made), 0) into v_n from public.api_usage_log
       where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
         and created_at > now() - interval '24 hours';
      if v_n + v_units > (a ->> 'rows_per_day')::numeric then v_reason := 'rate_limit'; end if;
    end if;
    if v_reason is null and v_paid then
      -- This person's spend: their own provider rows + the estimates for work billed to the book (hooks).
      select coalesce(sum(estimated_cost_usd) filter (where created_at > now() - interval '1 hour'), 0),
             coalesce(sum(estimated_cost_usd), 0)
        into v_h, v_d from public.api_usage_log
       where user_id = _actor and created_at > now() - interval '24 hours' and outcome is distinct from 'refused';
      if v_h >= (s.limits ->> 'user_hour_hard_usd')::numeric or v_d >= (s.limits ->> 'user_day_hard_usd')::numeric then
        v_reason := 'spend_cap';
      elsif v_h >= (s.limits ->> 'user_hour_warn_usd')::numeric or v_d >= (s.limits ->> 'user_day_warn_usd')::numeric then
        v_warn := 'spend_warning';
      end if;
    end if;
    if v_reason is null and v_warn is null and a ? 'warn_day' then
      select count(*) into v_n from public.api_usage_log
       where user_id = _actor and action = _action and outcome in ('allowed', 'warned')
         and created_at > now() - interval '24 hours';
      if v_n + 1 > (a ->> 'warn_day')::numeric then v_warn := 'volume_warning'; end if;
    end if;
    if v_reason is null and v_warn is null and a ? 'warn_rows' and v_units > (a ->> 'warn_rows')::numeric then
      v_warn := 'large_copy';
    end if;
  end if;

  v_outcome := case when v_reason is not null then 'refused' when v_warn is not null then 'warned' else 'allowed' end;
  insert into public.api_usage_log (user_id, function_name, api_type, calls_made, cache_hit, estimated_cost_usd,
                                    trigger_source, action, actor_role, lead_id, outcome, reason)
  values (_actor, left(coalesce(_fn, _action), 80), 'guard', v_units, false,
          case when v_reason is null then greatest(coalesce(_est_cost, 0), 0) else 0 end,
          'guard', _action, v_role, _lead, v_outcome, coalesce(v_reason, v_warn));

  if v_reason is not null or v_warn is not null then
    insert into public.security_events (actor_user_id, actor_role, kind, severity, action, lead_id, detail, alert_key, alert_wanted)
    values (_actor, v_role, coalesce(v_reason, v_warn),
            case when v_reason in ('paused', 'all_stop', 'suspended', 'not_onboarded', 'not_allowed') then 'info'
                 when v_reason is not null then 'restricted' else 'warning' end,
            _action, _lead,
            jsonb_build_object('spend_hour_usd', round(v_h, 2), 'spend_day_usd', round(v_d, 2),
                               'team_day_usd', round(v_team, 2), 'units', v_units, 'function', _fn),
            -- A SUSPENDED account's attempts are one alert per person per day, whatever they try (2026-09-29, live QA:
            -- one per action was ten lines in one email). Everything else stays per action.
            _actor::text || ':' || coalesce(v_reason, v_warn) || ':' || case when v_reason in ('suspended', 'not_onboarded') then 'any' else _action end || ':' || v_day,
            -- The admin's own pause is never emailed back to them; everything else is, once a day.
            coalesce(v_reason, v_warn) not in ('paused', 'all_stop'))
    on conflict (alert_key) do update
      set occurrences = public.security_events.occurrences + 1, last_at = now(), detail = excluded.detail;
  end if;

  return jsonb_build_object(
    'ok', v_reason is null,
    'state', case when v_reason is not null then 'restricted' when v_warn is not null then 'warning' else 'normal' end,
    'reason', coalesce(v_reason, v_warn),
    'role', v_role,
    'suspended', v_susp,
    'not_onboarded', v_unready);
end
$fn$;
revoke all on function public.guard_action(uuid, text, uuid, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.guard_action(uuid, text, uuid, numeric, integer, text) to service_role;
