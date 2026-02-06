-- Add explicit plan_status, trial_end_date, and daily search tracking to user_trials

-- Add new columns
ALTER TABLE public.user_trials 
ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'trial',
ADD COLUMN trial_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN searches_today INTEGER NOT NULL DEFAULT 0,
ADD COLUMN last_search_date DATE;

-- Update existing records to have computed trial_end_date
UPDATE public.user_trials 
SET trial_end_date = trial_started_at + (trial_days || ' days')::INTERVAL,
    last_search_date = CURRENT_DATE;

-- Make trial_end_date NOT NULL after populating existing data
ALTER TABLE public.user_trials 
ALTER COLUMN trial_end_date SET NOT NULL;

-- Update the trigger function to populate new fields on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  trial_duration INTEGER := 7;
BEGIN
  INSERT INTO public.user_trials (
    user_id, 
    trial_started_at, 
    trial_days, 
    searches_used,
    plan_status,
    trial_end_date,
    searches_today,
    last_search_date
  )
  VALUES (
    NEW.id, 
    now(), 
    trial_duration, 
    0,
    'trial',
    now() + (trial_duration || ' days')::INTERVAL,
    0,
    CURRENT_DATE
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;