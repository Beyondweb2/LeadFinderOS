# India readiness pass (2026-09-28)

Goal: the existing multi-country LeadFinderOS working properly when a salesperson targets India —
not a separate "India" product. UK behaviour unchanged unless it was genuinely wrong.
Branch `feat/india-readiness`. Rules that came out of it are in CLAUDE.md; this is the record.

## 1. What was already international

- A `Country` enum of 20 countries incl. India (`src/types/lead.ts`, `src/types/outreach.ts`), a
  `country` column on `outreach_leads` (default `'UK'`), Quick Locations tabs per country.
- Line type (`src/lib/lineType.ts` + `_shared/line-type.ts`) maps India → IN (libphonenumber).
- The audit engine sends `countryCode` from `ai_audits.country` to the Apify actor
  (`_shared/enrichment/ai-search.ts` `toCountryCode`, India → `in`) — the engines ARE asked from India.
- Place Details stores `internationalPhoneNumber` ("+91 98765 43210"); the town is `locality`
  for India (no postal_town) — "Pune", "Bengaluru".
- The town-distance check does not block a town missing from `uk_towns` (`town_not_in_gazetteer`).
- The Sales Dashboard shows counts only (no £); there is no commission system in the app.

## 2. UK assumptions found (C = broke/degraded India; fixed unless marked)

| Where | What | Impact on India | Status |
|---|---|---|---|
| `_shared/geobias.ts` `normCountry` | only 6 countries mapped; "India" → null → **GB** bias | bare "Pune"/"Kochi" geocoded with region=gb (Kochi also exists in Japan) | fixed: every picker country + Indian states |
| Find Leads country | hidden persisted choice, changed only by a Quick Locations click | **349 UK leads stored as USA, 23 Florida + 2 Chiang Mai stored as UK** (measured live) | fixed: country from Google's address (`src/lib/leadCountry.ts`), resolvedCountry from search-leads, visible picker |
| `search_cache` key | keyword + location + radius, no country | a same-named place abroad could be served another country's pool | fixed: non-GB bias in the key (UK keys unchanged) |
| `qualifyPlace` default `'UK'` (create-ai-audit ×2) | every local question got " UK" | "chartered accountant in Pune **UK**" | fixed: `placeSuffixForCountry` → "Pune India" |
| create-ai-audit national fallback / prompt | "uk" default region | national Indian audits say "uk" | fixed (non-UK only) |
| `sales_queue_opener` | `country <> 'UK' or not ^7…` → `not_a_uk_mobile` | **Sales could not queue any Indian lead** | fixed (migration `20260929010000`): Indian mobile by number |
| Queue send window | one 07:00–21:30 London window for everyone | Indian prospects messaged 11:30–02:00 IST | fixed: per-destination window (`src/lib/sendWindow.ts`), India 10:00–19:00 IST |
| `toWhatsAppNumber` ×4 copies + `formatPhoneForWhatsApp` | leading 0 → 44 (UK) only | typed "98765 43210" → +98 (Iran); "098765…" refused; one helper made it a UK 44 number | fixed: one rule `src/lib/waNumber.ts` |
| AddLeadDialog `country: 'UK'` hard-coded | hand-added Indian lead stored UK | "Pune UK" questions, engines asked from GB, no country code | fixed: Country field, +91 stored |
| Admin add name dedupe | exact name across the whole book | a Pune "Smile Dental" refused because a Leeds one exists | fixed: name within the same country |
| `place-resolve.ts` regionCode | "India" sent verbatim (invalid) | free-check/backfill place search fails | fixed: normCountry |
| Report + offer | £99 / £99 a month, "refund your £99", `FINDABLE_OFFER_SUMMARY` on the no-website panel | **an Indian prospect's report quotes £** | NOT changed — Paul's decision (offer copy is byte-locked) |
| Stripe / checkout / webhook | `currency = "gbp"`, amounts as £ | an Indian client would be charged in GBP | NOT changed — closing, not prospecting |
| `knownEntities.ts` / `aggregators.ts` | UK directories only (Checkatrade, Yell…) | Justdial / Sulekha / Practo / IndiaMART not recognised as directories in rival lists | NOT changed (19–24 function redeploy) — follow-up |
| Coverage + Niche Check | `uk_towns` (750 ONS towns), `…, UK` text query, regionCode GB | India cannot appear as Coverage rows | NOT changed — needs a geography model (§7) |
| `phone_key` (SQL) | strips 44 only | a +91 and a national form of one number key differently | mitigated: every Indian number is now stored +91 at ingest |
| `sales_queue_opener` mobile test | prefix only | a Bengaluru/Ahmedabad landline (080/079…) passes; the queue's libphonenumber check refuses it at send (`non_mobile`) | accepted (same shape as the UK "starts with 7" rule) |
| Place Details town | one Pune place returned "पुणे" (Devanagari) | 1 of 390 | not changed; minor |
| Dates `en-GB`, `Europe/London` follow-up buckets, "7am UK" copy | display | cosmetic | India queued line now says IST |

