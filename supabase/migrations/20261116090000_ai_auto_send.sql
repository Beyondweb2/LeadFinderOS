-- AI SENDS ITS OWN REPLY — LEVEL 2 (2026-10-21, Paul). Record: docs/ai-handles-replies.md "Level 2".
-- The rule is src/lib/aiAutoSend.ts (read by fn ai-reply-drafts when it writes a draft, and by fn inbox-scheduled-send just
-- before the message goes). An automatic reply is an ORDINARY inbox_scheduled_sends row (the lead's send hours, the drain's
-- opt-out / newer-message / 24-hour checks, sent by send-whatsapp-message) that names its draft.
--
-- ⛔ SHIPS OFF: ai_auto_send_intents defaults to '{}' — nothing can send by itself until an admin switches a type on.
-- ⛔ "AI handles replies" is the MASTER kill switch: turning it off cancels every automatic reply still waiting (trigger),
--    and switching a type off cancels that type's waiting rows. The drain re-checks both anyway.
-- ⛔ A cancelled / failed automatic reply leaves the draft waiting for a person (pending), as before Level 2.
-- Additive only. Rollback (Paul only):
--   drop trigger trg_ai_auto_send_switch on public.whatsapp_outreach_state; drop trigger trg_ai_auto_send_row on public.inbox_scheduled_sends;
--   drop function public._ai_auto_send_switch(); drop function public._ai_auto_send_row(); drop function public.inbox_mark_typing(text);
--   drop function public.ai_auto_send_counts(); drop function public.ai_auto_send_person_active_at(text); drop function public.ai_auto_send_summary(integer);
--   drop table public.inbox_typing_marks; (columns below may stay: nothing reads them once the functions are gone)

set local lock_timeout = '5s';

-- ── 1. The switches: per reply type (admin), the daily cap, and the admin the messages are sent as ─────────────────
alter table public.whatsapp_outreach_state add column if not exists ai_auto_send_intents text[] not null default '{}';
alter table public.whatsapp_outreach_state add column if not exists ai_auto_send_daily_cap integer not null default 30;
alter table public.whatsapp_outreach_state add column if not exists ai_auto_send_by uuid;
alter table public.whatsapp_outreach_state drop constraint if exists whatsapp_outreach_state_ai_auto_send_cap_check;
alter table public.whatsapp_outreach_state add constraint whatsapp_outreach_state_ai_auto_send_cap_check
  check (ai_auto_send_daily_cap between 0 and 200);

-- ── 2. The links: a draft knows its waiting automatic reply; the queued row knows its draft and reply type ─────────
alter table public.ai_reply_drafts add column if not exists auto_send_id uuid;
alter table public.ai_reply_drafts add column if not exists auto_sent_at timestamptz;
alter table public.inbox_scheduled_sends add column if not exists ai_draft_id uuid references public.ai_reply_drafts(id) on delete set null;
alter table public.inbox_scheduled_sends add column if not exists ai_intent text;
create index if not exists inbox_scheduled_sends_ai_idx on public.inbox_scheduled_sends (ai_draft_id) where ai_draft_id is not null;

-- ── 3. The thread label: a message the AI sent by itself ───────────────────────────────────────────────────────────
alter table public.whatsapp_messages add column if not exists sent_by_ai boolean;

-- ── 4. "A person typed here": the Inbox reply box marks the conversation (throttled); an automatic reply waiting on it
--       is cancelled at once and none is queued for PERSON_ACTIVE_MS. Service-role table, read through the functions. ──
create table if not exists public.inbox_typing_marks (
  phone    text not null,
  user_id  uuid not null,
  typed_at timestamptz not null default now(),
  primary key (phone, user_id)
);
alter table public.inbox_typing_marks enable row level security;
revoke all on public.inbox_typing_marks from anon, authenticated;

create or replace function public.inbox_mark_typing(_phone text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare p text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'); n int;
begin
  if auth.uid() is null or public.my_role() not in ('admin', 'sales') then return jsonb_build_object('ok', false, 'error', 'not_allowed'); end if;
  if length(p) < 8 or length(p) > 15 then return jsonb_build_object('ok', false, 'error', 'bad_phone'); end if;
  insert into public.inbox_typing_marks (phone, user_id, typed_at) values (p, auth.uid(), now())
    on conflict (phone, user_id) do update set typed_at = excluded.typed_at;
  update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_person_typing', updated_at = now()
   where phone = p and ai_draft_id is not null and status in ('scheduled', 'held');
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'cancelled', n);
end; $$;
revoke all on function public.inbox_mark_typing(text) from public, anon;
grant execute on function public.inbox_mark_typing(text) to authenticated;

