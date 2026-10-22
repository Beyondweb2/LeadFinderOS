-- ONE AUDIT SCORE, EVERYWHERE (2026-10-22, Paul). Record: docs/audit-score-one-ruler.md. Rules: src/lib/auditScore.ts.
-- The Inbox chips, the thread header, the Visible flag and the drafter's fallback read ONE stored score per run: the card's own
-- scorer (scoreHookRun, the report's ruler), computed by the ai-reply-drafts tick and stored in ai_audit_runs.hook_score.
--
-- ⛔ A STORED SCORE CAN NEVER BE SHOWN AS CURRENT OVER CHANGED INPUTS: every write of an answer (ai_audit_queue result / status),
--    of a run's status, or of the audit's name / trade / town / created_at marks the run dirty (score_dirty_at). A dirty run reads
--    as "updating" until the tick rescores it; the tick clears the mark only if nothing re-marked it meanwhile.
-- ⛔ Plain nullable columns (instant, no rewrite). Small row-level updates of ai_audit_runs only. Nothing that writes results changes.
-- ⛔ The tick's cron (invoke_ai_reply_drafts) now also posts while a run is dirty, so scores (and the Visible sweep) catch up
--    without waiting for a reply.
-- Rollback (Paul only): drop trigger trg_audit_score_queue on public.ai_audit_queue; drop trigger trg_audit_score_run on
--   public.ai_audit_runs; drop trigger trg_audit_score_audit on public.ai_audits; drop function public._audit_score_mark_queue(),
--   public._audit_score_mark_run(), public._audit_score_mark_audit(); restore invoke_ai_reply_drafts from 20261109090000.
--   The columns may stay.
--
-- APPLY IN TWO STEPS: STEP 1 (this block, one call). STEP 2 (the backfill at the bottom, repeated until it updates 0 rows).

set local lock_timeout = '5s';

-- ── STEP 1 ──────────────────────────────────────────────────────────────────────────────────────
alter table public.ai_audit_runs
  add column if not exists hook_score jsonb,
  add column if not exists score_dirty_at timestamptz,
  add column if not exists scored_at timestamptz;
create index if not exists ai_audit_runs_score_dirty_idx on public.ai_audit_runs (created_at desc) where score_dirty_at is not null;
create index if not exists ai_audit_runs_scored_at_idx on public.ai_audit_runs (scored_at) where scored_at is not null;

-- An answer changed → its run is dirty.
create or replace function public._audit_score_mark_queue()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.run_id is not null then
    update public.ai_audit_runs set score_dirty_at = now()
     where id = new.run_id and score_dirty_at is distinct from now();
  end if;
  return null;
end; $$;
revoke all on function public._audit_score_mark_queue() from public, anon, authenticated;
drop trigger if exists trg_audit_score_queue on public.ai_audit_queue;
create trigger trg_audit_score_queue after insert or update of result, status on public.ai_audit_queue
  for each row execute function public._audit_score_mark_queue();

-- A run's status changed (complete / capped / failed decides "complete") → dirty. New runs start dirty.
create or replace function public._audit_score_mark_run()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.score_dirty_at := now();
  end if;
  return new;
end; $$;
revoke all on function public._audit_score_mark_run() from public, anon, authenticated;
drop trigger if exists trg_audit_score_run on public.ai_audit_runs;
create trigger trg_audit_score_run before insert or update of status on public.ai_audit_runs
  for each row execute function public._audit_score_mark_run();

-- The audit's name / trade / town is the ruler's context, and created_at picks the scoring method → its runs are dirty.
create or replace function public._audit_score_mark_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.business_name is distinct from old.business_name or new.business_type is distinct from old.business_type
     or new.location_text is distinct from old.location_text or new.created_at is distinct from old.created_at
     or new.audit_purpose is distinct from old.audit_purpose or new.is_market is distinct from old.is_market then
    update public.ai_audit_runs set score_dirty_at = now() where audit_id = new.id;
  end if;
  return null;
end; $$;
revoke all on function public._audit_score_mark_audit() from public, anon, authenticated;
drop trigger if exists trg_audit_score_audit on public.ai_audits;
create trigger trg_audit_score_audit after update on public.ai_audits
  for each row execute function public._audit_score_mark_audit();

-- The tick also runs while a score is waiting (it used to run only for reply work).
create or replace function public.invoke_ai_reply_drafts()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_service_key text; v_anon_key text; v_cron_secret text;
begin
  if not exists (select 1 from public.ai_reply_draft_candidates(1))
     and not exists (select 1 from public.ai_reply_drafts where status in ('generating', 'sending'))
     and not exists (select 1 from public.ai_audit_runs where score_dirty_at is not null) then
    return;
  end if;
  select decrypted_secret into v_service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  select decrypted_secret into v_anon_key    from vault.decrypted_secrets where name = 'SUPABASE_ANON_KEY'         limit 1;
  select decrypted_secret into v_cron_secret from vault.decrypted_secrets where name = 'CRON_SECRET'               limit 1;
  perform net.http_post(
    url := 'https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/ai-reply-drafts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, ''),
      'apikey', coalesce(v_anon_key, ''),
      'x-internal-job', '1',
      'x-cron-secret', coalesce(v_cron_secret, '')
    ),
    body := jsonb_build_object('action', 'tick', 'triggered_by', 'pg_cron')
  );
end $$;

-- ── STEP 2 — mark every run never scored, 500 a call, repeat until it updates 0 rows ────────────────
/*
with b as (select id from public.ai_audit_runs where hook_score is null and score_dirty_at is null and scored_at is null limit 500)
update public.ai_audit_runs r set score_dirty_at = now() from b where r.id = b.id;
*/

-- Read back:
--   select column_name from information_schema.columns where table_name = 'ai_audit_runs' and column_name in ('hook_score','score_dirty_at','scored_at');
--   select tgname from pg_trigger where tgname in ('trg_audit_score_queue','trg_audit_score_run','trg_audit_score_audit');
--   select count(*) filter (where score_dirty_at is not null) dirty, count(*) filter (where hook_score is not null) scored from public.ai_audit_runs;
