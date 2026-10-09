-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- TWILIO SMS + BROWSER CALLING (2026-10-09, feat/twilio-comms). Additive only.
--
-- ONE comms system, not a second one: SMS sits beside WhatsApp in the same Inbox (a channel toggle), reusing
-- the same lead scope (my_sales_lead_ids), the same notification bell, the same suppression list
-- (contact_suppressions) and the same abuse guard (guard_action). WhatsApp tables are NOT touched.
--
--   sms_messages        every SMS, both directions. Phone = E.164 DIGITS without "+" (the whatsapp_messages convention).
--                       twilio_sid unique, idempotency_key unique, so a retry or a duplicate webhook is a no-op.
--                       Written ONLY by the service role (the send function and the Twilio webhook).
--   sms_conversation_reads   per person per number read marker (the whatsapp_conversation_reads pattern).
--   call_logs           one row per browser call. Created by the voice-token function BEFORE the call; the number to
--                       dial is read from this row by the TwiML webhook, NEVER from the browser (no arbitrary dialling).
--
-- ⛔ A call row is not "contact": lead_reached_contact / lead_first_contact_at read call_outcome/contact_logged
-- activity only, so an opened workspace, a ringing call or an unanswered call changes no lead state. A rep still
-- logs the outcome (lead_log_contact) — an answered call is a prompt, not a conversation.
-- The old, unused sms_sends / sms_outreach_state / invoke_sms_queue are left exactly as they are.
-- Rollback: drop the three tables, the two functions, the trigger; re-run the previous notifications_kind_check.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('inbound', 'outbound')),
  user_id uuid,                       -- the book owner (data account), as whatsapp_messages.user_id
  lead_id uuid references public.outreach_leads(id) on delete set null,
  phone text not null,                -- E.164 digits, no "+"
  body text not null,
  twilio_sid text,
  status text not null check (status in ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'received', 'simulated')),
  error_code text,
  error text,
  segments integer,
  template_key text,                  -- which approved template/link kind this was, if any
  link_kind text check (link_kind in ('setup', 'agreement', 'website')),
  sent_by_user_id uuid,               -- the rep who pressed send (attribution); null for inbound
  idempotency_key text,
  test_mode boolean not null default false,
  est_cost_gbp numeric
);
create unique index if not exists sms_messages_twilio_sid_uq on public.sms_messages (twilio_sid) where twilio_sid is not null;
create unique index if not exists sms_messages_idem_uq on public.sms_messages (idempotency_key) where idempotency_key is not null;
create index if not exists sms_messages_phone_idx on public.sms_messages (phone, created_at);
create index if not exists sms_messages_lead_idx on public.sms_messages (lead_id, created_at);

alter table public.sms_messages enable row level security;
drop policy if exists sms_read_admin on public.sms_messages;
create policy sms_read_admin on public.sms_messages for select to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::app_role)));
drop policy if exists sms_read_sales on public.sms_messages;
create policy sms_read_sales on public.sms_messages for select to authenticated
  using ((select public.my_role()) = 'sales' and lead_id in (select public.my_sales_lead_ids()));
-- No insert/update/delete policy: every write is the service role's.

create table if not exists public.sms_conversation_reads (
  user_id uuid not null,
  phone text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, phone)
);
alter table public.sms_conversation_reads enable row level security;
drop policy if exists sms_reads_own on public.sms_conversation_reads;
create policy sms_reads_own on public.sms_conversation_reads for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.mark_sms_read(_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or _phone is null or _phone !~ '^[0-9]{6,16}$' then return; end if;
  insert into public.sms_conversation_reads (user_id, phone, last_read_at) values (auth.uid(), _phone, now())
  on conflict (user_id, phone) do update set last_read_at = excluded.last_read_at;
end $$;
revoke all on function public.mark_sms_read(text) from public, anon;
grant execute on function public.mark_sms_read(text) to authenticated;

-- Unread inbound SMS per number for the CALLER. security invoker: sms_messages' own RLS decides whose rows count
-- (a rep only ever counts their assigned, non-client leads; admin all).
create or replace function public.my_sms_unread_counts()
returns table (phone text, lead_id uuid, last_inbound_at timestamptz, unread_messages integer)
language sql stable security invoker set search_path = public as $$
  select m.phone, (array_agg(m.lead_id order by m.created_at desc) filter (where m.lead_id is not null))[1],
         max(m.created_at), count(*)::int
    from public.sms_messages m
    left join public.sms_conversation_reads r on r.user_id = auth.uid() and r.phone = m.phone
   where m.direction = 'inbound' and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
   group by m.phone
$$;
revoke all on function public.my_sms_unread_counts() from public, anon;
grant execute on function public.my_sms_unread_counts() to authenticated;

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references public.outreach_leads(id) on delete set null,
  user_id uuid not null,              -- the rep who placed the call (attribution)
  phone text not null,                -- E.164 digits, no "+" — chosen by the SERVER from the lead
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  call_sid text,
  status text not null default 'initiated'
    check (status in ('initiated', 'dialing', 'ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'canceled', 'simulated')),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_s integer,
  error_code text,
  error text,
  test_mode boolean not null default false,
  est_cost_gbp numeric
);
create unique index if not exists call_logs_sid_uq on public.call_logs (call_sid) where call_sid is not null;
create index if not exists call_logs_lead_idx on public.call_logs (lead_id, created_at);
create index if not exists call_logs_user_idx on public.call_logs (user_id, created_at);

alter table public.call_logs enable row level security;
drop policy if exists calls_read_admin on public.call_logs;
create policy calls_read_admin on public.call_logs for select to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::app_role)));
drop policy if exists calls_read_sales on public.call_logs;
create policy calls_read_sales on public.call_logs for select to authenticated
  using ((select public.my_role()) = 'sales' and (user_id = (select auth.uid()) or lead_id in (select public.my_sales_lead_ids())));

