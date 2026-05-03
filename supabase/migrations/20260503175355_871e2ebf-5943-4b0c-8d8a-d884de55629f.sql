
-- Revoke public/anon/authenticated execute on invoke_cron_run
REVOKE EXECUTE ON FUNCTION public.invoke_cron_run() FROM public;
REVOKE EXECUTE ON FUNCTION public.invoke_cron_run() FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoke_cron_run() FROM authenticated;
