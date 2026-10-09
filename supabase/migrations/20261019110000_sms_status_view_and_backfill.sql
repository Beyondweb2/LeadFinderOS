-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- SMS STATUS FOR EVERY ROLE (2026-10-09, feat/sms-inbox-parity).
-- Paul queued texts and the lead never showed Queued / Contacted: the SMS state lived on outreach_leads columns nothing read, and the
-- delivery callback updated only the message row. This migration:
--   1. appends sms_queued_at and sms_delivery_status to the sales_leads view (APPENDED at the end — create or replace view keeps every
--      existing column and the security_barrier option, so a salesperson's list and Inbox can draw Queued / SMS Failed / No SMS);
--   2. BACKFILLS the four leads that were texted before the callback wiring: their sms_delivery_status from their newest real outbound text
--      (delivered / sent / failed; a failure code maps with src/lib/smsStatus.ts: 30005, 30006, 21211, 21614 = no_sms, else sms_failed), and a
--      DELIVERED text moves a still-early lead to Contacted (initial_contact) — the same effect a WhatsApp send has.
-- Nothing else is written. Rollback: re-create the view without the two columns.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

create or replace view public.sales_leads with (security_barrier = true) as
SELECT id,
    business_name,
    phone,
    email,
    google_maps_url,
    address,
    category,
    status,
    next_action,
    next_action_date,
    next_action_note,
    call_booked_at,
    created_at,
    updated_at,
    country,
    list_type,
    is_archived,
    is_potential_work,
    image_url,
    facebook_url,
    instagram_url,
    contact_method,
    place_id,
    whatsapp_status,
    whatsapp_sent_at,
    whatsapp_delivery_status,
    whatsapp_template,
    queued_at,
    contact_name,
    website,
    campaign_id,
    search_keyword,
    search_location,
    derived_town,
    review_count,
    rating,
    lat,
    lng,
    line_type,
    product,
    hook_followup_queued_at,
    contact_followup_queued_at,
    assigned_to_user_id,
    assigned_at,
    added_by_user_id,
    website_control,
    website_control_note,
    NULL::numeric AS amount_paid,
    lead_source,
    services_included,
    service_areas,
    domain_control,
    town_fetch_note,
    linkedin_url,
    facebook_status,
    instagram_status,
    linkedin_status,
    next_action_time,
    lost_reason,
    lost_reason_note,
    sms_queued_at,
    sms_delivery_status
   FROM outreach_leads l
  WHERE ((( SELECT my_role() AS my_role)) = ANY (ARRAY['sales'::text, 'admin'::text])) AND ((( SELECT my_role() AS my_role)) = 'admin'::text OR assigned_to_user_id = (( SELECT auth.uid() AS uid))) AND NOT lead_is_client(amount_paid, status);

with last as (
  select distinct on (m.lead_id) m.lead_id, m.status, m.error_code
    from public.sms_messages m
   where m.direction = 'outbound' and m.test_mode = false and m.lead_id is not null
   order by m.lead_id, m.created_at desc
)
update public.outreach_leads l
   set sms_delivery_status = case
         when last.status = 'delivered' then 'delivered'
         when last.status = 'sent' then 'sent'
         when last.status in ('failed', 'undelivered') then
           case when last.error_code in ('30005', '30006', '21211', '21614') then 'no_sms' else 'sms_failed' end
         else 'queued' end
  from last
 where l.id = last.lead_id and l.sms_queued_at is null;

update public.outreach_leads l
   set status = 'initial_contact'
 where l.sms_delivery_status = 'delivered'
   and coalesce(l.status, '') in ('', 'not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed');

-- Read back:
--   select column_name from information_schema.columns where table_name = 'sales_leads' and column_name in ('sms_queued_at', 'sms_delivery_status');
--   select (select reloptions::text from pg_class where oid = 'public.sales_leads'::regclass);   -- {security_barrier=true}
--   select sms_delivery_status, count(*) from public.outreach_leads where sms_delivery_status is not null group by 1;
