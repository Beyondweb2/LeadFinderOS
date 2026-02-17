
-- Step 1: Change status column from ENUM to TEXT
ALTER TABLE public.outreach_leads 
  ALTER COLUMN status TYPE text USING status::text;

-- Step 2: Set a sensible default
ALTER TABLE public.outreach_leads 
  ALTER COLUMN status SET DEFAULT 'not_contacted';

-- Note: We keep the lead_status enum type in the database for backwards compat,
-- but the column is now TEXT so any string value is accepted.
