-- Q2's second answer ("Areas you want work from") gets its own column. It was riding
-- along on `standout` because there was nowhere else to put it: `services` is what
-- findable-onboarding feeds the audit as specialisms, and area names in there skew the
-- generated questions. `services` stays audit-facing; this column is storage only.

alter table public.onboarding_responses
  add column if not exists areas_wanted text;
