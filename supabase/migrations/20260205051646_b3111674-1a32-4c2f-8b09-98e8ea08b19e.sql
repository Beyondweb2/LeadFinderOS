-- Add new values to lead_status enum for Potential Work pipeline
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'wants_draft';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'waiting';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'reviewing_draft';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'paid_for_draft';
ALTER TYPE lead_status ADD VALUE IF NOT EXISTS 'completed';

-- Add is_potential_work column to track leads moved to Potential Work
ALTER TABLE outreach_leads ADD COLUMN IF NOT EXISTS is_potential_work BOOLEAN NOT NULL DEFAULT false;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_outreach_leads_potential_work ON outreach_leads(user_id, is_potential_work);