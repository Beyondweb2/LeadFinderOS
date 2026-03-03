
-- Add Stripe data columns to checkout_attempts so webhook can store info even without auth user
ALTER TABLE public.checkout_attempts
ADD COLUMN IF NOT EXISTS stripe_customer_id text,
ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
ADD COLUMN IF NOT EXISTS checkout_completed boolean NOT NULL DEFAULT false;
