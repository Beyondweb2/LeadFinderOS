
-- Add trial_used flag to user_trials
ALTER TABLE public.user_trials
ADD COLUMN IF NOT EXISTS trial_used boolean NOT NULL DEFAULT false;
