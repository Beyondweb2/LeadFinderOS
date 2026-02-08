-- Create affiliates table
CREATE TABLE public.affiliates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0.30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on affiliates
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

-- Affiliates are public for lookup by code (needed for attribution)
CREATE POLICY "Anyone can lookup active affiliates by code"
  ON public.affiliates
  FOR SELECT
  USING (is_active = true);

-- Only admins can manage affiliates (via service role)
CREATE POLICY "Only service role can insert affiliates"
  ON public.affiliates
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can update affiliates"
  ON public.affiliates
  FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete affiliates"
  ON public.affiliates
  FOR DELETE
  USING (false);

-- Create affiliate_conversions table
CREATE TABLE public.affiliate_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  first_payment_amount INTEGER NOT NULL,
  commission_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on affiliate_conversions
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

-- Only admins can view conversions (via service role)
CREATE POLICY "Only service role can select conversions"
  ON public.affiliate_conversions
  FOR SELECT
  USING (false);

CREATE POLICY "Only service role can insert conversions"
  ON public.affiliate_conversions
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Only service role can update conversions"
  ON public.affiliate_conversions
  FOR UPDATE
  USING (false);

CREATE POLICY "Only service role can delete conversions"
  ON public.affiliate_conversions
  FOR DELETE
  USING (false);

-- Add affiliate tracking columns to user_trials (since we don't have a profiles table)
ALTER TABLE public.user_trials
  ADD COLUMN IF NOT EXISTS affiliate_code TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_attributed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;