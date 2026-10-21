-- 2026-10-21 (feat/whatsapp-rating-watcher): the WhatsApp number's quality rating and messaging tier, read from Meta
-- every 15 minutes by fn whatsapp-number-health. Additive only: nullable columns on the one-row whatsapp_outreach_state,
-- one append-only log table (service role only), one invoke function for the cron. docs/whatsapp-number-health.md.
-- The rules (yellow halves the cap, red pauses once, unreadable only blocks cap rises) are src/lib/whatsappNumberHealth.ts.

set local lock_timeout = '5s';

alter table public.whatsapp_outreach_state add column if not exists meta_quality_rating text;
alter table public.whatsapp_outreach_state add column if not exists meta_messaging_tier text;
alter table public.whatsapp_outreach_state add column if not exists meta_health_ok_at timestamptz;
alter table public.whatsapp_outreach_state add column if not exists meta_health_checked_at timestamptz;
alter table public.whatsapp_outreach_state add column if not exists meta_health_error text;
comment on column public.whatsapp_outreach_state.meta_quality_rating is 'Meta quality rating of WHATSAPP_PHONE_NUMBER_ID (GREEN / YELLOW / RED / UNKNOWN) at the last GOOD read. Written only by fn whatsapp-number-health.';
comment on column public.whatsapp_outreach_state.meta_messaging_tier is 'Meta messaging tier (e.g. TIER_1K) at the last good read. Written only by fn whatsapp-number-health.';
comment on column public.whatsapp_outreach_state.meta_health_ok_at is 'When the rating was last read successfully. Older than HEALTH_STALE_AFTER_MIN = cannot be read (cap rises blocked, sending untouched).';
comment on column public.whatsapp_outreach_state.meta_health_checked_at is 'When the watcher last tried (good or not).';
comment on column public.whatsapp_outreach_state.meta_health_error is 'Why the last try failed (Meta code / HTTP status, never a token). NULL after a good read.';

-- Append-only: every CHANGE (rating, tier, read failing / recovering, the red pause, a refused cap rise). Service role only.
create table if not exists public.whatsapp_number_health_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('rating_changed', 'tier_changed', 'read_failed', 'read_recovered', 'paused_red', 'cap_rise_refused')),
  from_value text,
  to_value text,
  detail text
);
alter table public.whatsapp_number_health_log enable row level security;
revoke all on public.whatsapp_number_health_log from anon, authenticated;
create index if not exists whatsapp_number_health_log_created_idx on public.whatsapp_number_health_log (created_at desc);

-- The cron's caller (same shape as invoke_whatsapp_queue: secrets from the vault, never in the job text).
create or replace function public.invoke_whatsapp_number_health()
returns void language plpgsql security definer set search_path = public as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name='SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name='SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name='CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/whatsapp-number-health',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || coalesce(v_service_key,''),
      'apikey', coalesce(v_anon_key,''),
      'x-cron-secret', coalesce(v_cron_secret,'')
    ),
    body := jsonb_build_object('mode','check','triggered_by','pg_cron')
  );
end $$;
revoke all on function public.invoke_whatsapp_number_health() from public, anon, authenticated;

-- The cron job itself lives only in the database (CLAUDE.md §7) and is created by hand after merge:
--   select cron.schedule('whatsapp-number-health-run', '*/15 * * * *', 'select public.invoke_whatsapp_number_health();');
-- Read back:
--   select meta_quality_rating, meta_messaging_tier, meta_health_ok_at, meta_health_error from public.whatsapp_outreach_state;
