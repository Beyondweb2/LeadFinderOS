
-- Add payment failure tracking to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN payment_failure_count integer NOT NULL DEFAULT 0;

-- Add last_payment_failed_at for timing the 24hr warning
ALTER TABLE public.subscriptions 
ADD COLUMN last_payment_failed_at timestamp with time zone DEFAULT NULL;
