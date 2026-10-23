-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS ACTUALLY SCHEDULED, AND HOW OFTEN  (2026-09-07)
--
-- I can prove from the data that process-ai-audit-queue has been firing continuously (every
-- apify_account_usage row is a receipt of one of its ticks, and they are 15.0 minutes apart with
-- no gaps for the last 7+ hours). What I CANNOT read from outside is the schedule itself — the
-- cron jobs live only in the database, not in migrations (CLAUDE.md §8), and cron.job is not
-- readable through PostgREST.
--
-- These three queries answer it definitively. Query 1 is the one that matters.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- 1. EVERY scheduled job, its interval, and whether it is switched on.
--    Expect a row whose command mentions process-ai-audit-queue, with active = true.
select jobid, jobname, schedule, active, command
  from cron.job
 order by jobname;

-- 2. Did it actually run, and did the runs succeed? (last 2 hours)
--    A row per firing. status should be 'succeeded'; 'failed' with a message is the thing to see.
select j.jobname, r.status, r.start_time, r.end_time, left(coalesce(r.return_message, ''), 200) as message
  from cron.job_run_details r
  join cron.job j on j.jobid = r.jobid
 where r.start_time > now() - interval '2 hours'
 order by r.start_time desc
 limit 100;

-- 3. Any job that has been failing rather than simply not existing (last 24h, failures only).
select j.jobname, count(*) as failures, max(r.start_time) as most_recent,
       left(max(coalesce(r.return_message, '')), 300) as a_message
  from cron.job_run_details r
  join cron.job j on j.jobid = r.jobid
 where r.start_time > now() - interval '24 hours'
   and r.status <> 'succeeded'
 group by j.jobname
 order by failures desc;
