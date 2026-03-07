
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS potential_revenue numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS website text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS services_included text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS project_overview text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS project_value numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS project_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_notes text DEFAULT NULL;
