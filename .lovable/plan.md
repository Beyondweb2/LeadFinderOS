# Reduce Google Places API costs

## Where the money is going today

The `google-place-details` edge function runs on every "Add to CRM" click. Today it requests:

```
internationalPhoneNumber, nationalPhoneNumber, formattedAddress,
primaryTypeDisplayName, googleMapsUri
```

Phone numbers fall in Google's **Enterprise (Contact)** SKU — the most expensive tier (~$0.017/call). Address/category/uri are already returned by Text Search, so we are paying Enterprise prices for data we mostly already have.

There is also a `phone_cache` table keyed by `place_id` (30-day TTL), which is good — but the cache hit rate is ~3% because:

1. Each new search returns fresh `place_id`s the user hasn't added before.
2. When a Place Details lookup returns no phone, the lead is **auto-deleted**, so the same business gets re-enriched the next time it appears in a search.
3. Null-phone cache TTL is only 7 days vs 30 days for positive hits.
4. There's no client-side check before calling — the function is invoked even when the lead row already has a phone.

## Goals

- Drop per-call cost (smaller field mask, Contact SKU only when needed).
- Drop call volume (better dedup, no re-enrichment of known-null businesses, reuse search-result data).
- Keep UX identical.

---

## Changes

### 1. Slim the field mask in `google-place-details`

New mask: `internationalPhoneNumber,nationalPhoneNumber,websiteUri`

- Drop `formattedAddress`, `primaryTypeDisplayName`, `googleMapsUri` — Text Search already returns address, category, and the maps URI when the lead is created. We were paying Enterprise prices to re-fetch them.
- Add `websiteUri` so the cached row stays useful if a search-time website was missing.
- Update the `phone_cache` upsert and the response shape: keep the existing columns but stop overwriting `address`/`category` with new values (only fill if currently null).

This keeps us in the Enterprise SKU (phone fields) but stops requesting Pro fields we don't need.

### 2. Extend null-phone TTL to 30 days

In `google-place-details`, change `NULL_PHONE_TTL_MS` from 7 days to 30 days, matching positive cache. A business with no Google-listed phone today almost never gets one within a month, and re-checking is the single biggest source of repeat calls today.

### 3. Stop auto-deleting leads with no phone

In `useOutreach.ts` (`fetchOnePhone` and `retryPhoneFetch`):

- Remove the `removeLeadNoPhone` path. If enrichment returns no phone, leave the lead in the CRM with `phone = null` and set `phoneFetchStatus` to `no_phone`.
- The existing "Retry" UI stays — user can manually retry, which uses `forceRefresh`.
- Effect: the same `place_id` won't be re-added → re-enriched on every future search. The `outreach_history` dedupe (which already prevents re-adding the same business) now works as intended.

This single change should massively raise the cache hit rate, since today's null-phone leads silently disappear and get re-enriched.

### 4. Skip enrichment when we already have a phone

In `addLead` (useOutreach.ts):

- Search results already carry `lead.phone` for some sources. Currently we always call enrichment if `lead.id` (place_id) exists.
- New rule: only call `enqueuePhoneFetch` if `!lead.phone`.
- Persist the search-time phone into the `outreach_leads` insert (it is currently set to `null`).

Result: zero Place Details call when the search already gave us a phone.

### 5. Cross-user dedup via `phone_cache` (already global)

The `phone_cache` table is **already keyed by `place_id` only** (no `user_id`), so it is global across all users. Confirm RLS keeps it locked to service-role-only (already the case via "No public access"). No change needed beyond the TTL bump in step 2 — once user A enriches a place_id, user B reuses it for free.

### 6. Single-flight protection per place_id (server-side)

Today there's only an in-memory per-session dedup (`queuedPlaceIdsRef`). Two tabs / two users hitting Add at the same moment can each fire a real Google call before the cache row exists.

In `google-place-details`, after the cache check fails:

- Insert a placeholder row into `phone_cache` with `phone = null` and a special marker (e.g. a column `pending_until` or just check `created_at` very recent + null `address`).
- Simpler alternative: wrap the cache check + Google call in a tiny in-memory `Map<placeId, Promise>` inside the edge function module scope. Concurrent requests in the same isolate await the same promise. Cross-isolate races still hit Google twice but that's rare and bounded.

Go with the in-memory promise map — minimal change, no schema churn.

### 7. Client-side debounce on Add to CRM

In the search results component (the button that calls `addLead`):

- Track an in-flight `Set<string>` of place_ids being added.
- Disable the button (or no-op) while the same place_id is being added.
- The local `outreachHistory` check already prevents the second add succeeding, but the disabled state stops accidental double-clicks from even trying.

### 8. Logging is already wired up

`api_usage_log` table + `AdminApiUsage` page already track cache_hit / miss / cost. After the changes above, the same dashboard will show the improvement (hit rate climbing, daily cost dropping). No new tooling needed; just add `trigger_source: 'add_to_crm_skipped'` log lines (cost 0) for the cases where we skipped enrichment — useful for "enrichments prevented" visibility.

---

## Files touched

- `supabase/functions/google-place-details/index.ts` — slim field mask, 30-day null TTL, in-memory single-flight, only fill missing cache columns.
- `src/hooks/useOutreach.ts` — keep no-phone leads, skip enrichment when phone already present, log skipped enrichments.
- `src/components/OutreachTable.tsx` or wherever Add to CRM lives in search results — in-flight Set + disabled button. (Will confirm exact file during build.)

## Out of scope

- No UI redesign.
- No new tables (api_usage_log already exists).
- No changes to bulk phone recovery — already routes through the same function and benefits automatically.
- No rate limiter changes — existing 30/min per user is fine; the real fix is volume reduction, not throttling.

## Expected impact

- **Field mask**: ~20% cheaper per call (drop 3 Pro fields, keep Contact SKU).
- **30-day null TTL + no auto-delete**: the dominant win — repeat enrichments of phoneless businesses go to ~zero, hit rate should climb from 3% to 40%+ within a week as the global cache fills.
- **Skip-when-phone-present**: eliminates calls entirely for search results that already carry a phone.
- **Single-flight**: caps concurrent duplicate calls.

Combined: realistic 60–80% cost reduction, no UX change.
