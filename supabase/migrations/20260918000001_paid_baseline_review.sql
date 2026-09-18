-- Paid-client baseline review state.  The existing onboarding row is already the
-- paid-client relationship, so keep the draft and approval state there rather
-- than introducing another fulfilment table.
ALTER TABLE public.onboarding_responses
  ADD COLUMN IF NOT EXISTS baseline_status text,
  ADD COLUMN IF NOT EXISTS baseline_questions jsonb,
  ADD COLUMN IF NOT EXISTS baseline_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS baseline_approved_by uuid;

CREATE INDEX IF NOT EXISTS onboarding_responses_paid_baseline_status_idx
  ON public.onboarding_responses (status, baseline_status, updated_at);
