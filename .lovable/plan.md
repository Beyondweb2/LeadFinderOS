
# Fix "Invalid time value" crash in Stripe webhook

## Problem
When processing `customer.subscription.created` (and `invoice.payment_succeeded`), the webhook crashes with `"Invalid time value"` on line 248:

```typescript
current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
```

For trialing subscriptions, `current_period_end` can be `null` or `0`, causing `new Date()` to produce an invalid date. The sync-subscription logs confirm this: `currentPeriodEnd: null` for this exact subscription.

## Fix
Add a null-safe check when converting `current_period_end` to an ISO string. If the value is null/falsy, fall back to `trial_end` or just store `null`.

### File: `supabase/functions/stripe-webhook/index.ts` (line 248)

**Before:**
```typescript
current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
```

**After:**
```typescript
current_period_end: subscription.current_period_end
  ? new Date(subscription.current_period_end * 1000).toISOString()
  : (subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null),
```

This matches the same logic already used in `sync-subscription/index.ts` which safely handles these nullable timestamps.

## Steps
1. Update line 248 in `stripe-webhook/index.ts` with the null-safe date conversion
2. Redeploy the `stripe-webhook` edge function
3. Resend the failed `customer.subscription.created` event from Stripe to confirm 200
