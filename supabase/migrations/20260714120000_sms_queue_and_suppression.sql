-- SMS outreach queue + cross-channel suppression — schema + scheduler.
-- RUN IN THE SUPABASE SQL EDITOR (db push is desynced for this project). Idempotent.
--
-- Mirrors the WhatsApp outreach system (20260627130000_whatsapp_outreach.sql):
--   a) per-lead SMS fields on outreach_leads (status stays text; 'sms_queued' /
--      'sms_failed' / 'opted_out' are just string values — no enum change).
--   b) sms_sends — audit row per send AND the source of truth for the daily cap
--      (count rows since UK midnight). Service-role only.
--   c) sms_outreach_state — single row holding next_send_at + paused for the
--      randomised spacing. Service-role only.
--   d) contact_suppressions — CHANNEL-AGNOSTIC opt-out list keyed by E.164 phone.
--      "One no = suppressed everywhere": both the SMS processor AND the WhatsApp
--      processor check this before sending. Fed by inbound STOP (twilio-inbound).
--   e) pg_cron job firing process-sms-queue every 10 min (window/cap/spacing are
--      enforced INSIDE the edge function). ⚠️ RUN THE CRON BLOCK ONLY AFTER the
--      function is deployed AND you're ready — until then it would 404 (harmless).

-- a) per-lead SMS fields -----------------------------------------------------
alter table public.outreach_leads
  add column if not exists sms_queued_at       timestamptz,
  add column if not exists sms_sent_at         timestamptz,
  add column if not exists sms_message_sid     text,
  add column if not exists sms_delivery_status text,
  add column if not exists sms_attempts        int not null default 0;

-- b) sms sends audit + daily-cap source --------------------------------------
create table if not exists public.sms_sends (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  lead_id         uuid references public.outreach_leads(id) on delete set null,
  user_id         uuid,
  template        text,
  phone           text,            -- E.164 (+44…) the message was sent to
  business_name   text,
  claim_url       text,
  body            text,            -- exact body sent (incl. the STOP line) for audit
  segments        int,             -- SMS segment count (flags multi-segment sends)
  test_mode       boolean not null default true,
  message_sid     text,            -- Twilio Message SID
  delivery_status text,            -- queued|accepted|sent|delivered|undelivered|failed|simulated
  error_code      text,            -- Twilio error code (e.g. 21610 = STOP'd, 30007 = filtered)
  error           text
);
create index if not exists sms_sends_created_idx on public.sms_sends (created_at desc);
create index if not exists sms_sends_sid_idx     on public.sms_sends (message_sid);
-- RLS on, NO policies → only the service-role (which bypasses RLS) can read/write.
alter table public.sms_sends enable row level security;

-- c) scheduler state (single row) --------------------------------------------
create table if not exists public.sms_outreach_state (
  id           int primary key default 1 check (id = 1),
  next_send_at timestamptz,
  paused       boolean not null default false,
  updated_at   timestamptz not null default now()
);
insert into public.sms_outreach_state (id) values (1) on conflict (id) do nothing;
alter table public.sms_outreach_state enable row level security; -- service-role only

-- d) cross-channel suppression list ------------------------------------------
-- Keyed by canonical E.164 (+44…). channel-agnostic: a STOP on SMS suppresses the
-- number on EVERY channel. reason/source are for audit only.
create table if not exists public.contact_suppressions (
  id          uuid primary key default gen_random_uuid(),
  phone_e164  text not null unique,   -- '+447…' canonical
  reason      text,                   -- e.g. 'sms_stop'
  source      text,                   -- e.g. 'twilio_inbound'
  created_at  timestamptz not null default now()
);
create index if not exists contact_suppressions_phone_idx on public.contact_suppressions (phone_e164);
alter table public.contact_suppressions enable row level security; -- service-role only

-- e) pg_cron: run the SMS processor every 10 minutes -------------------------
-- ⚠️ RUN THIS BLOCK ONLY AFTER `process-sms-queue` is deployed and you're ready to
--    let it tick (it stays DRY-RUN until SMS_TEST_MODE='off', so ticking is safe —
--    it just logs "WOULD SEND"). Mirrors invoke_whatsapp_queue() exactly.
create or replace function public.invoke_sms_queue()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_service_key text;
  v_anon_key    text;
begin
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  if v_service_key is null then
    raise warning '[sms-queue] service_role_key not found in vault';
    return;
  end if;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/process-sms-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'apikey', coalesce(v_anon_key, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end;
$$;

-- select cron.unschedule(jobid) from cron.job where jobname = 'sms-queue-run';
-- select cron.schedule('sms-queue-run', '*/10 * * * *', $$select public.invoke_sms_queue()$$);
