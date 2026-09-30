-- presence_trade_citation_hosts v2 (2026-09-30, docs/directory-presence.md §2). Replaces the definition
-- from 20260930130000; same signature, same privileges. Apply ONE statement at a time, then read back.
--
-- WHY: PostgREST cuts any response at 1,000 rows, silently. For locksmiths the function returned 2,066
-- hosts, so an arbitrary half never reached the engine — Yell (359 of 478 audits) and most of
-- Trustpilot's audits were missing from RG Locksmiths' reasons. Now: only hosts in at least
-- THIN_MIN_AUDITS (2) audits — below that the engine never uses a host — ordered by breadth with a
-- unique tiebreak, so the edge function can page it (1,056 rows for locksmiths).

-- 1.
create or replace function public.presence_trade_citation_hosts(_audit_ids uuid[])
returns table (host text, citations integer, audits integer)
language sql stable
set search_path = public
as $$
  with c as (
    select r.audit_id aid,
      lower(regexp_replace(split_part(split_part(regexp_replace(cit->>'url', '^https?://', ''), '/', 1), '?', 1), '^www\.', '')) host
    from ai_audit_runs r
    join ai_audit_queue q on q.run_id = r.id,
      jsonb_each(q.result) e(k, v),
      jsonb_array_elements(case when jsonb_typeof(v->'citations') = 'array' then v->'citations' else '[]'::jsonb end) cit
    where r.audit_id = any(_audit_ids) and k not like '\_%' and jsonb_typeof(q.result) = 'object'
  )
  select host, count(*)::int, count(distinct aid)::int from c where host <> ''
  group by host having count(distinct aid) >= 2
  order by count(distinct aid) desc, host
$$;

-- 2.
revoke all on function public.presence_trade_citation_hosts(uuid[]) from public, anon, authenticated;

-- 3.
grant execute on function public.presence_trade_citation_hosts(uuid[]) to service_role;
