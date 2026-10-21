-- Inbox lead rows show a small score per AI engine (ChatGPT, Gemini, Google AI) from the lead's newest audit.
-- Same pattern as the Gemini counts (20260927110000 / 20261102090000): plain nullable columns (instant), a BEFORE trigger that
-- fills them on every write of `result`, a batched backfill, and ONE security-invoker function the Inbox calls once.
-- ⛔ No generated columns, no rewrite of the big table. ⛔ Additive: nothing that writes results changes.
-- The Inbox shows grey chips (no answer) if inbox_engine_signals() is missing, so deploy order cannot break it.
-- To undo: drop function public.inbox_engine_signals(); the extra columns are harmless.
--
-- APPLY IN THREE STEPS, one block each: STEP 1 (columns + trigger), STEP 2 (backfill, repeat until 0), STEP 3 (the function).

-- ── STEP 1 ──────────────────────────────────────────────────────────────────────────────────────
alter table public.ai_audit_queue
  add column if not exists chatgpt_answered boolean,
  add column if not exists chatgpt_self_named boolean,
  add column if not exists overview_answered boolean,
  add column if not exists overview_self_named boolean;

create or replace function public.fill_ai_audit_queue_parts()
returns trigger language plpgsql as $$
begin
  new.gemini_answered := coalesce(new.result ? 'gemini', false);
  new.gemini_self_named := coalesce(nullif((new.result -> 'gemini') ->> 'self_named', '')::boolean,
                                    nullif((new.result -> 'gemini') ->> 'named', '')::boolean);
  new.chatgpt_answered := coalesce(new.result ? 'chatgpt', false);
  new.chatgpt_self_named := coalesce(nullif((new.result -> 'chatgpt') ->> 'self_named', '')::boolean,
                                     nullif((new.result -> 'chatgpt') ->> 'named', '')::boolean);
  new.overview_answered := coalesce(length(btrim(coalesce((new.result -> 'ai_overview') ->> 'answer_text', ''))) > 0, false);
  new.overview_self_named := coalesce(nullif((new.result -> 'ai_overview') ->> 'self_named', '')::boolean,
                                      nullif((new.result -> 'ai_overview') ->> 'named', '')::boolean);
  return new;
end
$$;

-- ── STEP 2 — backfill, 300 rows a call, repeat until it updates 0 rows ─────────────────────────────
-- (the queue's updated_at trigger is paused around the batch so old rows do not look freshly touched)
/*
alter table public.ai_audit_queue disable trigger update_ai_audit_queue_updated_at;
with b as (select id from public.ai_audit_queue where chatgpt_answered is null limit 300)
update public.ai_audit_queue q set
  chatgpt_answered = coalesce(q.result ? 'chatgpt', false),
  chatgpt_self_named = coalesce(nullif((q.result -> 'chatgpt') ->> 'self_named', '')::boolean, nullif((q.result -> 'chatgpt') ->> 'named', '')::boolean),
  overview_answered = coalesce(length(btrim(coalesce((q.result -> 'ai_overview') ->> 'answer_text', ''))) > 0, false),
  overview_self_named = coalesce(nullif((q.result -> 'ai_overview') ->> 'self_named', '')::boolean, nullif((q.result -> 'ai_overview') ->> 'named', '')::boolean)
  from b where q.id = b.id;
alter table public.ai_audit_queue enable trigger update_ai_audit_queue_updated_at;
*/

-- ── STEP 3 — the one call the Inbox makes ──────────────────────────────────────────────────────────
create or replace function public.inbox_engine_signals()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'audit_id', a.id,
      'lead_id', a.lead_id,
      'chatgpt_answers', s.chatgpt_answers, 'chatgpt_named', s.chatgpt_named,
      'gemini_answers', s.gemini_answers, 'gemini_named', s.gemini_named,
      'overview_answers', s.overview_answers, 'overview_named', s.overview_named
    ) order by a.id),
    '[]'::jsonb)
  from public.ai_audits a
  join lateral (
    select
      count(*) filter (where q.chatgpt_answered) as chatgpt_answers,
      count(*) filter (where q.chatgpt_answered and q.chatgpt_self_named) as chatgpt_named,
      count(*) filter (where q.gemini_answered) as gemini_answers,
      count(*) filter (where q.gemini_answered and q.gemini_self_named) as gemini_named,
      count(*) filter (where q.overview_answered) as overview_answers,
      count(*) filter (where q.overview_answered and q.overview_self_named) as overview_named
    from public.ai_audit_runs r
    join public.ai_audit_queue q on q.run_id = r.id and q.status = 'done'
    where r.audit_id = a.id
  ) s on true
  where a.lead_id is not null;
$$;

revoke all on function public.inbox_engine_signals() from public, anon;
grant execute on function public.inbox_engine_signals() to authenticated;
