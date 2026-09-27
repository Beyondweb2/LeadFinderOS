-- Inbox + Outreach load speed (2026-09-27). Paul approved: "inbox and outreach page must load quicker".
--
-- 🔴 THE FAULT. The Inbox's audits+runs embed and the audit_gemini_signal view answered 500
-- (57014, statement timeout, authenticated = 8 s) on a normal load. Both needed ~1 MB and made
-- Postgres detoast ~100 MB: every run's full `results` (2,042 rows, 47 MB) to project two small keys,
-- and every queue row's full `result` (8,251 rows, 53 MB) to count Gemini answers. Measured as the
-- admin with API-style claims: gemini 8.8 s cold / 2.4 s warm, embed 3.7 s / 0.2 s. With the fix
-- (prototyped, rolled back): gemini 0.06 s / 0.01 s, embed 0.07 s / 0.03 s, values identical.
--
-- ⛔ NOT GENERATED COLUMNS, ON PURPOSE. `add column … generated always as … stored` rewrites the
-- table under an ACCESS EXCLUSIVE lock; on this instance that took over 100 s for these two tables and
-- queued the live Inbox behind it (tried inside a rolled-back test, 2026-09-27). Instead: plain
-- nullable columns (instant), a BEFORE trigger that fills them on every write of the big column, and
-- a backfill in small batches (row locks only). Nothing that writes results changes.
--
-- ⚠️ APPLY IN THREE STEPS, one statement block each (a multi-statement query returns only the last
-- result, and step 2 must never run as one long transaction):
--   STEP 1 — columns + triggers (this block).
--   STEP 2 — the backfill, repeated until it reports 0 rows (block at the bottom, commented).
--   STEP 3 — verify equality, then the view + the owner read policies (block at the bottom).
-- ⛔ The multi-user sales policies and sales_leads are not touched.

-- ── STEP 1 ──────────────────────────────────────────────────────────────────────────────────────
alter table public.ai_audit_runs
  add column if not exists results_summary jsonb,
  add column if not exists results_crawl_check jsonb;
alter table public.ai_audit_queue
  add column if not exists gemini_answered boolean,
  add column if not exists gemini_self_named boolean;

create or replace function public.fill_ai_audit_run_parts()
returns trigger language plpgsql as $$
begin
  new.results_summary := new.results -> 'summary';
  new.results_crawl_check := new.results -> 'crawl_check';
  return new;
end
$$;
drop trigger if exists trg_ai_audit_runs_parts on public.ai_audit_runs;
create trigger trg_ai_audit_runs_parts before insert or update of results on public.ai_audit_runs
  for each row execute function public.fill_ai_audit_run_parts();

create or replace function public.fill_ai_audit_queue_parts()
returns trigger language plpgsql as $$
begin
  new.gemini_answered := coalesce(new.result ? 'gemini', false);
  new.gemini_self_named := coalesce(nullif((new.result -> 'gemini') ->> 'self_named', '')::boolean,
                                    nullif((new.result -> 'gemini') ->> 'named', '')::boolean);
  return new;
end
$$;
drop trigger if exists trg_ai_audit_queue_parts on public.ai_audit_queue;
create trigger trg_ai_audit_queue_parts before insert or update of result on public.ai_audit_queue
  for each row execute function public.fill_ai_audit_queue_parts();

revoke execute on function public.fill_ai_audit_run_parts() from public, anon, authenticated;
revoke execute on function public.fill_ai_audit_queue_parts() from public, anon, authenticated;

/* ── STEP 2 — backfill, 300 rows a call, repeat until both counts are 0 ──────────────────────────
   The queue's updated_at trigger is paused around its batch so the backfill does not make old
   rows look freshly touched (MAX_RUN_AGE_MS stale-run detection reads updated_at).

with b as (select id from public.ai_audit_runs where results_summary is null and results is not null
             and (results ? 'summary' or results ? 'crawl_check') limit 300)
update public.ai_audit_runs r set results_summary = r.results -> 'summary', results_crawl_check = r.results -> 'crawl_check'
  from b where r.id = b.id;

alter table public.ai_audit_queue disable trigger update_ai_audit_queue_updated_at;
with b as (select id from public.ai_audit_queue where gemini_answered is null limit 300)
update public.ai_audit_queue q set gemini_answered = coalesce(q.result ? 'gemini', false),
  gemini_self_named = coalesce(nullif((q.result -> 'gemini') ->> 'self_named', '')::boolean, nullif((q.result -> 'gemini') ->> 'named', '')::boolean)
  from b where q.id = b.id;
alter table public.ai_audit_queue enable trigger update_ai_audit_queue_updated_at;

── STEP 3 — only after a zero-difference check (see docs/inbox-outreach-speed.md) ─────────────────

create or replace view public.audit_gemini_signal with (security_invoker = on) as
 select a.id as audit_id, a.lead_id,
    count(*) filter (where q.gemini_answered) as gemini_answers,
    count(*) filter (where q.gemini_answered and q.gemini_self_named) as gemini_named
   from public.ai_audits a
     join public.ai_audit_runs r on r.audit_id = a.id
     join public.ai_audit_queue q on q.run_id = r.id and q.status = 'done'
  group by a.id, a.lead_id;

alter policy "Users can view their own ai_audits" on public.ai_audits using ((select auth.uid()) = user_id);
alter policy "Users can view their own ai_audit_runs" on public.ai_audit_runs using ((select auth.uid()) = user_id);
alter policy "Users can view their own ai_audit_queue" on public.ai_audit_queue using ((select auth.uid()) = user_id);
alter policy "Users can view their own leads" on public.outreach_leads using ((select auth.uid()) = user_id);
alter policy "Users can view their own history" on public.outreach_history using ((select auth.uid()) = user_id);
alter policy "lead_page_hits owner read" on public.lead_page_hits using ((select auth.uid()) = user_id);
alter policy "Users can view their own templates" on public.templates using ((select auth.uid()) = user_id);
alter policy "wa_messages read own or admin" on public.whatsapp_messages
  using ((user_id = (select auth.uid())) or (select public.has_role((select auth.uid()), 'admin'::public.app_role)));
analyze public.ai_audit_runs;
analyze public.ai_audit_queue;
*/
