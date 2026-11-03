-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RE-CRAWL OPEN LEADS WITH THE CORRECTED WEBSITE CHECKS (2026-11-03, docs/website-check.md).
--
-- The audit of 2026-11-03 found at least 38 of 127 serious website claims false. Readers already hold back what an older check
-- got wrong (siteAudit.heldOnOlderCheck); this replaces the stored checks with new ones, SLOWLY, through crawl-check's existing
-- catch-up door (prospects only; it refuses a paid client and any pause):
--
--   · the list is taken once, here: open CRM leads with a stored check whose lead has a website, newest activity first;
--   · WEBSITE_CHECK_RECRAWL_PER_TICK leads a minute, each at most once, paused while MAX_JOBS deep crawls are running;
--   · when nothing is left it unschedules itself.
-- ⛔ Nothing here writes a lead, sends anything or starts an audit. Apply AFTER crawl-check and crawl-worker are deployed.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.website_check_recrawl (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  rank bigint not null,
  requested_at timestamptz,
  request_id bigint
);
alter table public.website_check_recrawl enable row level security;
-- No policies: service role only.
revoke all on public.website_check_recrawl from anon, authenticated;

insert into public.website_check_recrawl (lead_id, rank)
select l.id, row_number() over (order by l.updated_at desc nulls last)
from public.lead_crawl_checks c
join public.outreach_leads l on l.id = c.lead_id
where l.status not in ('closed', 'not_interested', 'opted_out', 'payment_received', 'refunded')
  and coalesce(l.is_archived, false) = false
  and coalesce(l.amount_paid, 0) = 0
on conflict (lead_id) do nothing;

create or replace function public.website_check_recrawl_tick()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  per_tick constant integer := 2;    -- WEBSITE_CHECK_RECRAWL_PER_TICK
  max_jobs constant integer := 8;    -- WEBSITE_CHECK_RECRAWL_MAX_JOBS
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
    select lead_id from public.website_check_recrawl where requested_at is null order by rank limit per_tick
  loop
    update public.website_check_recrawl set requested_at = now(), request_id = net.http_post(
      url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/crawl-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
        'apikey', coalesce(v_anon_key, ''),
        'x-internal-job', '1',
        'x-cron-secret', v_cron_secret
      ),
      body := jsonb_build_object('lead_id', r.lead_id, 'mode', 'full', 'requested_from', 'catch_up'),
      timeout_milliseconds := 120000
    ) where lead_id = r.lead_id;
    n := n + 1;
  end loop;
  if n = 0 then
    perform cron.unschedule('website-check-recrawl');
  end if;
  return n;
end;
$function$;

revoke all on function public.website_check_recrawl_tick() from public, anon, authenticated;

select cron.schedule('website-check-recrawl', '* * * * *', 'select public.website_check_recrawl_tick()');
