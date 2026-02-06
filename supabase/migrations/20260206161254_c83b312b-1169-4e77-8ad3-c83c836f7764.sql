-- Add explicit DENY policies for INSERT, UPDATE, DELETE on subscriptions table
-- These operations should only be performed by service role (webhook), not regular users
-- This is defense in depth - even if RLS is bypassed, explicit policies make the intent clear

-- Policy to explicitly deny all INSERT operations from regular users
CREATE POLICY "Only service role can insert subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (false);

-- Policy to explicitly deny all UPDATE operations from regular users  
CREATE POLICY "Only service role can update subscriptions"
ON public.subscriptions
FOR UPDATE
USING (false)
WITH CHECK (false);

-- Policy to explicitly deny all DELETE operations from regular users
CREATE POLICY "Only service role can delete subscriptions"
ON public.subscriptions
FOR DELETE
USING (false);