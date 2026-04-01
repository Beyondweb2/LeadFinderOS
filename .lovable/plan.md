

# Google Maps API Optimisation — Implementation Plan

## Overview
Consolidate all phone enrichment to `google-place-details`, eliminate `lookup-phones`, cap search expansion, extend null-phone cache to 7 days, and add usage analytics. All changes preserve existing single-lead enrichment behaviour.

---

## Step 1: Migration — Create `api_usage_log` table
New migration with the exact schema specified. RLS denies all public access (service-role insert only from edge functions).

## Step 2: `supabase/functions/google-place-details/index.ts`
- Change `NULL_PHONE_TTL_MS` from `60 * 60 * 1000` to `7 * 24 * 60 * 60 * 1000` (7 days)
- After cache check and after API call, best-effort insert into `api_usage_log` (cache_hit true/false, cost 0.017 for misses). Wrapped in try/catch — never blocks the response.

## Step 3: `supabase/functions/search-leads/index.ts`
- `MAX_EXPANSION_ATTEMPTS`: 16 → 6
- Expansion paging: `ePage < 2` → `ePage < 1` (1 page per centre)
- Best-effort logging for geocode ($0.005), text_search ($0.032), expansion triggers. All wrapped in try/catch.

## Step 4: `src/hooks/useOutreach.ts` — Rewrite `bulkLookupPhones`

New signature and return shape:
```typescript
bulkLookupPhones(
  leadIds?: string[],
  onProgress?: (current: number, total: number) => void
): Promise<{ updated: number; skipped: number; failed: number; total: number }>
```

Logic:
1. Collect target leads from `leadIds` param or all leads+archivedLeads
2. Filter into two groups:
   - **eligible**: `!lead.phone && lead.place_id` → will be enriched
   - **skipped (no place_id)**: `!lead.phone && !lead.place_id` → counted as skipped, logged to console: `Skipped lead ${id} (${businessName}): no place_id`
   - **skipped (already has phone)**: `lead.phone` → counted as skipped
3. Process eligible leads with concurrency-3 pool (reuse `CONCURRENCY` constant)
4. For each eligible lead, call `google-place-details` directly (NOT `fetchOnePhone`, which auto-removes leads). This is a new internal helper `enrichPhoneBulk`:
   - Calls `supabase.functions.invoke('google-place-details', { body: { placeId } })`
   - If phone found → update DB (`outreach_leads.phone`, `.address`, `.category`) → count as **updated**
   - If no phone found → do nothing to DB → count as **skipped** (not a failure)
   - If actual error (network, 500, etc.) → count as **failed**, log error, continue
5. Call `onProgress(current, total)` after each lead completes (regardless of outcome)
6. After all done, call `fetchLeads()` once to refresh state
7. Return `{ updated, skipped, failed, total }`

Count definitions:
- **updated** = phone was newly written to the lead
- **skipped** = already had phone, had no place_id, or enrichment returned no phone (not an error)
- **failed** = enrichment threw an actual error
- **total** = all leads considered (updated + skipped + failed)

Key: `fetchOnePhone` is NOT touched — single-lead add-to-CRM auto-removal behaviour stays exactly as-is.

## Step 5: `src/components/OutreachTable.tsx`

- Add new prop: `onBulkLookupPhones?: (leadIds: string[], onProgress: (current: number, total: number) => void) => Promise<{ updated: number; skipped: number; failed: number; total: number }>`
- Replace `handleRecoverPhones` (lines 408-470): call `onBulkLookupPhones` with the missing-phone lead IDs and a progress callback that updates `recoveryProgress` state. Remove the old batch-of-50 loop and `lookup-phones` invocation. Show toast summary with updated/skipped/failed counts.

## Step 6: `src/pages/Outreach.tsx`

- Pass new prop: `onBulkLookupPhones={(ids, onProgress) => bulkLookupPhones(ids, onProgress)}`

## Step 7: `src/pages/Archive.tsx`

- Replace `handleBulkLookup` to call `bulkLookupPhones(missingIds, onProgress)` with progress callback
- Add `lookupProgress` state: `{ current: number; total: number } | null`
- Show `<Progress />` bar when active
- Show toast summary when complete

## Step 8: Cleanup

- Delete `supabase/functions/lookup-phones/index.ts`
- Remove `[functions.lookup-phones]` from `supabase/config.toml`
- Remove import/reference to `lookup-phones` in `useOutreach.ts` and `OutreachTable.tsx` (already replaced in steps 4-5)

---

## Answers to specific questions

**Return shape of `bulkLookupPhones`:**
```typescript
{ updated: number; skipped: number; failed: number; total: number }
```
Where `total = updated + skipped + failed`.

**How counts are calculated:**
- `updated`: phone found and written to DB
- `skipped`: lead already had phone OR had no `place_id` OR enrichment returned no phone
- `failed`: actual error during enrichment call
- Leads with no `place_id` are logged: `console.log('Skipped lead ${id}: no place_id')`

**DB schema assumptions:** None. The `outreach_leads` table already has `place_id` (text, nullable). The new `api_usage_log` table is additive.

**Old leads without `place_id`:** These will be skipped by bulk enrichment and counted in `skipped`. They can still be manually enriched via the existing "Retry" button if a `place_id` is added later. A future backfill could query leads where `place_id IS NULL AND phone IS NULL` and attempt a name-based lookup — but that's out of scope for this change.

## Implementation order
1. Migration (zero risk)
2. `google-place-details` cache + logging changes
3. `search-leads` expansion cap + logging
4. `useOutreach.ts` — new `bulkLookupPhones`
5. `OutreachTable.tsx` — new prop + updated handler
6. `Outreach.tsx` — pass prop
7. `Archive.tsx` — updated handler + progress UI
8. Delete `lookup-phones` + config cleanup

