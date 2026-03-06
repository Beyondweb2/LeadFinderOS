

## Problem

The affiliate dashboard's "Trialing" metric is always 0 because of a `plan_status` mismatch:

- **`complete-signup`** sets `plan_status = 'active'` for all new signups (lines 106, 117), even when the Stripe subscription is actually `trialing`
- **`admin-affiliates`** counts "Trialing" by filtering `plan_status === 'trial'` AND `trial_end_date > now()`
- These never match — the value is `'active'`, not `'trial'`

Additionally, the `handle_new_user_trial` DB trigger sets `plan_status = 'free'`, so there are three different values floating around (`'free'`, `'trial'`, `'active'`) with no consistency.

## Fix

**`supabase/functions/complete-signup/index.ts`** — Set `plan_status` based on the actual Stripe subscription status:
- If `subscription.status === 'trialing'` → set `plan_status = 'trial'` 
- If `subscription.status === 'active'` → set `plan_status = 'active'`

This is a 2-line change (lines 106 and 117): replace the hardcoded `'active'` with a conditional based on `subscription.status`.

**`supabase/functions/admin-affiliates/index.ts`** — No changes needed. The filter `plan_status === 'trial'` is correct; it just never had matching data.

## Technical Detail

```text
Current flow:
  Stripe status = "trialing"
  complete-signup → plan_status = "active"  ← WRONG
  admin-affiliates → WHERE plan_status = 'trial' → 0 results

Fixed flow:
  Stripe status = "trialing"  
  complete-signup → plan_status = "trial"   ← CORRECT
  admin-affiliates → WHERE plan_status = 'trial' → 1 result ✓
```

### Files to change
| File | Change |
|------|--------|
| `supabase/functions/complete-signup/index.ts` | Map Stripe `subscription.status` to `plan_status` instead of hardcoding `'active'` |

