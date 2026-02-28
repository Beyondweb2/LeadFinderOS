
-- Add lifecycle email fields to user_trials
ALTER TABLE public.user_trials
  ADD COLUMN IF NOT EXISTS checkout_started_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_stage integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_lifecycle_email_sent_at timestamp with time zone DEFAULT NULL;
