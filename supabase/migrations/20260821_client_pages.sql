-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PAGE STORE — Stage 1 of the page-decision database (RECON_PAGEDB.md).
--
-- Turns the page generator from a stateless copy-paste tool into a stored graph of page records:
-- one row per page, linked to the client (lead), to the questionnaire that wanted it, and to the
-- baseline-audit questions that measure it. This migration is Stage 1 ONLY — the STORE. It creates
-- no writer and changes no existing table or function; the page-generator's behaviour is untouched.
-- client_page_links (lateral sibling/related edges) is deliberately DEFERRED to Stage 2.
--
-- ⛔ RLS IS ENABLED *WITH POLICIES* IN THIS SAME MIGRATION. RLS-enabled-with-no-policy returns HTTP
--    200 with [] to the SPA — indistinguishable from "no rows", a feature that silently does nothing
--    (CLAUDE.md §8, three recorded casualties). Owner-scoped on user_id via auth.uid(); the service
--    role bypasses RLS for the capture pass. Verify with the pg_policies query at the bottom.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. client_pages — one row per page (the core store) ────────────────────────────────────────
create table if not exists public.client_pages (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references public.outreach_leads(id) on delete cascade,   -- the client
  -- Owner, for RLS. Resolved FROM THE DATA (the lead's user_id), never ADMIN_EMAIL / a hardcoded UUID.
  user_id              uuid not null references auth.users(id) on delete cascade,
  page_type            text not null check (page_type in ('service', 'qa')),
  primary_question     text,                       -- the ONE intent this page answers (service+town intent, or a Q&A question)
  service              text,                       -- the service (null for a pure Q&A page / a town hub)
  town                 text,                       -- target town
  slug                 text,                       -- from pagePlan.slugFor(), stable
  title                text,                       -- \
  meta_description     text,                       --  } generated content; NULL until generated. Capture leaves these null.
  h1                   text,                       --  }
  body_html            text,                       -- /
  parent_page_id       uuid references public.client_pages(id) on delete set null,  -- the hub (hub-and-spoke; hub has null parent)
  status               text not null default 'draft' check (status in ('draft', 'approved', 'live', 'archived')),
  source_onboarding_id uuid references public.onboarding_responses(id) on delete set null,  -- which questionnaire produced the plan
  baseline_audit_id    uuid references public.ai_audits(id) on delete set null,             -- the audit whose questions measure this page
  published_url        text,                       -- where it actually lives on the client's site
  stuffing_verdict     jsonb,                      -- the anti-stuffing grade at generation time
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists client_pages_lead_idx        on public.client_pages (lead_id);
create index if not exists client_pages_user_idx        on public.client_pages (user_id);
create index if not exists client_pages_parent_idx      on public.client_pages (parent_page_id);
create index if not exists client_pages_baseline_idx    on public.client_pages (baseline_audit_id);

-- ── 2. client_page_questions — the measurement link (the important one) ─────────────────────────
-- question_text is the VERBATIM baseline question — the stable join key into ai_audit_queue, because
-- a baseline re-runs the identical question strings every cycle (baseline_target_runs). To read a
-- page's named-rate over time: join (baseline_audit_id = ai_audit_queue.audit_id AND question_text =
-- ai_audit_queue.question), then read result per run.
create table if not exists public.client_page_questions (
  id                uuid primary key default gen_random_uuid(),
  page_id           uuid not null references public.client_pages(id) on delete cascade,
  baseline_audit_id uuid references public.ai_audits(id) on delete set null,  -- which audit these questions live under
  question_text     text not null,   -- VERBATIM baseline question
  role              text not null default 'targets',  -- 'targets' (the page's own query). Room for 'generic'/'related' later.
  created_at        timestamptz not null default now(),
  unique (page_id, question_text)
);

create index if not exists client_page_questions_page_idx     on public.client_page_questions (page_id);
-- The measurement join key: (audit, verbatim question) → ai_audit_queue.
create index if not exists client_page_questions_measure_idx  on public.client_page_questions (baseline_audit_id, question_text);

-- ── 3. RLS — owner-scoped, IN THIS MIGRATION (never enable without a policy) ────────────────────
alter table public.client_pages          enable row level security;
alter table public.client_page_questions enable row level security;

-- client_pages: the owner (auth.uid() = user_id) can do everything; anon/other users see nothing.
-- The service role bypasses RLS entirely (used by the capture pass and any future edge writer).
create policy client_pages_owner_all on public.client_pages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- client_page_questions has no user_id — it is scoped THROUGH its parent page's owner, so the two
-- tables can never disagree about who may see a question link.
create policy client_page_questions_owner_all on public.client_page_questions
  for all
  using (exists (select 1 from public.client_pages p where p.id = client_page_questions.page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.client_pages p where p.id = client_page_questions.page_id and p.user_id = auth.uid()));

-- ── 4. VERIFY THE POLICIES EXIST (run this after the migration; paste me the result) ────────────
-- select schemaname, tablename, policyname, cmd
--   from pg_policies
--  where tablename in ('client_pages', 'client_page_questions')
--  order by tablename, policyname;
