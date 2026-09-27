-- The Coverage niche lookup's trimmed copy of each queue result (2026-09-28, Paul approved:
-- "an additive derived column only … derived value contains ONLY what niche calculations require").
--
-- 🔴 THE COST. market-view's niche fold reads ai_audit_queue.result for every done question of a trade
-- (Plumbers: 1,741 rows, 19 MB). The database spent ~8.4 s of server time just unpacking those values
-- (measured, one batch at a time); picking fields out through PostgREST saved only 22% because every
-- path still opens the whole value. ~65% of each result is answer_text, which the fold never reads.
--
-- WHAT THE FOLD READS (market-view + classifyWinnability + cellNamed without a text context +
-- runIsModelRead), per engine in chatgpt / gemini / ai_overview / google_organic:
--   named, self_named, position, competitors, citations[].url, and WHETHER answer_text is truthy.
-- So result_niche holds exactly that: those four engine keys when present, each engine object cut to
-- those fields, citations cut to {url}, and answer_present = the JavaScript truthiness of answer_text.
-- A non-object engine value is copied as it is, so the fold sees what it always saw.
--
-- ⛔ SAME PATTERN AS 20260927110000 / 20260927130000: plain nullable column (catalog-only), the
-- EXISTING parts trigger fills it on every write of result, a primary-key-walk backfill in small
-- batches with triggers off for THAT session only (session_replication_role = replica, so updated_at
-- is not bumped — stale-run detection reads it), and a zero-difference check before any read switches.
-- result stays the source of truth; nothing that writes it changes.
--
-- ⚠️ APPLY IN THREE STEPS, one block per call, with lock/statement timeouts.

-- ── STEP 1 ──────────────────────────────────────────────────────────────────────────────────────
set local lock_timeout = '3s';
alter table public.ai_audit_queue add column if not exists result_niche jsonb;

create or replace function public.niche_result_slim(r jsonb)
returns jsonb language sql immutable as $$
  select case
    when r is null then null
    when jsonb_typeof(r) <> 'object' then null
    else coalesce((
      select jsonb_object_agg(e.key,
        case when jsonb_typeof(e.value) = 'object' then jsonb_build_object(
          'named', e.value -> 'named',
          'self_named', e.value -> 'self_named',
          'position', e.value -> 'position',
          'competitors', e.value -> 'competitors',
          'citations', case when jsonb_typeof(e.value -> 'citations') = 'array' then (
              select coalesce(jsonb_agg(case when jsonb_typeof(c.v) = 'object' then jsonb_build_object('url', c.v -> 'url') else c.v end order by c.ord), '[]'::jsonb)
              from jsonb_array_elements(e.value -> 'citations') with ordinality as c(v, ord))
            else e.value -> 'citations' end,
          -- JavaScript truthiness of answer_text (runIsModelRead's `!c.answer_text`).
          'answer_present', case jsonb_typeof(e.value -> 'answer_text')
              when 'string' then (e.value ->> 'answer_text') <> ''
              when 'number' then (e.value -> 'answer_text')::text::numeric <> 0
              when 'boolean' then (e.value -> 'answer_text')::text::boolean
              when 'object' then true
              when 'array' then true
              else false end)
        else e.value end)
      from jsonb_each(r) as e
      where e.key in ('chatgpt', 'gemini', 'ai_overview', 'google_organic')), '{}'::jsonb)
  end
$$;

create or replace function public.fill_ai_audit_queue_parts()
returns trigger language plpgsql as $$
begin
  new.gemini_answered := coalesce(new.result ? 'gemini', false);
  new.gemini_self_named := coalesce(nullif((new.result -> 'gemini') ->> 'self_named', '')::boolean,
                                    nullif((new.result -> 'gemini') ->> 'named', '')::boolean);
  new.result_niche := public.niche_result_slim(new.result);
  return new;
end
$$;
revoke execute on function public.niche_result_slim(jsonb) from public, anon, authenticated;
revoke execute on function public.fill_ai_audit_queue_parts() from public, anon, authenticated;

/* ── STEP 2 — backfill, primary-key walk, 100 rows a call ──────────────────────────────────────────
set statement_timeout = '8s'; set lock_timeout = '2s'; set session_replication_role = replica;
with b as (select id from public.ai_audit_queue where id > :cursor order by id limit 100 for update skip locked),
u as (update public.ai_audit_queue q set result_niche = public.niche_result_slim(q.result) from b
       where q.id = b.id and q.result_niche is distinct from public.niche_result_slim(q.result) returning 1)
select (select count(*) from b) scanned, (select max(id::text) from b) last, (select count(*) from u) written;
reset session_replication_role;

── STEP 3 — zero differences, id batches ─────────────────────────────────────────────────────────
select count(*) from (select id from public.ai_audit_queue where id > :cursor order by id limit 200) b
  join public.ai_audit_queue q using (id)
 where q.result_niche is distinct from public.niche_result_slim(q.result);
*/
