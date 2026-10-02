-- New public tables stop arriving with TRUNCATE, TRIGGER and REFERENCES for anon and authenticated.
--
-- Companion to 20261005110000_revoke_truncate_trigger_references.sql, which removed them from every
-- existing public table and view. Supabase's default privileges for role postgres in schema public
-- grant ALL on each new table to anon and authenticated; this narrows that default to what RLS can
-- govern (select/insert/update/delete). Every public relation is owned by postgres, so this is the
-- default that applies to tables our migrations create. Idempotent; nothing else changes.

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
