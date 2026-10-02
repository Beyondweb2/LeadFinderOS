-- Revoke TRUNCATE, TRIGGER and REFERENCES from anon and authenticated on every public table and view.
--
-- Supabase's default privileges give both roles ALL on each new public table. RLS governs
-- select/insert/update/delete only — TRUNCATE is not row-level, so any signed-in user (and, on
-- most tables, the anon key in the JS bundle) could wipe a table outright. Found 2026-10-02 on
-- quick_close_events, which is commission evidence (closedWhileEngaged); the live read showed 87
-- tables and 1 view in the same state.
--
-- TRIGGER and REFERENCES are DDL rights (create a trigger / a foreign key pointing at the table).
-- Nothing in src/ or supabase/functions uses them; edge functions run as service_role, which keeps
-- every privilege. Every public relation is owned by postgres, and no public function TRUNCATEs.
--
-- Additive and idempotent: REVOKE of a privilege not held is a no-op. Select/insert/update/delete
-- grants and every RLS policy are untouched. The default privileges are NOT changed here, so a
-- table created later still arrives with these rights — revoke them in that table's migration.

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', r.relname);
  end loop;
end
$$;
