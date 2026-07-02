-- ============================================================================
-- bulk-jobs-sweep — pg_cron heal for the bulk job runner's self-invoke chain.
--
-- RUN MANUALLY in the Supabase SQL editor (db push is desynced); this file keeps
-- the repo a true source of truth. Idempotent (create or replace + unschedule→
-- schedule). Mirrors invoke_whatsapp_queue()'s vault pattern exactly.
--
-- Every 2 minutes, ask the bulk-jobs function to re-kick any queued/running job
-- whose updated_at has gone stale (> ~3 min) — i.e. whose self-re-invoke chain
-- broke (killed isolate, dropped kick). A healthy chain touches updated_at after
-- every item, so live jobs are never re-kicked; the locked_until claim makes a
-- sweeper kick racing a live chain harmless.
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
select cron.schedule('bulk-jobs-sweep', '*/2 * * * *', $$select public.invoke_bulk_jobs_sweep()$$);
