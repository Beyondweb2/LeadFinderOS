-- G2 — drop the duplicate Instantly poll cron.
--
-- Two jobs run the SAME command on the SAME schedule, so the poll fires twice every 20 minutes:
--
--   jobid 3  instantly-reply-poll  */20 * * * *  select public.invoke_instantly_poll()
--   jobid 5  instantly-poll-run    */20 * * * *  select public.invoke_instantly_poll()
--
-- Keeping jobid 5 (instantly-poll-run) because that is the name the checked-in migration
-- 20260701170000_schedule_instantly_poll_cron.sql creates; jobid 3 exists only in the database,
-- so dropping it also brings the live schedule back in line with the repo.
--
-- No cost impact: poll-instantly-replies returns 503 without INSTANTLY_API_KEY, and every
-- instantly_* column is NULL across all 409 leads, so both jobs are currently no-ops. This is
-- 72 pointless invocations a day, and the noise hides a real failure if you ever start using it.

select cron.unschedule('instantly-reply-poll');

-- Verify: should leave exactly one instantly job.
-- select jobid, jobname, schedule, active from cron.job where jobname like 'instantly%';
