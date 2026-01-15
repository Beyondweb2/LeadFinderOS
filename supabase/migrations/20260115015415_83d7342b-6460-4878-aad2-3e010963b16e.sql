-- Add country column to outreach_leads table
ALTER TABLE public.outreach_leads 
ADD COLUMN country text DEFAULT 'UK';

-- Add country column to outreach_history table for consistency
ALTER TABLE public.outreach_history 
ADD COLUMN country text DEFAULT 'UK';