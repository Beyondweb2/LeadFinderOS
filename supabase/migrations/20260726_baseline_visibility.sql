-- PAID BASELINE diagnosability. The 3-run chain stalled silently: advanceBaseline logged its
-- failure to a console that isn't reachable from the CLI, so "the chain was refused" looked
-- exactly like "the chain never ran", and two paid baselines sat at 1 run while the results
-- screen promised the customer an average of three.
--
-- baseline_error            why the last advance attempt failed, or NULL when it didn't. Cleared
--                           on any successful/waiting outcome so a fixed chain stops showing an
--                           old failure.
-- baseline_last_attempt_at  when the chain was last driven, by the completion hook or the sweep.
--                           A baseline below target with a stale timestamp means the sweep isn't
--                           running; a recent timestamp plus an error means the call is refused.
--
-- Both are written migration-tolerantly: until this runs, the outcome is recorded on the latest
-- run's results jsonb instead (results.baseline_advance), so nothing is invisible either way.

alter table public.ai_audits
  add column if not exists baseline_error text,
  add column if not exists baseline_last_attempt_at timestamptz;

-- Find stalled paid baselines at a glance:
--   select id, baseline_target_runs, baseline_error, baseline_last_attempt_at
--   from ai_audits where baseline_target_runs > 1 and baseline is null;
