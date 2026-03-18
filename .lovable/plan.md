

# Get More Search Results Without Increasing Costs

After reviewing the search engine (`supabase/functions/search-leads/index.ts`), here are practical improvements that increase results **without adding API calls** (or even reducing them via better caching):

## 1. Smarter Cache Key Normalization (saves API calls)
Currently `"plumber"` and `"plumbers"` produce different cache keys, triggering separate Google API calls for the same results. Normalizing common keyword variations (trimming, lowercasing, stripping trailing "s"/"es"/"ing") would dramatically increase cache hit rates.

**File:** `supabase/functions/search-leads/index.ts` — update `generateCacheKey` to normalize keywords (strip trailing plurals/suffixes before hashing).

## 2. Extend Cache TTL from 24h to 72h (saves API calls)
Business websites rarely change day-to-day. Tripling the cache window means 3x more cache hits across all users — fewer Google API calls overall.

**File:** `supabase/functions/search-leads/index.ts` — change `CACHE_TTL_MS` from `24 * 60 * 60 * 1000` to `72 * 60 * 60 * 1000`.

## 3. Fetch 2 Pages During Expansion (more results, same cost budget)
Expansion attempts currently fetch only 1 page (20 results) per shifted centre. Fetching a second page (if `nextPageToken` exists) doubles the candidate pool per attempt, finding the 5 NO_WEBSITE target faster with **fewer total expansion attempts** — often net-neutral or cheaper.

**File:** `supabase/functions/search-leads/index.ts` — in `expandSearch`, add a second page fetch when `nextPageToken` is returned.

## 4. Expand Directory Blacklist (more NO_WEBSITE classifications, zero cost)
Add commonly seen directory/listing sites that aren't real business websites. This reclassifies more results as NO_WEBSITE, reducing the need for expansion.

New entries: `trustpilot.com`, `nextdoor.com`, `cylex.co.uk`, `192.com`, `brownbook.net`, `hotfrog.com`, `bizify.co.uk`, `misterwhat.co.uk`, `lacartes.com`, `findopen.co.uk`, `panpages.com`, `indiamart.com`, `justdial.com`, `sulekha.com`, `tradeindia.com`.

**File:** `supabase/functions/search-leads/index.ts` — add to `DIRECTORY_BLACKLIST` set.

---

**Expected impact:** More NO_WEBSITE leads per search, fewer Google API calls due to better caching, no changes to frontend code needed.

