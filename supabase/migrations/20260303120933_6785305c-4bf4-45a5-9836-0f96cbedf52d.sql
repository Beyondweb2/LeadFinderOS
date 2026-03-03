
-- Create checkout_attempts table to track every email that enters Stripe checkout
CREATE TABLE public.checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid NULL,
  converted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.checkout_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions use service role)
CREATE POLICY "Only service role can insert checkout_attempts"
  ON public.checkout_attempts FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can select checkout_attempts"
  ON public.checkout_attempts FOR SELECT
  USING (false);

CREATE POLICY "Only service role can update checkout_attempts"
  ON public.checkout_attempts FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete checkout_attempts"
  ON public.checkout_attempts FOR DELETE
  USING (false);

-- Index for quick lookups by email
CREATE INDEX idx_checkout_attempts_email ON public.checkout_attempts (email);
CREATE INDEX idx_checkout_attempts_created_at ON public.checkout_attempts (created_at);
