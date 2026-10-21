-- AI DRAFT OUTCOMES (2026-10-21, Paul) — every AI reply draft records what happened to it, with its intent.
-- Record: docs/ai-handles-replies.md "Draft outcomes". Readout: AiDraftOutcomes (Inbox, beside the admin switch).
--
-- WHY A TRIGGER: most drafts (29 of 33 on 2026-10-21) go out through the Inbox's ordinary Send with the draft pre-filled,
-- not through Approve & send, and are closed later by the worker's tick as `resolved` — so no code path ever saw the text
-- that was sent (final_text was on 3 of 33). The ONE writer is this trigger on ai_reply_drafts: whichever path closes or
-- rewrites a draft, the outcome is recorded here. Nothing in the edge function changes.
--
-- Outcomes, one per draft VERSION (a regeneration ends a version):
--   sent_unchanged · sent_edited (final text + words changed) · regenerated · discarded · superseded (a newer message
--   came in first) · not_used (answered by a template / media, no text to compare).
-- "Words changed" = word-level edit distance (insert / delete / replace one whitespace-separated word), so 0 ⇔ the
-- same words in the same order. Approve & send that was QUEUED for the lead's send hours is closed by the Inbox as
-- complete → discard; it is recorded as sent (queued = true), never as discarded.
--
-- Additive only. Rollback (Paul only):
--   drop trigger trg_ai_reply_draft_outcome on public.ai_reply_drafts; drop function public._ai_reply_draft_outcome();
--   drop function public.ai_draft_outcome_summary(integer); drop function public._ai_draft_record_outcome(public.ai_reply_drafts, text, text, uuid, uuid, boolean);
--   drop function public.word_edit_distance(text, text); drop table public.ai_reply_draft_outcomes;

set local lock_timeout = '5s';

-- ── 1. The log: one row per draft version ─────────────────────────────────────────────────────────────────────
create table if not exists public.ai_reply_draft_outcomes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.ai_reply_drafts(id) on delete cascade,
  user_id uuid not null,                       -- the BOOK
  lead_id uuid not null,
  version integer not null,                    -- the draft's regenerations count when this version ended
  intent text not null,                        -- the playbook intent, else the move, else the reason
  outcome text not null check (outcome in ('sent_unchanged', 'sent_edited', 'regenerated', 'discarded', 'superseded', 'not_used')),
  queued boolean not null default false,       -- approved, then queued for the lead's send hours
  draft_text text,                             -- what the AI wrote (null only for a backfilled regeneration)
  final_text text,                             -- what was sent (sent_* only)
  draft_words integer,
  words_changed integer,                       -- sent_* only; 0 for unchanged
  message_id uuid references public.whatsapp_messages(id) on delete set null,
  actor_user_id uuid,
  backfilled boolean not null default false,   -- written from rows that existed before 2026-10-21
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists ai_reply_draft_outcomes_draft on public.ai_reply_draft_outcomes (draft_id);
create index if not exists ai_reply_draft_outcomes_when on public.ai_reply_draft_outcomes (occurred_at desc);
-- Service role only: RLS on, NO policies. Admins read through ai_draft_outcome_summary().
alter table public.ai_reply_draft_outcomes enable row level security;
revoke all on public.ai_reply_draft_outcomes from anon, authenticated;

-- ── 2. Words changed: word-level Levenshtein. Messages are short; a pair over 400 × 400 words returns null. ──────
create or replace function public.word_edit_distance(a text, b text)
returns integer language plpgsql immutable set search_path = public as $$
declare
  x text[] := coalesce(regexp_split_to_array(nullif(btrim(coalesce(a, '')), ''), '\s+'), '{}');
  y text[] := coalesce(regexp_split_to_array(nullif(btrim(coalesce(b, '')), ''), '\s+'), '{}');
  n int := coalesce(array_length(x, 1), 0); m int := coalesce(array_length(y, 1), 0);
  prev int[]; cur int[]; i int; j int;
begin
  if n = 0 then return m; end if;
  if m = 0 then return n; end if;
  if n > 400 or m > 400 then return null; end if;
  prev := array(select generate_series(0, m));
  for i in 1..n loop
    cur := array[i];
    for j in 1..m loop
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + case when x[i] = y[j] then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[m + 1];
end $$;

-- ── 3. One recorder (trigger AND backfill) ───────────────────────────────────────────────────────────────────
-- p_kind: 'regenerated' | 'discarded' | 'superseded' | 'sent' (compare p_final with the draft).
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
  end if;
  insert into public.ai_reply_draft_outcomes (draft_id, user_id, lead_id, version, intent, outcome, queued, draft_text, final_text,
                                              draft_words, words_changed, message_id, actor_user_id)
  values (d.id, d.user_id, d.lead_id, coalesce(d.regenerations, 0),
          coalesce(nullif(d.why->>'intent', ''), nullif(d.why->>'move', ''), nullif(d.reason, ''), 'unknown'),
          v_out, coalesce(p_queued, false), d.draft_text, case when v_out like 'sent_%' then p_final end,
          v_words, case when v_out like 'sent_%' then v_changed end, p_message, p_actor);
