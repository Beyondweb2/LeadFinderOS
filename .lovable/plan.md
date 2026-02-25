

## Diagnosis: Why Affiliate Tracking is Broken

### Root Cause: Race Condition Between Two Competing Components

There are **two components** that both read the `?ref=` URL parameter:

1. **`RefSourceCapture`** — mounted globally in `App.tsx` (runs on every page)
2. **`AffiliateCapture`** — mounted on Landing, Auth, and AffiliateProgram pages

Both read `?ref=` and then **delete it from the URL**. Since `RefSourceCapture` is global and renders first, it captures the value as `leadfinder_ref_source` and strips `?ref=` from the URL. By the time `AffiliateCapture` runs on the same page, the parameter is already gone. The affiliate code is **never stored** under `leadfinder_affiliate_code`.

**Result**: `user_trials.affiliate_code` is always `null`. The admin dashboard counts signups by matching `affiliate_code` — so it always shows 0.

### Secondary Issues

- The `useAuth` SIGNED_IN handler tries to write `affiliate_code` to `user_trials` but only if the existing value `IS NULL` — this logic is correct but never fires because the localStorage key is never populated.
- The `ensure-trial` edge function also accepts `affiliate_code` from the body but `useTrial.ts` reads from `leadfinder_affiliate_code` in localStorage — same empty key.
- The admin dashboard has no click tracking, no signup-to-paid conversion rates, and no revenue per affiliate beyond commission amounts.

---

## Plan

### 1. Merge Capture Logic Into a Single Component

**File**: `src/components/RefSourceCapture.tsx`

- When `?ref=` is detected, store the value in **both** localStorage keys:
  - `leadfinder_ref_source` (for acquisition tracking)
  - `leadfinder_affiliate_code` + `leadfinder_affiliate_expiry` (for affiliate attribution)
- Then strip `?ref=` from URL once.
- This ensures the affiliate code persists regardless of which page the user lands on.

**File**: `src/components/AffiliateCapture.tsx`

- Remove the duplicate URL-stripping logic. Make it a no-op or delete the component entirely, replacing imports with `RefSourceCapture`.

### 2. Fix the Auth SIGNED_IN Handler

**File**: `src/hooks/useAuth.tsx`

- The existing logic is correct but depends on `leadfinder_affiliate_code` being populated — which it now will be after fix #1.
- No changes needed here beyond verifying it works.

### 3. Add Affiliate Click Tracking

**Database**: Add a new `affiliate_clicks` table or add a `click_count` column to the `affiliates` table.

Simpler approach: add an `affiliate_clicks` table with columns:
- `id` (uuid)
- `affiliate_code` (text)
- `clicked_at` (timestamptz)
- `page_url` (text, nullable)

When `RefSourceCapture` detects a `?ref=` param, fire a backend call (or use `log_usage_event`) to record the click. This enables "Total Clicks" in the admin dashboard.

Alternatively, to avoid complexity, add a counter column `click_count` to the `affiliates` table and increment it via an edge function or RPC call.

### 4. Enhance Admin Dashboard Stats

**File**: `src/pages/AdminAffiliates.tsx`  
**File**: `supabase/functions/admin-affiliates/index.ts`

Update the `list` action to return richer stats per affiliate:
- **Total clicks** (from new tracking)
- **Total signups** (already tracked via `user_trials.affiliate_code` — will work after fix #1)
- **Trial activations** (count `user_trials` where `plan_status` was ever trialing)
- **Paid subscriptions** (count `affiliate_conversions`)
- **Total revenue** (sum of `first_payment_amount` from conversions)
- **Click → Signup rate** (signups / clicks)
- **Signup → Paid rate** (conversions / signups)

Update the frontend to display these new columns.

### 5. Database Schema Updates

New columns/tables needed:

**Option A (minimal)**: Add `click_count` integer column to `affiliates` table.

**Option B (detailed tracking)**: Create `affiliate_clicks` table for per-click logging.

I recommend **Option A** for simplicity — increment the counter when `?ref=` is captured via a lightweight edge function or RPC.

---

## Implementation Order

1. Merge `RefSourceCapture` + `AffiliateCapture` into one unified component (fixes the core bug)
2. Add click tracking (database migration + capture logic)
3. Update `admin-affiliates` edge function to return enhanced stats
4. Update `AdminAffiliates.tsx` to display new metrics (clicks, conversion rates, revenue)

### Technical Detail: How Attribution Will Work After Fix

```text
User visits: myapp.com/?ref=PARTNER123
        │
        ▼
RefSourceCapture (global, App.tsx)
  ├─ localStorage: leadfinder_affiliate_code = "PARTNER123"
  ├─ localStorage: leadfinder_affiliate_expiry = <30 days>
  ├─ localStorage: leadfinder_ref_source = "PARTNER123"
  ├─ Record click (increment affiliates.click_count)
  └─ Strip ?ref= from URL
        │
        ▼
User signs up (minutes, hours, or days later)
        │
        ▼
useAuth SIGNED_IN handler
  ├─ Reads leadfinder_affiliate_code from localStorage
  ├─ Reads leadfinder_ref_source from localStorage
  └─ Updates user_trials SET affiliate_code, ref_source
        │
        ▼
useTrial.ensureTrialRecord()
  ├─ Reads same localStorage keys
  └─ Passes to ensure-trial edge function (backup path)
        │
        ▼
User pays (after 3-day trial)
        │
        ▼
stripe-webhook: invoice.paid
  ├─ Reads user_trials.affiliate_code
  ├─ Finds matching affiliate
  └─ Creates affiliate_conversion record
```

