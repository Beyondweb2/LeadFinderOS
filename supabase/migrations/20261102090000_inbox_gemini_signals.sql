-- ⚡ THE INBOX'S GEMINI COUNTS IN ONE CALL (2026-10-16, Inbox speed pass — docs/PERF_AUDIT.md).
--
-- The Inbox read the audit_gemini_signal VIEW a page at a time (1,680 rows = 2+ requests). Every page re-ran the
-- whole aggregate (ai_audits × ai_audit_runs × ai_audit_queue) only to sort it and keep 1,000 rows, so the work was
-- done twice, and that read was the slowest of the Inbox's opening reads on the live app (1.5–6.4 s, measured).
-- This returns the SAME rows from the SAME view as one JSON array: one request, one aggregate.
--
-- ⛔ SECURITY INVOKER, like the view (security_invoker=on): the caller's own RLS on ai_audits / ai_audit_runs /
-- ai_audit_queue decides what they see, exactly as the paged read did. Nothing new is exposed.
-- ⛔ Additive and reversible: no table or view changes. To undo: drop function public.inbox_gemini_signals();
-- (the Inbox falls back to the paged view read when the function is missing).

create or replace function public.inbox_gemini_signals()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'audit_id', s.audit_id,
      'lead_id', s.lead_id,
      'gemini_answers', s.gemini_answers,
      'gemini_named', s.gemini_named
    ) order by s.audit_id),
    '[]'::jsonb)
  from public.audit_gemini_signal s;
$$;

revoke all on function public.inbox_gemini_signals() from public, anon;
grant execute on function public.inbox_gemini_signals() to authenticated;
