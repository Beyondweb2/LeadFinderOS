
-- Add free_search_count column to user_trials for the new 5-search free access model
-- Default 0 for all existing and new users
ALTER TABLE public.user_trials 
  ADD COLUMN IF NOT EXISTS free_search_count integer NOT NULL DEFAULT 0;
