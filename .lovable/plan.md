
# Testing Results and Fixes Needed

## What's Working Correctly

- **Subscribe page UI**: Properly hides trial badge when `trialUsed = true`, shows skeleton while loading, redirects unauthenticated users.
- **create-checkout edge function**: Correctly checks `trial_used` flag and branches between trial/no-trial checkout sessions.
- **search-leads edge function**: Correctly treats `trialing` status as Pro access (unlimited searches).
- **Webhook code**: Has the right logic to set `trial_used = true` on lines 326-330.
- **useTrial hook**: Correctly returns `Infinity` for search limits when user has Pro access.
- **useSubscription hook**: Properly distinguishes `isPaidSubscriber` vs `isStripeTrialing`.

## Issues Found

### 1. Backfill Missing: `trial_used` is `false` for ALL existing users

Every user in the database currently has `trial_used = false`, including users with `active` and `trialing` subscriptions. This means if any of them cancel and come back, they'll incorrectly be offered a free trial again.

**Fix**: Run a one-time SQL migration to backfill `trial_used = true` for any user who has ever had an `active` or `trialing` subscription.

```text
UPDATE user_trials
SET trial_used = true
WHERE user_id IN (
  SELECT DISTINCT user_id
  FROM subscriptions
  WHERE status IN ('active', 'trialing', 'canceled', 'past_due')
);
```

### 2. Deploy webhook with trial_used logic

The webhook logs show no evidence of the `trial_used` update running. The `stripe-webhook` edge function needs to be redeployed to ensure the latest code (which sets `trial_used = true`) is live.

### 3. SearchForm "Free trial" text shows for Stripe trialing users (minor, already fixed)

The `Index.tsx` passes `isPaidSubscriber={hasProAccess}` which includes `trialing`, so the "Free trial: X/Y searches left today" indicator should already be hidden for Stripe trialing users. This appears correct in the current code.

## Implementation Steps

1. **Create a database migration** to backfill `trial_used = true` for all users who have ever had a subscription record (regardless of current status).
2. **Redeploy the `stripe-webhook` edge function** to ensure future webhook events correctly set `trial_used = true`.
3. **Verify end-to-end** by checking that:
   - A trialing user sees no search limits and no "2 free searches" text
   - The Subscribe page shows "Subscribe Now" (not "Start Free Trial") for users with `trial_used = true`
   - The create-checkout function skips trial for users with `trial_used = true`

## Technical Details

| Scenario | Expected Behavior |
|---|---|
| New user, never subscribed | Subscribe page shows "1-Day Free Trial" badge, "Start Free Trial" button |
| User with active/trialing sub | Redirected away from /subscribe to / |
| User who canceled, `trial_used = true` | Subscribe page shows "Subscribe Now", no trial badge, checkout has no trial period |
| Stripe trialing user on search page | No "Free trial: X/Y searches" indicator, unlimited searches |
| Free app trial user (no Stripe sub) | Shows "Free trial: 2/2 searches left today", 2/day limit enforced |
