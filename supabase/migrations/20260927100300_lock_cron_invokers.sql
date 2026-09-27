-- The pg_cron invokers were EXECUTE-able by anon and authenticated (Postgres grants EXECUTE to
-- PUBLIC by default). With the anon key in the JS bundle, anyone could fire a queue tick; with a
-- sales login, a salesperson could. Only pg_cron calls them, and it runs as postgres (cron.job
-- username), which keeps EXECUTE as the owner. Found in the multi-user security audit, 2026-09-27.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.invoke_ai_audit_queue()', 'public.invoke_bulk_jobs_sweep()', 'public.invoke_instantly_poll()',
    'public.invoke_notify_onboarding_submit()', 'public.invoke_sms_queue()',
    'public.invoke_whatsapp_auto_replies()', 'public.invoke_whatsapp_queue()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end
$$;
