
-- Add outreach attempt tracking columns to outreach_leads
ALTER TABLE public.outreach_leads
  ADD COLUMN IF NOT EXISTS last_outreach_attempt_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS outreach_attempts integer NOT NULL DEFAULT 0;

-- Create outreach_events table
CREATE TABLE IF NOT EXISTS public.outreach_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  channel text NOT NULL,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_events_user_created ON public.outreach_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outreach_events_lead_created ON public.outreach_events (lead_id, created_at);

-- Enable RLS
ALTER TABLE public.outreach_events ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can insert and select own rows only
CREATE POLICY "Users can insert own outreach events"
  ON public.outreach_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own outreach events"
  ON public.outreach_events
  FOR SELECT
  USING (auth.uid() = user_id);
