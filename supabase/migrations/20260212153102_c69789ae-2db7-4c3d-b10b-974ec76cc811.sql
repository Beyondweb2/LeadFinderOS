
-- Add demo_search_used flag to user_trials (safe additive column)
ALTER TABLE public.user_trials
ADD COLUMN IF NOT EXISTS demo_search_used BOOLEAN NOT NULL DEFAULT FALSE;
