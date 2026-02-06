-- Add DELETE policy to checked_businesses table
-- This allows users to manage their own business check history

CREATE POLICY "Users can delete their own checked businesses"
ON public.checked_businesses
FOR DELETE
USING (auth.uid() = user_id);