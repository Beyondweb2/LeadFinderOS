-- Per-person display preferences (2026-09-28): first use, the Sales Dashboard's hidden campaigns and
-- templates. ADDITIVE: one new small table. Each person reads and writes ONLY their own row; nobody —
-- not even the admin — reads another person's. Display only: nothing here changes a metric.
set lock_timeout = '5s';

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  dashboard_hidden jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_own_select on public.user_preferences;
create policy user_preferences_own_select on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists user_preferences_own_insert on public.user_preferences;
create policy user_preferences_own_insert on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists user_preferences_own_update on public.user_preferences;
create policy user_preferences_own_update on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_preferences from public, anon;
revoke delete, truncate on public.user_preferences from authenticated;
grant select, insert, update on public.user_preferences to authenticated;
