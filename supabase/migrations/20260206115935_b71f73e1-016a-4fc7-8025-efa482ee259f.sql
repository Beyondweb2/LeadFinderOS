-- Update has_role function to only allow users to check their own roles
-- This prevents any user from discovering if other users have admin/moderator roles

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND _user_id = auth.uid()  -- Only allow checking own roles
  )
$$;