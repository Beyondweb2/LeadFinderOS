-- ADMIN CONTROL CENTRE, release 6 (2026-09-30): the AI business summary.
-- One row per generated briefing: the exact facts the model was given, its words, and whether every
-- number in them was found in those facts (status 'ok'), or not ('rejected' — then the page shows the
-- deterministic checks instead). Advisory only: nothing reads the words to decide anything.
-- Additive. RLS on, no policies: service role only (fn business-summary writes, fn admin-overview reads).
create table if not exists public.admin_summaries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('weekly', 'on_demand')),
  period_label text not null,
  period_from date,
  period_to date,
  model text,
  prompt_version text,
  facts jsonb not null,
  summary text,
  look_at jsonb,
  status text not null check (status in ('ok', 'rejected', 'error')),
  reason text,
  cost_usd numeric,
  requested_by uuid
);
create index if not exists admin_summaries_created_idx on public.admin_summaries (created_at desc);
alter table public.admin_summaries enable row level security;

create or replace function public.invoke_business_summary()
returns void language plpgsql security definer set search_path = public
as $function$
declare v_cron_secret text;
begin
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/business-summary',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v_cron_secret, ''), 'x-internal-job', '1'),
    body := '{"kind":"weekly"}'::jsonb
  );
end $function$;
revoke all on function public.invoke_business_summary() from public;
revoke all on function public.invoke_business_summary() from anon, authenticated;

-- Mondays 06:30 UTC (07:30 London in BST, 06:30 in GMT): last week, Monday–Sunday London.
select cron.unschedule('business-summary-weekly') where exists (select 1 from cron.job where jobname = 'business-summary-weekly');
select cron.schedule('business-summary-weekly', '30 6 * * 1', 'select public.invoke_business_summary()');
