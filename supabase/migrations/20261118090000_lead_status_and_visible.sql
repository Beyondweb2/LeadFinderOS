-- ONE STATUS RULE FROM THE MESSAGES + THE VISIBLE FLAG (Paul, 2026-10-21). Record: docs/lead-status-and-visible.md.
--
-- JOB 1. Replied / You replied / back-to-Contacted were written by EIGHT different senders and handlers, each after its own
-- send, each with its own copy of the rule (the SMS sender with none). The status now follows the MESSAGES, whatever wrote them:
--   · lead_conversation_signal(lead)  — what the stored messages say: 'replied' | 'awaiting_reply' | 'not_a_reply' | null
--   · lead_status_target(status, sig) — which statuses that signal may move, and to what (pure; deals / clients / Not interested
--                                       / opted out / closed are never touched)
--   · trg_lead_status_from_message    — every whatsapp_messages / sms_messages insert or change that alters what counts
--   · trg_outreach_leads_status_from_messages — a SYSTEM write of Replied / You replied (or the old undo to Contacted) that the
--                                       messages contradict is corrected before it lands (the late-write race). A person's own
--                                       status choice (auth.role() = 'authenticated') is never second-guessed.
-- Counted: an inbound message, or one of ours that really went (sent / delivered / read; a QA fixture's simulated send).
-- A queued, failed or test send never counts. whatsapp_messages.reply_kind is written ONLY by ai-reply-drafts from the one
-- auto-reply reading (src/lib/replyKindTag.ts): 'auto' = an auto-responder, 'confirmed' = a bare "yes it is" before any real
-- reply (Paul's 20 Oct rule: not a reply). Both are "not a reply"; a 'confirmed' person we then answer reads You replied.
-- Every change is logged in lead_status_sync_log (admin-readable). ⛔ Fail-safe: a fault here is a WARNING, never a lost message.
--
-- JOB 2. The Visible flag (outreach_leads.ai_visible_*): set / cleared ONLY through apply_lead_visible, by the ai-reply-drafts
-- tick, from src/lib/visibleFlag.ts. Setting it cancels the queued follow-ups (report / opener follow-up markers, waiting
-- pitches, automatic replies) and closes open drafts / Needs you rows. Clearing it restores nothing: the normal flow resumes.
-- The rule (whatsapp_outreach_state.visible_rule: either / both / off) is changed by an admin through set_inbox_visible_rule.
--
-- Additive: plain nullable columns (instant), one CHECK added NOT VALID, no rewrite, no backfill here.
-- The repair is a SEPARATE, explicit call: select * from repair_lead_statuses_from_messages(false) previews; (true) applies.
-- To undo: drop the two triggers on the message tables and the one on outreach_leads; the columns and the log are harmless.

set local lock_timeout = '5s';

-- ── columns ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.whatsapp_messages add column if not exists reply_kind text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_messages_reply_kind_chk') then
    alter table public.whatsapp_messages add constraint whatsapp_messages_reply_kind_chk
      check (reply_kind is null or reply_kind in ('auto', 'confirmed')) not valid;
  end if;
end $$;

alter table public.outreach_leads
  add column if not exists ai_visible_at timestamptz,
  add column if not exists ai_visible_audit_id uuid,
  add column if not exists ai_visible_checked_audit_id uuid,
  add column if not exists ai_visible_checked_rule text;

alter table public.whatsapp_outreach_state add column if not exists visible_rule text not null default 'either';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'whatsapp_outreach_state_visible_rule_chk') then
    alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_visible_rule_chk
      check (visible_rule in ('either', 'both', 'off'));
  end if;
end $$;

-- ── the log ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.lead_status_sync_log (
  id bigserial primary key,
  lead_id uuid not null,
  from_status text,
  to_status text,
  visible_from boolean,
  visible_to boolean,
  source text not null,          -- 'message' | 'sender_guard' | 'repair' | 'visible'
  reason text,
  message_id uuid,
  audit_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists lead_status_sync_log_lead_idx on public.lead_status_sync_log (lead_id, created_at desc);
alter table public.lead_status_sync_log enable row level security;
drop policy if exists "admin reads lead status sync log" on public.lead_status_sync_log;
create policy "admin reads lead status sync log" on public.lead_status_sync_log
  for select using ((select public.has_role((select auth.uid()), 'admin'::app_role)));
revoke insert, update, delete, truncate on public.lead_status_sync_log from anon, authenticated;

-- ── JOB 1: the rule ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.lead_conversation_signal(p_lead uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with fixture as (
    select exists (select 1 from public.metric_exclusions x where x.kind = 'lead' and x.value = p_lead::text) as yes
  ), m as (
    select w.direction, w.created_at, w.reply_kind
    from public.whatsapp_messages w, fixture f
    where w.lead_id = p_lead and (w.test_mode is not true or f.yes)
      and (w.direction = 'inbound' or w.status in ('sent', 'delivered', 'read') or (f.yes and w.status = 'simulated'))
    union all
    select s.direction, s.created_at, null::text
    from public.sms_messages s, fixture f
    where s.lead_id = p_lead and (s.test_mode is not true or f.yes)
      and (s.direction = 'inbound' or s.status in ('sent', 'delivered', 'read') or (f.yes and s.status = 'simulated'))
  ), t as (
    select max(created_at) filter (where direction <> 'inbound') as last_out,
           max(created_at) filter (where direction = 'inbound' and reply_kind is null) as last_real,
           max(created_at) filter (where direction = 'inbound' and reply_kind is distinct from 'auto') as last_human,
           max(created_at) filter (where direction = 'inbound') as last_any
    from m
  )
  select case
    -- a real reply that nothing of ours has answered
    when last_real is not null and (last_out is null or last_real >= last_out) then 'replied'
    -- a person wrote (a real reply, or their bare "yes it is") and we answered after it
    when last_human is not null and last_out > last_human then 'awaiting_reply'
    -- only auto-replies / a bare "yes it is" since our last send, and no real reply ever
    when last_real is null and last_any is not null and (last_out is null or last_any > last_out) then 'not_a_reply'
    else null
  end
  from t;
$$;

create or replace function public.lead_status_target(p_current text, p_signal text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_signal = 'replied' and p_current in ('not_contacted', 'initial_contact', 'second_attempt', 'awaiting_reply', 'report_sent',
         'email_sent', 'bounced', 'no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed', 'site_sent', 'replied') then 'replied'
    -- Report sent stays Report sent after our send (it is the pitch marker); only these move to You replied.
    when p_signal = 'awaiting_reply' and p_current in ('replied', 'initial_contact', 'second_attempt', 'awaiting_reply') then 'awaiting_reply'
    when p_signal = 'not_a_reply' and p_current = 'replied' then 'initial_contact'
    else p_current
  end;
$$;

create or replace function public.sync_lead_status_from_messages(p_lead uuid, p_source text default 'message', p_message uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_old text; v_sig text; v_new text;
begin
  if p_lead is null then return null; end if;
  select status into v_old from public.outreach_leads where id = p_lead for update;
  if not found then return null; end if;
  v_sig := public.lead_conversation_signal(p_lead);
  v_new := public.lead_status_target(v_old, v_sig);
  if v_new is distinct from v_old then
    perform set_config('lfos.status_sync', 'on', true);
    update public.outreach_leads set status = v_new where id = p_lead;
    perform set_config('lfos.status_sync', 'off', true);
    insert into public.lead_status_sync_log (lead_id, from_status, to_status, source, reason, message_id)
    values (p_lead, v_old, v_new, p_source, v_sig, p_message);
  end if;
  return v_new;
end
$$;

-- Does this message row count (an inbound, or one of ours that really went)? Mirrors the signal's filter for the trigger's
-- "did anything that matters change" check; the fixture case is decided inside the signal.
create or replace function public._message_counts(p_direction text, p_status text)
returns boolean language sql immutable as $$
  select p_direction = 'inbound' or p_status in ('sent', 'delivered', 'read', 'simulated');
$$;

create or replace function public.trg_lead_status_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kind_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'whatsapp_messages' then
      v_kind_changed := (to_jsonb(old) ->> 'reply_kind') is distinct from (to_jsonb(new) ->> 'reply_kind');
    end if;
    -- Only what changes the reading: counted / not counted, the lead link, the reply kind. delivered → read is not.
    if old.lead_id is not distinct from new.lead_id and not v_kind_changed
       and public._message_counts(old.direction, old.status) = public._message_counts(new.direction, new.status) then
      return null;
    end if;
  end if;
  begin
    if tg_op = 'UPDATE' and old.lead_id is not null and old.lead_id is distinct from new.lead_id then
      perform public.sync_lead_status_from_messages(old.lead_id, 'message', new.id);
    end if;
    if new.lead_id is not null then
      perform public.sync_lead_status_from_messages(new.lead_id, 'message', new.id);
    end if;
  exception when others then
    -- ⛔ Never lose a message over a status: the write goes through, the fault is a warning.
    raise warning 'lead status from message %: %', new.id, sqlerrm;
  end;
  return null;
end
$$;

drop trigger if exists trg_lead_status_from_message on public.whatsapp_messages;
create trigger trg_lead_status_from_message
  after insert or update of status, lead_id, reply_kind, direction on public.whatsapp_messages
  for each row execute function public.trg_lead_status_from_message();
drop trigger if exists trg_lead_status_from_message on public.sms_messages;
create trigger trg_lead_status_from_message
  after insert or update of status, lead_id, direction on public.sms_messages
  for each row execute function public.trg_lead_status_from_message();

create or replace function public.trg_outreach_leads_status_from_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_sig text; v_t text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if coalesce(current_setting('lfos.status_sync', true), '') = 'on' then return new; end if;
  -- A person's own choice (the status select, the sales functions) stands.
  if coalesce(auth.role(), '') = 'authenticated' then return new; end if;
  if not (new.status in ('replied', 'awaiting_reply') or (old.status = 'replied' and new.status = 'initial_contact')) then return new; end if;
  begin
    v_sig := public.lead_conversation_signal(new.id);
    v_t := public.lead_status_target(new.status, v_sig);
    if v_t is distinct from new.status then
      insert into public.lead_status_sync_log (lead_id, from_status, to_status, source, reason)
      values (new.id, old.status, v_t, 'sender_guard', 'asked for ' || new.status || ', the messages say ' || coalesce(v_sig, 'nothing'));
      new.status := v_t;
    end if;
  exception when others then
    raise warning 'lead status guard %: %', new.id, sqlerrm;
  end;
  return new;
end
$$;

drop trigger if exists trg_outreach_leads_status_from_messages on public.outreach_leads;
create trigger trg_outreach_leads_status_from_messages
  before update of status on public.outreach_leads
  for each row execute function public.trg_outreach_leads_status_from_messages();

-- The repair: the same rule over every lead with messages. Preview with false, apply with true. ⛔ It never moves a lead INTO
-- Contacted (that could put it back in a no-reply follow-up lane) and it writes nothing but the status and the log: no message,
-- no draft, no queue row, no follow-up marker.
create or replace function public.repair_lead_statuses_from_messages(p_apply boolean default false, p_only uuid default null)
returns table (lead_id uuid, from_status text, to_status text, signal text)
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_t text;
begin
  for r in
    with ids as (
      select distinct w.lead_id from public.whatsapp_messages w where w.lead_id is not null
      union
      select distinct s.lead_id from public.sms_messages s where s.lead_id is not null
    )
    select l.id, l.status, public.lead_conversation_signal(l.id) as sig
    from public.outreach_leads l join ids on ids.lead_id = l.id
    where p_only is null or l.id = p_only
    order by l.id
  loop
    v_t := public.lead_status_target(r.status, r.sig);
    if v_t is distinct from r.status and v_t <> 'initial_contact' then
      lead_id := r.id; from_status := r.status; to_status := v_t; signal := r.sig;
      if p_apply then
        perform set_config('lfos.status_sync', 'on', true);
        update public.outreach_leads set status = v_t where id = r.id and status = r.status;
        perform set_config('lfos.status_sync', 'off', true);
        insert into public.lead_status_sync_log (lead_id, from_status, to_status, source, reason)
        values (r.id, r.status, v_t, 'repair', r.sig);
      end if;
      return next;
    end if;
  end loop;
end
$$;

-- ── JOB 2: the Visible flag ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.apply_lead_visible(p_lead uuid, p_visible boolean, p_audit uuid, p_rule text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_was timestamptz; v_now timestamptz := now();
begin
  select ai_visible_at into v_was from public.outreach_leads where id = p_lead for update;
  if not found then return false; end if;
  update public.outreach_leads set
    ai_visible_at = case when p_visible then coalesce(v_was, v_now) else null end,
    ai_visible_audit_id = case when p_visible then p_audit else null end,
    ai_visible_checked_audit_id = p_audit,
    ai_visible_checked_rule = p_rule
  where id = p_lead;
  if p_visible and v_was is null then
    -- The queued follow-ups: the report / opener follow-up lanes' markers, a waiting pitch, an automatic reply, open drafts.
    update public.outreach_leads set hook_followup_queued_at = null, contact_followup_queued_at = null
      where id = p_lead and (hook_followup_queued_at is not null or contact_followup_queued_at is not null);
    update public.whatsapp_auto_replies set status = 'skipped_visible', reason = 'AI already names them (Visible)', updated_at = v_now
      where lead_id = p_lead and status in ('awaiting_audit', 'pending');
    update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'visible', updated_at = v_now
      where lead_id = p_lead and ai_draft_id is not null and status in ('scheduled', 'held');
    update public.ai_reply_drafts set status = 'resolved', updated_at = v_now
      where lead_id = p_lead and status = 'pending';
  end if;
  if (v_was is not null) is distinct from p_visible then
    insert into public.lead_status_sync_log (lead_id, visible_from, visible_to, source, reason, audit_id)
    values (p_lead, v_was is not null, p_visible, 'visible', p_rule, p_audit);
  end if;
  return true;
end
$$;

-- The Inbox's chip + Show filter: the caller's own Visible leads (admin: all; sales: the leads they work). One small call.
create or replace function public.inbox_visible_leads()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(l.id), '[]'::jsonb)
  from public.outreach_leads l
  where l.ai_visible_at is not null
    and (public.my_role() = 'admin' or (public.my_role() = 'sales' and l.id in (select public.my_sales_lead_ids())));
$$;

create or replace function public.set_inbox_visible_rule(p_rule text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.my_role() is distinct from 'admin' then raise exception 'not_authorised' using errcode = '42501'; end if;
  if p_rule not in ('either', 'both', 'off') then raise exception 'bad_rule' using errcode = '22023'; end if;
  update public.whatsapp_outreach_state set visible_rule = p_rule where id = 1;
  return p_rule;
end
$$;

create or replace function public.inbox_visible_rule()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select visible_rule from public.whatsapp_outreach_state where id = 1), 'either');
$$;

revoke all on function public.lead_conversation_signal(uuid) from public, anon, authenticated;
revoke all on function public.sync_lead_status_from_messages(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.repair_lead_statuses_from_messages(boolean, uuid) from public, anon, authenticated;
revoke all on function public.apply_lead_visible(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.trg_lead_status_from_message() from public, anon, authenticated;
revoke all on function public.trg_outreach_leads_status_from_messages() from public, anon, authenticated;
revoke all on function public.inbox_visible_leads() from public, anon;
grant execute on function public.inbox_visible_leads() to authenticated;
revoke all on function public.set_inbox_visible_rule(text) from public, anon;
grant execute on function public.set_inbox_visible_rule(text) to authenticated;
revoke all on function public.inbox_visible_rule() from public, anon;
grant execute on function public.inbox_visible_rule() to authenticated;
