-- Admin home "What needs you" (Concept A, Paul 2026-10-26). docs/design/admin-dashboard/README.md.
-- Additive and idempotent. Nothing here sends, deletes or rewrites a lead.
--   1. admin_home_marks         — snooze / dismiss / archive per admin; archive is a mark, never a delete; undo = undone_at.
--   2. onboarding_outcomes      — a closed questionnaire: lost + reason (paid is DERIVED from the lead, never stored here).
--   3. dashboard_template_approvals — Paul marks a proposed template "approved by Meta"; until then its button is disabled.
--   4. admin_home_needs()       — the facts the list is folded from (src/lib/needsMe.ts), admin only.
--   5. admin_home_numbers(int)  — the key numbers (funnel, sending health, team this week), admin only.

-- 1. Marks ------------------------------------------------------------------------------------------------
create table if not exists public.admin_home_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_key text not null,
  action text not null check (action in ('snooze', 'dismiss', 'archive')),
  until timestamptz,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists admin_home_marks_user_idx on public.admin_home_marks (user_id, item_key) where undone_at is null;
alter table public.admin_home_marks enable row level security;
drop policy if exists admin_home_marks_select on public.admin_home_marks;
create policy admin_home_marks_select on public.admin_home_marks for select
  using (user_id = (select auth.uid()) and (select public.my_role()) = 'admin');
drop policy if exists admin_home_marks_insert on public.admin_home_marks;
create policy admin_home_marks_insert on public.admin_home_marks for insert
  with check (user_id = (select auth.uid()) and (select public.my_role()) = 'admin');
drop policy if exists admin_home_marks_update on public.admin_home_marks;
create policy admin_home_marks_update on public.admin_home_marks for update
  using (user_id = (select auth.uid()) and (select public.my_role()) = 'admin')
  with check (user_id = (select auth.uid()) and (select public.my_role()) = 'admin');
-- No delete policy on purpose: a mark is undone (undone_at), never deleted.

-- 2. Questionnaire outcomes -------------------------------------------------------------------------------
create table if not exists public.onboarding_outcomes (
  onboarding_id uuid primary key references public.onboarding_responses (id),
  outcome text not null check (outcome in ('lost')),
  lost_reason text not null check (lost_reason in ('price', 'domain_agency', 'timing', 'not_decision_maker', 'went_quiet', 'other')),
  note text,
  recorded_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default now()
);
alter table public.onboarding_outcomes enable row level security;
drop policy if exists onboarding_outcomes_admin_select on public.onboarding_outcomes;
create policy onboarding_outcomes_admin_select on public.onboarding_outcomes for select using ((select public.my_role()) = 'admin');
drop policy if exists onboarding_outcomes_admin_insert on public.onboarding_outcomes;
create policy onboarding_outcomes_admin_insert on public.onboarding_outcomes for insert
  with check ((select public.my_role()) = 'admin' and recorded_by = (select auth.uid()));
drop policy if exists onboarding_outcomes_admin_update on public.onboarding_outcomes;
create policy onboarding_outcomes_admin_update on public.onboarding_outcomes for update
  using ((select public.my_role()) = 'admin') with check ((select public.my_role()) = 'admin' and recorded_by = (select auth.uid()));

-- 3. Template approvals -----------------------------------------------------------------------------------
create table if not exists public.dashboard_template_approvals (
  template_key text primary key,
  approved_at timestamptz not null default now(),
  approved_by uuid not null default auth.uid()
);
alter table public.dashboard_template_approvals enable row level security;
drop policy if exists dashboard_template_approvals_admin_select on public.dashboard_template_approvals;
create policy dashboard_template_approvals_admin_select on public.dashboard_template_approvals for select using ((select public.my_role()) = 'admin');
drop policy if exists dashboard_template_approvals_admin_insert on public.dashboard_template_approvals;
create policy dashboard_template_approvals_admin_insert on public.dashboard_template_approvals for insert
  with check ((select public.my_role()) = 'admin' and approved_by = (select auth.uid()));
drop policy if exists dashboard_template_approvals_admin_delete on public.dashboard_template_approvals;
-- Un-marking an approval removes the approval row only (it is a switch, not business data).
create policy dashboard_template_approvals_admin_delete on public.dashboard_template_approvals for delete using ((select public.my_role()) = 'admin');

