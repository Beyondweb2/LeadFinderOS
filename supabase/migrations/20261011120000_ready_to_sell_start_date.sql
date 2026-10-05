-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- READY TO SELL WAITS FOR THE START DATE (final sales release, 2026-10-05; docs/salesperson-onboarding.md).
-- Applied AFTER 20261010140000_ready_to_sell_without_paperwork.sql (whose salesperson_onboarding_missing body
-- this copies byte for byte, plus ONE rule) and 20261011100000_attribution_review_admin.sql.
--
-- The bug (E2E-03): a salesperson whose start date is still in the future was Ready to Sell. Now:
--   start_date NULL            → 'start_date'   (unchanged)
--   start_date > today (UK)    → 'not_started'  (new) — Ready from the start date itself (start_date <= today)
-- "Today" is the London calendar day, the same v_today the right-to-work recheck and the end date already use.
-- Every gate that asks this function (guard_action 'not_onboarded', the lead_activity and assignment triggers,
-- quick-close, the Team page) picks the rule up with no change of its own. Paul / the admin are never gated.
--
-- my_onboarding_status (the salesperson's OWN status) also returns 'starts_on' — their own start date, and ONLY
-- while it is still to come — so the app can say "Starts on 12 October" instead of a bare key.
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
  if r.start_date is null then m := m || 'start_date'::text;
  -- ⛔ A START DATE STILL TO COME is not Ready to Sell (final sales release, 2026-10-05): active from that UK day on.
  elsif r.start_date > v_today then m := m || 'not_started'::text; end if;
  if not exists (select 1 from public.salesperson_document_versions d where d.id = r.team_guide_version and d.kind = 'team_guide' and d.status = 'approved')
     or r.team_guide_acknowledged_on is null then m := m || 'team_guide'::text; end if;
  if r.end_date is not null and r.end_date <= v_today then m := m || 'ended'::text; end if;
  return m;
end $$;
revoke all on function public.salesperson_onboarding_missing(uuid) from public, anon, authenticated;
grant execute on function public.salesperson_onboarding_missing(uuid) to service_role;

/* The signed-in salesperson's OWN status (body from 20261010120000, plus starts_on while the start date is to come). */
create or replace function public.my_onboarding_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_missing text[];
  v_start date;
begin
  if public.my_role() is distinct from 'sales' then return jsonb_build_object('ok', true, 'gated', false, 'ready', true, 'missing', '[]'::jsonb); end if;
  v_missing := public.salesperson_onboarding_missing(auth.uid());
  if 'not_started' = any(v_missing) then
    select start_date into v_start from public.salesperson_onboarding where user_id = auth.uid();
  end if;
  return jsonb_build_object('ok', true, 'gated', true, 'ready', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing),
    'starts_on', v_start,
    'team_guide', (select jsonb_build_object('id', id, 'label', label) from public.salesperson_document_versions where kind = 'team_guide' and status = 'approved'));
end $$;
revoke all on function public.my_onboarding_status() from public, anon;
grant execute on function public.my_onboarding_status() to authenticated;

-- Read back:
--   select position('not_started' in prosrc) > 0 from pg_proc where proname = 'salesperson_onboarding_missing';  -- true
--   select position('starts_on' in prosrc) > 0 from pg_proc where proname = 'my_onboarding_status';               -- true
--   select has_function_privilege('authenticated', 'public.salesperson_onboarding_missing(uuid)', 'execute');      -- false
--   select has_function_privilege('authenticated', 'public.my_onboarding_status()', 'execute');                   -- true
