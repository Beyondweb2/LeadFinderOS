-- ============================================================================
-- bulk_jobs — server-side bulk job tracking (bulk enrich + bulk site-gen).
--
-- RUN MANUALLY in the Supabase SQL editor (db push is desynced on this project);
-- this file keeps the repo a true source of truth. Idempotent.
--
-- A job = a list of lead ids processed server-side by the bulk-jobs edge function
-- in time-budgeted chunks (self-re-invoking, healed by the bulk-jobs-sweep cron),
-- so the operator can leave the page/browser mid-run and return to progress or
-- finished results. Per-item state lives in `items`; `updated_at` is touched after
-- every item and doubles as the liveness signal the sweeper checks.
-- ============================================================================

create table if not exists public.bulk_jobs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),  -- touched per item = liveness
  user_id       uuid not null references auth.users(id) on delete cascade,
  job_type      text not null check (job_type in ('enrich', 'site_gen')),
  status        text not null default 'queued'
                check (status in ('queued','running','done','failed','cancelled')),
  -- Per-item state: [{ lead_id, status: 'pending'|'done'|'cached'|'failed'
  --                    |'skipped_cap'|'skipped_existing', error? }]
  items         jsonb not null,
  total         int not null,
  done_count    int not null default 0,
  failed_count  int not null default 0,
  skipped_count int not null default 0,
  params        jsonb,             -- job-type params (e.g. { template, mode })
  locked_until  timestamptz,       -- runner claim: self-invoke chain vs sweeper mutex
  error         text
);

alter table public.bulk_jobs enable row level security;

-- Operators read ONLY their own jobs. No client INSERT/UPDATE/DELETE policies:
-- all writes go through the bulk-jobs edge function (service role bypasses RLS).
drop policy if exists "bulk_jobs read own" on public.bulk_jobs;
create policy "bulk_jobs read own" on public.bulk_jobs
  for select to authenticated using (user_id = auth.uid());

create index if not exists bulk_jobs_user_recent_idx on public.bulk_jobs (user_id, created_at desc);
create index if not exists bulk_jobs_active_idx on public.bulk_jobs (status, updated_at)
  where status in ('queued','running');
