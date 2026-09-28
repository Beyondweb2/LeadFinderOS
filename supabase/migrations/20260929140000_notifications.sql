-- Sales Experience, release 3 (2026-09-28): the NOTIFICATION CENTRE. Additive only.
-- docs/sales-experience.md §5.
--
-- ⛔ PER PERSON, SERVER-WRITTEN. A row belongs to ONE recipient; the browser can read its own and mark
-- them read / cleared through the two functions below — it can never write, forge or read anyone else's.
-- ⛔ A NOTIFICATION NEVER BLOCKS THE THING IT REPORTS. Every trigger here swallows its own failure
-- (EXCEPTION WHEN OTHERS → a warning): a WhatsApp reply, a page hit, an audit or a reassignment is
-- written whatever happens to its notification.
-- ⛔ NO DUPLICATE SPAM. unique (user_id, dedupe_key) makes every event idempotent; WhatsApp replies
-- COALESCE — while a reply notification for a lead is unread, a new reply updates it ("3 new messages")
-- instead of adding another.
-- Payments and commission are written by the ledger writer (_shared/payment-ledger.ts), where the
-- commission rule lives — never re-implemented in SQL.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'whatsapp_reply', 'whatsapp_failed', 'signup_opened', 'client_paid', 'commission_earned', 'commission_reversed',
    'audit_finished', 'template_decided', 'follow_up_due', 'lead_assigned', 'feedback_update', 'feature_update')),
  title text not null,
  body text,
  link text check (link is null or link like '/%'),
  lead_id uuid,
  priority smallint not null default 1,
  count integer not null default 1,
  dedupe_key text not null,
  read_at timestamptz,
  cleared_at timestamptz,
  constraint notifications_dedupe_uq unique (user_id, dedupe_key)
);
create index if not exists notifications_inbox_idx on public.notifications (user_id, created_at desc) where cleared_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));

