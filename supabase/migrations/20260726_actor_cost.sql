-- MEASURED actor spend per audit run, so unit economics stop being an estimate.
--
-- Apify's "Get run" API returns data.usageTotalUsd (what the run actually cost) and
-- stats.computeUnits. The queue already makes that exact GET to poll each question's run
-- status, so collecting the figure costs no extra API calls: the per-question amount is kept
-- on the queue row (result._cost_usd) and summed here at finalisation.
--
-- Null means "not measured": rows finalised before this shipped, or a run where every
-- question failed (an Apify 402 outage charges nothing, so there is nothing to record).

alter table public.ai_audit_runs
  add column if not exists actor_cost_usd numeric;

comment on column public.ai_audit_runs.actor_cost_usd is
  'Real Apify spend for this run in USD, summed from each question run''s usageTotalUsd. Null = not measured.';
