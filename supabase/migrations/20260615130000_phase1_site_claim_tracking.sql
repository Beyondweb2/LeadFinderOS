-- Phase 1 — barber/trade site claim + full event tracking.
--
-- Additive + idempotent. Adds an unguessable permanent share link, the claim /
-- add-on / open / sent / replied tracking columns, a default A/B segment from the
-- linked lead, and a raw site_events history table. No data is destroyed.

-- ── 1. generated_sites: unguessable link + tracking columns ──────────────────
alter table public.generated_sites
  -- Long random, permanent, unguessable token for the barber's /s/:token link.
  -- Volatile default → every NEW generated site gets its own token automatically
  -- (no change needed in generate-barber-site). ~64 hex chars.
  add column if not exists share_token       text default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists segment           text,          -- 'A' (no website) | 'B' (bad website)
  add column if not exists sent_at           timestamptz,
  add column if not exists sent_template     text,
  add column if not exists sent_message      text,
  add column if not exists first_opened_at   timestamptz,
  add column if not exists open_count        integer not null default 0,
  add column if not exists replied_at        timestamptz,
  add column if not exists claimed_at        timestamptz,
  add column if not exists addon_interest_at timestamptz;

-- Backfill tokens for any pre-existing rows that somehow lack one (safety; the
-- volatile default already fills existing rows on ADD COLUMN).
update public.generated_sites
  set share_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  where share_token is null;

-- Unguessable lookups must be unique + fast.
create unique index if not exists generated_sites_share_token_key
  on public.generated_sites (share_token);

-- Default the A/B segment from the linked lead's list_type (overridable later).
update public.generated_sites gs
  set segment = case ol.list_type when 'broken_website' then 'B' else 'A' end
  from public.outreach_leads ol
  where gs.lead_id = ol.id and gs.segment is null;

-- Anon (the public /s/:token page) must read a published site by its token.
-- Column-level grant mirrors the existing public read pattern; RLS still limits
-- visibility to published rows. (record-site-event writes via the service role.)
grant select (id, site_name, content, template, share_token, claimed_at, addon_interest_at)
  on public.generated_sites to anon;

-- ── 2. site_events: append-only raw history for analysis ─────────────────────
create table if not exists public.site_events (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.generated_sites(id) on delete cascade,
  event_type text not null,   -- 'open' | 'claim' | 'addon_interest' | 'sent' | 'replied'
  created_at timestamptz not null default now(),
  meta       jsonb
);
create index if not exists site_events_site_id_idx on public.site_events (site_id, created_at);
create index if not exists site_events_type_idx    on public.site_events (event_type);

alter table public.site_events enable row level security;

-- Anon/users have NO direct access (the service-role edge function bypasses RLS
-- to insert public open/claim/addon events). Admins can read the full history
-- and insert admin-side events (sent / replied).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='site_events' and policyname='admins read site_events') then
    create policy "admins read site_events" on public.site_events
      for select using (
        exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='site_events' and policyname='admins insert site_events') then
    create policy "admins insert site_events" on public.site_events
      for insert with check (
        exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')
      );
  end if;
end $$;
