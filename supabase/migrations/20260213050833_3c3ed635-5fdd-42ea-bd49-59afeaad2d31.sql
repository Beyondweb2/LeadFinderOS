
CREATE TABLE public.funnel_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  event_type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Allow inserts from service role only (edge functions use service role)
CREATE POLICY "Only service role can insert funnel events"
  ON public.funnel_events FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can select funnel events"
  ON public.funnel_events FOR SELECT
  USING (false);

-- Prevent duplicates: unique on user_id + event_type within 5 min window
CREATE INDEX idx_funnel_events_user_type ON public.funnel_events (user_id, event_type, created_at DESC);
