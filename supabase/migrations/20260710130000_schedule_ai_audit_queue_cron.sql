-- ============================================================================
-- Schedule process-ai-audit-queue via pg_cron (every 1 minute).
--
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (this project's migration history is
-- desynced, so `supabase db push` is broken). This file is the source-of-truth copy.
-- It is idempotent (create or replace + unschedule→schedule), so it's safe to re-run.
--
-- Mirrors invoke_instantly_poll() from 20260701170000 exactly: same vault-key lookup,
-- same net.http_post shape, same unschedule-then-schedule pattern. Differences: the
-- target function (process-ai-audit-queue), the job name ('ai-audit-queue-run'), the
-- interval (every minute, since users wait on results), and it ALSO passes the
-- x-cron-secret header (CRON_SECRET from the vault) — the function accepts either that
-- header OR the service-role bearer as its cron auth.
--
-- The queue processor drains up to a small batch of pending ai_audit_queue rows per
-- tick, runs the multi-engine SERP actor per question, folds results into the run, and
-- computes mention_rate. Idempotent per row; cost-capped per run and per user.
-- ============================================================================

create or replace function public.invoke_ai_audit_queue()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
  v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  if v_service_key is null then
    raise warning '[ai-audit-queue] service_role_key not found in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/process-ai-audit-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'ai-audit-queue-run';
select cron.schedule('ai-audit-queue-run', '* * * * *', $$select public.invoke_ai_audit_queue()$$);

-- Verify the job is registered (expect one row: ai-audit-queue-run, '* * * * *', active).
select jobname, schedule, active from cron.job where jobname = 'ai-audit-queue-run';
