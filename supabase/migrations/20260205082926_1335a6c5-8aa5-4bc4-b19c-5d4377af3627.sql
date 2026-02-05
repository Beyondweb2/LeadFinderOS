-- Add phone column to outreach_history for future recovery
ALTER TABLE public.outreach_history 
ADD COLUMN phone text;