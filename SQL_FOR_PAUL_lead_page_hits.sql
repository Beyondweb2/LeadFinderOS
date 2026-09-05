-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PER-TEMPLATE CLICK TRACKING — the one table the funnel is missing.
--
-- Run this in the Supabase SQL editor BEFORE the edge functions are deployed. It is additive and
-- idempotent: re-running it changes nothing.
--
-- WHY IT EXISTS: nothing anywhere records that a prospect reached findable.live. Report opens are
-- tracked (ai_audits.first_opened_at) and questionnaire SUBMISSIONS are tracked
-- (onboarding_responses), but the step between them — landing on the sign-up page — has never been
-- observable, so no template could be credited with driving a click. That is the whole gap for the
-- audit-first template, whose goal is clicks and sign-ups rather than replies.
--
-- ⛔ user_id IS ON THE ROW ON PURPOSE, AND IT IS NOT REDUNDANT. This project has a recorded failure
-- mode: a table with RLS enabled and NO policy returns HTTP 200 with an EMPTY ARRAY to the app —
-- indistinguishable from "nobody has visited". It has already cost three features that silently did
-- nothing for weeks. An owner column makes "my own rows" expressible, so the policy below can be
-- written at all. Without it this table would need an edge-function read instead.
--
-- ⚠️ THE POLICY IS IN THIS FILE, NOT LEFT FOR LATER. That is the specific mistake that produced the
-- three silent failures: the table shipped, the policy did not.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.lead_page_hits (
  id          uuid primary key default gen_random_uuid(),
  -- ON DELETE CASCADE: a hit is meaningless without the lead it belongs to, and these rows carry
  -- nothing worth keeping as an orphan.
  lead_id     uuid not null references public.outreach_leads(id) on delete cascade,
  -- Copied from the lead at insert time so RLS has something to scope by.
  user_id     uuid not null,
  -- Which page was reached. Free text rather than an enum so a new page needs no migration;
  -- 'onboarding' is the only writer today.
  page        text not null,
  created_at  timestamptz not null default now()
);

-- The read is "every hit for my leads, oldest first", and attribution walks them per lead.
create index if not exists lead_page_hits_lead_created_idx
  on public.lead_page_hits (lead_id, created_at);
create index if not exists lead_page_hits_user_created_idx
  on public.lead_page_hits (user_id, created_at);

alter table public.lead_page_hits enable row level security;

-- Owner-scoped read. The service role bypasses RLS, which is how the edge function writes.
drop policy if exists "lead_page_hits owner read" on public.lead_page_hits;
create policy "lead_page_hits owner read"
  on public.lead_page_hits for select
  using (auth.uid() = user_id);

-- ⚠️ NO INSERT POLICY, DELIBERATELY. Only findable-onboarding writes here, on the service role.
-- A browser must never be able to insert a hit: the whole value of this table is that the rows
-- were written by the server when a real page load happened.

-- Proof it worked — expect one row: the table, with rowsecurity = true and 1 policy.
select c.relname,
       c.relrowsecurity            as rls_enabled,
       count(p.polname)            as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relname = 'lead_page_hits'
 group by 1, 2;
