-- ADMIN CONTROL CENTRE, release 5 (2026-09-30): first-party findable.live analytics.
-- Paul's decision (2026-09-30): cookie-free, no names, no raw IP, no fingerprinting, admin/test
-- excluded; meaningful funnel events only; landing page, referrer and UTM where available.
-- What a row holds: the event, a RANDOM per-tab session id (sessionStorage, gone when the tab closes),
-- the path, the referring HOST only, UTM tags, a coarse device class, and whether it was flagged
-- internal. Nothing else — no IP, no user agent, no email, no name.
-- Written only by fn site-analytics (service role); read only by admin_site_funnel() below.

create table if not exists public.site_analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event text not null check (event in ('visit', 'free_check_started', 'onboarding_started', 'checkout_started')),
  session_id text not null check (char_length(session_id) between 8 and 40),
  path text check (char_length(path) <= 200),
  referrer_host text check (char_length(referrer_host) <= 120),
  utm_source text check (char_length(utm_source) <= 80),
  utm_medium text check (char_length(utm_medium) <= 80),
  utm_campaign text check (char_length(utm_campaign) <= 80),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  internal boolean not null default false
);
create index if not exists site_analytics_events_time on public.site_analytics_events (occurred_at desc);
create index if not exists site_analytics_events_session on public.site_analytics_events (session_id, occurred_at);
alter table public.site_analytics_events enable row level security;

-- The Findable funnel for a range: browser events (sessions, not page loads) + the server's own facts.
-- Internal sessions and internal / test submissions are counted apart, never in the funnel.
create or replace function public.admin_site_funnel(_from timestamptz, _to timestamptz)
returns jsonb language sql stable security definer set search_path = public
as $$
  with ev as (
    select * from site_analytics_events e
    where (_from is null or e.occurred_at >= _from) and e.occurred_at < _to
  ),
  real_sessions as (select distinct session_id from ev where not internal),
  firsts as (
    select distinct on (session_id) session_id, path, referrer_host, utm_source, utm_medium, utm_campaign, device
    from ev where not internal and event = 'visit' order by session_id, occurred_at
  ),
  int_emails as (select lower(value) v from metric_exclusions where kind = 'email'),
  ex_leads as (select value::uuid v from metric_exclusions where kind = 'lead'),
  onb as (
    select o.* from onboarding_responses o
    where (_from is null or o.created_at >= _from) and o.created_at < _to
      and not exists (select 1 from int_emails i where lower(coalesce(o.contact_email, '')) = i.v or (i.v like '@%' and lower(coalesce(o.contact_email, '')) like '%' || i.v))
      and (o.lead_id is null or o.lead_id not in (select v from ex_leads))
  )
  select jsonb_build_object(
    'tracking_since', (select min(occurred_at) from site_analytics_events),
    'sessions', (select count(*) from real_sessions),
    'page_views', (select count(*) from ev where not internal and event = 'visit'),
    'internal_sessions', (select count(distinct session_id) from ev where internal),
    'free_check_started', (select count(distinct session_id) from ev where not internal and event = 'free_check_started'),
    'onboarding_started', (select count(distinct session_id) from ev where not internal and event = 'onboarding_started'),
    'checkout_started_browser', (select count(distinct session_id) from ev where not internal and event = 'checkout_started'),
    'free_check_submitted', (select count(*) from onb where source = 'free_check'),
    'free_check_completed', (select count(*) from ai_audits a
       where a.audit_purpose = 'free_check' and (_from is null or a.created_at >= _from) and a.created_at < _to
         and (a.lead_id is null or a.lead_id not in (select v from ex_leads))
         and exists (select 1 from onb where onb.lead_id = a.lead_id and onb.source = 'free_check')
         and exists (select 1 from ai_audit_runs r where r.audit_id = a.id and r.status in ('complete', 'capped'))),
    'signup_forms', (select count(*) from onb where coalesce(source, 'signup') <> 'free_check'),
    'checkout_sessions', (select count(*) from client_error_reports c
       where c.error_id = 'checkout_session_created' and (_from is null or c.created_at >= _from) and c.created_at < _to
         and coalesce((c.context->>'lead_id')::uuid, '00000000-0000-0000-0000-000000000000'::uuid) not in (select v from ex_leads)),
    'checkout_refused', (select count(*) from client_error_reports c
       where c.error_id like 'checkout_refused%' and (_from is null or c.created_at >= _from) and c.created_at < _to),
    'paid', (select count(*) from payment_ledger p where p.kind = 'initial' and p.status = 'succeeded'
       and (_from is null or p.occurred_at >= _from) and p.occurred_at < _to and (p.lead_id is null or p.lead_id not in (select v from ex_leads))),
    'landing_pages', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select path as key, count(*) n from firsts group by path order by 2 desc limit 8) x),
    'referrers', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select coalesce(referrer_host, '(direct / none)') as key, count(*) n from firsts group by 1 order by 2 desc limit 8) x),
    'campaigns', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select concat_ws(' / ', utm_source, utm_medium, utm_campaign) as key, count(*) n from firsts where utm_source is not null or utm_campaign is not null group by 1 order by 2 desc limit 8) x),
    'devices', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select coalesce(device, 'unknown') as key, count(*) n from firsts group by 1) x),
    'top_pages', (select coalesce(jsonb_agg(x order by x.n desc), '[]'::jsonb) from (select path as key, count(*) n from ev where not internal and event = 'visit' group by path order by 2 desc limit 10) x)
  )
$$;
revoke all on function public.admin_site_funnel(timestamptz, timestamptz) from public;
revoke all on function public.admin_site_funnel(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.admin_site_funnel(timestamptz, timestamptz) to service_role;
