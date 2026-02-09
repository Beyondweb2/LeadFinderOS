
# Fix: Restrict ALL Trial Users to 2 Searches/Day

## Problem Summary

All users (including those who entered card details for the 3-day Stripe trial) are getting full access with unlimited searches. The crown icon is also showing for trial users, suggesting they're paid subscribers.

**Your requirement:** Everyone on trial (whether app trial or Stripe trial) should be limited to 2 searches/day for 3 days. Only after their first payment should they get unlimited access.

## Root Cause Analysis

The system currently treats Stripe `trialing` status as equivalent to `active` (paid):

1. **Backend (`search-leads`)**: Checks `subscriptions` table; if status is `trialing`, grants unlimited searches
2. **Frontend (`useSubscription`)**: Sets `subscribed: true` for `trialing` status
3. **Frontend (`useTrial`)**: When `subscribed: true`, overrides to `searchesRemaining: Infinity`
4. **UI (`UserMenu`)**: Shows crown for `subscribed: true`
5. **Dashboard**: Hides trial progress card when `subscribed` or `isStripeTrialing`

## Solution Overview

Change the logic so that `trialing` status ONLY grants feature access (CRM, outreach) but does NOT grant unlimited searches. Unlimited searches only come with `active` or `past_due` status.

## Technical Changes

### 1. Backend: `supabase/functions/search-leads/index.ts`

**Current logic (lines 697-703):**
```text
const validStatuses = ['active', 'trialing', 'past_due'];
hasActiveSubscription = subscription && validStatuses.includes(subscription.status);

if (hasActiveSubscription) {
  // Unlimited searches
}
```

**New logic:**
- Remove `trialing` from the list of statuses that grant unlimited searches
- Users with `trialing` status will fall through to the app trial check and be limited to 2/day
- Only `active` and `past_due` (grace period) get unlimited searches

### 2. Frontend: `src/hooks/useSubscription.ts`

Add new flags to differentiate between:
- `subscribed`: true for any valid status (`active`, `trialing`, `past_due`) - grants feature access
- `isPaidSubscriber`: true ONLY for `active` or `past_due` - used for crown icon
- `isStripeTrialing`: true when status is `trialing` - used for messaging

**Changes:**
```text
Line 80: Keep validStatuses including 'trialing' for feature access
Add new returned values:
- isPaidSubscriber: status === 'active' || status === 'past_due'
- isStripeTrialing: status === 'trialing'
```

### 3. Frontend: `src/hooks/useTrial.ts`

**Current logic (lines 208-222):**
```text
if (hasPaidAccess) {
  return {
    searchesRemaining: Infinity,
    dailyLimit: Infinity,
    ...
  };
}
```

**New logic:**
- Only grant unlimited searches if user has `active` or `past_due` status
- Stripe `trialing` users should still be subject to 2/day limit
- Change condition to check for `isPaidSubscriber` instead of `subscribed`

### 4. Frontend: `src/components/UserMenu.tsx`

**Current (line 118):**
```text
{subscribed && (
  <Crown className="h-3 w-3 text-primary absolute -top-1 -right-1" />
)}
```

**New logic:**
- Only show crown for `isPaidSubscriber` (not admins, not trialing)
- For `isStripeTrialing` users, show "Trial • X days left" instead of "Pro • Renews..."

### 5. Frontend: `src/pages/Dashboard.tsx`

**Current logic (line 30):**
```text
const showTrialProgress = !isSubscriptionLoading && !isTrialLoading && isOnTrial && !subscribed && !isStripeTrialing;
```

**New logic:**
- Show trial progress card for ALL trial users (including Stripe trialing)
- Only hide it for truly paid subscribers (`isPaidSubscriber`)
- For Stripe trialing users, show a modified message like "Pro trial - 3 days left (2 searches/day)"

### 6. Frontend: `src/components/SubscriptionGate.tsx`

**Current (line 50):**
```text
if (subscribed || isOnTrial) {
  return <>{children}</>;
}
```

This is correct - Stripe trial users should have feature access. No change needed here.

## Data Implications

Currently there are 6 users with `trialing` status in the database. After this fix:
- They will keep CRM/outreach access (no disruption)
- Their searches will be limited to 2/day until their trial converts to `active`
- The crown icon will disappear
- They'll see the trial progress card on the dashboard

This is the correct behavior per your requirements.

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/search-leads/index.ts` | Remove `trialing` from unlimited search statuses |
| `src/hooks/useSubscription.ts` | Add `isPaidSubscriber` and `isStripeTrialing` flags |
| `src/hooks/useTrial.ts` | Only grant unlimited to `isPaidSubscriber` |
| `src/components/UserMenu.tsx` | Crown only for `isPaidSubscriber`; show "Trial" for trialing |
| `src/pages/Dashboard.tsx` | Show trial progress for all trial users |

## Testing Plan

1. Create a new account (should see trial progress, 2/day limit)
2. Complete Stripe checkout for trial (should still see trial progress, 2/day limit, no crown)
3. Simulate `active` status (should see crown, unlimited searches, no trial card)
4. Verify existing users with `trialing` status now see trial card and 2/day limit

## Summary

This fix ensures:
- No one gets unlimited searches until their first payment
- Crown icon only appears for paying customers
- Trial progress is visible to all trial users (app trial and Stripe trial)
- Stripe trial users can still use CRM/outreach features (just with 2 searches/day)
- Smooth transition when trial converts to active subscription
