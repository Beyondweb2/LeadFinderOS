-- ════════════════════════════════════════════════════════════════════════════════════════════
-- bulk_jobs.job_type — allow 'audit_and_push'.
--
-- ⛔ WHY THIS IS SQL AND NOT JUST CODE. job_type carries a CHECK constraint, so bulk-jobs' `create`
--    would insert successfully in the code path and be REJECTED BY POSTGRES, surfacing as a generic
--    insert failure with the job never appearing. The function must not be deployed before this
--    runs — that is the SQL-FIRST rule, proven on 2026-08-04 when findable-onboarding v18 shipped
--    ahead of its five columns and every submission died for ~20 minutes.
--
-- ⚠️ THE LIVE CONSTRAINT IS NOT WHAT THE ORIGINAL MIGRATION SAYS. 20260702150000_bulk_jobs.sql
--    created it as ('enrich', 'site_gen'); 'audit' was added later BY HAND in the SQL editor and
--    that change was never written to a migration file (CLAUDE.md §8 records the gap). So this
--    cannot be a targeted ALTER of a known definition — it drops whatever is there by name and
--    states the whole set, which is also what makes it safe to run twice.
--
-- ⚠️ THE CONSTRAINT NAME IS A GUESS ONLY IN ITS DEFAULT FORM. Postgres names a table-level check
--    <table>_<column>_check when it is written inline, which it was. The VERIFY block below prints
--    every check on the table so a differently-named one is visible rather than silently left in
--    place alongside the new one — two checks both apply, and the old one would still reject.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.bulk_jobs drop constraint if exists bulk_jobs_job_type_check;

alter table public.bulk_jobs
  add constraint bulk_jobs_job_type_check
  check (job_type in ('enrich', 'site_gen', 'audit', 'audit_and_push'));

comment on column public.bulk_jobs.job_type is
  'enrich | site_gen | audit | audit_and_push. audit_and_push runs a two-phase job: audit the leads that need one (skip_seo), then push the whole set to Instantly in one call.';

-- ── VERIFY — run these and read them before deploying bulk-jobs ─────────────────────────────
-- 1. Exactly ONE check constraint should mention job_type, and it should list all four values.
--    If a second one appears, the old constraint had a different name and is still rejecting.
-- select conname, pg_get_constraintdef(oid) as definition
--   from pg_constraint
--  where conrelid = 'public.bulk_jobs'::regclass and contype = 'c'
--  order by conname;
--
-- 2. The value is now accepted. Rolled back, so it leaves nothing behind.
-- begin;
--   insert into public.bulk_jobs (user_id, job_type, status, items, total)
--   values ((select user_id from public.bulk_jobs order by created_at desc limit 1),
--           'audit_and_push', 'queued', '[]'::jsonb, 0);
-- rollback;
