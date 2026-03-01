
-- Add walkthrough timestamp fields to user_metrics
ALTER TABLE public.user_metrics 
  ADD COLUMN IF NOT EXISTS walkthrough_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS walkthrough_completed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS walkthrough_skipped_at timestamptz DEFAULT NULL;

-- Update log_walkthrough_event to handle new fields including 'walkthrough_skip'
CREATE OR REPLACE FUNCTION public.log_walkthrough_event(p_event_type text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step integer;
  v_allowed_types text[] := ARRAY['walkthrough_step_view', 'walkthrough_complete', 'walkthrough_exit', 'walkthrough_skip'];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (p_event_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'Invalid walkthrough event type: %', p_event_type;
  END IF;

  -- Insert into funnel_events
  INSERT INTO public.funnel_events (user_id, event_type, meta)
  VALUES (v_uid, p_event_type, p_meta);

  -- Extract step number from meta
  v_step := COALESCE((p_meta->>'step')::integer, 0);

  -- Upsert user_metrics with walkthrough fields
  INSERT INTO public.user_metrics (
    user_id, updated_at, last_active_at,
    search_count, businesses_added_count, messages_sent_count, replies_count,
    walkthrough_max_step, walkthrough_completed, walkthrough_last_seen_at, walkthrough_last_step,
    walkthrough_started_at, walkthrough_completed_at, walkthrough_skipped_at
  )
  VALUES (
    v_uid, now(), now(),
    0, 0, 0, 0,
    v_step,
    (p_event_type = 'walkthrough_complete'),
    now(),
    v_step,
    CASE WHEN p_event_type = 'walkthrough_step_view' AND v_step = 1 THEN now() ELSE NULL END,
    CASE WHEN p_event_type = 'walkthrough_complete' THEN now() ELSE NULL END,
    CASE WHEN p_event_type = 'walkthrough_skip' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    walkthrough_max_step = GREATEST(user_metrics.walkthrough_max_step, v_step),
    walkthrough_completed = user_metrics.walkthrough_completed OR (p_event_type = 'walkthrough_complete'),
    walkthrough_last_seen_at = now(),
    walkthrough_last_step = v_step,
    walkthrough_started_at = CASE 
      WHEN p_event_type = 'walkthrough_step_view' AND v_step = 1 AND user_metrics.walkthrough_started_at IS NULL 
      THEN now() 
      ELSE user_metrics.walkthrough_started_at 
    END,
    walkthrough_completed_at = CASE 
      WHEN p_event_type = 'walkthrough_complete' AND user_metrics.walkthrough_completed_at IS NULL 
      THEN now() 
      ELSE user_metrics.walkthrough_completed_at 
    END,
    walkthrough_skipped_at = CASE 
      WHEN p_event_type = 'walkthrough_skip' 
      THEN now() 
      ELSE user_metrics.walkthrough_skipped_at 
    END,
    last_active_at = now(),
    updated_at = now();
END;
$function$;
