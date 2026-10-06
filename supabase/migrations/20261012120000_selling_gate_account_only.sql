-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE SELLING GATE IS ACCOUNT RESTRICTIONS ONLY (sales-team-today release, Paul, 2026-10-06).
-- Applied AFTER 20261011120000_ready_to_sell_start_date.sql, whose salesperson_onboarding_missing body this
-- replaces. Supersedes the "Ready to Sell" practical-onboarding gate (docs/salesperson-onboarding.md §3).
--
-- Paul: "The sales team needs to use LeadFinderOS TODAY." The practical onboarding checklist — 18+ confirmed,
-- right to work, bank details, VAT status, individual / company, start date, team guide acknowledgement — stays
-- on the Team page as Paul's admin record, and NO LONGER BLOCKS SELLING: Find Leads, claiming, AI checks,
-- calls, messages, WhatsApp queueing, sign-up links and Quick Close all work with it incomplete.
--
-- What STILL stops a salesperson (genuine account restrictions, never the checklist):
--   not_sales  — no sales role (a DISABLED account loses its sales role: admin-users 'disable')
--   login      — no team_members row, or its status is not 'active'
--   suspended  — team_members.suspended_at is set (guard_action also checks this on its own)
--   ended      — salesperson_onboarding.end_date is today or earlier (engagement explicitly ended)
--
-- Every server gate reads this ONE function and follows with no change of its own: guard_action
-- ('not_onboarded' via salesperson_ready_to_sell), trg_lead_activity_ready_to_sell, trg_outreach_leads_
-- assign_ready, quick-close (_shared/sales-ready.ts), admin-users team_reassign_all, and the seller-attribution
-- snapshot (creator_ready). my_onboarding_status() reads it too. Paul / the admin are never gated.
-- ⛔ Do not add a checklist item back here (scripts/selling-gate-account-only.test.ts).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.salesperson_onboarding_missing(_user_id uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare
  m text[] := '{}';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_member record;
  v_end date;
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
  select end_date into v_end from public.salesperson_onboarding where user_id = _user_id;
  if v_end is not null and v_end <= v_today then m := m || 'ended'::text; end if;
  return m;
end $$;
revoke all on function public.salesperson_onboarding_missing(uuid) from public, anon, authenticated;
grant execute on function public.salesperson_onboarding_missing(uuid) to service_role;

-- Read back:
--   select position('age_18' in prosrc) = 0 and position('team_guide' in prosrc) = 0 and position('ended' in prosrc) > 0
--     from pg_proc where proname = 'salesperson_onboarding_missing';                                           -- true
--   select has_function_privilege('authenticated', 'public.salesperson_onboarding_missing(uuid)', 'execute'); -- false
