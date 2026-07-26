-- PAID CLIENT BASELINE. A single run is not a defensible measuring stick for the money-back
-- guarantee: measured in this database, Sinners and Saints swung 0 → 0.5 → 0 → 0.5 → 0.6 across
-- five runs with no intervention, and ABLM's answered-question coverage swung 40%..100% across
-- 18 runs of the same questions. So a paid baseline is several runs of the SAME questions,
-- averaged, and later comparisons only count questions answered on BOTH sides.
--
-- baseline_target_runs  how many runs make up this audit's baseline (null/0/1 = ordinary audit).
--                       Set by findable-onboarding (3); the queue's completion hook fires the
--                       repeats and finalises the snapshot.
-- baseline              the averaged snapshot: per question, per engine, answered + named counts
--                       across the counted runs, plus a summary. Written once, when the target
--                       is reached. Presence is the done-marker.
-- baseline_completed_at when that happened.

alter table public.ai_audits
  add column if not exists baseline_target_runs integer,
  add column if not exists baseline jsonb,
  add column if not exists baseline_completed_at timestamptz;

-- Finding audits whose baseline is still being measured (the chain driver's lookup).
create index if not exists ai_audits_baseline_pending_idx
  on public.ai_audits (baseline_target_runs)
  where baseline_target_runs is not null and baseline is null;
