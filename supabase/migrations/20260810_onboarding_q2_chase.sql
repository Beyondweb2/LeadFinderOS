-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CHASING THE SECOND QUESTIONNAIRE — day 2 and day 5.
--
-- A paid customer who never completes Q2 cannot be delivered to: no town, no services and no
-- address means startPaidBaseline defers, so there is no week-eight measurement and the guarantee
-- turns into a refund. Silence is the expensive option.
--
-- ⛔ A COUNT, NOT JUST A STAMP. "When did we last chase" cannot answer "which chase is next" —
-- after the day-2 email the stamp is 2 days old, and on day 5 that is indistinguishable from
-- never having sent the second one. The count makes each chase fire exactly once:
--   q2_chase_count = 0 and >= 2 days  -> send the first
--   q2_chase_count = 1 and >= 5 days  -> send the second
--   q2_chase_count >= 2               -> stop; it is a dashboard task now, not an email
--
-- ⛔ NOTHING IS DERIVED FROM THESE ABOUT WHETHER Q2 IS DONE. That stays derived from the answers
-- themselves (needsQ2 in src/hooks/useSubmissions.ts) — a stored "finished" flag would freeze old
-- rows against a stale definition. These two columns record only what WE sent.
--
-- NULL / 0 = never chased, which is the honest starting state for every existing row.
-- Purely additive. No backfill.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.onboarding_responses
  add column if not exists q2_chased_at timestamptz,
  add column if not exists q2_chase_count integer not null default 0;

comment on column public.onboarding_responses.q2_chased_at is
  'When the last second-questionnaire chase was sent. NULL = never chased. Records what we sent, never whether they answered — that is derived from the answers.';
comment on column public.onboarding_responses.q2_chase_count is
  'How many Q2 chases have gone out. 0 -> day-2 email is next, 1 -> day-5 email, >=2 -> stop emailing and let the dashboard task carry it. A stamp alone cannot answer this.';
