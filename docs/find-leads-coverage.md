# Find Leads finds most of a town (2026-10-23, feat/find-leads-coverage)

Paul's brief: Find Leads finds most of the businesses in a town, in every country. Diagnosis: the
"Find Leads Australia/UK discrepancy analysis" session (2026-10-23). The search is a Google Places text search, up to
3 pages of 20, inside Google's own town box, plus one nearby page.

## Part 1 — free fixes

- **Australian in-town radius** `√population ÷ 50` (`AU_TOWN_RADIUS_DIVISOR`, `src/lib/inTown.ts`); UK / Malaysia stay
  `÷ 80`. **New Australian step 3**: a suburb that is itself a different ABS urban centre in the same state (Wodonga,
  Bargara, Bendigo) is OUT (`other_town`) before distance. The wrong-state guard still runs first.
  - Measured on Paul's 18 cached Australian pools (5 days, locksmiths + driving instructors, no provider calls):
    shown **65 → 88** of 215 pooled results. Every newly-shown result is a suburb of the town (Lavington ×3 under Albury,
    Bundaberg Central / West, Wandal / Park Avenue / Rockhampton City, Frenchville / Berserker, Mount Austin,
    North Boambee Valley, Beaconsfield / Andergrove, Melton South / West / Harkness / Strathtulloh / Weir Views,
    Wonthella). None was another urban centre; the 6 Wodonga results under Albury stay out (`other_state`).
- **The town box** (`src/lib/townSearchArea.ts` rule 1): an Australian Google box under `AU_SMALL_BOX_KM2` (25 km²) is
  joined with a square of the in-town radius round the centre. Other countries' boxes are unchanged. Australian
  town-only answers cache under `##aubox2`, so centre-only pools are not replayed.
- **Found = shown** (`LeadSearchContext.tsx`): a run's `found_keys`, `results_count` and the many-towns line count the
  in-town rows only (`!outsideSearchedTown`). "Bundaberg: 14 found / 6 shown" was the out-of-town rows.
- **Singapore** had fallen into the UK branch (UK postcode parser, `uk_towns` population, a 3 km circle round the city
  centre — a search for "Singapore" hid everything 3 km+ out). Now: outside Singapore → OUT; "Singapore" itself → the
  whole city; an area → named by an address part, else 3 km. `search-leads` takes no `uk_towns` figure for any
  non-UK country.
- **Found while testing:** the Find Leads country Select fires `onValueChange("")` when the URL seeds a country; it
  was normalised to UK, so a Coverage arrival with Australia flipped to the UK. An empty value is now ignored.

## Part 2 — coverage lists

- **UK**: migration `20261023120000_uk_towns_scotland_ni_london.sql` adds 109 rows to `uk_towns` (insert … on conflict
  (ons_code) do nothing). Scotland 55 (NRS settlements, mid-2020 estimates), Northern Ireland 22 (NISRA Settlement
  2015, Census 2021), London 32 boroughs (ONS Census 2021; City of London 8,583 left out). Sources, attribution,
  renames and joined names are in the migration header. Renamed to the searchable name: Greater Glasgow → Glasgow,
  Belfast City → Belfast, Derry City → Londonderry, Lisburn City → Lisburn, Omagh Town → Omagh, Craigavon Urban Area
  including Aghacommon → Craigavon, Metropolitan Newtownabbey / Castlereagh → Newtownabbey / Castlereagh,
  Bangor (NI) → "Bangor, County Down" (Bangor, Wales already a row). 11 joined Scottish names kept as given.
  Build inputs (CSV + notes) were assembled from the official files; the Coverage footer carries the attributions.
- **Malaysia**: `scripts/build-malaysia-coverage-towns.mjs` → `src/data/malaysiaCoverageTowns.ts`, **66 towns**. Of
  GeoNames' 148 places of 50,000+: 28 already listed, 3 PPLX (suburbs), 19 kampung / taman / mukim names, 32 inside a
  metro's in-town radius (KL, JB, Ipoh, Malacca, Kota Bharu, Kuantan, Kota Kinabalu), 66 added. ⛔ Added on the
  Coverage screen only (`useCoverage.ts`), never to `ABROAD_TOWNS`: `cleanBusinessName.ts` reads that list on every
  sending path. Some added places are townships rather than towns (Bukit Rahman Putra, Val Dor, Bandar Tasik Puteri,
  Putra Heights, Seremban 2) — GeoNames calls them populated places.

## Part 3 — Standard / Thorough

- `depth` on `search-leads` (default `standard`; Thorough only with `townOnly`). Thorough tiles the (widened) town box
  into ≤ `THOROUGH_MAX_TILES` (9) ~3.5 km rectangles, page 1 of each, page 2 only of a full tile, **≤
  `THOROUGH_MAX_CALLS_PER_TOWN` (16) calls, reserved before each call**; merged by place id, no-website first, up to
  120. No nearby pass. Own cache key `##thorough`. Answer carries `townArea { depth, widened, tiles, calls }`.
- Per press: Thorough presses ≤ `THOROUGH_MAX_TOWNS_PER_PRESS` (6) towns (`THOROUGH_MAX_CALLS_PER_PRESS` 100).
- Screens: one `SearchDepthToggle` on Coverage and Find Leads; Thorough pre-selected for Australia; never persisted.
  The button shows the ceiling ("up to 45p", derived from `THOROUGH_MAX_USD_PER_TOWN`) to admins, "Thorough" to sales.
- Tests: `scripts/find-leads-coverage.test.ts`.

## Deployed 2026-10-23

- Migration applied by the Management API, one statement, read back: `uk_towns` 750 → 859 (Scotland 55, Northern
  Ireland 22, London 32; none suppressed; every row has a point).
- Full gate: 449/450. The one failure, `warm-lead-research.test.ts` "a fresh crawl-check row is reused", fails the same
  way on unchanged `main` (39aa06c0) — not this change; left for its owner.
- Merged `25aae411`. Edge deployed: search-leads, create-ai-audit, crawl-check, crawl-worker (the whole closure of
  `inTown.ts`); each live body carries `AU_TOWN_RADIUS_DIVISOR` and `SG_TAIL`, search-leads also `##aubox2`.
- Live SPA: `Coverage-*.js` carries `coverage-search-depth`; the What's New chunk carries the entry.
- NOT done (Paul, 2026-10-23: no provider calls): the live before/after on Albury, Bundaberg and Rockhampton
  (Standard with the Part 1 fixes, then Thorough). Only the cached-pool measurement above exists.
