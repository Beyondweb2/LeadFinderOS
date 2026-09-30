-- Trade-scoped citation hosts for directory-presence (2026-09-30, docs/directory-presence.md §2). ADDITIVE.
-- Apply ONE statement at a time (numbered), then read back.
--
-- WHY: playbook-evidence folds the WHOLE ai_audit_queue through PostgREST (every answer's full JSON,
-- 1,000 rows a page) and now dies on the 8 s statement timeout the API connection carries
-- ("ai_audit_queue: canceling statement due to statement timeout", measured 2026-09-30). This reads
-- only the audits the caller names — one trade's — and aggregates in the database: ~4.5 s for the
-- largest trade (508 plumber audits). The host rule mirrors playbook-evidence's hostOf: scheme off,
-- first path segment, query off, one leading www. off, lower-cased.
-- ⛔ Service role only: EXECUTE is revoked from public/anon/authenticated.

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
  select host, count(*)::int, count(distinct aid)::int from c where host <> '' group by host
$$;

-- 2.
revoke all on function public.presence_trade_citation_hosts(uuid[]) from public, anon, authenticated;

-- 3.
grant execute on function public.presence_trade_citation_hosts(uuid[]) to service_role;
