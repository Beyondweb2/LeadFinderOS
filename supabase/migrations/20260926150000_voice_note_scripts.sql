-- VOICE-NOTE SCRIPTS (2026-09-26) — every script the voice-note-script function generates, one row
-- per generation (a Regenerate is a NEW row pointing at the one it replaced).
--
-- Holds the script Paul read, and exactly what it was built from: the ONE hook result (question +
-- engine + that engine's competitors for that question), the website findings used, the research basis,
-- the model and generator version. So "which voice-note approach got replies" can be answered later.
-- No outcome / attribution columns: that is a separate piece of work.
--
-- ⛔ SERVICE ROLE ONLY. RLS on and NO policies, so anon/authenticated (which hold table grants on every
--    public table — CLAUDE.md §6) read 200 [] and cannot write; the grants are revoked as well. The
--    Inbox reads it through the function. Nothing here is client-facing.
-- Additive and idempotent: safe to run more than once.

create table if not exists public.voice_note_scripts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid,
  audit_id uuid references public.ai_audits(id) on delete set null,
  run_id uuid,
  hook_question text not null,
  hook_engine text not null check (hook_engine in ('chatgpt', 'gemini')),
  hook_question_index integer,
  competitors text[] not null,
  findings jsonb not null default '[]'::jsonb,
  site_mode text not null check (site_mode in ('findings', 'clean', 'unread', 'no_website')),
  research_basis jsonb,
  script text not null,
  word_count integer,
  problems jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  operator_note text,
  model text not null,
  generator_version integer not null,
  prompt_tokens integer,
  completion_tokens integer,
  model_calls integer,
  cost_usd numeric(10, 6),
  regenerated_from uuid references public.voice_note_scripts(id) on delete set null,
  generated_at timestamptz not null default now()
);

create index if not exists voice_note_scripts_lead_generated_idx
  on public.voice_note_scripts (lead_id, generated_at desc);

alter table public.voice_note_scripts enable row level security;
revoke all on table public.voice_note_scripts from anon, authenticated;

comment on table public.voice_note_scripts is
  'Generated WhatsApp voice-note scripts (never sent by code) and the exact evidence each was built from. Service role only (RLS, no policies). Written by the voice-note-script edge function.';
