-- AI Audit book: the SEO grade as a plain column (2026-09-27, Paul approved: "add the small AI Audit
-- SEO-grade column … same safe pattern as the Inbox optimisation").
--
-- 🔴 THE COST. The AI Audit landing list reads every run with `seo_grade:results->seo->>overallGrade`,
-- so Postgres opens every run's full `results` (2,042 runs, 64 MB table) to hand back one letter.
-- That read was ~6–8 s of the book's 7.8–8.9 s first load, and it ran again on every refresh.
--
-- ⛔ SAME PATTERN AS 20260927110000_inbox_outreach_speed.sql, NEVER A GENERATED COLUMN (a generated
-- stored column rewrites the table under ACCESS EXCLUSIVE — over 100 s here). A plain nullable column
-- (catalog-only), the EXISTING parts trigger fills it on every write of `results`, and a backfill in
-- small batches (row locks only, SKIP LOCKED so it never waits on the queue processor). `results`
-- stays the source of truth; nothing that writes it changes.
--
-- ⚠️ APPLY IN THREE STEPS, one block per call, lock_timeout on each:
--   STEP 1 — the column + the trigger function (this block).
--   STEP 2 — the backfill, repeated until it reports 0 rows.
--   STEP 3 — the zero-difference check, in id batches. Only then do the SPA reads switch.

-- ── STEP 1 ──────────────────────────────────────────────────────────────────────────────────────
set local lock_timeout = '3s';
alter table public.ai_audit_runs add column if not exists results_seo_grade text;

create or replace function public.fill_ai_audit_run_parts()
returns trigger language plpgsql as $$
begin
  new.results_summary := new.results -> 'summary';
  new.results_crawl_check := new.results -> 'crawl_check';
  new.results_seo_grade := (new.results -> 'seo') ->> 'overallGrade';
  return new;
end
$$;
revoke execute on function public.fill_ai_audit_run_parts() from public, anon, authenticated;

/* ── STEP 2 — backfill, 200 rows a call, repeat until it returns 0 ────────────────────────────────
   Only rows whose grade exists and is not yet copied. The parts trigger is UPDATE OF results, so
   setting results_seo_grade alone fires nothing.

set local statement_timeout = '10s'; set local lock_timeout = '2s';
with b as (select id from public.ai_audit_runs
            where results_seo_grade is null and (results -> 'seo') ->> 'overallGrade' is not null
            order by id limit 200 for update skip locked)
update public.ai_audit_runs r set results_seo_grade = (r.results -> 'seo') ->> 'overallGrade'
  from b where r.id = b.id;

── STEP 3 — zero differences, checked in id ranges (each call bounded) ────────────────────────────

select count(*) from public.ai_audit_runs
 where id > :last_id and id <= :next_id
   and results_seo_grade is distinct from (results -> 'seo') ->> 'overallGrade';
*/
