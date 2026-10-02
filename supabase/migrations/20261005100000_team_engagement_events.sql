-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- THE ENGAGEMENT LOG (Paul, 2026-10-02, docs/sales-page-monthly-commission.md §6).
-- One row each time a salesperson's engagement ENDS (Team → Disable) or RESUMES (Re-enable). Commission
-- reads it to decide whether a payment arrived while its seller was engaged (src/lib/commission.ts
-- engagedAt): a payment's eligibility is a function of ITS OWN time and this history, so re-enabling
-- someone later can never make a payment from their ended period commissionable.
-- ⛔ APPEND-ONLY AND SERVER-TIMED: `at` and `created_at` are set to now() by the database on every
-- insert (nothing can back- or forward-date an event); update, delete and truncate are refused by
-- trigger; no signed-in role holds any privilege (service role only — fn admin-users writes it).
-- Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.team_engagement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('ended', 'resumed')),
  at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists team_engagement_events_user_at on public.team_engagement_events (user_id, at);
alter table public.team_engagement_events enable row level security;
revoke all on public.team_engagement_events from anon, authenticated;

-- Seed BEFORE the timing trigger exists: a member already disabled gets their end at disabled_at.
insert into public.team_engagement_events (user_id, kind, at)
select t.user_id, 'ended', coalesce(t.disabled_at, now())
from public.team_members t
where t.status = 'disabled'
  and not exists (select 1 from public.team_engagement_events e where e.user_id = t.user_id);

create or replace function public.team_engagement_events_server_time()
returns trigger language plpgsql as $$
begin
  new.at := now();
  new.created_at := now();
  return new;
end $$;

create or replace function public.team_engagement_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'team_engagement_events is append-only';
end $$;

drop trigger if exists team_engagement_events_server_time on public.team_engagement_events;
create trigger team_engagement_events_server_time before insert on public.team_engagement_events
  for each row execute function public.team_engagement_events_server_time();
drop trigger if exists team_engagement_events_no_change on public.team_engagement_events;
create trigger team_engagement_events_no_change before update or delete on public.team_engagement_events
  for each row execute function public.team_engagement_events_append_only();
drop trigger if exists team_engagement_events_no_truncate on public.team_engagement_events;
create trigger team_engagement_events_no_truncate before truncate on public.team_engagement_events
  for each statement execute function public.team_engagement_events_append_only();
