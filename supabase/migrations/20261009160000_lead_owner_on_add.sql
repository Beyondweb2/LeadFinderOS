-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- A LEAD ADDED BY A TEAM MEMBER IS OWNED BY THAT TEAM MEMBER (2026-10-05, fix/outreach-lead-ownership;
-- docs/pre-sales-certification/outreach-ownership-safety.md §2).
--
-- Found: the admin's Find Leads "Add" and the Coverage add-all insert straight into outreach_leads from the
-- browser (useOutreach addLead) and never set assigned_to_user_id, so every lead Paul added landed UNASSIGNED
-- (148 in the ten days to 2026-10-05). Only sales_add_lead ("Add a lead", both roles) stamped an owner.
-- Paul's rule (2026-10-05): admin adds → owner = the admin; salesperson adds → owner = that salesperson;
-- a genuinely unowned lead (legacy, an import, a system-created row) stays unassigned.
--
-- The rule, decided HERE from the signed-in caller, never from what the browser sends:
--   · a signed-in ADMIN or SALES caller inserting a lead with no owner → owner = the caller
--     (assigned_to_user_id, assigned_at, added_by_user_id if blank);
--   · a SALESPERSON can never insert a lead owned by someone else (refused). In practice they cannot insert
--     directly at all (RESTRICTIVE policy) — sales_add_lead stamps the caller itself; this is the backstop;
--   · NOT stamped: any insert with no signed-in user — the service role (the free check, onboarding,
--     paid-client-hub, crons). Those are the genuinely unowned new leads.
--   (There is no live "import" marker: outreach_leads_list_type_check allows only no_website / broken_website /
--   manual, so the CSV import's list_type 'imported' is refused before this trigger matters — a pre-existing fault,
--   docs/pre-sales-certification/outreach-ownership-safety.md §5.)
--
-- Prospective only: NO existing row is updated. The ~2,650 unassigned leads stay unassigned (Outreach →
-- Unassigned, claimable one by one). Insert-only trigger; the assignment notification and reassignment
-- triggers are UPDATE-only, so an add notifies nobody. Named to fire before trg_outreach_leads_identity and
-- trg_outreach_leads_sold_by (BEFORE triggers run in name order).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace function public.lead_owner_on_add()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then return new; end if;                -- service role / cron / system: untouched
  v_role := public.my_role();
  if v_role is null then return new; end if;               -- not a team member: untouched (RLS decides)
  if v_role = 'sales' and new.assigned_to_user_id is not null and new.assigned_to_user_id <> v_uid then
    raise exception 'owner_not_yours' using errcode = '42501';
  end if;
  if new.assigned_to_user_id is null then
    new.assigned_to_user_id := v_uid;
    new.assigned_at := coalesce(new.assigned_at, now());
  end if;
  if new.added_by_user_id is null then new.added_by_user_id := v_uid; end if;
  return new;
end $function$;

revoke all on function public.lead_owner_on_add() from public, anon, authenticated;

drop trigger if exists trg_outreach_leads_added_by_owner on public.outreach_leads;
create trigger trg_outreach_leads_added_by_owner
  before insert on public.outreach_leads
  for each row execute function public.lead_owner_on_add();

-- Read back:
--   select tgname from pg_trigger where tgrelid = 'public.outreach_leads'::regclass and tgname = 'trg_outreach_leads_added_by_owner';
--   select count(*) from public.outreach_leads where assigned_to_user_id is null;   -- unchanged by this migration
