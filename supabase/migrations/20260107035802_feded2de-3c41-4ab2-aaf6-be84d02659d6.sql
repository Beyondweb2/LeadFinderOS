-- Create enum for call outcomes
CREATE TYPE public.call_outcome AS ENUM (
  'interested',
  'not_interested', 
  'no_answer',
  'callback_scheduled',
  'wrong_number',
  'left_voicemail'
);

-- Create table to track lead contacts
CREATE TABLE public.lead_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL,
  lead_name TEXT NOT NULL,
  outcome call_outcome NOT NULL,
  notes TEXT,
  contacted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups by lead_id
CREATE INDEX idx_lead_contacts_lead_id ON public.lead_contacts(lead_id);

-- Enable RLS (but allow public access since no auth yet)
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (no auth)
CREATE POLICY "Allow all operations on lead_contacts"
ON public.lead_contacts
FOR ALL
USING (true)
WITH CHECK (true);