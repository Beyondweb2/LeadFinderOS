# Business age — the Companies House check (built 2026-10-02, branch `feat/companies-house-age`, NOT merged)

Paul's brief: help salespeople spot very new businesses that have not built a website yet. Only Find Leads
results with NO website are checked. No AI, nothing paid. Do not invent certainty.

## 1. How it works

- **Who is checked:** `isCompaniesHouseTarget` — `websiteStatus` NO_WEBSITE (or legacy DIRECTORY_ONLY), a place
  id, and a UK address (a UK postcode, or ending UK / United Kingdom / a UK nation). UNCERTAIN and
  HAS_OWN_WEBSITE are never sent. The column reads "—" for them.
- **Where:** `useCompaniesHouseChecks` (mirrors `useAgencyChecks`): one read of `companies_house_checks` for the
  results' place ids; a fresh row for the same listing shows at once; the rest go to fn
  `companies-house-check`, **6 at a time** (`CH_CONCURRENCY`), each row filling in as it lands.
- **The lookup** (`supabase/functions/_shared/companies-house.ts`): official API
  `https://api.company-information.service.gov.uk`, HTTP Basic (key as username, blank password), 8 s per
  request. `GET /search/companies?q=<name>&items_per_page=20`; only if nothing usable, a second search with
  the town words removed; for a **strong** match only, `GET /company/{number}` to confirm date, status and
  registered office. **≤ 3 requests per business** (`CH_MAX_REQUESTS`).
- **Failures are answers, never throws:** no key → `not_configured` (zero requests); 401/403 →
  `not_configured`; 429 → `rate_limited` (stops at once); timeout / 5xx / network / unreadable body →
  `unavailable`. Nothing failed is stored. On `not_configured` or `rate_limited` the screen stops the run
  and the rest read "Not checked" with the reason on hover. Find Leads itself is never blocked.

## 2. The match (`src/lib/companiesHouse.ts`, pure, the ONE place)

- **Name tiers:** exact (normalised: case, `&`/and, apostrophes, Ltd/Limited/LLP… dropped; the listing's town
  words may be dropped) · exact_generic (exact, but every word is a trade word or the town — "Wisbech
  Plumbing") · close (every identifying word present and Dice ≥ 0.75) · partial (shares an identifying word,
  Dice ≥ 0.4).
- **Place tiers** against the registered office: same postcode · same postcode district · same town.
  A different place is not evidence against (registered offices are often accountants).
- **Strong:** exact + any place; close + postcode/district; exact_generic + postcode — AND the company is
  `active` AND no other company qualifies as strong (two → possible, "match equally well").
- **Possible:** exact with no place; close + town/none; exact_generic + district/town; partial + any place.
- ⛔ **A company not trading (dissolved, liquidation, administration…) is never a match.** It is named in the
  Not found evidence ("A company with this name exists but is no longer trading").
- ⛔ **"Not found", never "not registered"** — sole traders and companies under another name have no record.

## 3. On screen (Find Leads)

- **Business age** column (desktop) and a pill under the website status (phone): `NEW · 3 weeks` (under 2
  months shows weeks), `NEW · 2 months`, `8 months`, `2 years`, `Possible match`, `Not found`, `Checking…`,
  `Not checked`, `—`. NEW = under `CH_NEW_MONTHS` (3) whole months: a quiet green pill with a small spark.
  A click shows the company, incorporation date, status, number, registered office, the evidence and a
  link to the Companies House page. Possible matches never show an age as fact.
- **Filter** (in the Filter menu, "Business age (no website)"): Any age · New: under 3 months · 3–12 months ·
  1+ years · Possible match · Not found · Not checked / has website. Nothing is ever removed; Show all clears it.
- **Boost:** once BOTH the agency and the Companies House checks have finished, no-website + strong + NEW rows
  move to the top (agency sites still last). Rows never move while checks are running. Nothing is added or
  contacted automatically.

## 4. Cache (`companies_house_checks`, migration `20261004130000`, NOT applied)

One row per Google place id. Strong kept 90 days, possible 30, not found 14 (the newest businesses register
next week). A row is looked up again when `CH_CHECK_VERSION` changes or the listing's fingerprint (normalised
name + postcode) changes. Team members read (RLS `my_role() is not null`); only the function writes.
⛔ Machine match only — nothing writes `outreach_leads`. Each uncached lookup counts against the free
`site_scrape` guard (300 / hour / person) — a new guard action would have broken stored protection limits.

## 5. Measured (2026-10-02) — 60 random distinct no-website UK leads from the lead book

⚠️ **No API key exists on the project yet**, so the sample ran the real `lookUpCompany` and matcher with the
transport swapped to Companies House's public search website (same register, same fields; the profile call
was counted but answered from the search record). Timings are from this machine via the website, not the API.

| | first rules | final rules |
|---|---|---|
| strong | 9 (1 false: HARRY LOCKS SUPPLIERS → HARRY CONCRETE SUPPLIERS, same building) | **8, all correct on hand review** |
| possible | 21 (9 were dissolved companies; several wrong names) | **11** (~3 look wrong: CLK MEOPHAM RESTAURANT, HARRY CONCRETE, AMJ CONTRACTORS) |
| not found | 30 | **41** (7 of them name a dissolved namesake) |
| requests | | 74 total · **1.23 average** per business · max 3 |
| per business | | median 0.45 s · p90 1.3 s · max 1.4 s · 60 in 5.7 s at 6 at a time |

Of the 8 strong matches only 1 was under a year (9 months) and none under 3 months — the lead book is older
leads, so this sample says nothing about how often NEW appears in a fresh search.

Rate use: a 50-result search with ~25 no-website rows ≈ 31 requests = ~5% of the 600 / 5 minutes allowance
per key. The allowance is shared by every user on one key; several big searches at once can hit 429, which
stops that run safely.

Cost: no paid API (Companies House's API is free). One edge-function invocation per uncached business;
Supabase's published rate beyond the plan allowance is $2 per million invocations — ⚠️ not verified against
a bill.

## 6. Deploy order (when approved)

1. Paul registers a free key: developer.company-information.service.gov.uk → create an application → a
   **REST** API key (live).
2. Add the secret `COMPANIES_HOUSE_API_KEY` (Supabase dashboard → Project ruusxpkkmwtljxxulhbq → Edge
   Functions → Secrets).
3. SQL `20261004130000` (read back table, RLS, grants) → deploy fn `companies-house-check` (new; config.toml
   has it) → push main. Before the SQL or the function, every no-website cell reads "Not checked".
