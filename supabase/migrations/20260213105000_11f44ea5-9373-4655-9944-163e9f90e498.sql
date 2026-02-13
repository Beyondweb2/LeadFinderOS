
-- Add input validation to log_usage_event to restrict event types
CREATE OR REPLACE FUNCTION public.log_usage_event(p_event_type text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed_types text[] := ARRAY[
    'search', 'business_added', 'message_sent', 'reply_received',
    'template_created', 'template_updated', 'template_deleted',
    'lead_created', 'lead_updated', 'lead_deleted', 'lead_archived',
    'contact_logged', 'phone_copied', 'export', 'page_view'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate event type against whitelist
  IF p_event_type IS NULL OR length(p_event_type) = 0 OR length(p_event_type) > 50 THEN
    RAISE EXCEPTION 'Invalid event type';
  END IF;

  IF NOT (p_event_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'Unrecognized event type: %', p_event_type;
  END IF;

  INSERT INTO public.usage_events (user_id, event_type, meta)
  VALUES (v_uid, p_event_type, p_meta);

  INSERT INTO public.user_metrics (user_id, last_active_at, updated_at,
    search_count, businesses_added_count, messages_sent_count, replies_count,
    last_search_at)
  VALUES (
    v_uid, now(), now(),
    CASE WHEN p_event_type = 'search' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'business_added' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'message_sent' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'reply_received' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'search' THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    search_count = user_metrics.search_count
      + CASE WHEN p_event_type = 'search' THEN 1 ELSE 0 END,
    businesses_added_count = user_metrics.businesses_added_count
      + CASE WHEN p_event_type = 'business_added' THEN 1 ELSE 0 END,
    messages_sent_count = user_metrics.messages_sent_count
      + CASE WHEN p_event_type = 'message_sent' THEN 1 ELSE 0 END,
    replies_count = user_metrics.replies_count
      + CASE WHEN p_event_type = 'reply_received' THEN 1 ELSE 0 END,
    last_search_at = CASE WHEN p_event_type = 'search'
      THEN now() ELSE user_metrics.last_search_at END,
    last_active_at = now(),
    updated_at = now();
END;
$function$;
