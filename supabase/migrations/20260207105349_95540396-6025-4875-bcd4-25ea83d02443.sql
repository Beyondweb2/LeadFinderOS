-- Change default next_action from 'call' to 'none'
ALTER TABLE public.outreach_leads 
ALTER COLUMN next_action SET DEFAULT 'none'::next_action_type;