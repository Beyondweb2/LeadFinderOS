-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- QUICK CLOSE EVENTS ARE COMMISSION EVIDENCE (Paul, 2026-10-02). A first payment received after a
-- salesperson's engagement ended earns only if this table holds a payment link they generated while
-- engaged (src/lib/commission.ts closedWhileEngaged). So it is locked:
-- - No privilege at all for anon / authenticated. Every reader and writer is server-side with the
--   service role (fn quick-close, fn stripe-webhook, _shared/earnings.ts; admin_feature_usage is
--   security definer, granted to service_role only) — the browser never touches it. The select policy
--   stays as a second wall should a grant ever come back.
-- - The time is the database's: created_at := now() on every insert (no back- or forward-dating).
-- - A row is never edited (update refused for every role).
-- - A row is never deleted on its own or wiped (delete / truncate refused) — EXCEPT through the lead's
--   own ON DELETE CASCADE, so deleting a lead (a purge) still works: a cascade fires this trigger one
--   level deeper (pg_trigger_depth() > 1) than a direct delete.
-- Existing rows are untouched. Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
revoke all on public.quick_close_events from anon, authenticated;

create or replace function public.quick_close_events_server_time()
returns trigger language plpgsql as $$
begin
  new.created_at := now();
  return new;
end $$;

create or replace function public.quick_close_events_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- the lead's own cascade
  end if;
  raise exception 'quick_close_events is append-only (commission evidence)';
end $$;

drop trigger if exists quick_close_events_server_time on public.quick_close_events;
create trigger quick_close_events_server_time before insert on public.quick_close_events
  for each row execute function public.quick_close_events_server_time();
drop trigger if exists quick_close_events_no_update on public.quick_close_events;
create trigger quick_close_events_no_update before update or delete on public.quick_close_events
  for each row execute function public.quick_close_events_immutable();
drop trigger if exists quick_close_events_no_truncate on public.quick_close_events;
create trigger quick_close_events_no_truncate before truncate on public.quick_close_events
  for each statement execute function public.quick_close_events_immutable();