## 3. Google Places — measured, India vs UK (live search-leads + google-place-details)

39 searches, town-only (the Find Leads default), 50 in-town results each (the curated cap);
Place Details on the first 10 in-town results per search (390 lookups). ⚠️ The search orders
no-website businesses FIRST, so the detail sample leans to them; website share below is from all 50.

| | India (25 searches: Bengaluru, Pune, Jaipur, Kochi, Mumbai × 5 niches) | UK (10: Manchester, Peterborough × 5) |
|---|---|---|
| Genuine independent local businesses | **84%** (42/50) | 82% |
| Chains / franchise branches | 10% (Sabka/Clove Dental, HomeLane/Livspace, Bosch/GoMechanic/Castrol/myTVS) | 4% |
| Directories / aggregators | 3% | 2% |
| Off-niche | 2% | 10% (interior designers: furniture shops) |
| Phone on Google | 90% | 96% |
| **Phone is a mobile (WhatsApp-able)** | **89%** | **20%** |
| Own website (all 50) | 53–73% by city | 80–82% |
| Full address, city, state, country | 100% / 84% town = the searched city (rest are suburbs: Pimpri-Chinchwad, Thane, Ernakulam) / 100% / 100% | 99% / 91% / — / 100% |
| Place id | 100% | 100% |
| Median rating / reviews | 5.0 / 145 | 5.0 / 67 |
| Already in the book | 0% | 3% (Peterborough accountants 15/50) |
| Duplicates | same place in two niche searches: 0% in every city; same NAME twice in one search: 1 of 50 (19 in Mumbai dentists = chain branches) | same |
| **Addable (phone, not agg/off-niche, not in book)** | **75%** | 83% |
| **Addable AND WhatsApp-able** | **74%** | **14%** |

Per niche (India, pooled): dentist — 76% local, 20% chains, 98% mobile, median 314 reviews;
chartered accountant — 90% local, 78% mobile, fewest websites; lawyer/advocate — 92% local, 90%
mobile, almost none have websites; interior designer — 86% local but 60% addable (chains + agencies);
car service — 76% local, 18% chains/franchises (Bosch, GoMechanic, Castrol, dealer service).
Terminology: "accountant" and "chartered accountant" return the same kind of firm (CA firms);
"advocate" ≈ "lawyer" (Google files both as `lawyer`); "car repair" ≈ "car service"; "dental clinic"
returned fewer chains than "dentist" in Pune (48 local / 0 chain vs 39 / 11). No synonym map was added — the canonical trade
already finds the right businesses; the salesperson can type the Indian term.

## 4. Live QA (2026-09-28, the Test salesperson + admin via one-time links, ended with logout?scope=local)

- search-leads (new code): bare "Pune"/"Kochi" with country India → "Pune, Maharashtra, India" /
  "Kochi, Keralam, India", resolvedCountry India, ONE geocode; "Wisbech" UK → "Wisbech, UK", UK.
- Sales add from Find Leads (real `salesAddPayload`, the form deliberately left on UK): stored
  country India, "+91 91195 09231", town Pune, full address with Maharashtra, rating 5 / 170 reviews,
  assigned. Same place again → `exists` ("yours"); the same phone typed "091195 09231" in Add a lead
  → stored as +91 → `exists`.
- Admin "Add a lead" with a TYPED "98601 06015" → stored "+91 98601 06015" (the old code would have
  sent to 9860106015 = +98).
- sales_queue_opener, structurally rolled back (DO block ending in RAISE): India mobile queued 1;
  fictional UK mobile queued 1; UK landline and a +1 number labelled UK refused `not_a_uk_mobile`.
  Afterwards the India row was untouched (not_contacted, 0 activity rows).
- send-whatsapp-message `dry_run`, both roles, all three phone forms → `to: 919119509231`,
  initial_contact eligible, `sent: false`, 0 whatsapp_messages rows. The queue was PAUSED by the admin.
- Hook Audit (propose → run), as Sales and as admin: see §5.
- Deploy: SQL applied and read back (India clause + unchanged UK clause, grants and search_path kept);
  15 functions deployed and each bundle carries a new-code marker.

## 5. Hook Audit and the engines (4 live hooks, 24 answers, 2026-09-28)

