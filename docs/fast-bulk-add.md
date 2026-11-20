# Find Leads add is fast again (2026-11-20, v1-fast-bulk-add)

**Problem (Paul):** after `v1-rep-limits-own-actions` (19 Nov) the Find Leads add paced Google lookups at 36 a minute, so
"Add 111" showed "Adding 36 of 111" and took about 3 minutes.

**Where the limit came from:** OUR guard, not Google. `protection_settings.limits.actions.place_details` was
`{per_min: 40, per_hour: 500}` (read live 20 Nov). Google's documented default for Place Details (New) is 600 requests a
minute per project; the project's own console figure was not readable from here.

**What changed**
- Guard `place_details` → `{per_min: 400, per_hour: 3000}` (migration `20261224090000`, same in `DEFAULT_PROTECTION_LIMITS`).
  Spend caps, suspension and pause modes are unchanged — they are the safety net.
- `findLeadsBulkAdd.ts`: pacer at 90 % of the guard (360 a minute), 10 lookups at once (Paul's 8–10 cap). Simulated with
  500 ms per lookup: 111 leads ≈ 6 s, 300 ≈ 15 s, no pause (old pacer: ≈ 3 min and ≈ 8 min).
- A pause (pacer or 429 retry) shows a countdown: "Adding 360 of 500 · next in 42s".
- **Search fills phone_cache** (`_shared/search-place-cache.ts`): every Find Leads text search already bills at Text Search
  Enterprise (websiteUri), so phone, rating, review count (Enterprise) and addressComponents (Pro) are free to add. search-leads
  writes them as v2 `phone_cache` rows; the add's `google-place-details` call is then a cache hit — no Google call, $0.
  ⛔ The phone is stripped (`_pd`) before the response and `search_cache`; a rep still gets a number only through
  google-place-details (ownership check + guard).

**Cost per add:** cache hit $0 (was $0.020 Place Details Enterprise per lead). Leads from searches run before this deploy (or
Apify discovery, or cached search blobs up to 72 h old) still pay one $0.020 lookup.

Tests: `scripts/find-leads-bulk-add.test.ts` sections 6–7.
