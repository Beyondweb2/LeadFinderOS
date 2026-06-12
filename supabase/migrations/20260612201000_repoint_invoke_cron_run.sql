-- invoke_cron_run() was created with the original LeadFinder project's URL
-- hardcoded. Repoint it at this project so the nightly pg_cron job calls OUR
-- cron-run function and never touches the original project.
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

  v_url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/cron-run';

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
