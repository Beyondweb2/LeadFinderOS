
-- Add column with default false for new users
ALTER TABLE public.user_trials
  ADD COLUMN IF NOT EXISTS has_seen_walkthrough_prompt boolean NOT NULL DEFAULT false;

-- Set true for all existing users so they never see the modal
UPDATE public.user_trials SET has_seen_walkthrough_prompt = true;
