
-- Remove the conflicting deny policy - keep only the user-scoped one
DROP POLICY "Deny direct select on subscriptions" ON public.subscriptions;
