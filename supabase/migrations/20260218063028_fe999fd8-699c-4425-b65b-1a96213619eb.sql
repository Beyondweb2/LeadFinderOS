
-- The free_search_count column already exists in user_trials table.
-- We need to add walkthrough_completed column.

ALTER TABLE public.user_trials 
  ADD COLUMN IF NOT EXISTS walkthrough_completed boolean NOT NULL DEFAULT false;
