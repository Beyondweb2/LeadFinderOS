-- Manual website-status overrides for Find Leads results. ADDITIVE.
-- Search results are auto-detected fresh each search (not stored), so a manual
-- correction must persist server-side keyed by the business and be re-applied
-- over auto-detection so it always wins. One row per (user, business map url);
-- the app upserts on that unique key to toggle in place.

create table if not exists public.website_status_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_maps_url text not null,
  business_name text,
  website_status text not null,          -- 'NO_WEBSITE' | 'HAS_OWN_WEBSITE'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_maps_url)
);

alter table public.website_status_overrides enable row level security;

create policy "owners manage their website overrides"
  on public.website_status_overrides for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger website_status_overrides_set_updated_at
  before update on public.website_status_overrides
  for each row execute function public.update_updated_at_column();