-- Helper: a lead the business numbers leave out (metric_exclusions kind 'lead').
create or replace function public._admin_home_excluded(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_lead is not null and exists (select 1 from public.metric_exclusions e where e.kind = 'lead' and e.value = p_lead::text);
$$;
revoke all on function public._admin_home_excluded(uuid) from public, anon, authenticated;

-- 4. The facts for "What needs you" -----------------------------------------------------------------------
create or replace function public.admin_home_needs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_today date := (now() at time zone 'Europe/London')::date;
  v jsonb;
begin
  if (select public.my_role()) is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'questionnaires', coalesce((
      select jsonb_agg(q order by q.created_at desc) from (
        select o.id, o.lead_id, coalesce(o.business_name, l.business_name) as business_name, o.created_at, o.updated_at, o.status,
               o.incomplete, o.plan_tier, o.website_route, o.website_addon, o.business_website, o.domain_status, o.domain_owned,
               o.domain_access, o.domain_third_party, o.site_rights, o.authority_confirmed, o.dns_permission, o.materials_confirmed,
               o.website_manager, o.agency_contract, o.domain_escalated_at,
               l.phone as lead_phone, l.country as lead_country, l.contact_name as lead_contact_name,
               l.amount_paid as lead_amount_paid, l.payment_date as lead_payment_date,
               (select max(a.accepted_at) from public.client_agreement_acceptances a
                 where a.onboarding_id = o.id or (o.lead_id is not null and a.lead_id = o.lead_id)) as agreement_signed_at,
               (select max(m.created_at) from public.whatsapp_messages m
                 where m.lead_id = o.lead_id and m.direction = 'outbound' and m.created_at > o.created_at
                   and coalesce(m.test_mode, false) = false) as last_out_at,
               (select m.template_name from public.whatsapp_messages m
                 where m.lead_id = o.lead_id and m.direction = 'outbound' and m.created_at > o.created_at
                   and coalesce(m.test_mode, false) = false order by m.created_at desc limit 1) as last_out_template,
               exists (select 1 from public.whatsapp_messages m where m.lead_id = o.lead_id and m.direction = 'outbound'
                   and m.template_name = 'questionnaire_followup' and coalesce(m.status, '') not in ('failed', 'simulated')) as followup_sent,
               (select max(m.created_at) from public.whatsapp_messages m
                 where m.lead_id = o.lead_id and m.direction = 'inbound' and m.created_at > o.created_at) as last_in_at,
               oc.outcome, oc.lost_reason, oc.recorded_at as outcome_at
          from public.onboarding_responses o
          left join public.outreach_leads l on l.id = o.lead_id
          left join public.onboarding_outcomes oc on oc.onboarding_id = o.id
         where o.created_at > now() - interval '30 days'
           and not public._admin_home_excluded(o.lead_id)
           and coalesce(l.is_archived, false) = false
      ) q), '[]'::jsonb),
    'interested', coalesce((
      select jsonb_agg(i order by i.last_in_at) from (
        select l.id as lead_id, l.business_name, l.phone, l.country, l.contact_name, w.last_in_at, w.last_out_at
          from public.outreach_leads l
          cross join lateral (
            select max(m.created_at) filter (where m.direction = 'inbound') as last_in_at,
                   max(m.created_at) filter (where m.direction = 'outbound' and coalesce(m.test_mode, false) = false) as last_out_at
              from public.whatsapp_messages m where m.lead_id = l.id) w
         where l.is_potential_work = true and coalesce(l.is_archived, false) = false and coalesce(l.amount_paid, 0) <= 0
           and w.last_in_at is not null and w.last_in_at > coalesce(w.last_out_at, '-infinity'::timestamptz)
           and not public._admin_home_excluded(l.id)
         limit 200
      ) i), '[]'::jsonb),
    'followups', coalesce((
      select jsonb_agg(f order by f.next_action_date, f.next_action_time nulls last) from (
        select l.id as lead_id, l.business_name, l.phone, l.country, l.contact_name, l.next_action::text as next_action,
               l.next_action_date, l.next_action_time, l.next_action_note, l.is_potential_work as starred
          from public.outreach_leads l
         where l.next_action is not null and l.next_action::text <> 'none'
           and l.next_action_date is not null and l.next_action_date <= v_today
           and coalesce(l.is_archived, false) = false and not public._admin_home_excluded(l.id)
         limit 200
      ) f), '[]'::jsonb),
    'marks', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'item_key', k.item_key, 'action', k.action, 'until', k.until, 'created_at', k.created_at))
        from public.admin_home_marks k where k.user_id = v_uid and k.undone_at is null), '[]'::jsonb),
    'approvals', coalesce((select jsonb_agg(t.template_key) from public.dashboard_template_approvals t), '[]'::jsonb),
    'today', v_today
  ) into v;
  return v;
