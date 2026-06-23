-- ============================================================================
-- TEST BARBER SEED  —  run ONCE in the Supabase SQL editor
-- ============================================================================
-- Creates a single, clearly-fake permanent test barber:
--   * one outreach lead (status "New"/not_contacted)
--   * one generated_sites row (barber template) with a STABLE share_token so
--     /s/test-barber-fixture works forever and survives every reset.
--
-- IDs/token are HARDCODED and must match:
--   src/config/testBarber.ts  AND  supabase/functions/reset-test-barber/index.ts
-- Idempotent: ON CONFLICT DO NOTHING, so re-running won't duplicate.
-- The reset-test-barber edge function is the source of truth for content — it
-- re-applies the canonical content on every reset (so this seed only needs to run
-- once to create the rows).
-- ============================================================================

-- 1) The lead (owned by the first admin so it shows on your Outreach page).
--    If you have multiple admins / want a specific account, replace the `owner`
--    subquery with: select '<your-auth-user-id>'::uuid as id
with owner as (
  select user_id as id
  from public.user_roles
  where role = 'admin'
  order by user_id
  limit 1
)
insert into public.outreach_leads
  (id, user_id, business_name, phone, address, category, country, list_type,
   status, is_archived, is_potential_work, outreach_attempts)
select
  '7e57ba12-0000-4000-8000-000000000001',
  owner.id,
  'TEST – Sharp & Co Barbers (DEMO · DO NOT CONTACT)',
  '+44 7700 900123',                       -- Ofcom fictional-use UK mobile range
  '12 Test Street, Manchester, M1 1AA',
  'Barber shop',
  'UK',
  'no_website',
  'not_contacted',                          -- "New"
  false,
  false,
  0
from owner
on conflict (id) do nothing;

-- 2) The generated site (stable share_token = test-barber-fixture).
insert into public.generated_sites
  (id, lead_id, site_name, template, status, share_token, content)
values (
  '7e57ba12-0000-4000-8000-000000000002',
  '7e57ba12-0000-4000-8000-000000000001',
  'test-sharp-co-barbers',
  'barber',
  'draft',
  'test-barber-fixture',
  '{
    "businessName": "TEST – Sharp & Co Barbers (DEMO · DO NOT CONTACT)",
    "category": "Barber shop",
    "tagline": "The safe-testing barbershop — not a real business.",
    "heroHeadline": "Look sharp, feel sharp",
    "about": "TEST FIXTURE. A fake barbershop used only to safely test the claim and editing flow. Not a real business — please do not contact this number or address.",
    "phone": "+44 7700 900123",
    "address": "12 Test Street, Manchester, M1 1AA",
    "googleRating": 4.8,
    "reviewCount": 57,
    "showExamplePrices": false,
    "accentColor": "#E6A24B",
    "services": [
      { "name": "Skin Fade", "price": "£22", "durationMins": 40 },
      { "name": "Beard Trim", "price": "£12", "durationMins": 20 },
      { "name": "Cut & Beard", "price": "£30", "durationMins": 50 },
      { "name": "Kids Cut", "price": "£14", "durationMins": 30 },
      { "name": "Hot Towel Shave", "price": "£20", "durationMins": 30 }
    ],
    "hours": [
      { "day": "Monday", "open": "9:00 – 18:00" },
      { "day": "Tuesday", "open": "9:00 – 18:00" },
      { "day": "Wednesday", "open": "9:00 – 18:00" },
      { "day": "Thursday", "open": "9:00 – 19:00" },
      { "day": "Friday", "open": "9:00 – 19:00" },
      { "day": "Saturday", "open": "8:30 – 16:00" },
      { "day": "Sunday", "open": "Closed" }
    ],
    "stats": [
      { "value": "2015", "label": "Trading since" },
      { "value": "4.8★", "label": "57 reviews" }
    ],
    "heroImageUrl": "https://picsum.photos/seed/testbarber-hero/1280/853",
    "aboutImageUrl": "https://picsum.photos/seed/testbarber-about/1000/1250",
    "galleryImageUrls": [
      "https://picsum.photos/seed/testbarber-g1/800/800",
      "https://picsum.photos/seed/testbarber-g2/800/800",
      "https://picsum.photos/seed/testbarber-g3/800/800",
      "https://picsum.photos/seed/testbarber-g4/800/800"
    ]
  }'::jsonb
)
on conflict (id) do nothing;

-- 3) Verify
select l.business_name, l.status, s.site_name, s.share_token, s.claimed_at
from public.generated_sites s
join public.outreach_leads l on l.id = s.lead_id
where s.id = '7e57ba12-0000-4000-8000-000000000002';
