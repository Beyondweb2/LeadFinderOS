-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE WHATSAPP QUEUE CRON: EVERY 4 MINUTES -> EVERY MINUTE  (2026-09-14)
--
-- Run this in the Supabase SQL editor. It is the ONLY half of the DAILY_CAP 400 change that
-- cannot ship from the repo: the schedule lives only in the database (CLAUDE.md §8), there is
-- no migration for it, and nothing in the codebase can read or change it.
--
-- ⛔ WITHOUT THIS, THE CAP CHANGE IS ALMOST INERT. Simulated 5,000 days against the real pacing
--    formula: cap 400 on the existing 4-minute cron gives 218 sends/day because the GRID binds at
--    217 ticks, not the cap. Only a 1-minute grid reaches ~399.
--       cron 4 -> 218/day     cron 3 -> 290/day     cron 2 -> 364/day     cron 1 -> 399/day
--
-- ⚠️ The deployed function already has DAILY_CAP 400 and SEND_GAP_FLOOR_MIN 1, so running this
--    takes the queue from ~218/day to ~399/day. It is the step that actually changes throughput.
--    Not running it is a safe state: the queue simply stays at ~218.
--
-- ⚠️ ONE SEND PER TICK IS UNCHANGED. A 1-minute cron does not mean a send every minute — the
--    pacing (baseGap = time-left-in-window / remaining-cap ≈ 2.18 min at 07:00) still spreads the
--    day. The finer grid only stops gaps being rounded up to the next 4-minute mark.
--
-- ⚠️ THE 07:00-21:30 WINDOW IS UNCHANGED and is enforced in the function, not here. Ticks outside
--    it return immediately, so the extra invocations cost nothing but a no-op.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- 1. What is scheduled now (run this first and keep the output — it is the rollback).
select jobid, schedule, jobname, active
  from cron.job
 where jobname = 'whatsapp-queue-run';

-- 2. Unschedule the 4-minute job.
select cron.unschedule('whatsapp-queue-run');

-- 3. Reschedule it every minute, calling the same function it called before.
select cron.schedule(
  'whatsapp-queue-run',
  '* * * * *',
  $$select public.invoke_whatsapp_queue();$$
);

-- 4. Confirm. `schedule` must read '* * * * *' and `active` must be true.
select jobid, schedule, jobname, active
  from cron.job
 where jobname = 'whatsapp-queue-run';

-- ── ROLLBACK, if the quality rating moves or the Apify budget bites ──────────────────────────
-- select cron.unschedule('whatsapp-queue-run');
-- select cron.schedule('whatsapp-queue-run','*/4 * * * *',$$select public.invoke_whatsapp_queue();$$);
-- Lowering DAILY_CAP alone is ALWAYS safe and needs no SQL: the pacing just spreads fewer sends
-- wider. The cron only sets the ceiling.
