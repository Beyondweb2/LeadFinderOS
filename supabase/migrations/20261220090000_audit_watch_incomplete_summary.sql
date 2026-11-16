-- AUDITS INCOMPLETE SUMMARY (v1-incomplete-fix, 2026-11-16; src/lib/auditAlerts.ts, supabase/functions/_shared/audit-alerts.ts).
-- At 12:08 on 16 Nov twelve Quick checks failed together (Apify's AI search never finished, 3 tries each) and Paul got twelve
-- "Audit incomplete" emails in a minute. The finaliser now adds each incomplete audit to ONE bell row per cause per hour
-- (dedupe_key 'audit_incomplete:<cause>:<YYYY-MM-DDTHH:MI>'), and audit-watch sends that row's ONE email 3+ minutes after it
-- opened. This gate wakes audit-watch for that too: a summary row opened 3 minutes to 2 hours ago with no
-- 'audit_incomplete_emailed:<key>' claim yet. Only invoke_audit_watch() changes. ADDITIVE / IDEMPOTENT.
-- Rollback: re-run 20261218090100_audit_watch_rescored_copies.sql (the previous body).

create or replace function public.invoke_audit_watch()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_anon_key text; v_cron_secret text; v_counts boolean; v_apify boolean; v_summary boolean;
begin
  select exists (
    select 1 from public.ai_audits a
     where a.audit_purpose = 'discovery' and a.created_at >= timestamptz '2026-11-15 06:00:00+00'
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
  select exists (
    select 1 from public.notifications n
     where n.dedupe_key ~ '^audit_incomplete:(openai_refused|apify_refused|search_timeout|search_failed|firms_unread):'
       and n.created_at between now() - interval '2 hours' and now() - interval '3 minutes'
       and not exists (select 1 from public.notifications e where e.user_id = n.user_id and e.dedupe_key = 'audit_incomplete_emailed:' || n.dedupe_key)
  ) into v_summary;
  if not (coalesce(v_counts, false) or coalesce(v_apify, false) or coalesce(v_summary, false)) then
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

-- Read back: select prosrc like '%audit_incomplete_emailed:%' from pg_proc where proname = 'invoke_audit_watch';
