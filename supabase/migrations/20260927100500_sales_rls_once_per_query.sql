-- Multi-user follow-up (2026-09-27): the sales SELECT policies must cost the ADMIN nothing.
--
-- 🔴 WHAT BROKE. The first sales policies called can_work_lead(lead_id) / sales_can_see_phone(phone)
-- per row. Permissive policies are OR-ed, and Postgres does not promise to evaluate the cheap
-- "(select my_role()) = 'sales'" guard first — so the admin's Inbox paid a function call (with its own
-- lookups) for every audit, run, queue row and message. The Inbox's embedded ai_audits → ai_audit_runs
-- read and the audit_gemini_signal view started answering 500 (statement timeout) within minutes of
-- the frontend going live. Found by loading the live Inbox as the admin.
--
-- ⛔ THE FIX: each policy compares against a SET computed ONCE per statement (a hashed subplan over a
-- SECURITY DEFINER set-returning function), and each function returns an empty set immediately for
-- anyone who is not sales. No per-row function call remains on any sales policy.
create or replace function public.my_sales_lead_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select l.id from public.outreach_leads l
    where l.assigned_to_user_id = auth.uid() and not public.lead_is_client(l.amount_paid, l.status);
end
$$;

create or replace function public.my_sales_audit_ids()
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select a.id from public.ai_audits a
    where a.lead_id in (select public.my_sales_lead_ids())
      and coalesce(a.audit_purpose, 'audit') = 'audit' and a.is_measurement is not true;
end
$$;

-- Every stored form a message phone can take for the rep's leads: whatsapp_messages.phone is E.164
-- digits ('447700900123'); the key alone and the trunk form are included for older rows.
create or replace function public.my_sales_message_phones()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'sales' then return; end if;
  return query
    select distinct x.p from (
      select public.phone_key(l.phone) as k from public.outreach_leads l
      where l.id in (select public.my_sales_lead_ids())
    ) s
    cross join lateral (values ('44' || s.k), (s.k), ('0' || s.k), ('+44' || s.k)) as x(p)
    where s.k is not null;
end
$$;

do $$
declare f text;
begin
  foreach f in array array['public.my_sales_lead_ids()', 'public.my_sales_audit_ids()', 'public.my_sales_message_phones()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

drop policy if exists sales_select_hook_audits on public.ai_audits;
create policy sales_select_hook_audits on public.ai_audits for select to authenticated
  using ((select public.my_role()) = 'sales' and id in (select public.my_sales_audit_ids()));

drop policy if exists sales_select_audit_runs on public.ai_audit_runs;
create policy sales_select_audit_runs on public.ai_audit_runs for select to authenticated
  using ((select public.my_role()) = 'sales' and audit_id in (select public.my_sales_audit_ids()));

drop policy if exists sales_select_audit_queue on public.ai_audit_queue;
create policy sales_select_audit_queue on public.ai_audit_queue for select to authenticated
  using ((select public.my_role()) = 'sales' and audit_id in (select public.my_sales_audit_ids()));

drop policy if exists sales_select_messages on public.whatsapp_messages;
create policy sales_select_messages on public.whatsapp_messages for select to authenticated
  using ((select public.my_role()) = 'sales'
         and (lead_id in (select public.my_sales_lead_ids()) or phone in (select public.my_sales_message_phones())));

drop policy if exists sales_select_crawl_checks on public.lead_crawl_checks;
create policy sales_select_crawl_checks on public.lead_crawl_checks for select to authenticated
  using ((select public.my_role()) = 'sales' and lead_id in (select public.my_sales_lead_ids()));

drop policy if exists sales_select_page_hits on public.lead_page_hits;
create policy sales_select_page_hits on public.lead_page_hits for select to authenticated
  using ((select public.my_role()) = 'sales' and lead_id in (select public.my_sales_lead_ids()));

drop policy if exists sales_select_templates on public.templates;
create policy sales_select_templates on public.templates for select to authenticated
  using ((select public.my_role()) = 'sales' and user_id = (select public.book_owner_id()));

drop policy if exists lead_activity_select on public.lead_activity;
create policy lead_activity_select on public.lead_activity for select to authenticated
  using ((select public.my_role()) = 'admin' or lead_id in (select public.my_sales_lead_ids()));

-- The view: the role once per statement, not per row.
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
  null::numeric as amount_paid
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;
