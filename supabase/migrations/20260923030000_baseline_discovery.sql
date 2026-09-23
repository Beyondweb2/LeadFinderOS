-- Paid-client Discovery before the baseline (2026-09-23). Additive: the generated Discovery pool
-- (question + town + service + intent) and which questions Paul added to the baseline draft.
alter table public.onboarding_responses add column if not exists baseline_discovery jsonb;
