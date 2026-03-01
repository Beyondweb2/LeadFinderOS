
ALTER TABLE public.outreach_leads
ADD COLUMN whatsapp_status text DEFAULT 'unknown',
ADD COLUMN whatsapp_checked_at timestamptz DEFAULT NULL;
