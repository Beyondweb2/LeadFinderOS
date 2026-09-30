-- ADMIN CONTROL CENTRE, release 5 (2026-09-30): feature usage.
-- Most features already leave a row (audits, logged contacts, Next Actions, Quick Close, Niche Check,
-- socials, directories, the backlog, links sent, reply drafts…) and are COUNTED from those rows by
-- admin_feature_usage() below. Only four leave nothing, so they get one small event each, and only for
-- a USEFUL action, never a click (Paul): the call script shown for a lead, a LinkedIn / email script
-- copied, Focus Mode opened — at most once per person, per feature, per lead, per London day.
-- Additive and idempotent.

create table if not exists public.feature_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null check (feature in ('focus_mode', 'call_script', 'linkedin_script', 'email_script')),
  lead_id uuid,
  day date not null default ((now() at time zone 'Europe/London')::date),
  created_at timestamptz not null default now()
);
create unique index if not exists feature_events_once_a_day
  on public.feature_events (user_id, feature, coalesce(lead_id, '00000000-0000-0000-0000-000000000000'::uuid), day);
alter table public.feature_events enable row level security;

-- The one writer: the signed-in person, their own id, an allowlisted feature. A repeat the same day is a no-op.
create or replace function public.log_feature_event(_feature text, _lead_id uuid default null)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if _feature not in ('focus_mode', 'call_script', 'linkedin_script', 'email_script') then return; end if;
  insert into public.feature_events (user_id, feature, lead_id) values (auth.uid(), _feature, _lead_id)
  on conflict do nothing;
end $$;
revoke all on function public.log_feature_event(text, uuid) from public, anon;
grant execute on function public.log_feature_event(text, uuid) to authenticated;

-- Uses per feature per person in a range, summed in the database (the dashboard never pages the rows).
create or replace function public.admin_feature_usage(_from timestamptz, _to timestamptz)
returns table (feature text, user_id uuid, uses bigint)
language sql stable security definer set search_path = public
as $$
  with ev as (
    select 'hook_audit'::text f, null::uuid u, a.created_at t from ai_audits a where a.audit_purpose = 'audit'
    union all select 'discovery', null, a.created_at from ai_audits a where a.audit_purpose = 'discovery'
    union all select 'paid_baseline', null, a.created_at from ai_audits a where a.audit_purpose = 'baseline'
    union all select 'weekly_check', null, a.created_at from ai_audits a where a.audit_purpose = 'weekly_check'
    union all select 'lead_search', e.user_id, e.created_at from usage_events e where e.event_type = 'search'
    -- From the lead rows themselves: lead_activity 'lead_added' only exists since 2026-09-27, so it made
    -- every earlier week read "unused" (found by the first AI briefing, 2026-09-30).
    union all select 'leads_added', l.added_by_user_id, l.created_at from outreach_leads l
    union all select 'log_contact', a.actor_user_id, a.created_at from lead_activity a where a.kind in ('call_outcome', 'contact_logged')
    union all select 'next_action', a.actor_user_id, a.created_at from lead_activity a where a.kind = 'follow_up_set'
    union all select 'find_email', a.actor_user_id, a.created_at from lead_activity a where a.kind = 'details_set' and a.data ? 'email_source'
    union all select 'find_socials', s.added_by, s.created_at from lead_social_profiles s where s.added_by is not null  -- a person found it; the 2026-09-30 backfill has no actor
    union all select 'paid_enrich', g.user_id, g.created_at from api_usage_log g where g.api_type in ('apify_business_enrich', 'apify_website_check', 'apify_maps_enrich')
    union all select 'voice_note', v.user_id, v.generated_at from voice_note_scripts v
    union all select 'reply_draft', g.user_id, g.created_at from api_usage_log g where g.api_type = 'openai_warm_reply'
    union all select 'quick_close', q.actor_user_id, q.created_at from quick_close_events q
    union all select 'niche_check', n.created_by, n.created_at from niche_samples n
    union all select 'directories', r.requested_by, r.started_at from lead_directory_presence_runs r
    union all select 'opportunity_backlog', o.user_id, o.created_at from client_opportunities o
    union all select 'report_link', e.actor_user_id, e.created_at from report_link_events e where e.kind = 'sent'
    union all select 'signup_link', e.actor_user_id, e.created_at from onboarding_link_events e where e.kind = 'sent'
    union all select 'prospect_preview', p.user_id, coalesce(p.generated_at, p.created_at) from prospect_previews p
    union all select 'page_generator', c.user_id, c.created_at from client_pages c
    union all select 'mockups', null, s.created_at from generated_sites s
    union all select 'reply_handled', t.resolved_by, t.resolved_at from conversation_triage t where t.resolved_at is not null
    union all select e.feature, e.user_id, e.created_at from feature_events e
  )
  select f, u, count(*)::bigint from ev
  where t is not null and (_from is null or t >= _from) and t < _to
  group by f, u
$$;
revoke all on function public.admin_feature_usage(timestamptz, timestamptz) from public;
revoke all on function public.admin_feature_usage(timestamptz, timestamptz) from anon, authenticated;
grant execute on function public.admin_feature_usage(timestamptz, timestamptz) to service_role;
