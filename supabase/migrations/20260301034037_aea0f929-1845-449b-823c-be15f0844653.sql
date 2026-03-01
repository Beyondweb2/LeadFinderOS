
CREATE TABLE public.email_job_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at timestamp with time zone NOT NULL DEFAULT now(),
  checked_count integer NOT NULL DEFAULT 0,
  eligible_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  errors text,
  sample_user_ids jsonb
);

ALTER TABLE public.email_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can insert job runs"
  ON public.email_job_runs FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can update job runs"
  ON public.email_job_runs FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete job runs"
  ON public.email_job_runs FOR DELETE
  USING (false);

CREATE POLICY "Admins can view job runs"
  ON public.email_job_runs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
