
CREATE TABLE public.client_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id text NOT NULL,
  user_id uuid,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert their own error reports
CREATE POLICY "Users can insert own error reports"
  ON public.client_error_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admins can view all error reports
CREATE POLICY "Admins can view error reports"
  ON public.client_error_reports
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own error reports
CREATE POLICY "Users can view own error reports"
  ON public.client_error_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
