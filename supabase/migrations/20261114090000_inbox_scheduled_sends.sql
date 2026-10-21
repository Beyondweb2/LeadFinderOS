-- INBOX SEND WINDOW (2026-10-21, feat/inbox-send-window). Every Inbox send outside the lead's local send window is SAVED here by
-- the send function (after every one of its own checks) and sent by fn inbox-scheduled-send when the window opens. The rules
-- (hours, next opening, holds) live in src/lib/inboxSendWindow.ts.
--
-- ⛔ SERVICE-ROLE ONLY: RLS on, no policies, no grants to anon/authenticated. The Inbox reads and changes rows only through the
--    role-checked functions below (admin: every row; a salesperson: rows they queued or for leads assigned to them).
-- ⛔ A STOP CANCELS: any contact_suppressions row written for the number or the lead cancels its waiting rows (trigger), so an
--    opt-out / angry reply recorded by ANY path (the reply drafter's stop, the triage phrases, an SMS STOP, Mark opted out) wins.
-- ⛔ This touches nothing in the WhatsApp drip (outreach_leads.status = 'queued', whatsapp_queue_state) and unpauses nothing.
--
-- Apply ONE statement block at a time; read back with the queries at the end. Rollback:
--   select cron.unschedule('inbox-scheduled-send-run');
--   drop trigger if exists trg_inbox_scheduled_cancel_on_suppression on public.contact_suppressions;
--   drop table if exists public.inbox_scheduled_sends;  (and the functions below)
--   alter table public.whatsapp_outreach_state drop column if exists reply_start_min, drop column if exists reply_end_min;

-- 1. the one setting: Inbox reply hours (minutes after local midnight, in the market's own zone). NULL = the outreach hours.
alter table public.whatsapp_outreach_state add column if not exists reply_start_min integer;
alter table public.whatsapp_outreach_state add column if not exists reply_end_min integer;

-- 2. the scheduled sends
create table if not exists public.inbox_scheduled_sends (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,                                   -- the BOOK (whatsapp_messages.user_id of the thread)
  lead_id         uuid references public.outreach_leads(id) on delete cascade,
  phone           text not null,                                   -- WhatsApp digits ('447…'), the thread key
  channel         text not null check (channel in ('whatsapp', 'sms')),
  kind            text not null check (kind in ('text', 'template', 'voice')),
  body            text,                                            -- free text, or the built template / voice label (what the thread shows)
  template_name   text,
  allow_resend    boolean not null default false,
  link_variant    text,
  sms_extended    jsonb,                                           -- SMS: { template, body } built at queue time by the WhatsApp dry run
  media_path      text,                                            -- voice: the stored Ogg in bucket whatsapp-media
  duration_ms     integer,
  send_at         timestamptz not null,
  tz              text not null,
  status          text not null default 'scheduled'
                  check (status in ('scheduled', 'sending', 'sent', 'held', 'cancelled', 'failed')),
  hold_reason     text check (hold_reason is null or hold_reason in ('replied_since', 'window_expired')),
  cancel_reason   text,
  error           text,
  checked_at      timestamptz not null default now(),             -- the person last looked (queued / edited / released)
  queued_by       uuid not null,                                   -- who pressed Send; the drain sends AS them (role re-read)
  sent_message_id text,
  claimed_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists inbox_scheduled_sends_due_idx on public.inbox_scheduled_sends (send_at, created_at) where status = 'scheduled';
create index if not exists inbox_scheduled_sends_thread_idx on public.inbox_scheduled_sends (phone, channel, created_at);
create index if not exists inbox_scheduled_sends_lead_idx on public.inbox_scheduled_sends (lead_id);
alter table public.inbox_scheduled_sends enable row level security;
revoke all on public.inbox_scheduled_sends from anon, authenticated;

-- 3. who may see / change a row
create or replace function public._inbox_scheduled_may(_r public.inbox_scheduled_sends)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and (
    public.my_role() = 'admin'
    or _r.queued_by = auth.uid()
    or exists (select 1 from public.outreach_leads l where l.id = _r.lead_id and l.assigned_to_user_id = auth.uid())
  );
$$;
revoke all on function public._inbox_scheduled_may(public.inbox_scheduled_sends) from public, anon, authenticated;

-- 4. the Inbox's read: waiting rows, plus anything that did not go in the last two days (so a failure is seen)
create or replace function public.my_inbox_scheduled_sends()
returns table (id uuid, lead_id uuid, phone text, channel text, kind text, body text, template_name text, send_at timestamptz,
               tz text, status text, hold_reason text, cancel_reason text, error text, created_at timestamptz, queued_by uuid)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.lead_id, s.phone, s.channel, s.kind, s.body, s.template_name, s.send_at, s.tz, s.status, s.hold_reason,
         s.cancel_reason, s.error, s.created_at, s.queued_by
  from public.inbox_scheduled_sends s
  where public.my_role() in ('admin', 'sales')
    and (s.status in ('scheduled', 'sending', 'held')
         or (s.status = 'failed' and s.updated_at > now() - interval '2 days')
         or (s.status = 'cancelled' and coalesce(s.cancel_reason, '') <> 'by_person' and s.updated_at > now() - interval '2 days'))
    and public._inbox_scheduled_may(s)
  order by s.created_at
  limit 2000;
$$;
revoke all on function public.my_inbox_scheduled_sends() from public, anon;
grant execute on function public.my_inbox_scheduled_sends() to authenticated;

-- 5. edit (free text only; editing is looking, so a "they replied since" hold is released)
create or replace function public.inbox_scheduled_edit(_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.inbox_scheduled_sends; b text := btrim(coalesce(_body, ''));
begin
  select * into r from public.inbox_scheduled_sends where id = _id for update;
  if not found or not public._inbox_scheduled_may(r) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status not in ('scheduled', 'held') then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', r.status); end if;
  if r.kind <> 'text' then return jsonb_build_object('ok', false, 'error', 'not_editable'); end if;
  if length(b) < 1 or length(b) > (case when r.channel = 'sms' then 600 else 4096 end) then
    return jsonb_build_object('ok', false, 'error', 'bad_length');
  end if;
  update public.inbox_scheduled_sends
     set body = b, checked_at = now(), updated_at = now(),
         status = case when status = 'held' and hold_reason = 'replied_since' then 'scheduled' else status end,
         hold_reason = case when status = 'held' and hold_reason = 'replied_since' then null else hold_reason end
   where id = _id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.inbox_scheduled_edit(uuid, text) from public, anon;
grant execute on function public.inbox_scheduled_edit(uuid, text) to authenticated;

-- 6. cancel
create or replace function public.inbox_scheduled_cancel(_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.inbox_scheduled_sends;
begin
  select * into r from public.inbox_scheduled_sends where id = _id for update;
  if not found or not public._inbox_scheduled_may(r) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status not in ('scheduled', 'held') then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', r.status); end if;
  update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'by_person', updated_at = now() where id = _id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.inbox_scheduled_cancel(uuid) from public, anon;
grant execute on function public.inbox_scheduled_cancel(uuid) to authenticated;

-- 7. release a "they replied since" hold: the person has read the new message and still wants it to go (at the window, as before)
create or replace function public.inbox_scheduled_release(_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.inbox_scheduled_sends;
begin
  select * into r from public.inbox_scheduled_sends where id = _id for update;
  if not found or not public._inbox_scheduled_may(r) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'held' or r.hold_reason is distinct from 'replied_since' then return jsonb_build_object('ok', false, 'error', 'not_releasable'); end if;
  update public.inbox_scheduled_sends set status = 'scheduled', hold_reason = null, checked_at = now(),
         send_at = greatest(send_at, now()), updated_at = now() where id = _id;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.inbox_scheduled_release(uuid) from public, anon;
grant execute on function public.inbox_scheduled_release(uuid) to authenticated;

-- 8. the reply-hours setting: any role reads it, only the admin changes it (both NULL = the outreach hours)
create or replace function public.inbox_reply_hours()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when public.my_role() in ('admin', 'sales')
    then (select jsonb_build_object('reply_start_min', reply_start_min, 'reply_end_min', reply_end_min) from public.whatsapp_outreach_state where id = 1)
    else null end;
$$;
revoke all on function public.inbox_reply_hours() from public, anon;
grant execute on function public.inbox_reply_hours() to authenticated;

create or replace function public.set_inbox_reply_hours(_start integer, _end integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if public.my_role() is distinct from 'admin' then return jsonb_build_object('ok', false, 'error', 'admin_only'); end if;
  if (_start is null) <> (_end is null) then return jsonb_build_object('ok', false, 'error', 'both_or_neither'); end if;
  if _start is not null and (_start < 0 or _end > 1440 or _start >= _end) then return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  update public.whatsapp_outreach_state set reply_start_min = _start, reply_end_min = _end where id = 1;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.set_inbox_reply_hours(integer, integer) from public, anon;
grant execute on function public.set_inbox_reply_hours(integer, integer) to authenticated;

-- 9. a stop cancels: any suppression for the number or the lead cancels its waiting rows
create or replace function public._inbox_scheduled_cancel_on_suppression()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.inbox_scheduled_sends s
     set status = 'cancelled', updated_at = now(),
         cancel_reason = case when new.reason = 'opted_out' then 'opted_out'
                              when new.wrong_number_at is not null or new.reason = 'wrong_number' then 'wrong_number'
                              else 'lead_stopped' end
   where s.status in ('scheduled', 'held')
     and (s.phone = ltrim(coalesce(new.phone_e164, ''), '+') or (new.lead_id is not null and s.lead_id = new.lead_id));
  return new;
end; $$;
drop trigger if exists trg_inbox_scheduled_cancel_on_suppression on public.contact_suppressions;
create trigger trg_inbox_scheduled_cancel_on_suppression
  after insert or update on public.contact_suppressions
  for each row execute function public._inbox_scheduled_cancel_on_suppression();

-- 10. the clock: every minute, same pattern as the SMS queue (vault secrets, x-cron-secret). The function does nothing when no row is due.
--     ⚠️ Schedule ONLY after fn inbox-scheduled-send is deployed.
create or replace function public.invoke_inbox_scheduled_send()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.inbox_scheduled_sends where status = 'scheduled' and send_at <= now()) then return; end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/inbox-scheduled-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron', 'ts', now())
  );
end; $function$;
revoke all on function public.invoke_inbox_scheduled_send() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'inbox-scheduled-send-run';
select cron.schedule('inbox-scheduled-send-run', '* * * * *', $$select public.invoke_inbox_scheduled_send()$$);

-- Read back:
--   select column_name from information_schema.columns where table_name = 'inbox_scheduled_sends' order by ordinal_position;
--   select column_name from information_schema.columns where table_name = 'whatsapp_outreach_state' and column_name like 'reply_%';
--   select tgname from pg_trigger where tgname = 'trg_inbox_scheduled_cancel_on_suppression';
--   select relrowsecurity from pg_class where relname = 'inbox_scheduled_sends';
--   select jobname, schedule, active from cron.job where jobname = 'inbox-scheduled-send-run';
