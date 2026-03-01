
-- Add meta column to funnel_events for storing properties
ALTER TABLE public.funnel_events ADD COLUMN IF NOT EXISTS meta jsonb;

-- Add walkthrough tracking columns to user_metrics
ALTER TABLE public.user_metrics 
  ADD COLUMN IF NOT EXISTS walkthrough_max_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS walkthrough_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walkthrough_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS walkthrough_last_step integer;

-- Create a security definer function to log walkthrough events
CREATE OR REPLACE FUNCTION public.log_walkthrough_event(
  p_event_type text,
  p_meta jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step integer;
  v_allowed_types text[] := ARRAY['walkthrough_step_view', 'walkthrough_complete', 'walkthrough_exit'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (p_event_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'Invalid walkthrough event type: %', p_event_type;
  END IF;

  -- Insert into funnel_events (bypasses RLS via security definer)
  INSERT INTO public.funnel_events (user_id, event_type, meta)
  VALUES (v_uid, p_event_type, p_meta);

  -- Extract step number from meta
  v_step := COALESCE((p_meta->>'step')::integer, 0);

  -- Upsert user_metrics with walkthrough fields
  INSERT INTO public.user_metrics (
    user_id, updated_at, last_active_at,
    search_count, businesses_added_count, messages_sent_count, replies_count,
    walkthrough_max_step, walkthrough_completed, walkthrough_last_seen_at, walkthrough_last_step
  )
  VALUES (
    v_uid, now(), now(),
    0, 0, 0, 0,
    v_step,
    (p_event_type = 'walkthrough_complete'),
    now(),
    v_step
  )
  ON CONFLICT (user_id) DO UPDATE SET
    walkthrough_max_step = GREATEST(user_metrics.walkthrough_max_step, v_step),
    walkthrough_completed = user_metrics.walkthrough_completed OR (p_event_type = 'walkthrough_complete'),
    walkthrough_last_seen_at = now(),
    walkthrough_last_step = v_step,
    last_active_at = now(),
    updated_at = now();
END;
$$;
