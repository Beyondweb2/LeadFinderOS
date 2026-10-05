-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- READY TO SELL WITHOUT SALESPERSON PAPERWORK (Paul, 2026-10-05; docs/salesperson-onboarding.md).
-- Applied AFTER 20261010120000_salesperson_onboarding_compliance.sql.
--
-- Paul sends the contractor agreement and the salesperson privacy notice to salespeople HIMSELF, outside
-- LeadFinderOS. So neither is part of the Ready to Sell rule any more, and nothing in the app asks a
-- salesperson to open, tick or sign them. Anything Paul records about them stays as a reference line.
--
-- ONE replaced function body: public.salesperson_onboarding_missing — H's body, minus the 'agreement' and
-- 'privacy_notice' checks, plus one fix: a NULL contractor_type now counts as missing (it silently passed before). Still required: an active, unsuspended sales login, not past an end date,
-- 18+ confirmed, right to work, bank details received, VAT status, individual / limited company, start date,
-- the current team guide acknowledged. Schedule 2 optional. TPS/CTPS still postponed (not part of it).
-- Every gate that asks this function (guard_action 'not_onboarded' — incl. Find Leads' lead_search, claims,
-- checks, WhatsApp; the lead_activity and assignment triggers; quick-close via salesperson_ready_to_sell) is
-- unchanged. The CLIENT Service Agreement v3 gate is unrelated and untouched.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

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
  -- (No contractor agreement / privacy notice check: handled outside LeadFinderOS.)
  if r.age_18_confirmed_on is null then m := m || 'age_18'::text; end if;
  if r.rtw_result is distinct from 'pass' or r.rtw_method is null or r.rtw_checked_on is null
     or coalesce(btrim(r.rtw_checked_by), nb) = nb or coalesce(btrim(r.rtw_evidence_ref), nb) = nb
     or (r.rtw_method = 'certified_provider' and coalesce(btrim(r.rtw_provider), nb) = nb)
     or (r.rtw_recheck_due is not null and r.rtw_recheck_due <= v_today) then m := m || 'right_to_work'::text; end if;
  if r.bank_details_received_on is null then m := m || 'bank_details'::text; end if;
  if not (r.vat_registered is false or (r.vat_registered is true and r.vat_number is not null)) then m := m || 'vat'::text; end if;
  -- ⛔ coalesce(…, false): with contractor_type NULL the comparison is NULL and "not NULL" never fired, so a rep with
  --    no contractor status recorded passed this item (found by supabase/tests/ready-to-sell-paperwork.sql, 2026-10-05).
  if not coalesce(r.contractor_type = 'individual' or (r.contractor_type = 'limited_company' and coalesce(btrim(r.company_name), nb) <> nb
          and r.company_number is not null and r.company_contract_confirmed_on is not null), false) then m := m || 'contractor_status'::text; end if;
  if r.start_date is null then m := m || 'start_date'::text; end if;
  if not exists (select 1 from public.salesperson_document_versions d where d.id = r.team_guide_version and d.kind = 'team_guide' and d.status = 'approved')
     or r.team_guide_acknowledged_on is null then m := m || 'team_guide'::text; end if;
  if r.end_date is not null and r.end_date <= v_today then m := m || 'ended'::text; end if;
  return m;
end $$;
revoke all on function public.salesperson_onboarding_missing(uuid) from public, anon, authenticated;
grant execute on function public.salesperson_onboarding_missing(uuid) to service_role;

-- Read back:
--   select position('agreement' in prosrc) = 0 and position('privacy_notice' in prosrc) = 0 from pg_proc where proname = 'salesperson_onboarding_missing';  -- true
--   select has_function_privilege('authenticated', 'public.salesperson_onboarding_missing(uuid)', 'execute');  -- false
