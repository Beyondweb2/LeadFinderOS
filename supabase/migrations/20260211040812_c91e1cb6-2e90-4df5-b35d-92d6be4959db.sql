-- Add paid client tracking fields to outreach_leads
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_for text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS project_duration text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_checkin_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS checkin_notes text DEFAULT NULL;