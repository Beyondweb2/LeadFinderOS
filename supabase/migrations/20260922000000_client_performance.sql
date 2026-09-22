-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CLIENT PERFORMANCE — Phase 1 STORE (Google Search Console only).
--
-- Adds the minimum schema for the Paid Client "Performance" section: one connection row per
-- client, a tracked-page inventory, and two daily snapshot tables that a scheduled edge function
-- upserts into. It creates NO writer and changes NO existing behaviour; `outreach_leads.website`
-- is untouched and nothing here is read by any existing screen.
--
-- ⛔ GA4 IS DELIBERATELY ABSENT. There is no ga4_property_id, no ga4 table, no nullable column
--    "ready for later". A column nothing writes is a column nobody can tell is broken, and the GA4
--    property key is the one field we cannot guess the shape of until the Analytics Data API is
--    actually wired. Phase 3 adds it in its own migration.
--
-- ⛔ NO GOOGLE CREDENTIAL LIVES IN THIS SCHEMA. client_search_connections holds the PROPERTY
--    STRING and sync health, nothing else. The service-account key is an edge secret
--    (GOOGLE_SERVICE_ACCOUNT_JSON) and is never persisted, logged, or returned to the browser.
--    `anon` and `authenticated` hold full DML grants on every public table and the anon key ships
--    in the JS bundle, so a credential in a public table is a credential on the internet.
--
-- ⛔ RLS IS ENABLED *WITH POLICIES* IN THIS SAME MIGRATION. RLS-enabled-with-no-policy returns
--    HTTP 200 with [] — indistinguishable from "no rows", a feature that silently does nothing
--    (CLAUDE.md §8, three recorded casualties). Owner-scoped on user_id via auth.uid(), matching
--    client_pages exactly; the service role bypasses RLS for the sync pass.
--
-- Apply BY HAND, one statement block at a time, then run the verification queries at the bottom
-- and read the result back. Never `supabase db push` (history is desynced).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. The client's canonical domain ───────────────────────────────────────────────────────────
-- Search Console keys everything on an exact, normalised origin. `outreach_leads.website` cannot
-- serve: across the four paying clients today it is 'http://…/', 'https://www.…/' and 'https://…/'
-- with no rule, and it is read by serveGate, the baseline context and the client report — changing
-- its shape would move three unrelated things. So the reporting side gets its own field, and the
-- normaliser in src/lib/searchPerformance.ts is the ONE place that decides what "the same page"
-- means. Bare registrable host, no scheme, no www, no trailing slash: 'mc-locksmiths.com'.
alter table public.outreach_leads
  add column if not exists canonical_domain text;

comment on column public.outreach_leads.canonical_domain is
  'Bare canonical host for performance reporting (no scheme, no www, no trailing slash), e.g. mc-locksmiths.com. Set by hand when a client is connected to Search Console. NEVER derived from `website` at read time — `website` is free text and is read by serveGate and the report.';

