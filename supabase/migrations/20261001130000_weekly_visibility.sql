-- ADMIN CONTROL CENTRE, release 4 (2026-09-30): the weekly visibility check.
-- ⛔ SEPARATE from the official baseline, the guarantee and the four-week re-measure: own tables, own
-- audit purpose ('weekly_check' — no pointer trigger reads it), never read by guarantee code.
-- Additive. RLS on, no policies: service role only (fn weekly-visibility writes, fn admin-overview reads).

-- 1. One FROZEN question set per client, chosen once (src/lib/weeklyCheck.ts chooseWeeklySet).
create table if not exists public.weekly_check_sets (
  lead_id uuid primary key,
  questions jsonb not null,
  from_hook integer not null default 0,
  from_baseline integer not null default 0,
  source_baseline_audit_id uuid,
  source_hook_audit_id uuid,
  start_reason text not null,
  frozen_at timestamptz not null default now()
);
alter table public.weekly_check_sets enable row level security;

-- Frozen means frozen: the questions can never be edited in place (a new set needs a deliberate delete).
create or replace function public.weekly_check_sets_frozen()
returns trigger language plpgsql as $$
begin
  if new.questions is distinct from old.questions then
    raise exception 'weekly_check_sets.questions is frozen for lead %', old.lead_id using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_weekly_check_sets_frozen on public.weekly_check_sets;
create trigger trg_weekly_check_sets_frozen before update on public.weekly_check_sets
  for each row execute function public.weekly_check_sets_frozen();

-- 2. One run per client per London week (the unique key is the "never twice a week" guard).
create table if not exists public.weekly_check_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  week_start date not null,
  audit_id uuid,
  status text not null check (status in ('starting', 'started', 'complete', 'failed')),
  estimate_usd numeric,
  cost_usd numeric,
  summary jsonb,
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (lead_id, week_start)
);
create index if not exists weekly_check_runs_lead_idx on public.weekly_check_runs (lead_id, week_start desc);
alter table public.weekly_check_runs enable row level security;

-- 3. The cron invoker (CRON_SECRET from the vault, x-internal-job) — same shape as the others.
create or replace function public.invoke_weekly_visibility()
returns void language plpgsql security definer
as $function$
declare v_cron_secret text;
begin
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/weekly-visibility',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_cron_secret, ''), 'x-internal-job', '1'),
    body := '{"action":"run"}'::jsonb
  );
end $function$;
revoke all on function public.invoke_weekly_visibility() from public;
revoke all on function public.invoke_weekly_visibility() from anon, authenticated;

-- 4. Hourly: starts at most one check per client per week, and folds finished ones. (Scheduled only
--    after the function is deployed and verified — see the release note.)
select cron.unschedule('weekly-visibility-run') where exists (select 1 from cron.job where jobname = 'weekly-visibility-run');
select cron.schedule('weekly-visibility-run', '15 * * * *', 'select public.invoke_weekly_visibility()');
