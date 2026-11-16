-- AUDIT WATCH (Paul, 2026-11-16, leftovers items 1 and 3). Function: supabase/functions/audit-watch.
--
-- ai_audits.verdict_counts  jsonb, written ONLY by audit-watch: a finished Discovery on rules v3/v4 gets
--                           { v:1, rules, at, incomplete, named, winnable, notWinnable, noNames, unmeasured, searches } —
--                           the report's own split (src/lib/auditVerdictCounts.ts). Any other finished Discovery since v3
--                           gets { v:0, none:true, at }. Read by the team's Opportunity score. Never shown to a client.
-- invoke_audit_watch()      posts to audit-watch only when it has work: a finished v3/v4-era Discovery with no counts yet
--                           (or a run re-scored after them), OR the newest Apify reading is at/over 80% of its monthly limit
--                           and this billing cycle's alert has not been raised. pg_cron every 5 minutes.
--
-- ⛔ ADDITIVE AND IDEMPOTENT. A nullable jsonb column with no default does not rewrite ai_audits. Updating it fires
--    trg_audit_score_audit, which marks runs dirty only on name / trade / town / created_at / purpose / is_market changes,
--    so this column never dirties a score.
-- ⛔ The 80 and the dedupe key ('apify_usage_80:' + cycle start date, else the capture month) are src/lib/apifyUsageAlert.ts's.
-- Rollback (Paul only): select cron.unschedule('audit-watch'); drop function public.invoke_audit_watch(); the column may stay.

set local lock_timeout = '5s';

alter table public.ai_audits add column if not exists verdict_counts jsonb;
comment on column public.ai_audits.verdict_counts is
  'Team only. A finished rules v3/v4 Discovery''s split (Already named / Winnable / Not winnable / AI doesn''t name / Couldn''t measure), written by audit-watch from the report''s own functions. Read by the Opportunity score.';

create or replace function public.invoke_audit_watch()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_anon_key text; v_cron_secret text; v_counts boolean; v_apify boolean;
begin
  select exists (
    select 1 from public.ai_audits a
     where a.audit_purpose = 'discovery' and a.created_at >= timestamptz '2026-11-16 10:30:00+00'
       and exists (select 1 from public.ai_audit_runs r where r.audit_id = a.id)
       and not exists (select 1 from public.ai_audit_runs r where r.audit_id = a.id and r.status in ('pending', 'running', 'processing'))
       and (a.verdict_counts is null
            or exists (select 1 from public.ai_audit_runs r where r.audit_id = a.id
                        and coalesce(r.scored_at, r.created_at) > (a.verdict_counts->>'at')::timestamptz))
  ) into v_counts;
  select exists (
    select 1 from (
      select u.monthly_usage_usd, u.max_monthly_usage_usd,
             coalesce(to_char(u.cycle_start at time zone 'UTC', 'YYYY-MM-DD'), to_char(u.captured_at at time zone 'UTC', 'YYYY-MM')) as cycle
        from public.apify_account_usage u order by u.captured_at desc limit 1
    ) l
     where l.max_monthly_usage_usd > 0 and l.monthly_usage_usd is not null
       and l.monthly_usage_usd * 100 >= l.max_monthly_usage_usd * 80
       and not exists (select 1 from public.notifications n where n.dedupe_key = 'apify_usage_80:' || l.cycle)
  ) into v_apify;
  if not (coalesce(v_counts, false) or coalesce(v_apify, false)) then
    return;
  end if;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY' limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'       limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/audit-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
end $$;
revoke all on function public.invoke_audit_watch() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'audit-watch') then perform cron.unschedule('audit-watch'); end if;
  perform cron.schedule('audit-watch', '*/5 * * * *', 'select public.invoke_audit_watch();');
end $$;

-- Read back:
--   select column_name, data_type from information_schema.columns where table_name = 'ai_audits' and column_name = 'verdict_counts';
--   select jobname, schedule, command from cron.job where jobname = 'audit-watch';
