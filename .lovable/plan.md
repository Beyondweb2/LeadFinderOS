

## Investigation Report: Attribution Still Showing "Organic"

### Latest Test User

- **User ID**: `d661146b-dd1a-49fe-92fe-b3249c3aef9e`
- **Email**: `paulkkkjsales455@outlook.com`

---

### Step-by-step trace

**1. What was captured on landing**

The test URL `?utm_source=meta&utm_campaign=test_ads` (or `debug_test` in the latest run) should have stored `traffic_attribution` in localStorage with `utm_source: meta`, `utm_campaign: debug_test`, `traffic_source: meta_ads`.

**2. What was written to `checkout_attempts`**

| Field | Value |
|-------|-------|
| `utm_source` | **meta** |
| `utm_campaign` | **debug_test** |
| `traffic_source` | **meta_ads** |
| `created_at` | 10:10:27 UTC |

Attribution correctly stored in `checkout_attempts`. No issue here.

**3. What was written to `user_trials`**

| Field | Value |
|-------|-------|
| `utm_source` | **null** |
| `utm_campaign` | **null** |
| `traffic_source` | **null** |
| All other UTM fields | **null** |
| `created_at` | 10:09:26 UTC |

All attribution fields are null.

**4. What the Admin Dashboard reads**

The `admin-users` edge function reads `trial?.traffic_source` (line 256) from `user_trials`. Since it's null, the dashboard maps it to "Organic".

---

### Root Cause: `sync-subscription` has ZERO attribution logic

The test user was **already authenticated** when they went to Stripe checkout. This means on return from Stripe:

1. `BillingSuccess.tsx` detects the user IS authenticated (line 44-47)
2. For authenticated users, it calls **`sync-subscription`** (line 63), NOT `complete-signup`
3. `sync-subscription` updates `user_trials` with `plan_status`, `paid_at`, `setup_completed` — but **does not write any attribution fields at all** (lines 124-133)

The `complete-signup` function (which was fixed to include attribution) is only called for **anonymous** users who need to create an account after checkout. This user already had an account, so `complete-signup` was never invoked. The edge function logs confirm: **zero** `complete-signup` calls for this test, only `sync-subscription` and `ensure-trial` (for non-attribution actions like `set_language`).

The `user_trials` row was created at 10:09:26 by the `handle_new_user_trial` database trigger when the auth user was first created. This trigger inserts all attribution fields as null. No subsequent function ever populated them.

---

### Answer to your questions

| Question | Answer |
|----------|--------|
| Is attribution reaching `checkout_attempts`? | **Yes** — correctly |
| Is attribution reaching `user_trials`? | **No** — all null |
| Why not? | `sync-subscription` (the function used for authenticated users) has no attribution logic |
| Why does Admin show "Organic"? | It reads `traffic_source` from `user_trials`, which is null |
| Was `complete-signup` even called? | **No** — it's only for anonymous users creating accounts |

### Category of issue

This is a **persistence problem** — specifically, a **missing code path**. The fix applied to `complete-signup` is correct but only covers anonymous-checkout users. The authenticated-checkout path (`sync-subscription`) was never patched to write attribution.

### What needs fixing

`sync-subscription` (or `BillingSuccess.tsx` calling it) must forward stored attribution from `localStorage` and/or recover it from `checkout_attempts`, then write it to `user_trials`. This is the same pattern already implemented in `complete-signup`.

