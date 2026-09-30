-- Directory + public-profile presence (2026-09-30, docs/directory-presence.md). ADDITIVE ONLY.
-- Apply ONE statement at a time (numbered), then read the schema back.
--
-- ONE ROW PER (lead, source), FOREVER: a recheck UPDATES the row (first_seen_at kept, last_checked_at
-- and last_seen_at moved) — it never inserts a second one. The unique index is what makes that true.
-- ⛔ RLS ON, NO POLICIES: service-role only, like the other client-evidence tables. anon/authenticated
-- hold table grants on every public table, so RLS is the only barrier; every read and write goes
-- through the `directory-presence` edge function (requireAdmin).

-- 1.
create table if not exists public.lead_directory_presence (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null,
  source_key text not null,
  source_label text not null,
  source_kind text not null check (source_kind in ('map','directory','review','social','trade-body','manufacturer','register','other')),
  status text not null check (status in ('existing','needs_attention','worth_adding','not_relevant','added','verified')),
  status_source text not null default 'check' check (status_source in ('check','operator')),
  previous_status text check (previous_status is null or previous_status in ('existing','needs_attention','worth_adding','not_relevant','added','verified')),
  match_confidence text check (match_confidence is null or match_confidence in ('confirmed','likely','unverified')),
  listing_url text,
  match_signals jsonb not null default '[]'::jsonb,
  found_details jsonb not null default '{}'::jsonb,
  inconsistencies jsonb not null default '[]'::jsonb,
  fields_compared jsonb not null default '[]'::jsonb,
  priority text check (priority is null or priority in ('high','medium','low')),
  reason text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  discovered_via jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_seen_at timestamptz,
  status_changed_at timestamptz not null default now(),
  verified_at timestamptz,
  check_count integer not null default 1,
  last_run_id uuid,
  operator_note text,
  operator_updated_by uuid,
  operator_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2.
create unique index if not exists lead_directory_presence_lead_source_key on public.lead_directory_presence (lead_id, source_key);

-- 3.
alter table public.lead_directory_presence enable row level security;

-- 4.
create table if not exists public.lead_directory_presence_runs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outreach_leads(id) on delete cascade,
  user_id uuid not null,
  requested_by uuid,
  status text not null check (status in ('running','ok','partial','error','refused_cap')),
  searched boolean not null default false,
  sources_used jsonb not null default '[]'::jsonb,
  queries_run jsonb not null default '[]'::jsonb,
  apify_runs jsonb not null default '[]'::jsonb,
  cost_usd numeric,
  counts jsonb not null default '{}'::jsonb,
  review jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 5.
create index if not exists lead_directory_presence_runs_lead on public.lead_directory_presence_runs (lead_id, started_at desc);

-- 6.
alter table public.lead_directory_presence_runs enable row level security;

-- Read-back (one statement):
-- select table_name, count(*) cols, bool_or(false) from information_schema.columns
--  where table_schema='public' and table_name in ('lead_directory_presence','lead_directory_presence_runs') group by 1;
