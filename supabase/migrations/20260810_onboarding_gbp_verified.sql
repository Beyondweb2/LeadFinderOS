-- ════════════════════════════════════════════════════════════════════════════════════════════
-- IS THE GOOGLE BUSINESS PROFILE **VERIFIED** — which is not what gbp_exists asks.
--
-- gbp_exists asks whether a profile exists and whether they can sign in to it. That is CLAIM and
-- ACCESS. Verification is a third thing, and its option "Yes, and I can get into it" is equally
-- true of a profile that is pending verification and of one that is suspended.
--
-- ⛔ WHY IT MATTERS ENOUGH TO ASK: an unverified profile does not show on Maps or Search. Every
-- hour of profile work — categories, services, posts, photos — publishes to nobody, and the
-- questionnaire currently gives us no way to know that before the work starts. It is also the
-- state that most often explains "AI has never heard of me": there is nothing of theirs to read.
--
-- ⛔ NULL = NOT ANSWERED, NEVER AN ANSWER. The rule every column in this table follows. A skipped
-- question must never read as "no" — CLAUDE.md records six live instances of an absent value
-- falling through as though it were a real one.
--
-- ⚠️ NO CHECK CONSTRAINT, DELIBERATELY, matching gbp_exists and gbp_status. The permitted values
-- are enforced by a Set in findable-onboarding, where they sit beside the question that produces
-- them. A CHECK here would be a second copy of the rule in a second language, and CLAUDE.md §8
-- records the bulk_jobs job_type constraint as a live example of one that exists only in the
-- database and is invisible to anyone reading the repo.
--
-- Purely additive. No backfill: every existing row genuinely has no answer to this question.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.onboarding_responses
  -- 'yes' | 'pending' | 'no' | 'not_sure'
  add column if not exists gbp_verified text;

comment on column public.onboarding_responses.gbp_verified is
  'Is the Google Business Profile VERIFIED, not merely claimed: yes | pending | no | not_sure. Asked only when gbp_exists = yes, because the other three answers already mean the profile is not ours to work on yet. pending = verification in flight (postcard, video review) and resolves itself; no = nothing started, and is a delivery task in its own right. An unverified profile does not show on Maps or Search, so profile work publishes to nobody. NULL = not answered, never an answer.';
