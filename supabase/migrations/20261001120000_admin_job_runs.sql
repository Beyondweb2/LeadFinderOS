-- ADMIN CONTROL CENTRE (release 3, 2026-09-30): one lease + status row per background job.
-- Why: two overlapping conversation-triage runs asked the model about the same messages (61 calls for
-- 34 filings, measured). A job now CLAIMS its lease atomically before working, and records how it ended —
-- which is also what the dashboard's "scheduled jobs" line reads (last run, status, result, error).
-- Additive and idempotent. RLS on, no policies: service role only.
create table if not exists public.admin_job_runs (
  job text primary key,
  locked_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text,
  last_result jsonb,
  last_error text,
  runs integer not null default 0
);
alter table public.admin_job_runs enable row level security;

-- Claim the lease: true only for the ONE caller that finds it free (or expired). Atomic by the row lock.
create or replace function public.admin_job_claim(_job text, _lease_seconds int)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_ok boolean;
begin
  insert into public.admin_job_runs (job) values (_job) on conflict (job) do nothing;
  update public.admin_job_runs
     set locked_until = now() + make_interval(secs => greatest(10, least(coalesce(_lease_seconds, 120), 900))),
         last_started_at = now(), runs = runs + 1
   where job = _job and (locked_until is null or locked_until < now())
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

-- Record how a run ended and release the lease.
create or replace function public.admin_job_finish(_job text, _status text, _result jsonb, _error text)
returns void language sql security definer set search_path = public
as $$
  update public.admin_job_runs
     set locked_until = null, last_finished_at = now(), last_status = _status, last_result = _result, last_error = _error
   where job = _job
$$;

revoke all on function public.admin_job_claim(text, int) from public;
revoke all on function public.admin_job_claim(text, int) from anon, authenticated;
grant execute on function public.admin_job_claim(text, int) to service_role;
revoke all on function public.admin_job_finish(text, text, jsonb, text) from public;
revoke all on function public.admin_job_finish(text, text, jsonb, text) from anon, authenticated;
grant execute on function public.admin_job_finish(text, text, jsonb, text) to service_role;
