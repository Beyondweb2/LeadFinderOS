-- ============================================================================
-- CRON_SECRET header for all pg_cron → edge-function invokers.
--
-- RUN MANUALLY in the Supabase SQL editor (db push is desynced); this file keeps
-- the repo a true source of truth. Idempotent (create or replace).
--
-- WHY: the internal cron/self-invoke calls were authenticating by string-matching
-- the vault SUPABASE_SERVICE_ROLE_KEY against the function's injected
-- SUPABASE_SERVICE_ROLE_KEY env. Those drifted (the vault copy is not the value the
-- runtime injects), so every cron got 401/403 and the background jobs silently
-- failed (bulk site-gen sweep, WhatsApp queue sends, Instantly polls).
--
-- FIX: authenticate with a dedicated shared secret CRON_SECRET, sent in an
-- 'x-cron-secret' header. Each function accepts EITHER that header OR the legacy
-- service-key match, so this is backward-compatible and order-independent. Until
-- CRON_SECRET exists in BOTH the vault (sent here) and as a function secret (read by
-- the functions), these invokers fall back to the old header (no behaviour change).
--
-- PREREQUISITE (operator, one value, two places — must match):
--   1. Function secret:  CRON_SECRET = <random>   (Dashboard → Edge Functions → Secrets)
--   2. Vault secret:     CRON_SECRET = <same>      (Dashboard → Vault, or insert below)
-- CRON_SECRET already exists as a function secret; set/rotate it to a fresh random
-- value and store the SAME value in the vault.
-- ============================================================================

-- ── bulk-jobs sweep (every 1 min) ───────────────────────────────────────────
create or replace function public.invoke_bulk_jobs_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
  v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/bulk-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', 'sweep',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('action', 'sweep', 'triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

-- ── WhatsApp outreach queue (every 10 min) ──────────────────────────────────
create or replace function public.invoke_whatsapp_queue()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
  v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/process-whatsapp-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

-- ── Instantly reply poll (every 20 min) ─────────────────────────────────────
create or replace function public.invoke_instantly_poll()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
  v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/poll-instantly-replies',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

-- ── Daily cron dispatcher (2am) ─────────────────────────────────────────────
create or replace function public.invoke_cron_run()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
  v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/cron-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;
