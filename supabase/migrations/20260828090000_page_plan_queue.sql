-- PAGE-PLAN QUEUE (Stage 1, 2026-08-28). Two tables: one row per PLANNED PAGE, one per
-- question variant it answers. Anchored on the BASELINE AUDIT (works for lead-less national
-- clients like Solene); lead_id kept when one exists. RLS owner policies IN THIS MIGRATION
-- (the RLS-with-no-policy trap: a denied read is 200 [] and the feature silently dies).
-- Run by hand in the Supabase SQL editor.

create table if not exists public.client_pages (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,                -- owner (resolved from the audit row, never ADMIN_EMAIL)
  baseline_audit_id  uuid not null references public.ai_audits(id) on delete cascade,
  lead_id            uuid references public.outreach_leads(id) on delete set null,
  page_type          text not null default 'qa' check (page_type in ('service','qa')),
  job                text not null,                -- the distinct customer job this page does
  topic              text not null default 'general',  -- hub grouping; siblings publish together
  primary_question   text not null,
  slug               text not null,
  rationale          text,                         -- the clusterer's merge/split reasoning
  winnability        text,                         -- wide_open | informational | unclear | locked
  score              int,
  score_reasons      jsonb,                        -- itemised scoring, never a bare number
  wave               int not null default 2,
  position           int not null default 0,
  status             text not null default 'planned' check (status in ('planned','held','merged','removed')),
  held_reason        text,
  near_dup_of        uuid references public.client_pages(id) on delete set null,
  top_sources        jsonb,                        -- [{domain, count}] — where the engines are looking
  -- generated content lands here in Stage 3 (draft -> approved -> live machine comes with it):
  title              text, meta_description text, h1 text, body_html text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.client_page_questions (
  id                 uuid primary key default gen_random_uuid(),
  page_id            uuid not null references public.client_pages(id) on delete cascade,
  baseline_audit_id  uuid not null,
  question_text      text not null,                -- VERBATIM baseline question: the stable join key into ai_audit_queue
  named_rate         jsonb,                        -- {chatgpt: 0..1|null, gemini: 0..1|null} at plan time
  unique (page_id, question_text)
);

create index if not exists client_pages_audit_idx on public.client_pages (baseline_audit_id);
create index if not exists client_page_questions_page_idx on public.client_page_questions (page_id);

alter table public.client_pages enable row level security;
alter table public.client_page_questions enable row level security;

create policy client_pages_owner on public.client_pages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy client_page_questions_owner on public.client_page_questions
  for all using (exists (select 1 from public.client_pages p where p.id = page_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.client_pages p where p.id = page_id and p.user_id = auth.uid()));
