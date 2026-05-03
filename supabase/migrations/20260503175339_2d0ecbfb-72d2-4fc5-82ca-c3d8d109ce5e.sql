
-- Create a wrapper function that invokes cron-run using service_role_key from vault
CREATE OR REPLACE FUNCTION public.invoke_cron_run()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_key text;
  v_anon_key text;
  v_url text;
BEGIN
  -- Read keys from vault
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_ANON_KEY'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE WARNING '[CRON] service_role_key not found in vault';
    RETURN;
  END IF;

  v_url := 'https://hhbdvgsnjequwooynxpr.supabase.co/functions/v1/cron-run';

  -- Fire-and-forget HTTP POST via pg_net
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', COALESCE(v_anon_key, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
END;
$$;

-- Remove any old cron job
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'daily-cron-run';

-- Schedule new job: daily at 02:00 UTC, calls the wrapper function
SELECT cron.schedule(
  'daily-cron-run',
  '0 2 * * *',
  $$SELECT public.invoke_cron_run()$$
);
