-- Add is_archived column to outreach_leads for archive functionality
ALTER TABLE public.outreach_leads 
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

-- Create index for fast filtering by user and archive status
CREATE INDEX idx_outreach_leads_archived 
ON public.outreach_leads(user_id, is_archived);