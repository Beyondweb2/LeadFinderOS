-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SALESPERSON ONBOARDING, TPS/CTPS STATE, BUSINESS TYPE (2026-10-05, docs/salesperson-onboarding.md).
-- Additive and idempotent. Four new tables and one function; NO existing table, policy or function is
-- changed, and nothing here touches WhatsApp.
--
-- 1. salesperson_onboarding        — what Paul has on file for each salesperson (src/lib/salespersonOnboarding.ts).
--    ⛔ ADMIN ONLY, BY HAVING NO POLICY: RLS on, zero policies, every privilege revoked from anon and
--    authenticated. The only reader and writer is fn admin-users (service role) after its admin check, so
--    no salesperson can read any onboarding row — their own or anyone else's. No bank details, passport
--    numbers or copies are stored: only dates, versions, answers and WHERE the evidence is kept.
-- 2. salesperson_onboarding_log    — every change, append-only and server-timed (who, when, which fields).
-- 3. phone_tps_checks              — genuine TPS/CTPS answers from a connected provider (src/lib/tpsCheck.ts).
--    Service role writes only; a row without a provider and a provider reference is refused, so a
--    "not registered" can never be typed in by hand. No provider is connected: the table starts empty.
-- 4. lead_business_type_records    — a person's record of a lead's legal form, with its evidence
--    (src/lib/businessType.ts). Append-only; written only through lead_record_business_type().
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. salesperson_onboarding ──────────────────────────────────────────────────────────────────────
create table if not exists public.salesperson_onboarding (
  user_id uuid primary key references auth.users(id) on delete restrict,
  agreement_version text,
  agreement_signed_on date,
  privacy_notice_version text,
  privacy_notice_given_on date,
  age_18_confirmed_on date,
  rtw_method text check (rtw_method in ('video_call_original_not_held', 'in_person_original', 'certified_provider', 'home_office_online')),
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
  team_guide_version text,
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

-- ── 2. the change log ───────────────────────────────────────────────────────────────────────────────
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

create or replace function public.salesperson_onboarding_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'updated_by' - 'user_id';
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' - 'updated_by' - 'user_id' else '{}'::jsonb end;
  v_changed jsonb;
begin
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

-- ── 3. phone_tps_checks ─────────────────────────────────────────────────────────────────────────────
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

-- ── 4. lead_business_type_records ───────────────────────────────────────────────────────────────────
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
   client — public._require_work). The person and the time come from the session and the database. A
   type other than unknown needs a note of the evidence. */
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
