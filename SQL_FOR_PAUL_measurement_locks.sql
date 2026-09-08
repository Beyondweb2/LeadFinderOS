-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOCKED BASELINE QUESTIONS  (2026-09-08)
--
-- One row per business: the exact question set its before/after is measured on, the audit it came
-- from, and how many runs it was measured over.
--
-- ⚠️ WHAT THIS IS FOR, HONESTLY. Re-measures do NOT regenerate questions today — create-ai-audit
-- uses a supplied list verbatim and otherwise reuses the previous run's set, and the generator has
-- no randomness. RG's 11 Aug, 26 Aug and 8 Sep measurements ask the byte-identical same 12
-- strings, verified against these tables. So this does not fix drift; it makes the set EXPLICIT
-- and lets a proposed re-measure be diffed against it before the money is spent. The client it
-- would actually have protected is ABLM: 28 runs, 10 different question sets.
--
-- 🔴 RUN THIS BEFORE THE CODE THAT READS IT IS DEPLOYED (CLAUDE.md §3). The SPA is written
-- defensively — a missing table leaves the feature dormant rather than erroring — but the lock
-- button cannot work until the table exists.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.measurement_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Keyed by BUSINESS NAME, because a re-measure mints a NEW ai_audits row: a lock hung off one
  -- audit id would be invisible from the next one. This is the same key the before/after view
  -- already uses to find a business's sibling audits.
  business_name text not null,
  lead_id uuid null references public.outreach_leads(id) on delete set null,
  -- The audit the set was taken from, so the lock is traceable to rows that really ran.
  source_audit_id uuid null references public.ai_audits(id) on delete set null,
  -- { version, questions[], runs, sourceAuditId, measuredAt, lockedAt, note? } — validated in
  -- code by isUsableLock, because jsonb will accept anything and a lock with no questions would
  -- make every future diff read "identical".
  lock jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One lock per business per operator. Re-locking REPLACES it (the UI confirms first), so this is
-- an upsert target rather than a constraint to work around.
create unique index if not exists measurement_locks_user_business_uidx
  on public.measurement_locks (user_id, lower(business_name));

-- ⛔ RLS WITH A POLICY, IN THE SAME FILE. CLAUDE.md §8 records three features that silently did
-- nothing because RLS was enabled with no policy: a denied read returns HTTP 200 with [], which is
-- indistinguishable from "no lock exists" — and this table's whole job is to tell those apart.
alter table public.measurement_locks enable row level security;

do $$
begin
  create policy measurement_locks_owner on public.measurement_locks
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

-- ── CONFIRM ───────────────────────────────────────────────────────────────────────────────────
-- Expect one row: measurement_locks, rls_enabled true, policies 1.
select c.relname,
       c.relrowsecurity as rls_enabled,
       count(p.polname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relname = 'measurement_locks'
 group by 1, 2;
