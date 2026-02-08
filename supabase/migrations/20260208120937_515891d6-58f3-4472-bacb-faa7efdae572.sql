-- Add 'no_whatsapp' to lead_status enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'no_whatsapp';