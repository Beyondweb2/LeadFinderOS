# The Coverage town is the question's town (2026-10-20, `fix/coverage-town-strict`)

## Why
Mway Driving School was added from a Find Leads search for **Cheshunt**. It is at Selby Rd, **London N17 8JL**
(Tottenham), ~11 km from Cheshunt's centre. Its audit (`fc6b3afa`, 2026-10-19) asked about **"London"** (Google's
post town), far too broad, and the rivals named came from Pimlico. Under these rules it would not have been added under
Cheshunt at all, and its own area is **Tottenham** (N17).

## The "in the town" rule — `src/lib/inTown.ts` `inTownVerdict` (one copy; search-leads runs it)
In order, the first that decides wins:
1. **A name match → IN**: the post town (`Cheshunt EN8`), the London postcode district's area or borough
   (`src/data/londonPostcodeAreas.ts`: N17 = Tottenham / Haringey), or a whole address part (`…, Bukit Bintang, 55100 Kuala Lumpur`).
2. **A different ordinary post town → OUT** (`Waltham Cross EN8` is not Cheshunt, even 1 km away).
3. **London address + a London area searched → the district decides** (Pimlico: SW1V in, SW1P out).
4. **Otherwise distance** from the searched town's geocoded centre, radius = √population ÷ 80 km, 2–15 km
   (3 km when the size is unknown). Population: `uk_towns` (UK), the bundled GeoNames list (Malaysia).
5. **Nothing to judge → null**: the page falls back to Google's town boundary (`outsideTown`, kept unchanged).

A city post town (London, Birmingham, Manchester, Kuala Lumpur, Johor Bahru, Petaling Jaya…) is never step 2.
UK reads `Town POSTCODE`; Malaysia reads `12345 Town` and the listed towns' other names (KL, PJ, Penang).

## Where it applies
- **search-leads**: every "This town only" answer (the default, and what Coverage sends), fresh or cached, gets
  `townCheck` on each result, recomputed each time. `places.location` added to the field mask (Essentials — free at
  the Enterprise tier already billed). Radius searches are unchanged.
- **Find Leads add**: `Index.tsx` `handleBulkAdd` is the one door — a result judged outside is never added (row, Add
  all, Add all with emails). A result judged IN sends `coverage_town` (`findLeadsBulkAdd.ts` `coverageTownFor`), saved
  by `coverage_add_leads` into `outreach_leads.coverage_town` (migration `20261111090000`). NULL = not verified.
- **The grey "N outside {town} hidden · Show" line** (LeadsTable) — preview branch, waits for Paul.

## The audit town — `create-ai-audit`
1. A human-confirmed town still wins.
2. `coverage_town` (not broad) → the question's town, **no distance cap** (`location_source 'search'`).
3. Otherwise the old rules, unchanged (Google's town; the 25 km found-under `search_location` rule for older leads).
4. Still broad ("London") → the postcode's area (`areaFromAddress`, `location_source 'derived'`); if none, kept and
   `location_note` carries `BROAD_TOWN_NOTE` ("Broad town: …").
Existing audits are never touched; a re-run repeats its stored town as before.

## The crawl's town — `_shared/question-town.ts`
crawl-check and crawl-job name the town the lead's newest audit ASKED (`ai_audits.location_text`), else the town an
audit would ask (`leadQuestionTown`). So "<town> is not mentioned on the site" checks the question's town.

## Measured 2026-10-20 (open leads, newest audit)
- Bare "London": **13** (all have a London postcode, so a new audit would get the area). No nation-level towns.
- A big city as the town (not flagged broad): 102 — Manchester 29, Newcastle upon Tyne 15, Liverpool 12, Birmingham 11,
  Bristol 11, Leeds 6, Nottingham 6, Sheffield 6, Leicester 5, Cardiff 1.
