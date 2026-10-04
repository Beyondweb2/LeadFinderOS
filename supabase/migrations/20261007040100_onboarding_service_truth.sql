-- SERVICE TRUTH — the two answers the client was never asked (fix/04-ai-measurement, 2026-10-04;
-- Session C C-04 and the client-facts audit).
--
--   services_not_offered  "What do you NOT offer — what should we never describe you as offering?"
--                         Read by Discovery, the final-20 checks and the backlog seeding
--                         (src/lib/serviceScope.ts). Session C's locksmith did not do car keys;
--                         Discovery wrote a car-keys question and approval seeded it as future work.
--   top_requests          "What do customers contact you for most often?" — what the 20 should
--                         weight, instead of spreading across every listed service in list order.
--
-- Both free text, both optional, never invented. ADDITIVE AND IDEMPOTENT. Run BEFORE deploying
-- findable-onboarding / paid-baseline (both select these columns), then read back.

alter table public.onboarding_responses add column if not exists services_not_offered text;
alter table public.onboarding_responses add column if not exists top_requests text;

comment on column public.onboarding_responses.services_not_offered is
  'Client-stated services they do NOT offer / must never be described as offering. A hard exclusion for Discovery, the baseline and the backlog (src/lib/serviceScope.ts).';
comment on column public.onboarding_responses.top_requests is
  'Client-stated: what customers contact them for most often. Weights the baseline toward the money services.';

-- Read back:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'onboarding_responses'
--     and column_name in ('services_not_offered', 'top_requests');
