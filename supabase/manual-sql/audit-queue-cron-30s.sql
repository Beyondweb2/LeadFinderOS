-- TASK 1.2 - drop the audit queue tick from every 60s to every 30s.
--
-- WHY. Questions are started asynchronously and only POLLED on a later tick, so the cron interval
-- is the polling granularity: a question whose actor finishes in 25s is not noticed for up to a
-- full minute. Halving the interval halves that dead time, on every question, for every audit.
--
-- SAFE TO OVERLAP. Rows are claimed with an atomic pending->running flip that returns the claimed
-- rows, so two ticks running concurrently cannot start the same question twice. The SEO step is
-- idempotent (results.seo is its own done-marker), and finalisation is gated on a conditional
-- update that only one poller can win.
--
-- NO EXTRA APIFY COST. The number of actor runs is set by the number of questions, not by how
-- often we look at them. This only adds cheap function invocations and DB reads.
--
-- pg_cron here is 1.6.4, which supports sub-minute schedules given as an interval string.
-- '30 seconds' is native; do NOT try '*/30 * * * * *' (six-field syntax is not accepted).

select cron.unschedule('ai-audit-queue-run');

select cron.schedule(
  'ai-audit-queue-run',
  '30 seconds',
  $$select public.invoke_ai_audit_queue()$$
);

-- Verify: schedule should read '30 seconds' and active should be true.
--   select jobid, jobname, schedule, active from cron.job where jobname = 'ai-audit-queue-run';
--
-- ROLLBACK (returns to the previous every-minute cadence):
--   select cron.unschedule('ai-audit-queue-run');
--   select cron.schedule('ai-audit-queue-run', '* * * * *', $$select public.invoke_ai_audit_queue()$$);
