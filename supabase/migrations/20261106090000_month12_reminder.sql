-- THE PAYMENT-12 REMINDER (Client Service Agreement v5, clause 9A.5 — 2026-10-17, Paul).
-- ADDITIVE ONLY: two new tables, one new function, one new cron job. Nothing existing is changed.
-- Rollback:
--   select cron.unschedule('month12-reminder-run');
--   drop function if exists public.invoke_month12_reminder();
--   drop table if exists public.month12_reminders; drop table if exists public.month12_reminder_settings;
--
-- month12_reminders — ONE ROW PER CLIENT, EVER (primary key lead_id). fn month12-reminder CLAIMS the row first
-- (insert … on conflict do nothing), then sends, then records the outcome. A client with a row is never reminded
-- again, whatever its status (a failed send is Paul's to look at, never retried blind: Resend may have accepted it).
-- month12_reminder_settings — the KILL SWITCH. One row; `enabled` false = the scheduled run sends nothing.
-- Both service-role only: RLS on, no policies (anon/authenticated read nothing).
create table if not exists public.month12_reminders (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  agreement_acceptance_id uuid references public.client_agreement_acceptances(id) on delete set null,
  payment12_day date not null,
  sent_to text not null,
  channel text not null default 'email' check (channel in ('email')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'failed', 'simulated')),
  provider_id text,
  detail jsonb not null default '{}'::jsonb,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  triggered_by text not null default 'cron'
);
alter table public.month12_reminders enable row level security;
revoke all on public.month12_reminders from anon, authenticated;

create table if not exists public.month12_reminder_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.month12_reminder_settings enable row level security;
revoke all on public.month12_reminder_settings from anon, authenticated;
insert into public.month12_reminder_settings (id, enabled, updated_by) values (true, false, 'migration') on conflict (id) do nothing;

-- The daily run (10:00 UK in winter, 11:00 in summer). Posts only while the switch is on.
create or replace function public.invoke_month12_reminder()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not coalesce((select enabled from public.month12_reminder_settings where id), false) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/month12-reminder',
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
revoke all on function public.invoke_month12_reminder() from public, anon, authenticated;

select cron.schedule('month12-reminder-run', '0 10 * * *', 'select public.invoke_month12_reminder()')
 where not exists (select 1 from cron.job where jobname = 'month12-reminder-run');

-- Verify (read back):
--   select * from public.month12_reminder_settings;
--   select jobname, schedule, command from cron.job where jobname = 'month12-reminder-run';
--   select relrowsecurity from pg_class where relname in ('month12_reminders', 'month12_reminder_settings');
