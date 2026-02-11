
-- 1. usage_events table
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_user_created ON public.usage_events (user_id, created_at DESC);
CREATE INDEX idx_usage_events_type_created ON public.usage_events (event_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own events"
  ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. user_metrics table
CREATE TABLE public.user_metrics (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  search_count int NOT NULL DEFAULT 0,
  businesses_added_count int NOT NULL DEFAULT 0,
  messages_sent_count int NOT NULL DEFAULT 0,
  replies_count int NOT NULL DEFAULT 0,
  last_search_at timestamptz,
  last_active_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON public.user_metrics FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all metrics"
  ON public.user_metrics FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Deny client inserts on metrics"
  ON public.user_metrics FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Deny client updates on metrics"
  ON public.user_metrics FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Deny client deletes on metrics"
  ON public.user_metrics FOR DELETE TO authenticated
  USING (false);

-- 3. SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.log_usage_event(
  p_event_type text,
  p_meta jsonb DEFAULT NULL
)
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
$$;
