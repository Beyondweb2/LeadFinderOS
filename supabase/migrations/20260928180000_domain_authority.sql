-- Domain ownership / authority for the new-website service (Paul, 2026-09-28; docs/domain-authority.md).
-- ADDITIVE ONLY: nullable columns (metadata-only), CHECKs added NOT VALID then validated, one new
-- SECURITY DEFINER function. The rule itself is src/lib/domainAuthority.ts — derived, never stored.
set lock_timeout = '5s';

-- ── 1. The client's own answers (onboarding) ──────────────────────────────────────────────────
-- website_manager (web_company / direct_access) is REUSED for "is your website managed by an agency".
alter table public.onboarding_responses add column if not exists domain_owned text;
alter table public.onboarding_responses add column if not exists domain_access text;
alter table public.onboarding_responses add column if not exists domain_third_party text;
alter table public.onboarding_responses add column if not exists site_rights text;
alter table public.onboarding_responses add column if not exists authority_confirmed boolean;
alter table public.onboarding_responses add column if not exists dns_permission boolean;
alter table public.onboarding_responses add column if not exists materials_confirmed boolean;
-- The customer stopped at the domain question and asked Findable to look at it (the escalation route).
alter table public.onboarding_responses add column if not exists domain_escalated_at timestamptz;
alter table public.onboarding_responses drop constraint if exists onboarding_domain_answers_check;
alter table public.onboarding_responses add constraint onboarding_domain_answers_check check (
  (domain_owned is null or domain_owned in ('yes', 'no', 'not_sure'))
  and (domain_access is null or domain_access in ('yes', 'no', 'agency'))
  and (domain_third_party is null or domain_third_party in ('yes', 'no', 'not_sure'))
  and (site_rights is null or site_rights in ('yes', 'no', 'not_sure'))) not valid;
alter table public.onboarding_responses validate constraint onboarding_domain_answers_check;

-- ── 2. What Sales learned (the four situations), on the lead ───────────────────────────────────
-- Informational: only the CLIENT's own confirmation can make a new site domain-ready.
alter table public.outreach_leads add column if not exists domain_control text;
alter table public.outreach_leads drop constraint if exists outreach_leads_domain_control_check;
alter table public.outreach_leads add constraint outreach_leads_domain_control_check check (
  domain_control is null or domain_control in ('client_owns', 'client_owns_agency_manages', 'third_party_owns', 'unknown')) not valid;
alter table public.outreach_leads validate constraint outreach_leads_domain_control_check;

-- ── 3. Findable ended the service because the client's domain / authority / IP was disputed ─────
-- Recorded by the admin (paid-client-hub). The app never moves money: it records, excludes the case
-- from the guarantee refund, and alerts Paul to cancel the subscription in Stripe.
alter table public.outreach_leads add column if not exists service_terminated_at timestamptz;
alter table public.outreach_leads add column if not exists service_termination_reason text;
alter table public.outreach_leads add column if not exists service_termination_note text;
alter table public.outreach_leads add column if not exists service_terminated_by uuid;
alter table public.outreach_leads drop constraint if exists outreach_leads_service_termination_check;
alter table public.outreach_leads add constraint outreach_leads_service_termination_check check (
  service_termination_reason is null or service_termination_reason in ('domain_authority_dispute')) not valid;
alter table public.outreach_leads validate constraint outreach_leads_service_termination_check;

-- ── 4. The sales view gains the domain situation at its END ─────────────────────────────────────
create or replace view public.sales_leads with (security_barrier = true) as
select
  l.id, l.business_name, l.phone, l.email, l.google_maps_url, l.address, l.category, l.status,
  l.next_action, l.next_action_date, l.next_action_note, l.call_booked_at, l.created_at, l.updated_at,
  l.country, l.list_type, l.is_archived, l.is_potential_work, l.image_url, l.facebook_url, l.instagram_url,
  l.contact_method, l.place_id, l.whatsapp_status, l.whatsapp_sent_at, l.whatsapp_delivery_status,
  l.whatsapp_template, l.queued_at, l.contact_name, l.website, l.campaign_id, l.search_keyword,
  l.search_location, l.derived_town, l.review_count, l.rating, l.lat, l.lng, l.line_type, l.product,
  l.hook_followup_queued_at, l.contact_followup_queued_at,
  l.assigned_to_user_id, l.assigned_at, l.added_by_user_id, l.website_control, l.website_control_note,
  null::numeric as amount_paid,
  l.lead_source,
  l.services_included, l.service_areas,
  l.domain_control
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;

-- ── 5. Sales records the domain situation (both roles, own leads) ──────────────────────────────
create or replace function public.lead_set_domain_control(_lead_id uuid, _value text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._require_work(_lead_id);
  if _value is not null and _value not in ('client_owns', 'client_owns_agency_manages', 'third_party_owns', 'unknown') then
    return jsonb_build_object('ok', false, 'error', 'bad_value');
  end if;
  update public.outreach_leads set domain_control = _value where id = _lead_id;
  insert into public.lead_activity (lead_id, actor_user_id, kind, data)
  values (_lead_id, auth.uid(), 'details_set', jsonb_build_object('domain_control', _value));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_set_domain_control(uuid, text) from public, anon;
grant execute on function public.lead_set_domain_control(uuid, text) to authenticated;
