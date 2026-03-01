
-- Create outreach_logs table for tracking individual contact actions by type
CREATE TABLE IF NOT EXISTS public.outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.outreach_leads(id) ON DELETE CASCADE,
  outreach_type text NOT NULL,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own outreach logs"
  ON public.outreach_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own outreach logs"
  ON public.outreach_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all outreach logs"
  ON public.outreach_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_outreach_logs_user_date ON public.outreach_logs (user_id, contacted_at DESC);
CREATE INDEX idx_outreach_logs_user_type ON public.outreach_logs (user_id, outreach_type);
