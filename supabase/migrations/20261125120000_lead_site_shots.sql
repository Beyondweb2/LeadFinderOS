-- LEAD SITE SHOTS (2026-10-23) — one homepage picture per lead for the prospect report's left card.
-- ADDITIVE ONLY: two new tables, one function, one private bucket. Nothing existing is changed.
-- Rollback:
--   drop function if exists public.claim_site_shot(uuid, timestamptz, interval, integer);
--   drop table if exists public.lead_site_shots; drop table if exists public.site_shot_settings;
--   delete from storage.buckets where id = 'lead-site-shots';   -- (empty it first)
--
-- lead_site_shots — ONE ROW PER LEAD (primary key lead_id). fn site-shot CLAIMS the row with claim_site_shot()
-- (one conditional write only one caller can win), then shoots, then records the outcome. The picture itself
-- is one object in the PRIVATE bucket `lead-site-shots` at <lead_id>/homepage.jpg, overwritten on a re-shoot,
-- and read back by short-lived signed URLs minted at report render. Nothing here is ever sent anywhere.
-- ⛔ SERVICE ROLE ONLY. RLS on, NO policies (anon/authenticated hold grants on every public table), grants revoked.
create table if not exists public.lead_site_shots (
  lead_id uuid primary key references public.outreach_leads(id) on delete cascade,
  status text not null default 'claimed' check (status in ('claimed', 'ok', 'refused', 'failed')),
  reason text,
  source_url text,
  path text,
  content_type text,
  bytes integer,
  request_ms integer,
  attempts integer not null default 0,
  claimed_at timestamptz,
  shot_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists lead_site_shots_claimed_at_idx on public.lead_site_shots (claimed_at);
alter table public.lead_site_shots enable row level security;
revoke all on table public.lead_site_shots from anon, authenticated;
comment on table public.lead_site_shots is
  'One homepage picture per lead for the prospect report. Service role only (RLS, no policies). Written by the site-shot edge function; the file is in the private lead-site-shots bucket.';

-- site_shot_settings — the KILL SWITCH and the monthly cap. One row; `enabled` false = nothing is shot automatically.
-- The cap counts shots CLAIMED in the London calendar month. Service-role only.
create table if not exists public.site_shot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  monthly_cap integer not null default 600 check (monthly_cap between 0 and 100000),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.site_shot_settings enable row level security;
revoke all on table public.site_shot_settings from anon, authenticated;
insert into public.site_shot_settings (id, enabled, monthly_cap, updated_by) values (true, false, 600, 'migration') on conflict (id) do nothing;

-- claim_site_shot — the ONE conditional write. A row is claimed only when: there is none; or its picture is older than
-- p_fresh; or the last try failed and attempts are below p_max_attempts; or a refusal is older than p_fresh; or an
-- earlier claim never finished (older than 10 minutes). Anything else is 'held' — so two audits finishing together can
-- never both spend. Returns 'claimed' or 'held'.
create or replace function public.claim_site_shot(p_lead uuid, p_now timestamptz, p_fresh interval, p_max_attempts integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  insert into public.lead_site_shots as s (lead_id, status, attempts, claimed_at, updated_at)
  values (p_lead, 'claimed', 1, p_now, p_now)
  on conflict (lead_id) do update
    set status = 'claimed',
        attempts = case when s.status = 'failed' then s.attempts + 1 else 1 end,
        claimed_at = p_now,
        reason = null,
        updated_at = p_now
    where (s.status = 'ok' and s.shot_at < p_now - p_fresh)
       or (s.status = 'failed' and s.attempts < p_max_attempts)
       or (s.status = 'refused' and s.updated_at < p_now - p_fresh)
       or (s.status = 'claimed' and s.claimed_at < p_now - interval '10 minutes')
  returning s.lead_id into v_id;
  return case when v_id is null then 'held' else 'claimed' end;
end $function$;
revoke all on function public.claim_site_shot(uuid, timestamptz, interval, integer) from public, anon, authenticated;

-- The private bucket: no storage policies, so only the service role reads or writes it. JPEG only, 2 MB a file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-site-shots', 'lead-site-shots', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Verify (read back):
--   select * from public.site_shot_settings;
--   select relrowsecurity from pg_class where relname in ('lead_site_shots', 'site_shot_settings');
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'lead-site-shots';
--   select has_function_privilege('anon', 'public.claim_site_shot(uuid, timestamptz, interval, integer)', 'execute');
