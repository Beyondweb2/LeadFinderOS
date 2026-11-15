-- ONBOARDING → AUDIT, SELF-SERVE (v1-onboarding-to-audit, 2026-11-15).
--
--   services_not_wanted  "Anything you do but DON'T want more of?" (e.g. emergency call-outs). Different
--                        from services_not_offered: they DO it, so nothing says they don't — but it is
--                        never measured or pushed. Discovery, the baseline 20 and the final-20 checks
--                        treat it as an exclusion alongside services_not_offered (paid-baseline).
--   coverage_area        The area they cover, in their own words ("all London boroughs inside the M25",
--                        "Kent and East Sussex", "20 miles around Croydon"). Context for Paul when he
--                        approves the towns; the questions are still written per approved town.
--
-- Both free text, both optional. ADDITIVE AND IDEMPOTENT; onboarding_responses is small (89 rows) and a
-- nullable column with no default does not rewrite it. Run BEFORE deploying findable-onboarding /
-- paid-baseline / client-onboarding (they select these columns), then read back.

alter table public.onboarding_responses add column if not exists services_not_wanted text;
alter table public.onboarding_responses add column if not exists coverage_area text;

comment on column public.onboarding_responses.services_not_wanted is
  'Client-stated: services they DO offer but do not want pushed (e.g. emergency call-outs). Excluded from Discovery and the baseline, like services_not_offered.';
comment on column public.onboarding_responses.coverage_area is
  'Client-stated: the area they cover, in their own words (boroughs, counties, a radius). Context for approving towns.';

-- Read back:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'onboarding_responses'
--     and column_name in ('services_not_wanted', 'coverage_area');
