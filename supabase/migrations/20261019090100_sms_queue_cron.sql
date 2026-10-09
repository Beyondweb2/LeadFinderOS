-- The SMS drip's clock (2026-10-09). Replaces the legacy invoke_sms_queue() (it called the deleted process-sms-queue with the
-- service key only) with the same pattern the WhatsApp queue uses: vault secrets, x-cron-secret, an unconditional ONE-minute
-- schedule. The function does nothing at all while sms_queue_state.paused, outside 09:00-20:00 London, or at the daily cap.
-- Applied AFTER process-sms-queue is deployed. Rollback: select cron.unschedule('sms-queue-run');
create or replace function public.invoke_sms_queue()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/process-sms-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end; $function$;

select cron.unschedule(jobid) from cron.job where jobname = 'sms-queue-run';
select cron.schedule('sms-queue-run', '* * * * *', $$select public.invoke_sms_queue()$$);

-- Read back:  select jobname, schedule, active from cron.job where jobname = 'sms-queue-run';