-- Realtime: the Inbox and the softphone listen to these.
do $$ begin
  begin alter publication supabase_realtime add table public.sms_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.call_logs; exception when duplicate_object then null; end;
end $$;

-- ── Notifications: a reply and a missed call ─────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
  'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update',
  'quick_close_review', 'quick_close_paid', 'transfer_request', 'team_update', 'team_task', 'client_info_request',
  'client_handoff', 'client_intake', 'client_onboarding', 'sms_reply', 'sms_failed', 'missed_call']));

create or replace function public.trg_notify_sms()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text;
begin
  if new.lead_id is null then return new; end if;
  v_to := public.lead_recipient(new.lead_id);
  select business_name into v_name from public.outreach_leads where id = new.lead_id;
  if new.direction = 'inbound' and new.status = 'received' then
    perform public.notify_person(v_to, 'sms_reply', 'SMS reply · ' || coalesce(v_name, 'a prospect'), left(new.body, 120),
      '/inbox?channel=sms&lead=' || new.lead_id::text, new.lead_id, 'sms_reply:' || new.id::text, 2::smallint);
  elsif new.direction = 'outbound' and new.status in ('failed', 'undelivered')
        and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_person(coalesce(new.sent_by_user_id, v_to), 'sms_failed', 'SMS not delivered · ' || coalesce(v_name, 'a prospect'),
      'The text did not arrive. Check the number, or send the link another way.',
      '/inbox?channel=sms&lead=' || new.lead_id::text, new.lead_id, 'sms_failed:' || new.id::text, 2::smallint);
  end if;
  return new;
exception when others then
  raise warning 'trg_notify_sms: %', sqlerrm;
  return new;
end $$;
drop trigger if exists trg_notify_sms on public.sms_messages;
create trigger trg_notify_sms after insert or update of status on public.sms_messages
  for each row execute function public.trg_notify_sms();

-- ── Activity kinds ───────────────────────────────────────────────────────────────────────────────────
alter table public.lead_activity drop constraint if exists lead_activity_kind_check;
alter table public.lead_activity add constraint lead_activity_kind_check check (kind = any (array[
  'lead_added', 'lead_claimed', 'lead_assigned', 'lead_unassigned', 'note', 'stage_changed', 'follow_up_set', 'call_booked',
  'call_outcome', 'website_control_set', 'audit_run', 'bulk_queued', 'marked_interested', 'details_set', 'archived_set',
  'contact_logged', 'crawl_run', 'report_link', 'state_changed', 'opted_out', 'transfer_requested', 'lost_reason_set',
  'payment_received', 'handoff_saved', 'onboarding_submitted', 'delivery_submitted', 'discovery_run', 'baseline_approved',
  'baseline_run', 'build_started', 'launched', 'payment_link_shared', 'client_info_requested', 'client_info_answered',
  'client_contact_opened', 'handoff_sent', 'client_intake', 'client_fact_set', 'onboarding_link_sent',
  'onboarding_form_submitted', 'whatsapp_facts_found', 'sms_sent', 'call_made']));

-- ── Abuse limits for the two new actions (guard_action treats an unknown action as PAID; these are people
--    pressing buttons, so they are unpaid with burst limits). ─────────────────────────────────────────────
update public.protection_settings
   set limits = jsonb_set(jsonb_set(limits, '{actions,sms_send}', '{"paid":false,"per_min":6,"per_hour":60,"per_day":200}'::jsonb, true),
                          '{actions,voice_call}', '{"paid":false,"per_min":6,"per_hour":120,"per_day":400}'::jsonb, true)
 where id = 1;

-- Read back:
--   select to_regclass('public.sms_messages'), to_regclass('public.call_logs'), to_regclass('public.sms_conversation_reads');
--   select limits -> 'actions' -> 'sms_send', limits -> 'actions' -> 'voice_call' from public.protection_settings;
--   select polname from pg_policy where polrelid in ('public.sms_messages'::regclass, 'public.call_logs'::regclass);
