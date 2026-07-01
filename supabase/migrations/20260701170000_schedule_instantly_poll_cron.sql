-- ============================================================================
-- Schedule poll-instantly-replies via pg_cron (every 20 min).
--
-- APPLIED MANUALLY in the Supabase SQL editor on 2026-07-01 (it returned the
-- job id). This file exists ONLY to keep the repo a true source of truth — it is
-- NOT for `supabase db push` (this project's migration history is desynced, so
-- pushing is broken). It is idempotent (create or replace + unschedule→schedule),
-- so it's a no-op against live and safe on a fresh rebuild.
--
-- Mirrors invoke_whatsapp_queue() from migration 20260627130000 exactly: same
-- vault-key lookup, same net.http_post shape/headers, same unschedule-then-
-- schedule pattern. Only the function name, target URL, job name and interval
-- differ (poll-instantly-replies, 'instantly-poll-run', */20 instead of */10).
--
-- The poll function (poll-instantly-replies) walks the active set — outreach_leads
-- with instantly_pushed_at set AND status='email_sent' — and flips reply→'replied'
-- / bounce→'bounced'. It's idempotent per lead. Auth: service-role bearer (this cron).
-- ============================================================================

create or replace function public.invoke_instantly_poll()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  if v_service_key is null then
    raise warning '[instantly-poll] service_role_key not found in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/poll-instantly-replies',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', coalesce(v_anon_key, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'instantly-poll-run';
select cron.schedule('instantly-poll-run', '*/20 * * * *', $$select public.invoke_instantly_poll()$$);
