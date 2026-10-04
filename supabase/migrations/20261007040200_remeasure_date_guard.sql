-- THE RE-MEASURE DATE CANNOT BE CLEARED BY ACCIDENT (fix/04-ai-measurement, 2026-10-04 — Session C
-- C-09, master plan M-031).
--
-- WHY. The delivery cockpit's date picker (react-day-picker) passes `undefined` when the selected day
-- is clicked again, and the cockpit wrote that as remeasure_due_date = NULL. The day-28 replay
-- (fireDueRemeasures) needs a date, and so does the overdue alert, so one re-click silently cancelled
-- a client's guarantee re-measure. The picker is fixed (required + a confirm), and this is the server
-- half: a lead WITH a baseline pointer and a stored date can never have that date set to NULL by an
-- ordinary update.
--
-- ⛔ MOVING the date is still allowed (the cockpit asks for confirmation). Only CLEARING is refused.
-- ⛔ A deliberate clear by Paul is still possible, and has to be said out loud in the same transaction:
--      begin;
--      set local app.allow_remeasure_clear = 'on';
--      update public.outreach_leads set remeasure_due_date = null where id = '<lead>';
--      commit;
-- ⛔ No existing row is touched (no backfill, no rewrite — pinned dates stay as history).
--
-- ADDITIVE AND IDEMPOTENT. Show Paul before running (it adds a trigger to outreach_leads).

create or replace function public.guard_remeasure_date_not_cleared()
returns trigger
language plpgsql
as $$
begin
  if old.remeasure_due_date is not null
     and new.remeasure_due_date is null
     and new.baseline_audit_id is not null
     and coalesce(current_setting('app.allow_remeasure_clear', true), '') <> 'on' then
    raise exception 'remeasure_due_date cannot be cleared for a lead with a baseline (lead %). Move the date instead, or set app.allow_remeasure_clear = on in the same transaction.', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_outreach_leads_remeasure_date_guard on public.outreach_leads;
create trigger trg_outreach_leads_remeasure_date_guard
  before update of remeasure_due_date on public.outreach_leads
  for each row execute function public.guard_remeasure_date_not_cleared();

-- Read back:
--   select trigger_name, action_timing, event_manipulation from information_schema.triggers
--   where event_object_table = 'outreach_leads' and trigger_name = 'trg_outreach_leads_remeasure_date_guard';