end $$;
revoke all on function public._ai_draft_record_outcome(public.ai_reply_drafts, text, text, uuid, uuid, boolean) from public, anon, authenticated;

-- ── 4. The trigger. ⛔ It never blocks the draft's own update: any failure is swallowed (the outcome is lost, the
--       worker and the Inbox are not). ─────────────────────────────────────────────────────────────────────────
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
      if new.status = 'sent' then
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

drop trigger if exists trg_ai_reply_draft_outcome on public.ai_reply_drafts;
create trigger trg_ai_reply_draft_outcome before update on public.ai_reply_drafts
  for each row execute function public._ai_reply_draft_outcome();

-- ── 5. Backfill: the drafts that existed before today, by the same recorder. Regenerations before today kept no
--       text, so each is one 'regenerated' row with draft_text null. Idempotent: only drafts with no outcome yet. ────
do $$
declare d public.ai_reply_drafts; m record; i int;
begin
  for d in select * from public.ai_reply_drafts x
           where not exists (select 1 from public.ai_reply_draft_outcomes o where o.draft_id = x.id)
             and (x.draft_text is not null or coalesce(x.regenerations, 0) > 0) loop
    for i in 0 .. coalesce(d.regenerations, 0) - 1 loop
      insert into public.ai_reply_draft_outcomes (draft_id, user_id, lead_id, version, intent, outcome, occurred_at, backfilled)
      values (d.id, d.user_id, d.lead_id, i, coalesce(nullif(d.why->>'intent', ''), nullif(d.why->>'move', ''), nullif(d.reason, ''), 'unknown'),
              'regenerated', d.updated_at, true);
    end loop;
    if d.status = 'sent' then
      perform public._ai_draft_record_outcome(d, 'sent', d.final_text, d.sent_message_id, d.approved_by, false);
    elsif d.status = 'resolved' and d.draft_text is not null then
      select o.id, o.body, o.user_id, o.template_name into m from public.whatsapp_messages o
        where o.phone = d.phone and o.direction = 'outbound' and o.created_at > d.inbound_at
          and o.status in ('sent', 'delivered', 'read', 'simulated')
        order by o.created_at limit 1;
      if found then
        perform public._ai_draft_record_outcome(d, 'sent', case when m.template_name is null then m.body end, m.id, m.user_id, false);
        update public.ai_reply_drafts set final_text = coalesce(final_text, case when m.template_name is null then m.body end),
                                          sent_message_id = coalesce(sent_message_id, m.id)
          where id = d.id;
      end if;
    elsif d.status = 'discarded' then
      perform public._ai_draft_record_outcome(d, case when d.error = 'queued_for_send_hours' and d.final_text is not null then 'sent' else 'discarded' end,
                                              d.final_text, null, d.discarded_by, d.error = 'queued_for_send_hours' and d.final_text is not null);
    elsif d.status = 'superseded' then
      perform public._ai_draft_record_outcome(d, 'superseded', null, null, null, false);
    end if;
  end loop;
  update public.ai_reply_draft_outcomes set backfilled = true, occurred_at = coalesce((select x.updated_at from public.ai_reply_drafts x where x.id = draft_id), occurred_at)
    where backfilled = false and created_at = now();  -- now() is this transaction's start: only the rows written above
end $$;

-- ── 6. The readout: admin only, per intent, over the last p_days ────────────────────────────────────────────────
create or replace function public.ai_draft_outcome_summary(p_days integer default 90)
returns table (intent text, versions integer, sent_unchanged integer, sent_edited integer, regenerated integer, discarded integer,
               superseded integer, not_used integer, avg_words_changed numeric, avg_share_changed numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_role() is distinct from 'admin' then return; end if;
  return query
  select o.intent, count(*)::int,
         count(*) filter (where o.outcome = 'sent_unchanged')::int, count(*) filter (where o.outcome = 'sent_edited')::int,
         count(*) filter (where o.outcome = 'regenerated')::int, count(*) filter (where o.outcome = 'discarded')::int,
         count(*) filter (where o.outcome = 'superseded')::int, count(*) filter (where o.outcome = 'not_used')::int,
         round(avg(o.words_changed) filter (where o.outcome = 'sent_edited'), 1),
         round(avg(least(1.0, o.words_changed::numeric / greatest(o.draft_words, 1))) filter (where o.outcome = 'sent_edited'), 2)
  from public.ai_reply_draft_outcomes o
  where o.occurred_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 3650)))
  group by o.intent
  order by count(*) desc, o.intent;
end $$;
revoke all on function public.ai_draft_outcome_summary(integer) from public, anon;
grant execute on function public.ai_draft_outcome_summary(integer) to authenticated;
