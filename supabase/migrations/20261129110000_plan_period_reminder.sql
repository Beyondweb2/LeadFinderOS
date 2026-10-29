-- THE PLAN-PERIOD REMINDER (Client Service Agreement v6, clause 9A.5 — 2026-10-29, Paul).
-- "We will remind you before the Plan Period ends that you can opt in." Pay in full / 6 months / 12 months on v6.
-- ADDITIVE ONLY: one nullable column + its stamping trigger on outreach_leads, two new tables, one function, one cron job.
-- Rollback:
--   select cron.unschedule('plan-period-reminder-run');
--   drop function if exists public.invoke_plan_period_reminder();
--   drop trigger if exists trg_stamp_site_first_live on public.outreach_leads; drop function if exists public._stamp_site_first_live();
--   drop table if exists public.plan_period_reminders; drop table if exists public.plan_period_reminder_settings;
--   alter table public.outreach_leads drop column if exists site_first_live_at;
set lock_timeout = '5s';

-- site_first_live_at — v6 2.6 / 9.2: on Pay in full the Plan Period (and its included hosting) runs until 6 months
-- after the website we build FIRST goes live. Stamped by the DB, once, the first time the build is recorded live
-- (production_status deployed / verified, or the v1 deploy_status 'production'), by whichever writer records it.
-- Never moves once set. A site already live before this migration stays NULL (its go-live day is unknown) — for
-- the reminder that means "no date", never a guessed one. Plain nullable column: no table rewrite.
alter table public.outreach_leads add column if not exists site_first_live_at timestamptz;

create or replace function public._stamp_site_first_live()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare v_new_live boolean; v_old_live boolean := false;
begin
  if tg_op = 'UPDATE' and old.site_first_live_at is not null then
    new.site_first_live_at := old.site_first_live_at;  -- immutable once set
    return new;
  end if;
  v_new_live := coalesce(new.website_build->>'production_status', '') in ('deployed', 'verified')
             or coalesce(new.website_build->>'deploy_status', '') = 'production';
  if tg_op = 'UPDATE' then
    v_old_live := coalesce(old.website_build->>'production_status', '') in ('deployed', 'verified')
               or coalesce(old.website_build->>'deploy_status', '') = 'production';
  end if;
  if v_new_live and not v_old_live then
    new.site_first_live_at := now();
  elsif tg_op = 'UPDATE' then
    new.site_first_live_at := old.site_first_live_at;  -- only the transition stamps it; no writer sets it by hand
  else
    new.site_first_live_at := null;
  end if;
  return new;
end $function$;

drop trigger if exists trg_stamp_site_first_live on public.outreach_leads;
create trigger trg_stamp_site_first_live
  before insert or update of website_build, site_first_live_at on public.outreach_leads
  for each row execute function public._stamp_site_first_live();

-- plan_period_reminders — ONE ROW PER CLIENT, EVER (primary key lead_id). fn plan-period-reminder CLAIMS the row
-- first, then sends, then records the outcome. A failed send is Paul's to look at, never retried blind.
-- plan_period_reminder_settings — the KILL SWITCH. Switched ON here (Paul, 2026-10-29: "It must be scheduled"): on
-- the day of this migration no client has signed v6, so nobody is in a reminder window.
-- Both service-role only: RLS on, no policies.
create table if not exists public.plan_period_reminders (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  agreement_acceptance_id uuid references public.client_agreement_acceptances(id) on delete set null,
  payment_plan text not null check (payment_plan in ('full', 'six', 'twelve')),
  period_end_day date not null,
  sent_to text not null,
  channel text not null default 'email' check (channel in ('email')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'simulated')),
  provider_id text,
  detail jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  triggered_by text not null default 'cron'
);
alter table public.plan_period_reminders enable row level security;
revoke all on public.plan_period_reminders from anon, authenticated;

create table if not exists public.plan_period_reminder_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.plan_period_reminder_settings enable row level security;
revoke all on public.plan_period_reminder_settings from anon, authenticated;
insert into public.plan_period_reminder_settings (id, enabled, updated_by) values (true, true, 'migration') on conflict (id) do nothing;

-- The daily run (10:15 UTC). Posts only while the switch is on.
create or replace function public.invoke_plan_period_reminder()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not coalesce((select enabled from public.plan_period_reminder_settings where id), false) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/plan-period-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('mode', 'run', 'triggered_by', 'pg_cron')
  );
end $function$;
revoke all on function public.invoke_plan_period_reminder() from public, anon, authenticated;

select cron.schedule('plan-period-reminder-run', '15 10 * * *', 'select public.invoke_plan_period_reminder()')
 where not exists (select 1 from cron.job where jobname = 'plan-period-reminder-run');

-- Verify (read back):
--   select * from public.plan_period_reminder_settings;
--   select jobname, schedule, command from cron.job where jobname = 'plan-period-reminder-run';
--   select relrowsecurity from pg_class where relname in ('plan_period_reminders', 'plan_period_reminder_settings');
--   select tgname from pg_trigger where tgname = 'trg_stamp_site_first_live';
