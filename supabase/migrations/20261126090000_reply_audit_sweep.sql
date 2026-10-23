-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE REPLY-AUDIT SWEEPER (2026-10-23, fn reply-audit-sweep, docs/reply-audit-sweep.md).
--
-- The held WhatsApp webhook (whatsapp-status, live v129) still skips an automated first reply, so those
-- leads never get a reply audit. fn reply-audit-sweep records the missed audit-only claim; the audit
-- queue's reconciler mints the audit. This migration gives it:
--   1. its daily allowance — protection_settings.reply_audit_sweep_per_day (default = the code's
--      REPLY_AUDIT_SWEEP_DEFAULT_PER_DAY). Its OWN column, not a key in protection_settings.limits:
--      validateLimits refuses an unknown key there, which would break every Security-panel save.
--   2. its hourly run — public.invoke_reply_audit_sweep(), CRON_SECRET from the vault, like the others.
-- Additive and idempotent. Rollback:
--   select cron.unschedule('reply-audit-sweep-run');
--   drop function if exists public.invoke_reply_audit_sweep();
--   alter table public.protection_settings drop column if exists reply_audit_sweep_per_day;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
set local lock_timeout = '5s';

alter table public.protection_settings
  add column if not exists reply_audit_sweep_per_day integer not null default 50
  check (reply_audit_sweep_per_day >= 0);

create or replace function public.invoke_reply_audit_sweep()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/reply-audit-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('mode', 'run')
  );
end $function$;
revoke all on function public.invoke_reply_audit_sweep() from public, anon, authenticated;

select cron.schedule('reply-audit-sweep-run', '23 * * * *', 'select public.invoke_reply_audit_sweep()')
 where not exists (select 1 from cron.job where jobname = 'reply-audit-sweep-run');

-- Verify (read back):
--   select reply_audit_sweep_per_day from public.protection_settings where id = 1;
--   select jobname, schedule, command from cron.job where jobname = 'reply-audit-sweep-run';
