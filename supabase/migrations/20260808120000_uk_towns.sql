-- ════════════════════════════════════════════════════════════════════════════════════════════
-- UK TOWNS — the candidate list a trade can be worked through, so "where have I been" stops being
-- a thing Paul holds in his head.
--
-- ⛔ WHY THIS EXISTS. On 2026-08-08 I told Paul mobile mechanics had never been audited. It had
--    been audited in TEN towns — Wisbech, Cambridge, King's Lynn, Peterborough ×3, Thetford, Bury
--    St Edmunds, Lincoln — with 25 leads and 17 contacted in Wisbech alone. He was about to spend
--    8p re-measuring it. Neither of us could hold the coverage in our head, which is the argument
--    for storing it rather than recalling it.
--
-- ⚠️ THIS TABLE IS THE CANDIDATE LIST ONLY. It deliberately holds NO state about work done: which
--    trade+town pairs are measured, have prospects, or have been contacted is DERIVED from
--    ai_audits, ai_audit_runs, outreach_leads and whatsapp_messages, which already carry it. A
--    status column here would be a second copy of a truth those tables already own, and it would
--    be the copy that goes stale. Measured 2026-08-08: 69 trade+town pairs derive cleanly with
--    nothing marked by hand.
--
-- SOURCE: ONS Built-Up Areas (BUA 2022, GB), Open Government Licence v3.0 — free for commercial
-- use with attribution. Boundaries and names come from the ONS Open Geography Portal; POPULATION
-- is a separate Census 2021 table and is loaded with the same seed (see the seed script's header
-- for exactly which source each column came from).
-- Attribution required by the OGL, to be carried wherever the list is shown:
--   "Contains OS data © Crown copyright and database right 2024"
--   "Source: Office for National Statistics licensed under the Open Government Licence v.3.0"
-- ════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.uk_towns (
  id             uuid primary key default gen_random_uuid(),
  /* The ONS code (BUA22CD). UNIQUE, and the key the seed upserts on — see the re-seed note below. */
  ons_code       text not null unique,
  name           text not null,
  /* Census 2021 usual-resident population. Nullable so names can be seeded before populations are
     joined; a NULL sorts out of every size filter rather than pretending to be zero. */
  population     integer,
  region         text,
  county         text,
  lat            double precision,
  lng            double precision,

  /* ── SUPPRESSION, NOT DELETION ────────────────────────────────────────────────────────────────
     ⛔ Roughly 5% of built-up areas are conurbation fragments rather than towns anyone would name —
     the same shape as Southsea deriving to Portsmouth. Those rows must come OFF the working list
     WITHOUT being deleted, for two reasons: the reason is worth keeping, and a delete would be
     silently undone by the next re-seed. Suppression survives a re-seed because the seed upserts
     only the ONS-sourced columns and never touches these two. */
  suppressed_at     timestamptz,
  suppressed_reason text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.uk_towns is
  'ONS Built-Up Areas 2022 (OGL v3.0) as the candidate town list. Holds NO work state — that is derived from ai_audits / outreach_leads.';
comment on column public.uk_towns.suppressed_at is
  'Set to take a row off the working list. NEVER delete: a delete is undone by the next re-seed, and the reason is lost.';
comment on column public.uk_towns.population is
  'Census 2021. NULL means not yet joined — sorts out of size filters rather than reading as zero.';

/* Seeded 12k–250k deliberately WIDER than the 15k–200k working default, so the edges can be
   examined without a re-seed. Soham at ~11k proved the bottom end is real; 12k is just below it. */
create index if not exists uk_towns_population_idx on public.uk_towns (population)
  where suppressed_at is null;
create index if not exists uk_towns_region_idx     on public.uk_towns (region)
  where suppressed_at is null;
create index if not exists uk_towns_name_idx       on public.uk_towns (lower(name));

alter table public.uk_towns enable row level security;

/* ⚠️ READ-ONLY TO ANY SIGNED-IN OPERATOR, writable only by the service role (the seed runs as
   service role). A reference list nobody can read is the RLS trap CLAUDE.md records against
   apify_account_usage: RLS on with no policy returns HTTP 200 and an empty array, which reads as
   "no towns" rather than "denied", and the page would look broken in a way nobody could diagnose. */
drop policy if exists uk_towns_read on public.uk_towns;
create policy uk_towns_read on public.uk_towns
  for select to authenticated using (true);

/* ⛔ GRANTS, AND THIS MIGRATION SHIPPED WITHOUT THEM. A policy says WHICH ROWS a role may see;
   it does not grant access to the TABLE. PostgREST omits any table its roles cannot touch, so the
   first version produced the most confusing possible result: information_schema returned the table,
   `notify pgrst, 'reload schema'` succeeded, and REST still answered
     PGRST205 "Could not find the table 'public.uk_towns' in the schema cache"
   — which reads as a stale cache and is not. Verified against the OpenAPI spec: 52 tables listed,
   uk_towns absent.
   ⚠️ Supabase's own tables get these via ALTER DEFAULT PRIVILEGES; a table created by hand in the
   SQL editor does not always inherit them. State them rather than relying on it. */
grant usage on schema public to anon, authenticated, service_role;
grant select on public.uk_towns to authenticated;
grant all    on public.uk_towns to service_role;

-- ── VERIFY ─────────────────────────────────────────────────────────────────────────────────────
-- select count(*) as towns from public.uk_towns;                       -- expect 0 until seeded
-- Which schema is it actually in? (a non-public schema is invisible to PostgREST)
-- select table_schema, table_name from information_schema.tables where table_name = 'uk_towns';
-- Do the API roles hold privileges? (expect authenticated=SELECT, service_role=ALL)
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_name = 'uk_towns' order by grantee, privilege_type;
-- select column_name from information_schema.columns
--  where table_name = 'uk_towns' order by ordinal_position;
