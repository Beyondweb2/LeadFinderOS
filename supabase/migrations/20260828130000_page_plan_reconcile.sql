-- RECONCILE the page-plan schema (2026-08-28). Root cause of the Page Plan screen failing AFTER
-- the base migration was run: BOTH tables ALREADY EXISTED — created 2026-08-21 by the earlier
-- page-record capture experiment (11 RG rows keyed to old baseline f64920ce, in the RECON_PAGEDB
-- shape). The Stage-1 migration's CREATE TABLE IF NOT EXISTS silently no-op'd against them, so the
-- queue's columns never materialised (client_pages.wave etc. -> 42703 on every plan_get).
--
-- This ALTERs the existing tables ADDITIVELY. The 11 existing rows are KEPT — they are invisible
-- to the queue anyway (it keys on the NEWEST baseline audit; those rows point at the old one).
-- Idempotent: safe to run repeatedly. Run by hand in the Supabase SQL editor.

alter table public.client_pages add column if not exists job            text;
alter table public.client_pages add column if not exists topic          text not null default 'general';
alter table public.client_pages add column if not exists rationale      text;
alter table public.client_pages add column if not exists winnability    text;
alter table public.client_pages add column if not exists score          int;
alter table public.client_pages add column if not exists score_reasons  jsonb;
alter table public.client_pages add column if not exists wave           int not null default 2;
alter table public.client_pages add column if not exists position       int not null default 0;
alter table public.client_pages add column if not exists held_reason    text;
alter table public.client_pages add column if not exists near_dup_of    uuid references public.client_pages(id) on delete set null;
alter table public.client_pages add column if not exists top_sources    jsonb;

-- The pre-existing table's status CHECK only allows draft/approved/live/archived, which would
-- refuse every queue insert ('planned'/'held'). Widen it to the union of both status sets.
alter table public.client_pages drop constraint if exists client_pages_status_check;
alter table public.client_pages add constraint client_pages_status_check
  check (status in ('draft','approved','live','archived','planned','held','merged','removed'));

alter table public.client_page_questions add column if not exists named_rate jsonb;

create index if not exists client_pages_audit_idx on public.client_pages (baseline_audit_id);
create index if not exists client_page_questions_page_idx on public.client_page_questions (page_id);
