-- ════════════════════════════════════════════════════════════════════════════════════════════
-- MCLOCKSMITHS — Performance seeding. RUN AFTER supabase/migrations/20260922000000_client_performance.sql
-- AND AFTER the service account has been added to the Search Console property.
--
-- ⛔ RUN THE MIGRATION FIRST. Every statement here writes to tables that migration creates.
-- ⛔ NOTHING HERE IS INVENTED. The 31 URLs are the live sitemap at https://mc-locksmiths.com/sitemap-0.xml
--    read on 2026-09-22, normalised by normaliseUrl() in src/lib/searchPerformance.ts — the SAME
--    function the sync applies to every Search Console row, which is what makes them join. Each
--    label is that page's own <title>, cut at its first separator, read off the live page.
--    /cookies, /privacy and /terms are deliberately NOT tracked: legal pages are not what the site
--    is for and their traffic says nothing about whether the work is landing.
--
-- ⚠️ built_or_rebuilt_on IS LEFT NULL AND existed_before_findable IS LEFT false ON EVERY ROW, AND
--    THAT IS NOT A STATEMENT THAT THE PAGES ARE NEW. The sitemap carries no lastmod, nothing in the
--    repo records per-page build dates, and the lead's `website` already held this domain before
--    payment — so neither fact can be established from evidence, and this feature does not infer
--    facts about the project from the shape of a URL. Until someone states them, the UI simply
--    compares periods normally and offers no before/after-rebuild framing. Fill them in when known:
--      update public.client_tracked_pages set built_or_rebuilt_on = '2026-09-__'
--       where lead_id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5' and canonical_url = '...';
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. The canonical domain ───────────────────────────────────────────────────────────────────
-- Bare host: no scheme, no www, no trailing slash. `website` is deliberately NOT touched — it is
-- read by serveGate, the baseline context and the client report.
update public.outreach_leads
   set canonical_domain = 'mc-locksmiths.com'
 where id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5';

-- ── 2. The Search Console connection ──────────────────────────────────────────────────────────
-- ⛔ THE PROPERTY STRING IS THE URL-PREFIX FORM, INCLUDING ITS TRAILING SLASH, because that is the
--    property that exists. Do not "tidy" it and do not swap it for sc-domain: — they are different
--    properties that return different URL strings, and a wrong one returns 403, not an empty set.
-- ⛔ status STARTS AS 'not_connected'. It flips to 'connected' only when a sync actually succeeds,
--    so the screen cannot claim a working link before one has been proved. If the service account
--    is not on the property, the first sync writes 'error' and the real message.
insert into public.client_search_connections (lead_id, user_id, gsc_property, status)
select l.id, l.user_id, 'https://mc-locksmiths.com/', 'not_connected'
  from public.outreach_leads l
 where l.id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5'
on conflict (lead_id) do update
   set gsc_property = excluded.gsc_property, updated_at = now();

-- ── 3. The tracked page inventory (31 pages) ──────────────────────────────────────────────────
-- user_id is resolved FROM THE LEAD, never hardcoded and never ADMIN_EMAIL: a row under the wrong
-- owner is invisible rather than wrong.
insert into public.client_tracked_pages (lead_id, user_id, canonical_url, label, page_type)
select l.id, l.user_id, v.canonical_url, v.label, v.page_type
  from public.outreach_leads l
  cross join (values
  ('https://mc-locksmiths.com/', 'Home', 'home'),
  ('https://mc-locksmiths.com/about', 'About MC Locksmiths', 'other'),
  ('https://mc-locksmiths.com/car-keys', 'Auto Locksmith Canterbury & Kent', 'service'),
  ('https://mc-locksmiths.com/commercial', 'Commercial Locksmith Canterbury & Kent', 'commercial'),
  ('https://mc-locksmiths.com/contact', 'Contact MC Locksmiths', 'other'),
  ('https://mc-locksmiths.com/faqs', 'Locksmith FAQs', 'other'),
  ('https://mc-locksmiths.com/gallery', 'Before & After Gallery', 'other'),
  ('https://mc-locksmiths.com/locations', 'Areas Covered', 'location'),
  ('https://mc-locksmiths.com/locations/canterbury', 'Locksmith in Canterbury', 'location'),
  ('https://mc-locksmiths.com/pricing', 'MC Locksmiths Pricing', 'other'),
  ('https://mc-locksmiths.com/services', 'Locksmith Services Canterbury & Kent', 'service'),
  ('https://mc-locksmiths.com/services/3-lever-mortice-lock-replacement', '3 Lever Mortice Lock Replacement', 'service'),
  ('https://mc-locksmiths.com/services/5-lever-mortice-lock-replacement', '5 Lever Mortice Lock Replacement', 'service'),
  ('https://mc-locksmiths.com/services/broken-glass-emergency', 'Broken Glass, Emergency Response', 'service'),
  ('https://mc-locksmiths.com/services/burglary-repair', 'Burglary Repair & Make Safe', 'service'),
  ('https://mc-locksmiths.com/services/digital-safe-opening', 'Digital Safe Opening', 'service'),
  ('https://mc-locksmiths.com/services/emergency-lockouts', 'Emergency Lockouts', 'service'),
  ('https://mc-locksmiths.com/services/evva-high-security-cylinders', 'EVVA & Premium Restricted Cylinders', 'service'),
  ('https://mc-locksmiths.com/services/faulty-handle-replacement', 'Faulty Door Handle Replacement', 'service'),
  ('https://mc-locksmiths.com/services/garage-door-locks', 'Garage Door Locks', 'service'),
  ('https://mc-locksmiths.com/services/high-security-upgrades', 'High-Security Lock Upgrades', 'service'),
  ('https://mc-locksmiths.com/services/key-cutting', 'Key Cutting Service', 'service'),
  ('https://mc-locksmiths.com/services/key-safe-installation', 'Key Safe Installation', 'service'),
  ('https://mc-locksmiths.com/services/keyed-alike-systems', 'Keyed-Alike Systems', 'service'),
  ('https://mc-locksmiths.com/services/lock-changes-upgrades', 'Lock Changes & Upgrades', 'service'),
  ('https://mc-locksmiths.com/services/misted-glass-replacement', 'Misted Glass Replacement', 'service'),
  ('https://mc-locksmiths.com/services/non-destructive-entry', 'Non Destructive Entry', 'service'),
  ('https://mc-locksmiths.com/services/security-survey', 'Free Security Survey', 'service'),
  ('https://mc-locksmiths.com/services/snapped-key-extraction', 'Snapped Key Extraction', 'service'),
  ('https://mc-locksmiths.com/services/upvc-door-mechanism', 'uPVC Door Mechanism Replacement', 'service'),
  ('https://mc-locksmiths.com/services/upvc-window-door-specialist', 'uPVC Window & Door Specialist', 'service')  ) as v(canonical_url, label, page_type)
 where l.id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5'
on conflict (lead_id, canonical_url) do update
   set label = excluded.label, page_type = excluded.page_type, updated_at = now();

-- ── 4. VERIFY (paste the results back) ────────────────────────────────────────────────────────
-- select canonical_domain from public.outreach_leads where id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5';
-- select gsc_property, status, last_synced_at, last_sync_error from public.client_search_connections
--  where lead_id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5';
-- select page_type, count(*) from public.client_tracked_pages
--  where lead_id = '6d0585ac-b4a3-463b-8150-c59c3dd0f0e5' group by page_type order by 1;
--   EXPECT: commercial 1 · home 1 · location 2 · other 5 · service 22   (31 total)
