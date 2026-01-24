-- Add list_type column to outreach_leads
ALTER TABLE public.outreach_leads
ADD COLUMN list_type text NOT NULL DEFAULT 'no_website';

-- Add check constraint for valid values
ALTER TABLE public.outreach_leads
ADD CONSTRAINT outreach_leads_list_type_check 
CHECK (list_type IN ('no_website', 'broken_website'));