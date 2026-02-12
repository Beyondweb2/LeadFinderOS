
-- Add checkout abandonment tracking flags to user_trials
ALTER TABLE public.user_trials
  ADD COLUMN IF NOT EXISTS checkout_abandoned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS post_abandon_search_used BOOLEAN NOT NULL DEFAULT FALSE;
