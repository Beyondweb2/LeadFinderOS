-- Fix has_role function to prevent role enumeration
-- Returns NULL for unauthorized checks instead of false
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN _user_id != auth.uid() THEN NULL  -- Return NULL for unauthorized checks (no info leak)
      ELSE EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
      )
    END
$$;