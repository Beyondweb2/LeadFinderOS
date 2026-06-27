-- WhatsApp outreach system — schema + scheduler. RUN IN THE SUPABASE SQL EDITOR
-- (db push is desynced). Safe to re-run (idempotent).
--
-- Everything the processor needs:
--   a) per-lead WhatsApp fields on outreach_leads (status stays text; 'queued' is
--      just a string value — no enum change).
--   b) whatsapp_sends — audit row per send AND the source of truth for the daily
--      cap (count rows since UK midnight). Service-role only.
--   c) whatsapp_outreach_state — single row holding next_send_at for the randomised
--      spacing. Service-role only.
--   d) pg_cron job firing the processor every 10 min (the 7am–7pm UK window + the
--      10/day cap are enforced INSIDE the edge function, not by the schedule).

-- a) per-lead fields ---------------------------------------------------------
alter table public.outreach_leads
  add column if not exists whatsapp_template        text,
  add column if not exists queued_at                timestamptz,
  add column if not exists whatsapp_sent_at         timestamptz,
  add column if not exists whatsapp_message_id      text,
  add column if not exists whatsapp_delivery_status text;

-- b) sends audit + daily-cap source -----------------------------------------
create table if not exists public.whatsapp_sends (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  lead_id         uuid references public.outreach_leads(id) on delete set null,
  user_id         uuid,
  template        text,
  phone           text,
  business_name   text,
  claim_url       text,
  test_mode       boolean not null default true,
  message_id      text,
  delivery_status text,
  error           text
);
create index if not exists whatsapp_sends_created_idx on public.whatsapp_sends (created_at desc);
-- RLS on, NO policies → only the service-role (which bypasses RLS) can read/write.
-- The dashboard reads counts via the edge function, never directly.
alter table public.whatsapp_sends enable row level security;

-- c) scheduler state (single row) -------------------------------------------
create table if not exists public.whatsapp_outreach_state (
  id           int primary key default 1 check (id = 1),
  next_send_at timestamptz,
  updated_at   timestamptz not null default now()
);
insert into public.whatsapp_outreach_state (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_outreach_state enable row level security; -- service-role only

-- d) pg_cron: run the processor every 10 minutes ----------------------------
-- Mirrors the existing invoke_cron_run() vault pattern, pointed at THIS project.
create or replace function public.invoke_whatsapp_queue()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  if v_service_key is null then
    raise warning '[whatsapp-queue] service_role_key not found in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/process-whatsapp-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', coalesce(v_anon_key, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'whatsapp-queue-run';
select cron.schedule('whatsapp-queue-run', '*/10 * * * *', $$select public.invoke_whatsapp_queue()$$);