-- Live updates for the bell (RLS applies to realtime too: a person receives only their own rows).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ── Reading / clearing: the caller's own rows only ─────────────────────────────────────────────────
create or replace function public.mark_notifications_read(_ids uuid[] default null)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (_ids is null or id = any(_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.clear_notifications(_ids uuid[] default null)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  update public.notifications set cleared_at = now(), read_at = coalesce(read_at, now())
    where user_id = auth.uid() and cleared_at is null and (_ids is null or id = any(_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.clear_notifications(uuid[]) from public, anon;
grant execute on function public.clear_notifications(uuid[]) to authenticated;

-- ── The one writer (service side only) ─────────────────────────────────────────────────────────────
create or replace function public.notify_person(_user uuid, _kind text, _title text, _body text, _link text, _lead uuid, _dedupe text, _priority smallint default 1)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if _user is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link, lead_id, dedupe_key, priority)
    values (_user, _kind, _title, left(_body, 280), _link, _lead, _dedupe, coalesce(_priority, 1))
    on conflict (user_id, dedupe_key) do nothing;
end $$;
revoke all on function public.notify_person(uuid, text, text, text, text, uuid, text, smallint) from public, anon, authenticated;

-- Who works a lead: its assignee, else the book owner.
create or replace function public.lead_recipient(_lead uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(l.assigned_to_user_id, public.book_owner_id()) from public.outreach_leads l where l.id = _lead
$$;
revoke all on function public.lead_recipient(uuid) from public, anon, authenticated;

-- ── 1. WhatsApp: a reply (coalesced) and a failed send ──────────────────────────────────────────────
create or replace function public.trg_notify_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text; v_after_audit boolean; v_n integer;
begin
  begin
    if new.lead_id is null then return new; end if;
    if tg_op = 'INSERT' and new.direction = 'inbound' then
      v_to := public.lead_recipient(new.lead_id);
      if v_to is null then return new; end if;
      select business_name into v_name from public.outreach_leads where id = new.lead_id;
      select exists (select 1 from public.whatsapp_messages m where m.lead_id = new.lead_id and m.direction = 'outbound'
        and m.template_name like 'audit%' and m.status <> 'failed' and m.created_at < new.created_at) into v_after_audit;
      update public.notifications set count = count + 1, created_at = now(),
          body = coalesce(v_name, 'A prospect') || ': ' || left(coalesce(new.body, '[' || new.message_type || ']'), 120),
          title = case when count + 1 > 1 then (count + 1) || ' new WhatsApp messages' else title end
        where user_id = v_to and kind = 'whatsapp_reply' and lead_id = new.lead_id and read_at is null and cleared_at is null;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        perform public.notify_person(v_to, 'whatsapp_reply',
          case when v_after_audit then 'Replied after their audit' else 'New WhatsApp reply' end,
          coalesce(v_name, 'A prospect') || ': ' || left(coalesce(new.body, '[' || new.message_type || ']'), 120),
          '/inbox?lead=' || new.lead_id, new.lead_id, 'reply:' || new.id, 2::smallint);
      end if;
    elsif new.direction = 'outbound' and new.status = 'failed' and (tg_op = 'INSERT' or old.status is distinct from 'failed') then
      v_to := coalesce(new.sent_by_user_id, public.lead_recipient(new.lead_id));
      select business_name into v_name from public.outreach_leads where id = new.lead_id;
      perform public.notify_person(v_to, 'whatsapp_failed', 'A WhatsApp message failed',
        coalesce(v_name, 'A lead') || coalesce(': ' || left(new.error, 120), ''), '/inbox?lead=' || new.lead_id, new.lead_id, 'failed:' || new.id, 2::smallint);
    end if;
  exception when others then raise warning 'trg_notify_whatsapp: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_notify_whatsapp on public.whatsapp_messages;
create trigger trg_notify_whatsapp after insert or update of status on public.whatsapp_messages
  for each row execute function public.trg_notify_whatsapp();

-- ── 2. The sign-up page opened (one a day per lead; previews never count) ────────────────────────────
create or replace function public.trg_notify_signup_opened()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_to uuid; v_name text;
begin
  begin
    if new.lead_id is null or new.page <> 'onboarding' then return new; end if;
    -- Only an open of a link we SENT (the same rule as the dashboard: a recorded send first).
    if not exists (select 1 from public.onboarding_link_events e where e.lead_id = new.lead_id and e.kind = 'sent' and e.created_at <= new.created_at + interval '60 seconds') then return new; end if;
    v_to := public.lead_recipient(new.lead_id);
    select business_name into v_name from public.outreach_leads where id = new.lead_id;
    perform public.notify_person(v_to, 'signup_opened', 'Opened the sign-up page', coalesce(v_name, 'A prospect') || ' is looking at the sign-up page now.',
      '/inbox?lead=' || new.lead_id, new.lead_id, 'signup_opened:' || new.lead_id || ':' || to_char(new.created_at at time zone 'Europe/London', 'YYYY-MM-DD'), 2::smallint);
  exception when others then raise warning 'trg_notify_signup_opened: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_notify_signup_opened on public.lead_page_hits;
create trigger trg_notify_signup_opened after insert on public.lead_page_hits for each row execute function public.trg_notify_signup_opened();

-- ── 3. A hook audit finished (the lead's person; measurements and market audits never) ──────────────
create or replace function public.trg_notify_audit_finished()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_name text; v_purpose text; v_measure boolean;
begin
  begin
    if new.status <> 'complete' or old.status = 'complete' then return new; end if;
    select a.lead_id, a.business_name, coalesce(a.audit_purpose, 'audit'), coalesce(a.is_measurement, false) into v_lead, v_name, v_purpose, v_measure
      from public.ai_audits a where a.id = new.audit_id;
    if v_lead is null or v_purpose <> 'audit' or v_measure then return new; end if;
    perform public.notify_person(public.lead_recipient(v_lead), 'audit_finished', 'Audit finished', coalesce(v_name, 'A lead') || ' — see what AI says about them.',
      '/inbox?lead=' || v_lead, v_lead, 'audit:' || new.audit_id, 1::smallint);
  exception when others then raise warning 'trg_notify_audit_finished: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_notify_audit_finished on public.ai_audit_runs;
create trigger trg_notify_audit_finished after update of status on public.ai_audit_runs for each row execute function public.trg_notify_audit_finished();

-- ── 4. A lead assigned to a person (not the book owner's own backfill; never on insert) ─────────────
create or replace function public.trg_notify_lead_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.assigned_to_user_id is null or new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
    -- A person who claims a lead themselves needs no notice of their own click, and the book owner is
    -- never told about the automatic contact-assignment (trg_whatsapp_messages_assign) — they see all.
    if new.assigned_to_user_id = auth.uid() or new.assigned_to_user_id = public.book_owner_id() then return new; end if;
    perform public.notify_person(new.assigned_to_user_id, 'lead_assigned', 'Lead assigned to you', coalesce(new.business_name, 'A lead') || ' is now yours.',
      '/inbox?lead=' || new.id, new.id, 'assigned:' || new.id || ':' || coalesce(new.assigned_at::text, now()::text), 1::smallint);
  exception when others then raise warning 'trg_notify_lead_assigned: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists trg_notify_lead_assigned on public.outreach_leads;
create trigger trg_notify_lead_assigned after update of assigned_to_user_id on public.outreach_leads for each row execute function public.trg_notify_lead_assigned();

-- ── 5. Template requests get a decision (status is new; the admin sets it) ───────────────────────────
alter table public.template_requests add column if not exists status text not null default 'submitted';
alter table public.template_requests add column if not exists decided_at timestamptz;
alter table public.template_requests add column if not exists decision_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'template_requests_status_check') then
    alter table public.template_requests add constraint template_requests_status_check check (status in ('submitted', 'approved', 'rejected'));
  end if;
end $$;

create or replace function public.set_template_request_status(_id uuid, _status text, _note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'admin_only'; end if;
  if _status not in ('submitted', 'approved', 'rejected') then raise exception 'bad_status'; end if;
  update public.template_requests set status = _status, decided_at = case when _status = 'submitted' then null else now() end,
      decision_note = nullif(btrim(coalesce(_note, '')), '')
    where id = _id returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  if _status in ('approved', 'rejected') then
    perform public.notify_person(r.requested_by, 'template_decided',
      case when _status = 'approved' then 'Your template was approved' else 'Your template request was not approved' end,
      coalesce(r.proposed_name, left(r.message_text, 60)) || coalesce(' — ' || r.decision_note, ''), '/inbox', null,
      'template:' || r.id || ':' || _status, 1::smallint);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_template_request_status(uuid, text, text) from public, anon;
grant execute on function public.set_template_request_status(uuid, text, text) to authenticated;

-- ── 6. Follow-ups due today (a person's own Next Action; run each morning by pg_cron) ───────────────
create or replace function public.notify_due_follow_ups()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Europe/London')::date; n integer := 0; r record;
begin
  for r in
    select l.id, l.business_name, l.next_action::text as na, l.next_action_date, public.lead_recipient(l.id) as to_user
    from public.outreach_leads l
    where l.next_action is not null and l.next_action::text <> 'none' and l.next_action_date is not null
      and l.next_action_date <= v_today and l.is_archived is not true
  loop
    begin
      perform public.notify_person(r.to_user, 'follow_up_due',
        case when r.next_action_date < v_today then 'Follow-up overdue' else 'Follow-up due today' end,
        coalesce(r.business_name, 'A lead') || ' — ' || replace(r.na, '_', ' '), '/inbox?lead=' || r.id, r.id,
        'followup:' || r.id || ':' || r.na || ':' || r.next_action_date, 1::smallint);
      n := n + 1;
    exception when others then raise warning 'notify_due_follow_ups: %', sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke all on function public.notify_due_follow_ups() from public, anon, authenticated;

-- One notice per scheduled date (an overdue follow-up is not re-announced every morning).
-- 06:00 UTC = 07:00 London in summer, 06:00 in winter — before the working day either way.
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'notify-follow-ups-due') then
    perform cron.schedule('notify-follow-ups-due', '0 6 * * *', 'select public.notify_due_follow_ups()');
  end if;
end $$;
