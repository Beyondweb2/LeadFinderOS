-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PERFORMANCE SYNC — the nightly cron job. RUN LAST, after the migration, after the seeding, and
-- after the first manual sync has been proved to return data.
--
-- ⛔ CRON JOBS LIVE ONLY IN THE DATABASE (CLAUDE.md §7). There is no migration that can create
--    this, nothing in the repo records it, and a rebuild from migrations loses it. It is here, by
--    hand, on purpose.
--
-- This copies public.invoke_cron_run() exactly — the proven pattern: read the secrets out of the
-- vault, POST to the edge function with x-cron-secret. Nothing new is invented and no secret is
-- written into this file.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. The invoker ────────────────────────────────────────────────────────────────────────────
create or replace function public.invoke_performance_sync()
returns void
language plpgsql
security definer
as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name='SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name='SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name='CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/performance-sync',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || coalesce(v_service_key,''),
      'apikey', coalesce(v_anon_key,''),
      'x-cron-secret', coalesce(v_cron_secret,'')
    ),
    body := jsonb_build_object('mode','daily','triggered_by','pg_cron','ts',now())
  );
end;
$$;

-- ── 2. The schedule ───────────────────────────────────────────────────────────────────────────
-- ⛔ ONCE A DAY, 05:00 UTC. Search Console data is daily and lands a couple of days late; polling
--    it hourly would spend edge invocations to rewrite the same rows. 05:00 UTC is quiet and sits
--    after Google's overnight processing, whichever side of BST we are on.
-- The rolling window means a miss is self-healing: the next run re-fetches today-6 … today-2, so a
-- night that fails loses nothing permanently.
select cron.schedule(
  'performance-sync-run',
  '0 5 * * *',
  $$select public.invoke_performance_sync();$$
);

-- ── 3. VERIFY (paste the result back) ─────────────────────────────────────────────────────────
-- select jobid, jobname, schedule, active, command from cron.job where jobname = 'performance-sync-run';
--
-- To take it off again (it is a schedule, not a migration — this is the only way):
--   select cron.unschedule('performance-sync-run');
