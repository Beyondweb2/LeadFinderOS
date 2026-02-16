
-- Add new lead status enum values for separate contact methods
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'facebook_msg';
