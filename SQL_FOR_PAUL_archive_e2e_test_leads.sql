-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ARCHIVE THE PAYMENT-FLOW TEST LEADS  (2026-09-07)
--
-- Nine leads named "ZZ ..." were created by scripts/addon-e2e.mjs while proving that each
-- site-access answer creates the right Stripe session. They are mine, not prospects. None has
-- amount_paid set, and the guard below is what makes that a fact rather than a claim: if a real
-- payment ever landed on one of these rows it is left alone.
--
-- Archiving, not deleting: archived rows still count in the add-path dedupe, so archiving keeps
-- them from ever being messaged AND keeps them blocking a future duplicate. A delete would remove
-- both properties.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- 1. Look first. Expect 9 rows, every amount_paid null.
select id, created_at, business_name, amount_paid, is_archived, status
  from public.outreach_leads
 where business_name like 'ZZ %'
 order by created_at desc;

-- 2. Then archive them.
update public.outreach_leads
   set is_archived = true,
       notes = coalesce(notes || E'\n', '') || 'Archived 2026-09-07: payment-flow e2e test lead (addon-e2e.mjs).'
 where business_name like 'ZZ %'
   and amount_paid is null;

-- 3. Confirm. Expect 9 archived, 0 left unarchived.
select count(*) filter (where is_archived) as archived,
       count(*) filter (where not is_archived) as still_active
  from public.outreach_leads
 where business_name like 'ZZ %';
