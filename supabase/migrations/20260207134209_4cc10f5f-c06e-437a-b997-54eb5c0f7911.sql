-- Add explicit DENY policies for user_roles modifications (prevents privilege escalation)
CREATE POLICY "Deny direct role inserts"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Deny direct role updates"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Deny direct role deletes"
ON public.user_roles
FOR DELETE
TO authenticated
USING (false);