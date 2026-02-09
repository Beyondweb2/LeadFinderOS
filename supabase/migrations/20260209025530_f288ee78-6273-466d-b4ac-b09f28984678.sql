-- Update the handle_new_user_trial function to use 3 days instead of 7
CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trial_duration INTEGER := 3;
BEGIN
  INSERT INTO public.user_trials (
    user_id, 
    trial_started_at, 
    trial_days, 
    searches_used,
    plan_status,
    trial_end_date,
    searches_today,
    last_search_date
  )
  VALUES (
    NEW.id, 
    now(), 
    trial_duration, 
    0,
    'trial',
    now() + (trial_duration || ' days')::INTERVAL,
    0,
    CURRENT_DATE
  );
  RETURN NEW;
END;
$function$;