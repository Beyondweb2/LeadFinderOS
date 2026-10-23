-- Stop the Instantly reply poll. Email outreach has ended; this pg_cron job still calls the
-- poll-instantly-replies edge function every 20 minutes for the 24 leads at status email_sent.
-- This ONLY unschedules the job. The DB function invoke_instantly_poll(), the edge function
-- poll-instantly-replies and the instantly_poll_state table are removed in Phase 3, not here.
-- Safe to run twice: the second run errors "could not find valid entry" and changes nothing.

select cron.unschedule('instantly-poll-run');

-- Verify: expect ZERO rows back.
select jobid, jobname, schedule, active
  from cron.job
 where jobname = 'instantly-poll-run';

-- And the six that must still be there: expect exactly these six, all active = true.
select jobname, schedule, active
  from cron.job
 order by jobname;
-- ai-audit-queue-run · bulk-jobs-sweep · daily-cron-run · notify-onboarding-submit-run ·
-- whatsapp-auto-replies-run · whatsapp-queue-run
