
-- Allow users to delete their own copied phone records
CREATE POLICY "Users can delete their own copied phones"
ON public.copied_phones
FOR DELETE
USING (auth.uid() = user_id);

-- Create a function to reset user metrics (since RLS blocks direct client updates)
CREATE OR REPLACE FUNCTION public.reset_my_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_metrics
  SET search_count = 0,
      businesses_added_count = 0,
      messages_sent_count = 0,
      replies_count = 0,
      last_search_at = NULL,
      last_active_at = now(),
      updated_at = now()
  WHERE user_id = v_uid;
END;
$$;
