-- READING JAVASCRIPT SITES IN A BROWSER: the switch, the monthly cap and the one write that spends (2026-11-03, docs/website-check.md).
-- Additive. Service role only: RLS on, no policies, no grants to anon / authenticated.
create table if not exists public.crawl_render_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  monthly_cap integer not null default 3000,
  updated_at timestamptz not null default now()
);
insert into public.crawl_render_settings (id) values (true) on conflict (id) do nothing;
alter table public.crawl_render_settings enable row level security;

create table if not exists public.crawl_render_usage (
  month text primary key,
  pages integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.crawl_render_usage enable row level security;

revoke all on public.crawl_render_settings from anon, authenticated;
revoke all on public.crawl_render_usage from anon, authenticated;

-- One page's claim. Absent settings or any mode but 'running' = do not.
create or replace function public.claim_crawl_render()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(now() at time zone 'Europe/London', 'YYYY-MM');
  v_cap integer;
  v_mode text;
  v_claimed integer;
begin
  select monthly_cap into v_cap from public.crawl_render_settings where id and enabled;
  if v_cap is null then return false; end if;
  select mode into v_mode from public.protection_settings limit 1;
  if coalesce(v_mode, '') <> 'running' then return false; end if;
  insert into public.crawl_render_usage as u (month, pages) values (v_month, 1)
    on conflict (month) do update set pages = u.pages + 1, updated_at = now()
    where u.pages < v_cap
    returning u.pages into v_claimed;
  return v_claimed is not null;
end;
$$;
revoke all on function public.claim_crawl_render() from public, anon, authenticated;
grant execute on function public.claim_crawl_render() to service_role;
