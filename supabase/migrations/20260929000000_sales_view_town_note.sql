-- ══ SALES SEES WHY A LEAD'S TOWN IS UNCONFIRMED (2026-09-28, Sales parity pass) ══════════════════
-- The Outreach row shows "Google couldn't confirm the town" from outreach_leads.town_fetch_note
-- (src/lib/townVerdict.ts townGated). The sales view never carried the column, so a salesperson's
-- gated lead refused WhatsApp queueing with no visible reason. It is the lead's own town note — no
-- money, delivery or admin-note data — appended at the view's END (create or replace view can only
-- add columns there). Body otherwise byte-for-byte the 20260928180000 definition (read back live
-- with pg_get_viewdef on 2026-09-28 before this was written).
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
  l.domain_control,
  l.town_fetch_note
from public.outreach_leads l
where (select public.my_role()) in ('sales', 'admin')
  and ((select public.my_role()) = 'admin' or l.assigned_to_user_id = (select auth.uid()))
  and not public.lead_is_client(l.amount_paid, l.status);
revoke all on public.sales_leads from public, anon, authenticated;
grant select on public.sales_leads to authenticated;
