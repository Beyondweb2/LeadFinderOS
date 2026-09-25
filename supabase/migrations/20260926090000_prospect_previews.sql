-- PROSPECT PREVIEWS (2026-09-26) — one row per lead, written only by the prospect-preview function.
--
-- An OUTREACH asset, not a Website Build: one generated replacement homepage + an evidence card +
-- screenshots, made on an operator's click for a prospect whose AI audit went badly. Lightweight
-- metadata here; the images and the HTML live in the PRIVATE storage bucket `prospect-previews`
-- (paths in asset_paths, served to the operator by short-lived signed URLs). Nothing here is
-- client-facing, and nothing is ever sent from it automatically.
--
-- ⛔ SERVICE ROLE ONLY. RLS on and NO policies (anon/authenticated hold grants on every public
--    table — CLAUDE.md §6), grants revoked too. The app reads it through the function.
-- Additive and idempotent: safe to run more than once. NOT YET APPLIED — run it before deploying
-- the function.

create table if not exists public.prospect_previews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.outreach_leads(id) on delete cascade,
  user_id uuid,
  audit_id uuid references public.ai_audits(id) on delete set null,
  status text not null default 'not_generated',
  status_detail text,
  template_id text,
  template_version text,
  generator_version integer,
  fingerprint text,
  fingerprint_parts jsonb,
  source_website text,
  source_crawl_at timestamptz,
  headline jsonb,
  primary_finding jsonb,
  secondary_findings jsonb,
  facts jsonb,
  notes jsonb,
  message text,
  asset_paths jsonb not null default '{}'::jsonb,
  timings jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_previews_status_check check (status in
    ('not_generated', 'gathering', 'selecting_template', 'building', 'rendering', 'ready', 'failed'))
);

alter table public.prospect_previews enable row level security;
revoke all on table public.prospect_previews from anon, authenticated;

comment on table public.prospect_previews is
  'Prospect Preview (outreach homepage mock-up + evidence card) metadata. Service role only (RLS, no policies). Written by the prospect-preview edge function; assets in the private prospect-previews bucket.';

-- The private bucket. No storage policies: only the service role reads or writes it.
insert into storage.buckets (id, name, public)
values ('prospect-previews', 'prospect-previews', false)
on conflict (id) do nothing;