-- ── 2. client_search_connections — one row per client, no credentials ──────────────────────────
create table if not exists public.client_search_connections (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null unique references public.outreach_leads(id) on delete cascade,
  -- Owner, for RLS. Resolved FROM THE DATA (the lead's user_id), never ADMIN_EMAIL / a hardcoded UUID.
  user_id             uuid not null references auth.users(id) on delete cascade,
  -- The EXACT Search Console property string. Two incompatible shapes exist and they return
  -- different URL strings, so this is stored verbatim and never reconstructed:
  --   URL-prefix:  'https://mc-locksmiths.com/'   (note the trailing slash Google itself uses)
  --   Domain:      'sc-domain:mc-locksmiths.com'
  gsc_property        text,
  -- ⛔ A POSITIVE ENUM. 'not_connected' is the default and the only thing an absent/unknown state
  --    may resolve to; the UI asserts on the state it WANTS and never lets an `else` carry the rest
  --    (CLAUDE.md §4 — 16 recorded instances of an absent value falling through as a real one).
  status              text not null default 'not_connected'
                        check (status in ('not_connected', 'connected', 'error')),
  last_synced_at      timestamptz,
  last_sync_error     text,
  last_sync_row_count integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists client_search_connections_user_idx on public.client_search_connections (user_id);

comment on table public.client_search_connections is
  'Per-client Search Console link. Holds the property string and sync health ONLY — no tokens, no keys. Credentials live in the GOOGLE_SERVICE_ACCOUNT_JSON edge secret.';
comment on column public.client_search_connections.last_synced_at is
  'When the sync last RAN. ⛔ Never use this to decide which dates to display — data coverage is max(date) in search_console_page_daily, which is a different and usually earlier thing.';

-- ── 3. client_tracked_pages — the page inventory we report on ──────────────────────────────────
-- Deliberately NOT client_pages. client_pages is the page GENERATOR's plan store: its page_type is
-- CHECK-constrained to ('service','qa'), it is keyed on a plan, and 72 of its 72 rows have a null
-- published_url. This table is keyed on the URL Search Console actually returns, which is the only
-- thing that can join to a performance row.
create table if not exists public.client_tracked_pages (
  id                      uuid primary key default gen_random_uuid(),
  lead_id                 uuid not null references public.outreach_leads(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  -- Normalised by normaliseUrl() in src/lib/searchPerformance.ts — the SAME function the sync uses
  -- on every Search Console row. If the two ever disagree, every page reads as "untracked".
  canonical_url           text not null,
  label                   text,
  page_type               text not null default 'other'
                            check (page_type in ('home', 'service', 'location', 'commercial', 'other')),
  -- ⚠️ BOTH OF THESE ARE FACTS ABOUT THE PROJECT, NOT ABOUT THE URL, AND NEITHER MAY BE INFERRED.
  -- A page that existed before Findable and a page we built look identical from the outside. The
  -- default false means "not recorded as pre-existing", and built_or_rebuilt_on stays NULL until a
  -- person states it. The UI must treat NULL as unknown and suppress any before/after framing —
  -- never as "built today".
  existed_before_findable boolean not null default false,
  built_or_rebuilt_on     date,
  -- Optional bridge to the plan/question graph, so a page's baseline questions are reachable
  -- without copying them. Nullable and ON DELETE SET NULL: most real pages on a client's site were
  -- never client_pages rows, and a deleted plan must not delete a performance target.
  client_page_id          uuid references public.client_pages(id) on delete set null,
  first_tracked_on        date not null default current_date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (lead_id, canonical_url)
);

create index if not exists client_tracked_pages_lead_idx on public.client_tracked_pages (lead_id);
create index if not exists client_tracked_pages_user_idx on public.client_tracked_pages (user_id);

-- ── 4. search_console_page_daily — one row per client, day, page ───────────────────────────────
create table if not exists public.search_console_page_daily (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.outreach_leads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  -- ⛔ A URL STRING, NOT A FOREIGN KEY TO client_tracked_pages, AND THAT IS THE POINT. Search
  --    Console returns pages we do not track: old URLs, a feed, a page added to the site after we
  --    seeded. A FK would force the sync to either invent a tracked page or DROP the row. Dropping
  --    it loses real traffic silently. So every row is stored and the join happens at READ time —
  --    an unknown URL surfaces in the UI as "untracked", which is information, not an error.
  page        text not null,
  clicks      integer,
  impressions integer,
  ctr         numeric,
  position    numeric,
  synced_at   timestamptz not null default now(),
  -- The idempotency key. Re-syncing a day is an upsert onto this, which is WHY a rolling window
  -- can re-fetch unsettled days without ever creating a duplicate snapshot.
  unique (lead_id, date, page)
);

create index if not exists search_console_page_daily_lead_date_idx on public.search_console_page_daily (lead_id, date);

-- ── 5. search_console_query_daily — one row per client, day, page, query ───────────────────────
create table if not exists public.search_console_query_daily (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.outreach_leads(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  page        text not null,
  query       text not null,
  clicks      integer,
  impressions integer,
  ctr         numeric,
  position    numeric,
  synced_at   timestamptz not null default now(),
  unique (lead_id, date, page, query)
);

create index if not exists search_console_query_daily_lead_date_idx on public.search_console_query_daily (lead_id, date);

-- ── 6. RLS — owner-scoped, IN THIS MIGRATION (never enable without a policy) ───────────────────
alter table public.client_search_connections enable row level security;
alter table public.client_tracked_pages      enable row level security;
alter table public.search_console_page_daily  enable row level security;
alter table public.search_console_query_daily enable row level security;

create policy client_search_connections_owner_all on public.client_search_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy client_tracked_pages_owner_all on public.client_tracked_pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy search_console_page_daily_owner_all on public.search_console_page_daily
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy search_console_query_daily_owner_all on public.search_console_query_daily
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 7. Aggregates — SQL GROUPS AND SUMS; IT NEVER COMPUTES A RATE ──────────────────────────────
-- 🔴 THE ONE RULE ABOUT THESE FUNCTIONS: they return clicks, impressions and
--    sum(position * impressions) — three additive integers — and NOTHING ELSE. CTR and average
--    position are computed in exactly one place in the whole codebase, finaliseTotals() in
--    src/lib/searchPerformance.ts, which the SPA, the read function and the tests all import.
--    The moment SQL returns a ctr or a position, the rule "CTR is sum(clicks)/sum(impressions),
--    never the average of CTRs" exists in two places and one of them will drift (CLAUDE.md §6:
--    one rule written in N places, six recorded copies).
--
-- SECURITY INVOKER (the default, stated explicitly so nobody "fixes" it): under the service role
-- RLS is bypassed and the caller has already checked lead ownership; under an authenticated
-- browser session the owner policies above still apply. Neither path can read another user's rows.

create or replace function public.search_console_page_totals(
  p_lead uuid, p_from date, p_to date
) returns table (page text, clicks bigint, impressions bigint, position_impressions numeric)
language sql stable security invoker set search_path = public as $$
  select d.page,
         coalesce(sum(d.clicks), 0)::bigint,
         coalesce(sum(d.impressions), 0)::bigint,
         coalesce(sum(d.position * d.impressions), 0)::numeric
    from public.search_console_page_daily d
   where d.lead_id = p_lead and d.date >= p_from and d.date <= p_to
   group by d.page;
$$;

create or replace function public.search_console_query_totals(
  p_lead uuid, p_from date, p_to date, p_limit integer
) returns table (query text, page text, clicks bigint, impressions bigint, position_impressions numeric)
language sql stable security invoker set search_path = public as $$
  select d.query, d.page,
         coalesce(sum(d.clicks), 0)::bigint,
         coalesce(sum(d.impressions), 0)::bigint,
         coalesce(sum(d.position * d.impressions), 0)::numeric
    from public.search_console_query_daily d
   where d.lead_id = p_lead and d.date >= p_from and d.date <= p_to
   group by d.query, d.page
   order by 3 desc, 4 desc
   limit greatest(coalesce(p_limit, 50), 1);
$$;

-- Data coverage. ⛔ The UI shows data "through" THIS, never through last_synced_at: a sync that ran
-- five minutes ago and returned nothing must not imply there is data for today.
create or replace function public.search_console_coverage(p_lead uuid)
returns table (first_date date, last_date date, row_count bigint)
language sql stable security invoker set search_path = public as $$
  select min(d.date), max(d.date), count(*)::bigint
    from public.search_console_page_daily d
   where d.lead_id = p_lead;
$$;

grant execute on function public.search_console_page_totals(uuid, date, date)           to authenticated, service_role;
grant execute on function public.search_console_query_totals(uuid, date, date, integer) to authenticated, service_role;
grant execute on function public.search_console_coverage(uuid)                          to authenticated, service_role;

-- ── 8. VERIFY (run these after the migration and read the result back) ─────────────────────────
-- select table_name, column_name, data_type from information_schema.columns
--  where table_schema = 'public'
--    and (table_name in ('client_search_connections','client_tracked_pages',
--                        'search_console_page_daily','search_console_query_daily')
--         or (table_name = 'outreach_leads' and column_name = 'canonical_domain'))
--  order by table_name, ordinal_position;
--
-- select tablename, policyname, cmd from pg_policies
--  where tablename in ('client_search_connections','client_tracked_pages',
--                      'search_console_page_daily','search_console_query_daily')
--  order by tablename;   -- MUST return four rows. Zero rows = every read is a silent 200 [].
--
-- select proname from pg_proc where proname like 'search_console%';  -- MUST return three rows.
