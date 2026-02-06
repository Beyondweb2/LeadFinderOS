-- Add trial tracking columns to subscriptions table
-- Users without a subscription row get a trial that starts at account creation

-- Create a user_trials table to track trial status separately from subscriptions
CREATE TABLE public.user_trials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  trial_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_days INTEGER NOT NULL DEFAULT 7,
  searches_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_trials ENABLE ROW LEVEL SECURITY;

-- Users can read their own trial status
CREATE POLICY "Users can view their own trial" 
ON public.user_trials 
FOR SELECT 
USING (auth.uid() = user_id);

-- Only service role can insert/update (via edge functions or triggers)
CREATE POLICY "Deny direct inserts" 
ON public.user_trials 
FOR INSERT 
WITH CHECK (false);

CREATE POLICY "Deny direct updates" 
ON public.user_trials 
FOR UPDATE 
USING (false);

CREATE POLICY "Deny direct deletes" 
ON public.user_trials 
FOR DELETE 
USING (false);

-- Create trigger to auto-create trial record on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_trials (user_id, trial_started_at, trial_days, searches_used)
  VALUES (NEW.id, now(), 7, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to auth.users (this runs when a new user signs up)
CREATE TRIGGER on_auth_user_created_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_trial();