-- The newest moment a person typed in / sent into / queued for this conversation (service role: the worker and the drain).
create or replace function public.ai_auto_send_person_active_at(_phone text)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select greatest(
    (select max(t.typed_at) from public.inbox_typing_marks t where t.phone = _phone),
    (select max(m.created_at) from public.whatsapp_messages m
      where m.phone = _phone and m.direction = 'outbound' and m.sent_by_user_id is not null and m.sent_by_ai is not true
        and m.created_at > now() - interval '1 day'),
    (select max(s.created_at) from public.inbox_scheduled_sends s where s.phone = _phone and s.ai_draft_id is null)
  );
$$;
revoke all on function public.ai_auto_send_person_active_at(text) from public, anon, authenticated;

-- ── 5. Today's automatic replies (London day): queued (not cancelled / failed) and actually sent ──────────────────
create or replace function public.ai_auto_send_counts()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with d as (select (date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London') as start)
  select jsonb_build_object(
    'queued_today', (select count(*) from public.inbox_scheduled_sends s, d where s.ai_draft_id is not null
                       and s.status in ('scheduled', 'held', 'sending', 'sent') and s.created_at >= d.start),
    'sent_today',   (select count(*) from public.inbox_scheduled_sends s, d where s.ai_draft_id is not null
                       and s.status in ('sending', 'sent') and s.claimed_at >= d.start));
$$;
revoke all on function public.ai_auto_send_counts() from public, anon, authenticated;

-- ── 6. The Inbox's own scheduled list leaves the automatic rows out (the draft panel shows them); a person cannot edit
--       or release one (Approve / Discard / typing / cancel stop it). Same signatures as 20261114090000. ────────────
create or replace function public.my_inbox_scheduled_sends()
returns table (id uuid, lead_id uuid, phone text, channel text, kind text, body text, template_name text, send_at timestamptz,
               tz text, status text, hold_reason text, cancel_reason text, error text, created_at timestamptz, queued_by uuid)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.lead_id, s.phone, s.channel, s.kind, s.body, s.template_name, s.send_at, s.tz, s.status, s.hold_reason,
         s.cancel_reason, s.error, s.created_at, s.queued_by
  from public.inbox_scheduled_sends s
  where public.my_role() in ('admin', 'sales')
    and s.ai_draft_id is null
    and (s.status in ('scheduled', 'sending', 'held')
         or (s.status = 'failed' and s.updated_at > now() - interval '2 days')
         or (s.status = 'cancelled' and coalesce(s.cancel_reason, '') <> 'by_person' and s.updated_at > now() - interval '2 days'))
    and public._inbox_scheduled_may(s)
  order by s.created_at
  limit 2000;
$$;

create or replace function public.inbox_scheduled_edit(_id uuid, _body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.inbox_scheduled_sends; b text := btrim(coalesce(_body, ''));
begin
  select * into r from public.inbox_scheduled_sends where id = _id for update;
  if not found or not public._inbox_scheduled_may(r) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status not in ('scheduled', 'held') then return jsonb_build_object('ok', false, 'error', 'not_open', 'status', r.status); end if;
  if r.kind <> 'text' or r.ai_draft_id is not null then return jsonb_build_object('ok', false, 'error', 'not_editable'); end if;
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

create or replace function public.inbox_scheduled_release(_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r public.inbox_scheduled_sends;
begin
  select * into r from public.inbox_scheduled_sends where id = _id for update;
  if not found or not public._inbox_scheduled_may(r) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.ai_draft_id is not null then return jsonb_build_object('ok', false, 'error', 'not_releasable'); end if;
  if r.status <> 'held' or r.hold_reason is distinct from 'replied_since' then return jsonb_build_object('ok', false, 'error', 'not_releasable'); end if;
  update public.inbox_scheduled_sends set status = 'scheduled', hold_reason = null, checked_at = now(),
         send_at = greatest(send_at, now()), updated_at = now() where id = _id;
  return jsonb_build_object('ok', true);
end; $$;

-- ── 7. An automatic row settles its draft: sent → the draft is sent (by the AI, the message labelled); cancelled /
--       failed → the draft waits for a person again. ────────────────────────────────────────────────────────────────
create or replace function public._ai_auto_send_row()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_msg uuid;
begin
  if new.ai_draft_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status = 'sent' then
    if coalesce(new.sent_message_id, '') ~ '^[0-9a-fA-F-]{36}$' then v_msg := new.sent_message_id::uuid; end if;
    if v_msg is not null then update public.whatsapp_messages set sent_by_ai = true where id = v_msg; end if;
    update public.ai_reply_drafts
       set status = 'sent', final_text = new.body, sent_message_id = v_msg, approved_by = null, approved_at = now(),
           auto_sent_at = now(), auto_send_id = new.id,
           why = coalesce(why, '{}'::jsonb) || jsonb_build_object('autoSend', coalesce(why->'autoSend', '{}'::jsonb) || jsonb_build_object('sentAt', now())),
           updated_at = now()
     where id = new.ai_draft_id and status = 'pending';
  elsif new.status in ('cancelled', 'failed') then
    update public.ai_reply_drafts
       set auto_send_id = null,
           why = coalesce(why, '{}'::jsonb) || jsonb_build_object('autoSend', coalesce(why->'autoSend', '{}'::jsonb)
                   || jsonb_build_object('stopped', coalesce(new.cancel_reason, case when new.status = 'failed' then 'failed' end))),
           updated_at = now()
     where id = new.ai_draft_id and auto_send_id = new.id;
  end if;
  return new;
end; $$;
revoke all on function public._ai_auto_send_row() from public, anon, authenticated;
drop trigger if exists trg_ai_auto_send_row on public.inbox_scheduled_sends;
create trigger trg_ai_auto_send_row after update of status on public.inbox_scheduled_sends
  for each row execute function public._ai_auto_send_row();

-- ── 8. The kill switch: master off → every waiting automatic reply is cancelled; a type switched off → its rows. ───
create or replace function public._ai_auto_send_switch()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.ai_handles_replies is not true then
    update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_switched_off', updated_at = now()
     where ai_draft_id is not null and status in ('scheduled', 'held');
  else
    update public.inbox_scheduled_sends set status = 'cancelled', cancel_reason = 'ai_type_off', updated_at = now()
     where ai_draft_id is not null and status in ('scheduled', 'held')
       and not (coalesce(ai_intent, '') = any (coalesce(new.ai_auto_send_intents, '{}'::text[])));
  end if;
  return new;
end; $$;
revoke all on function public._ai_auto_send_switch() from public, anon, authenticated;
drop trigger if exists trg_ai_auto_send_switch on public.whatsapp_outreach_state;
create trigger trg_ai_auto_send_switch after update of ai_handles_replies, ai_auto_send_intents on public.whatsapp_outreach_state
  for each row execute function public._ai_auto_send_switch();

-- ── 9. The outcome log gains 'auto_sent' (the draft went out by itself, unchanged). ─────────────────────────────────
alter table public.ai_reply_draft_outcomes drop constraint if exists ai_reply_draft_outcomes_outcome_check;
alter table public.ai_reply_draft_outcomes add constraint ai_reply_draft_outcomes_outcome_check
  check (outcome in ('sent_unchanged', 'sent_edited', 'regenerated', 'discarded', 'superseded', 'not_used', 'auto_sent'));

create or replace function public._ai_draft_record_outcome(d public.ai_reply_drafts, p_kind text, p_final text, p_message uuid,
                                                          p_actor uuid, p_queued boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_out text := p_kind; v_changed int; v_words int;
begin
  if d.draft_text is null and p_kind <> 'regenerated' then return; end if;  -- no AI text: not a draft
  v_words := coalesce(array_length(regexp_split_to_array(nullif(btrim(coalesce(d.draft_text, '')), ''), '\s+'), 1), 0);
  if p_kind = 'sent' then
    if nullif(btrim(coalesce(p_final, '')), '') is null then
      v_out := 'not_used';
    else
      v_changed := public.word_edit_distance(d.draft_text, p_final);
      v_out := case when v_changed = 0 then 'sent_unchanged' else 'sent_edited' end;
    end if;
  elsif p_kind = 'auto_sent' then
    v_changed := public.word_edit_distance(d.draft_text, p_final);
  end if;
  insert into public.ai_reply_draft_outcomes (draft_id, user_id, lead_id, version, intent, outcome, queued, draft_text, final_text,
                                              draft_words, words_changed, message_id, actor_user_id)
  values (d.id, d.user_id, d.lead_id, coalesce(d.regenerations, 0),
          coalesce(nullif(d.why->>'intent', ''), nullif(d.why->>'move', ''), nullif(d.reason, ''), 'unknown'),
          v_out, coalesce(p_queued, false), d.draft_text, case when v_out like 'sent_%' or v_out = 'auto_sent' then p_final end,
          v_words, case when v_out like 'sent_%' or v_out = 'auto_sent' then v_changed end, p_message, p_actor);
end $$;
revoke all on function public._ai_draft_record_outcome(public.ai_reply_drafts, text, text, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public._ai_reply_draft_outcome()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  begin
    -- A rewrite of an open draft ends that version (Regenerate, or "Draft reply" over the same inbound).
    if old.status = 'pending' and new.status = 'pending' and old.draft_text is not null
       and new.draft_text is distinct from old.draft_text then
      perform public._ai_draft_record_outcome(old, 'regenerated', null, null, null, false);
    end if;
    if old.status in ('pending', 'sending') and new.status is distinct from old.status then
      if new.status = 'sent' and new.auto_sent_at is not null then
        -- Level 2: the AI sent it by itself (fn inbox-scheduled-send → trg_ai_auto_send_row).
        perform public._ai_draft_record_outcome(new, 'auto_sent', new.final_text, new.sent_message_id, null, true);
      elsif new.status = 'sent' then
        perform public._ai_draft_record_outcome(new, 'sent', new.final_text, new.sent_message_id, new.approved_by, false);
      elsif new.status = 'resolved' then
        -- Answered another way (usually the ordinary Send with the draft pre-filled): the first real outbound after it.
        select o.id, o.body, o.user_id, o.template_name into m from public.whatsapp_messages o
          where o.phone = new.phone and o.direction = 'outbound' and o.created_at > new.inbound_at
            and o.status in ('sent', 'delivered', 'read', 'simulated')
          order by o.created_at limit 1;
        if found then
          if new.final_text is null and m.template_name is null then new.final_text := m.body; end if;
          if new.sent_message_id is null then new.sent_message_id := m.id; end if;
          perform public._ai_draft_record_outcome(new, 'sent', case when m.template_name is null then m.body end, m.id, m.user_id, false);
        end if;
      elsif new.status = 'discarded' then
        if new.error = 'queued_for_send_hours' and new.final_text is not null then
          perform public._ai_draft_record_outcome(new, 'sent', new.final_text, null, new.discarded_by, true);
        else
          perform public._ai_draft_record_outcome(new, 'discarded', null, null, new.discarded_by, false);
        end if;
      elsif new.status = 'superseded' then
        perform public._ai_draft_record_outcome(new, 'superseded', null, null, null, false);
      end if;
    end if;
  exception when others then
    raise warning 'ai draft outcome not recorded for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public._ai_reply_draft_outcome() from public, anon, authenticated;

-- ── 10. The readout: automatic replies per reply type, today (London) and over p_days. Admin only. ─────────────────
create or replace function public.ai_auto_send_summary(p_days integer default 90)
returns table (intent text, today integer, in_period integer, waiting integer)
language plpgsql stable security definer set search_path = public as $$
declare v_start timestamptz := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then return; end if;
  return query
  with sent as (
    select o.intent, o.occurred_at from public.ai_reply_draft_outcomes o
     where o.outcome = 'auto_sent' and o.occurred_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 3650)))
  ), wait as (
    select coalesce(s.ai_intent, 'unknown') as intent, count(*)::int as n from public.inbox_scheduled_sends s
     where s.ai_draft_id is not null and s.status in ('scheduled', 'held', 'sending') group by 1
  ), keys as (select sent.intent from sent union select wait.intent from wait)
  select k.intent,
         (select count(*)::int from sent where sent.intent = k.intent and sent.occurred_at >= v_start),
         (select count(*)::int from sent where sent.intent = k.intent),
         coalesce((select wait.n from wait where wait.intent = k.intent), 0)
  from keys k
  order by 3 desc, 1;
end $$;
revoke all on function public.ai_auto_send_summary(integer) from public, anon;
grant execute on function public.ai_auto_send_summary(integer) to authenticated;

-- Read back:
--   select ai_handles_replies, ai_auto_send_intents, ai_auto_send_daily_cap, ai_auto_send_by from public.whatsapp_outreach_state where id = 1;
--   select column_name from information_schema.columns where table_name in ('ai_reply_drafts','inbox_scheduled_sends','whatsapp_messages')
--     and column_name in ('auto_send_id','auto_sent_at','ai_draft_id','ai_intent','sent_by_ai');
--   select tgname from pg_trigger where tgname in ('trg_ai_auto_send_row', 'trg_ai_auto_send_switch');
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'ai_reply_draft_outcomes_outcome_check';
