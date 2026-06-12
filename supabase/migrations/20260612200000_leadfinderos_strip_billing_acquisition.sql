-- LeadFinder OS: strip billing / trial / affiliate / funnel / challenge /
-- walkthrough objects from the schema. The app is an internal tool — every
-- authenticated account has full access; none of these objects have readers
-- or writers anymore.

-- 1. Trial bootstrap trigger must go before its table.
DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_trial();

-- 2. View over subscriptions.
DROP VIEW IF EXISTS public.user_subscription_status;

-- 3. Billing / acquisition tables (policies, indexes, FKs go with them).
DROP TABLE IF EXISTS public.affiliate_conversions CASCADE;
DROP TABLE IF EXISTS public.affiliates CASCADE;
DROP TABLE IF EXISTS public.checkout_attempts CASCADE;
DROP TABLE IF EXISTS public.funnel_events CASCADE;
DROP TABLE IF EXISTS public.funnel_analytics CASCADE;
DROP TABLE IF EXISTS public.email_job_runs CASCADE;
DROP TABLE IF EXISTS public.user_challenge_10_outreach_contacts CASCADE;
DROP TABLE IF EXISTS public.user_challenges_10_outreach CASCADE;
DROP TABLE IF EXISTS public.user_trials CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- 4. Functions that served only the dropped features.
DROP FUNCTION IF EXISTS public.validate_affiliate_code(text);
DROP FUNCTION IF EXISTS public.challenge_10_record_contact(text);
DROP FUNCTION IF EXISTS public.log_walkthrough_event(text, jsonb);

-- 5. Walkthrough tracking columns on user_metrics.
ALTER TABLE public.user_metrics
  DROP COLUMN IF EXISTS walkthrough_completed,
  DROP COLUMN IF EXISTS walkthrough_completed_at,
  DROP COLUMN IF EXISTS walkthrough_last_seen_at,
  DROP COLUMN IF EXISTS walkthrough_last_step,
  DROP COLUMN IF EXISTS walkthrough_max_step,
  DROP COLUMN IF EXISTS walkthrough_skipped_at,
  DROP COLUMN IF EXISTS walkthrough_started_at;

-- 6. log_usage_event: same behaviour, allowlist trimmed of trial/walkthrough
--    event names so nothing in the schema mentions the removed features.
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
    'contact_logged', 'phone_copied', 'export', 'page_view',
    'search_blocked', 'search_1_completed'
  ];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

-- 7. Self-consistency check: fail the migration loudly if any remaining
--    public function or view still references a dropped object.
DO $$
DECLARE
  bad_functions text;
  bad_views text;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ')
  INTO bad_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.prosrc ILIKE '%user_trials%' OR
      p.prosrc ILIKE '%public.subscriptions%' OR
      p.prosrc ILIKE '%checkout_attempts%' OR
      p.prosrc ILIKE '%affiliate%' OR
      p.prosrc ILIKE '%funnel_%' OR
      p.prosrc ILIKE '%email_job_runs%' OR
      p.prosrc ILIKE '%user_challenge%' OR
      p.prosrc ILIKE '%walkthrough%'
    );

  SELECT string_agg(DISTINCT viewname, ', ')
  INTO bad_views
  FROM pg_views
  WHERE schemaname = 'public'
    AND (
      definition ILIKE '%user_trials%' OR
      definition ILIKE '%subscriptions%' OR
      definition ILIKE '%checkout_attempts%' OR
      definition ILIKE '%affiliate%' OR
      definition ILIKE '%funnel_%' OR
      definition ILIKE '%user_challenge%'
    );

  IF bad_functions IS NOT NULL THEN
    RAISE EXCEPTION 'Dangling references to removed objects in functions: %', bad_functions;
  END IF;
  IF bad_views IS NOT NULL THEN
    RAISE EXCEPTION 'Dangling references to removed objects in views: %', bad_views;
  END IF;
END $$;
