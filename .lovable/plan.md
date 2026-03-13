

## Plan: Fix Ad Attribution Tracking + Add Visibility to Admin Dashboard

### Issues Found

**Critical: UTM data is never saved to the database.**
The `useAuth.tsx` tries to write UTM data to `user_trials` via the client SDK, but `user_trials` has RLS that **denies all client-side updates** (`UPDATE: false`). This means `traffic_source`, `utm_source`, `utm_campaign`, `utm_adset`, `utm_ad`, and `fbclid` are never persisted. The update call silently fails.

**Admin dashboard does not show traffic source data.**
Even if UTM data were saved, the `admin-users` edge function doesn't fetch those columns, and the admin dashboard UI doesn't display them.

**Affiliate tracking works correctly.** The `complete-signup` edge function (which uses the service role key, bypassing RLS) writes `affiliate_code` and `ref_source`. The affiliate dashboard correctly queries this data and displays clicks, trials, conversions, and commissions.

---

### Fix Plan

#### 1. Pass UTM data through `complete-signup` (bypass RLS)

Since `user_trials` blocks client updates, UTM data must be passed through the `complete-signup` edge function (which uses the service role).

**Files changed:**
- `src/pages/CompleteSetup.tsx` — read stored UTM data from localStorage and include it in the `complete-signup` request body alongside `affiliate_code` and `ref_source`
- `supabase/functions/complete-signup/index.ts` — accept and persist `utm_source`, `utm_campaign`, `utm_adset`, `utm_ad`, `fbclid`, `traffic_source` to the `user_trials` insert/update

Remove the UTM write attempt from `useAuth.tsx` since it can never work with current RLS.

#### 2. Fetch UTM data in `admin-users` edge function

Update the `user_trials` select query (line ~151) to also fetch: `utm_source, utm_campaign, utm_adset, utm_ad, fbclid, traffic_source, ref_source, affiliate_code`.

Pass these fields through to the user response object.

#### 3. Show traffic source in admin dashboard

- Add `traffic_source`, `ref_source`, and `affiliate_code` to the `AdminUser` interface
- Add a "Source" column to the users table showing a badge: `Meta Ads`, `Affiliate`, `Organic`, etc.
- Show UTM details in the user detail drawer (utm_source, utm_campaign, etc.)
- Add a source filter dropdown: All / Meta Ads / Affiliate / Organic
- Add summary cards: "From Ads" count and "From Affiliates" count

#### 4. Files changed summary

| File | Change |
|---|---|
| `supabase/functions/complete-signup/index.ts` | Accept + persist UTM fields |
| `src/pages/CompleteSetup.tsx` | Pass UTM data in request body |
| `src/hooks/useAuth.tsx` | Remove broken UTM write attempt |
| `supabase/functions/admin-users/index.ts` | Fetch UTM columns from user_trials |
| `src/pages/AdminDashboard.tsx` | Show source column, filter, detail view |

