-- ============================================================================
-- bulk-jobs-sweep — pg_cron backstop for the bulk job runner.
--
-- RUN MANUALLY in the Supabase SQL editor (db push is desynced); this file keeps
-- the repo a true source of truth. Idempotent (create or replace + unschedule→
-- schedule). Mirrors invoke_whatsapp_queue()'s vault pattern exactly.
--
-- Every 1 minute, ask the bulk-jobs function's `sweep` action to kick jobs that
-- need a runner: ANY 'queued' job (its create-time self-invoke never landed) plus
-- any 'running' job whose updated_at has gone stale (> ~3 min = its self-re-invoke
-- chain broke: killed isolate / dropped kick). A healthy running chain touches
-- updated_at after every wave, so it's never swept; the locked_until claim makes a
-- sweeper kick racing the create-time kick (or a live chain) harmless. This is the
-- GUARANTEED trigger — the create-time kickRun is just the fast path.
-- ============================================================================

create or replace function public.invoke_bulk_jobs_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  if v_service_key is null then
    raise warning '[bulk-jobs] service_role_key not found in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/bulk-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', 'sweep'
    ),
    body := jsonb_build_object('action', 'sweep', 'triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'bulk-jobs-sweep';
select cron.schedule('bulk-jobs-sweep', '* * * * *', $$select public.invoke_bulk_jobs_sweep()$$);
