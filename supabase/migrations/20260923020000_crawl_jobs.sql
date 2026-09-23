-- EXHAUSTIVE MANUAL CRAWLS as resumable background jobs (2026-09-23).
--
-- A user-triggered crawl no longer lives inside one edge request. crawl-check creates a crawl_jobs
-- row and seeds its frontier (crawl_urls); crawl-worker drains the frontier in batches, persisting
-- every URL's state, and finishes only when no eligible URL is left queued. A worker that dies
-- mid-batch loses nothing: the next tick (self-chained, with a one-minute cron backstop) takes the
-- expired lease and re-queues what was in flight.
--
-- ADDITIVE AND IDEMPOTENT. Service-role only: RLS on, no policies — every read goes through an edge
-- function that checks the operator.

create table if not exists public.crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.outreach_leads(id) on delete cascade,
  user_id uuid,
  mode text not null default 'full',
  requested_from text,
  start_url text not null,
  served_url text,
  status text not null default 'running'
    check (status in ('running', 'complete', 'complete_with_failures', 'failed', 'cancelled')),
  lease_until timestamptz,
  ticks integer not null default 0,
  error text,
  robots_txt text,
  home jsonb,
  summary jsonb,
  result jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists crawl_jobs_lead_idx on public.crawl_jobs (lead_id, started_at desc);
create index if not exists crawl_jobs_running_idx on public.crawl_jobs (status) where status = 'running';
alter table public.crawl_jobs enable row level security;

create table if not exists public.crawl_urls (
  id bigserial primary key,
  job_id uuid not null references public.crawl_jobs(id) on delete cascade,
  url text not null,
  kind text not null default 'page' check (kind in ('page', 'sitemap')),
  source text,
  depth integer not null default 0,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0,
  http_status integer,
  final_url text,
  error text,
  evidence jsonb,
  discovered_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (job_id, url)
);
create index if not exists crawl_urls_frontier_idx on public.crawl_urls (job_id, status, kind, depth, id);
alter table public.crawl_urls enable row level security;

-- The lead's canonical crawl row points at the job that produced it.
alter table public.lead_crawl_checks add column if not exists job_id uuid;

-- Progress counts in one call (the UI polls this through crawl-check `status`).
create or replace function public.crawl_job_counts(p_job uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'discovered', count(*) filter (where kind = 'page'),
    'queued', count(*) filter (where kind = 'page' and status = 'queued'),
    'processing', count(*) filter (where kind = 'page' and status = 'processing'),
    'done', count(*) filter (where kind = 'page' and status = 'done'),
    'failed', count(*) filter (where kind = 'page' and status = 'failed'),
    'skipped', count(*) filter (where kind = 'page' and status = 'skipped'),
    'sitemaps', count(*) filter (where kind = 'sitemap'),
    'sitemaps_pending', count(*) filter (where kind = 'sitemap' and status in ('queued', 'processing'))
  ) from public.crawl_urls where job_id = p_job
$$;
revoke all on function public.crawl_job_counts(uuid) from public, anon, authenticated;

-- The one-minute backstop: wakes crawl-worker only when a crawl is running. The worker also chains
-- itself, so this only matters when a chain link is lost.
create or replace function public.invoke_crawl_worker()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.crawl_jobs where status = 'running'
                 and (lease_until is null or lease_until < now())) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/crawl-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('action', 'tick', 'triggered_by', 'pg_cron')
  );
end; $$;
revoke all on function public.invoke_crawl_worker() from public, anon, authenticated;

-- Scheduled separately (cron lives only in the database): see docs/exhaustive-crawl.md.
-- select cron.schedule('crawl-worker-run', '* * * * *', 'select public.invoke_crawl_worker()');