Audits: MISS DENTIST (Pune, as Sales), CA Sagar Parsewar (Pune, as admin), Floorplan Interior Design
Studio (Bengaluru), Advocate Umesh Sharma (Jaipur). Stored `ai_audits.country = India`; the actor ran
with `countryCode: in`. Questions (proposed by the app, unedited): "best dentist in Pune India",
"dentist for children in Pune India", "emergency dentist in Pune India who can see me today", "best
chartered accountant in Pune India", "who can help me with my tax returns if I'm self-employed in Pune
India", "financial statements preparation for startups in Pune India", "best lawyer in Jaipur India",
"family lawyer in Jaipur India", "who is a good lawyer for property disputes in Jaipur India", and three
Bengaluru interior-design questions. UK preview unchanged ("best locksmith in Wisbech UK …").

- **24/24 answered (6/6 per hook), 0 mention the UK, every answer is about the Indian city.**
- ChatGPT named ≥1 firm in 12/12 (mean 6.2); **Gemini in 8/12 (mean 3.0)** — Gemini answered 4 of the
  12 with generic advice and no firm (emergency dentist, self-employed tax, startup accounts, property
  disputes). The same shape as the UK: Gemini is the harder, more fragmented engine.
- Rivals named are real local firms — many are the same businesses Find Leads returned (MJS And Co,
  CA Dhiraj Ostwal, Smilekraft Dentistry, Go-Best Dentist, Advocate J P Rinwa, Sunil Sharma & Associates).
  Chains/nationals appear too: Clove Dental and Sabka Dentist (Gemini), Livspace / HomeLane / Design
  Cafe (interior design, both engines), Jehangir Hospital. Office interiors surfaced nationals/MNCs
  (Space Matrix, M Moser, Gensler).
- Citations: ChatGPT leaned on directories/portals — practo.com (2), lawrato.com (3), livspace.com (2),
  nobroker.in, icai.org / mca.gov.in / incometax.gov.in; **Gemini cited firms' OWN sites** where it cited
  at all (jprinwa.com, advocateshrutigoyal.com, panchaminteriors.com, interiordesk.in) plus justdial.com
  once. Consistent with the UK finding (ChatGPT reads directories, Gemini reads businesses' websites) —
  4 hooks, evidence not proof.
- The audited businesses were named 0/6 (dentist, CA), 2/6 (Floorplan — a dictionary-word name, see
  below) and 0/6 (Umesh Sharma, after the fix).
- 🔴 **Found and fixed: a title read as a name.** "Advocate Umesh Sharma" scored **6/6 named** (stored
  flag AND the app's ruler) although "Umesh" appears in no answer: the lone-token rule in
  `src/lib/nameMatch.ts` took "advocate" (8 letters, not the trade "lawyer") as the firm. Titles are now
  excluded (`PERSON_TITLE_TOKENS`); the ruler reads 0/6. Measured first: one audit in the book ever
  started with "Advocate" (this QA one) — zero UK results change. The stored flag on that QA audit
  stays as written; it was deleted with the QA records.
- ⚠️ Not fixed: "Floorplan Interior Design Studio" reads 2/6 because answers say "floor plan" and the
  joined-spelling rule makes that "floorplan". A dictionary-word business name — not India-specific.
- Report: questions and rivals read correctly for India; **the no-website panel shows "£99 to start,
  then £99 a month…" and the refund line "£99"** — do not send Indian prospects the report link until
  Paul decides the India offer copy (§6). No other UK wording on the page.
- Language: English only was tested. Hindi / Hinglish questions ("Pune mein accha dentist") are worth a
  later controlled test — Indian users often search that way; nothing here was built for it.

## 6. Pricing / INR — what closing needs (not built)

Prospecting can run today: the Sales Dashboard shows no money; templates in use carry no £. Before
an Indian client can CLOSE: an INR offer constant set (₹12,500 + ₹12,500/month) with its own
guarantee wording; the report's offer panel and "refund your £99" chosen by the lead's market;
`findable-checkout` / `_shared/offer-price.ts` / `delayed-subscription.ts` taking the currency and the
Stripe price ids per market; `stripe-webhook` reading `currency` instead of assuming £ (today it writes
`amount_total/100` as pounds into `amount_paid`); the welcome pack, remeasure results and payment
emails per currency; the dashboard's `PAYING_FLOOR_GBP` compared per currency; findable.live terms /
refunds for India (GST/tax is a separate question). That is a multi-currency change — stop-and-design.

## 7. Coverage for India — design (not built)

Coverage and the Niche Check are built on `uk_towns` (750 ONS built-up areas, 12k–1.1m); the key is
`trade|town`; bands and regions are UK; the Niche Check text query appends ", UK" and sends regionCode
GB. A small country flag is not enough. Proposed: a `towns` table (country, name, admin1 region,
population, lat/lng, aliases e.g. Bengaluru/Bangalore, Gurugram/Gurgaon) seeded from Census/GeoNames
(Indian cities ≥ 100k to start); `coverageKey` gains the country ONLY for non-UK (UK keys unchanged);
per-country band defaults; Niche Check parameterised (country, bands, suffix, regionCode). Find Leads
works for India now without it.
