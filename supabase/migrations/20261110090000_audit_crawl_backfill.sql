-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE ONE-OFF CATCH-UP: every audited lead gets its website check (Paul, 2026-10-20; docs/website-check.md).
--
-- Since 2026-09-17 every audit that finishes crawls its lead's site (process-ai-audit-queue). Leads audited
-- before that, or whose crawl was skipped, have an AI result and no website check (861 open leads on
-- 2026-10-20). This works through them SLOWLY, the same internal call the audit makes:
--
--   · AUDIT_CRAWL_BACKFILL_PER_TICK leads a minute, each at most once (audit_crawl_backfill records it);
--   · only open CRM leads (not closed / not interested / opted out / paid / refunded / archived) with a
--     completed, non-market audit whose own website (ai_audits.website — already filtered of directories and
--     social pages) is set, and no lead_crawl_checks row;
--   · paused while AUDIT_CRAWL_BACKFILL_MAX_JOBS deep crawls are already running;
--   · crawl-check reads one page at a time per site and obeys robots.txt (2026-10-20); fetches only, no paid API;
--   · when nothing is left it unschedules itself.
-- ⛔ Nothing here writes a lead, sends anything or starts an audit.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.audit_crawl_backfill (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  audit_id uuid,
  requested_at timestamptz not null default now(),
  request_id bigint
);
alter table public.audit_crawl_backfill enable row level security;
-- No policies: service role only.

create or replace function public.audit_crawl_backfill_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  per_tick constant integer := 3;    -- AUDIT_CRAWL_BACKFILL_PER_TICK
  max_jobs constant integer := 20;   -- AUDIT_CRAWL_BACKFILL_MAX_JOBS
  v_service_key text; v_anon_key text; v_cron_secret text;
  r record;
  n integer := 0;
begin
  if (select count(*) from public.crawl_jobs where status = 'running') >= max_jobs then
    return 0;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  if coalesce(v_cron_secret, '') = '' then
    return 0;
  end if;
  for r in
    select l.id as lead_id, a.id as audit_id, trim(a.website) as site
    from public.outreach_leads l
    join lateral (
      select au.id, au.website
      from public.ai_audits au
      where au.lead_id = l.id and coalesce(au.is_market, false) = false
        and coalesce(trim(au.website), '') <> ''
        and exists (select 1 from public.ai_audit_runs ru where ru.audit_id = au.id and ru.status in ('complete', 'capped'))
      order by au.created_at desc
      limit 1
    ) a on true
    where l.status not in ('closed', 'not_interested', 'opted_out', 'payment_received', 'refunded')
      and coalesce(l.is_archived, false) = false
      and not exists (select 1 from public.lead_crawl_checks c where c.lead_id = l.id)
      and not exists (select 1 from public.audit_crawl_backfill b where b.lead_id = l.id)
    order by l.updated_at desc nulls last
    limit per_tick
  loop
    insert into public.audit_crawl_backfill (lead_id, audit_id) values (r.lead_id, r.audit_id) on conflict do nothing;
    update public.audit_crawl_backfill set request_id = net.http_post(
      url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/crawl-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
        'apikey', coalesce(v_anon_key, ''),
        'x-internal-job', '1',
        'x-cron-secret', v_cron_secret
      ),
      body := jsonb_build_object('lead_id', r.lead_id, 'audit_id', r.audit_id, 'url', r.site, 'deep', true),
      timeout_milliseconds := 120000
    ) where lead_id = r.lead_id;
    n := n + 1;
  end loop;
  if n = 0 then
    perform cron.unschedule('audit-crawl-backfill');
  end if;
  return n;
end;
$function$;

revoke all on function public.audit_crawl_backfill_tick() from public, anon, authenticated;

-- Every minute until it unschedules itself. Applied AFTER crawl-check is deployed with the one-page-at-a-time rule.
select cron.schedule('audit-crawl-backfill', '* * * * *', 'select public.audit_crawl_backfill_tick()');
