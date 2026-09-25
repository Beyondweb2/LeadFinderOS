-- WARM LEAD RESEARCH (2026-09-25) — one row per lead, written only by the warm-lead-reply function.
--
-- Holds the saved site research the Inbox's "Research & draft reply" reuses, the conversation-level
-- sales facts ("owns website = yes" — each with the prospect's own words), and the last draft's
-- metadata. Nothing here is client-facing and nothing here is read by any client-facing surface.
--
-- ⛔ SERVICE ROLE ONLY. RLS on and NO policies, so anon/authenticated (which hold table grants on
--    every public table — CLAUDE.md §6) read 200 [] and cannot write. The grants are revoked as
--    well so the table does not depend on RLS alone. The Inbox reads it through the function.
-- Additive and idempotent: safe to run more than once.

create table if not exists public.warm_lead_research (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.outreach_leads(id) on delete cascade,
  user_id uuid,
  website text,
  research jsonb,
  research_status text,
  generated_at timestamptz,
  source_crawl_at timestamptz,
  revalidated_at timestamptz,
  content_hash text,
  research_ms integer,
  sales_facts jsonb not null default '{}'::jsonb,
  last_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.warm_lead_research enable row level security;
revoke all on table public.warm_lead_research from anon, authenticated;

comment on table public.warm_lead_research is
  'Warm-lead site research + conversation sales facts for the Inbox draft assistant. Service role only (RLS, no policies). Written by the warm-lead-reply edge function.';
