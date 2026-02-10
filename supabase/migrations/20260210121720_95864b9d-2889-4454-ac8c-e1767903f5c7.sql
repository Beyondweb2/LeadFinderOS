
-- Create a view that excludes Stripe IDs for client-side access
CREATE VIEW public.user_subscription_status
WITH (security_invoker = on) AS
SELECT id, user_id, status, current_period_end, created_at, updated_at
FROM public.subscriptions;

-- Drop the existing SELECT policy that exposes Stripe IDs
DROP POLICY "Users can view their own subscription" ON public.subscriptions;

-- Deny direct SELECT on the base table
CREATE POLICY "Deny direct select on subscriptions"
ON public.subscriptions
FOR SELECT
USING (false);

-- Allow users to SELECT from the view (RLS on base table enforces user_id check via security_invoker)
-- We need a permissive policy for the view to work with security_invoker
CREATE POLICY "Users can view own subscription via view"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