end $$;
revoke all on function public.admin_home_needs() from public, anon;
grant execute on function public.admin_home_needs() to authenticated;

-- 5. The key numbers --------------------------------------------------------------------------------------
create or replace function public.admin_home_numbers(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 14), 90)));
  v_day_start timestamptz := ((now() at time zone 'Europe/London')::date)::timestamp at time zone 'Europe/London';
  v jsonb;
begin
  if (select public.my_role()) is distinct from 'admin' then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  with openers as (
    select m.lead_id, bool_or(m.status in ('delivered', 'read')) as delivered
      from public.whatsapp_messages m
     where m.direction = 'outbound' and m.created_at >= v_since and coalesce(m.test_mode, false) = false
       and coalesce(m.status, '') <> 'simulated' and m.lead_id is not null
       and (m.template_name like 'initial\_contact%' or m.template_name like 'initial\_opener%')
       and not public._admin_home_excluded(m.lead_id)
     group by m.lead_id
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 14), 90)),
    'funnel', jsonb_build_object(
      'sent', (select count(*) from openers),
      'delivered', (select count(*) from openers where delivered),
      'real_replies', (select count(*) from openers o where exists (
          select 1 from public.whatsapp_messages i where i.lead_id = o.lead_id and i.direction = 'inbound'
             and i.created_at >= v_since and coalesce(i.reply_kind, '') not in ('auto', 'confirmed'))),
      'interested', (select count(*) from openers o join public.outreach_leads l on l.id = o.lead_id where l.is_potential_work = true),
      'questionnaire', (select count(*) from public.onboarding_responses r where r.created_at >= v_since and not public._admin_home_excluded(r.lead_id)),
      'reached_payment', (select count(distinct coalesce(a.lead_id::text, a.id::text)) from public.client_agreement_acceptances a
                           where a.accepted_at >= v_since and not public._admin_home_excluded(a.lead_id)),
      'paid', (select count(*) from public.outreach_leads l where l.payment_date >= v_since and coalesce(l.amount_paid, 0) > 0
                 and not public._admin_home_excluded(l.id))
    ),
    'health', (select jsonb_build_object(
        'rating', s.meta_quality_rating, 'tier', s.meta_messaging_tier, 'checked_at', s.meta_health_checked_at, 'ok_at', s.meta_health_ok_at,
        'daily_cap', s.daily_cap, 'min_gap_minutes', s.min_gap_minutes, 'person_daily_limit_default', s.person_daily_limit_default,
        'paused', s.paused,
        'sent_today', (select count(*) from public.whatsapp_messages m where m.direction = 'outbound' and m.created_at >= v_day_start
                         and coalesce(m.test_mode, false) = false and coalesce(m.status, '') <> 'simulated'),
        'failed_today', (select count(*) from public.whatsapp_messages m where m.direction = 'outbound' and m.created_at >= v_day_start
                         and coalesce(m.test_mode, false) = false and m.status in ('failed', 'failed_temporary')))
      from public.whatsapp_outreach_state s limit 1),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', t.uid, 'name', t.name, 'messages', t.n) order by t.n desc) from (
        select m.sent_by_user_id as uid, coalesce(tm.display_name, 'Unknown') as name, count(*) as n
          from public.whatsapp_messages m left join public.team_members tm on tm.user_id = m.sent_by_user_id
         where m.direction = 'outbound' and m.created_at >= now() - interval '7 days' and m.sent_by_user_id is not null
           and coalesce(m.test_mode, false) = false
           and not exists (select 1 from public.metric_exclusions e where e.kind = 'user' and e.value = m.sent_by_user_id::text)
         group by 1, 2) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_home_numbers(int) from public, anon;
grant execute on function public.admin_home_numbers(int) to authenticated;
