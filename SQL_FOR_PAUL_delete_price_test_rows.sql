-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DELETE THE TEST ROWS FROM THE PLAN-SCREEN PRICE VERIFICATION (2026-09-03)
--
-- Reaching the plan screen requires submitting the form, so proving the price displays correctly
-- on each of the four website answers meant eight real submissions. Each created one
-- onboarding_responses row and one outreach_leads row. Cost: ~36p of Google Places lookups.
-- NO audits fired (verified: 0 ai_audits against these leads), so no Apify money was spent.
--
-- All eight are named 'ZZ ...' and none has ever been messaged or paid.
--
-- ⚠️ RUN THE SELECTS FIRST and check the counts look like 8 and 8. The deletes are ordered
--    children-before-parents so no foreign key can block them.
-- ⚠️ The 'made up busienss' row is YOUR OWN test from 13:16 and is deliberately NOT touched.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- 1. LOOK FIRST -------------------------------------------------------------------------------
select id, business_name, website_addon, lead_id, created_at
  from onboarding_responses
 where business_name like 'ZZ %'
 order by created_at desc;

select id, business_name, enrichment_source, status, amount_paid, created_at
  from outreach_leads
 where business_name like 'ZZ %'
 order by created_at desc;

-- 2. SAFETY CHECK: none of these should have taken money or been contacted --------------------
--    Expect ZERO rows. If anything comes back, stop and look at it rather than deleting.
select l.id, l.business_name, l.amount_paid, l.status
  from outreach_leads l
 where l.business_name like 'ZZ %'
   and (coalesce(l.amount_paid, 0) > 0 or l.status <> 'not_contacted');

select m.lead_id, count(*) as messages
  from whatsapp_messages m
  join outreach_leads l on l.id = m.lead_id
 where l.business_name like 'ZZ %'
 group by m.lead_id;

-- 3. DELETE -----------------------------------------------------------------------------------
--    Onboarding rows first (they reference the leads), then the leads.
delete from onboarding_responses
 where business_name like 'ZZ %';

delete from outreach_leads
 where business_name like 'ZZ %'
   and coalesce(amount_paid, 0) = 0;

-- 4. CONFIRM ----------------------------------------------------------------------------------
select count(*) as onboarding_rows_left from onboarding_responses where business_name like 'ZZ %';
select count(*) as leads_left            from outreach_leads       where business_name like 'ZZ %';
