-- Nightly cleanup of pg_cron run history (cron.job_run_details).
-- Why: 2026-11-21 the V1 database disk (2 GB) filled and the project went unhealthy, then read-only.
--      cron.job_run_details had never been cleaned: 1.4M rows / 286 MB since June, the largest single table.
-- Applied by hand on 2026-11-21 (Paul approved). Before that, a one-off clean kept the last 7 days and truncated the rest
-- (DB 1004 MB -> 737 MB). Record: docs/incident-2026-11-21-disk-full.md.
-- Rollback (Paul only): select cron.unschedule('cron-history-cleanup');

do $$ begin
  if exists (select 1 from cron.job where jobname = 'cron-history-cleanup') then perform cron.unschedule('cron-history-cleanup'); end if;
  perform cron.schedule('cron-history-cleanup', '40 3 * * *',
    $c$delete from cron.job_run_details where start_time < now() - interval '7 days'$c$);
end $$;

-- Read back:
--   select jobname, schedule, command, active from cron.job where jobname = 'cron-history-cleanup';
