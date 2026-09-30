-- Paid baseline workflow (2026-09-30, docs/baseline-workflow.md).
--
-- 1. onboarding_responses.baseline_meta — the APPROVAL RECORD of the official baseline: which Hook
--    Audit questions were locked in, any replaced with the admin's reason, the source of each of the
--    20, and the history of exceptional corrections. Written only by fn paid-baseline (service role).
--    It never changes the measured set: the questions are baseline_questions, as before.
--
-- 2. client_opportunities — the OPPORTUNITY BACKLOG / ONGOING IMPROVEMENTS pool. Discovery questions
--    that did not enter the official 20, and anything added later. ⛔ NEVER READ BY THE GUARANTEE:
--    the before/after is the baseline audit vs the day-28 replay, keyed by audit id
--    (_shared/remeasure-results.ts); nothing here is an audit.
--
-- Additive and idempotent. RLS on with NO policies = service-role only (the house pattern for a
-- table only an admin edge function reads); fn paid-baseline is requireAdmin.

alter table public.onboarding_responses add column if not exists baseline_meta jsonb;

create table if not exists public.client_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  question text not null,
  service text,
  area text,
  intent text,
  source text not null default 'manual' check (source in ('discovery', 'manual')),
  source_audit_id uuid,
  -- The visibility when it entered the backlog: {chatgpt:{complete,named,target}, gemini:{…}}.
  visibility jsonb,
  competitors text[] not null default '{}',
  evidence_gap text,
  suggested_action text,
  action_note text,
  status text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'implemented', 'waiting_recheck', 'improved', 'no_change', 'not_pursuing')),
  what_changed text,
  implemented_at timestamptz,
  recheck_due date,
  recheck_audit_id uuid,
  recheck_result jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists client_opportunities_lead_question_uq
  on public.client_opportunities (lead_id, lower(btrim(question)));
create index if not exists client_opportunities_lead_idx on public.client_opportunities (lead_id);

alter table public.client_opportunities enable row level security;
