
# Plan: Fix Trial Banner Layout & Require Payment at Signup

## Issues Identified

### Issue 1: Trial Banner Cutoff with Expanded Sidebar
Looking at the screenshot, when the sidebar is expanded, the trial banner text is being cut off (showing "ys left" instead of "7 days left"). This is because:
- The `TrialBanner` is rendered **above** the sidebar in `AppLayout.tsx`
- When the sidebar expands, it overlaps the banner content
- The banner needs to account for sidebar width

### Issue 2: Payment Required at Signup
Currently users can:
1. Create account (free)
2. Use the app with trial limitations
3. Optionally upgrade later

**New flow requested:**
1. Create account → Immediately redirect to Stripe Checkout with 7-day free trial
2. Card details captured upfront (Stripe handles trial billing automatically)
3. User gets full access during trial (no daily search limits)

### Issue 3: Preventing Trial Abuse
**Question asked:** "What's stopping them from signing up with another account and doing another free trial?"

**Realistic mitigations:**
- Stripe automatically associates payment methods with cards - same card can be flagged
- Email verification adds friction to rapid account creation
- Phone number verification (requires additional setup)
- Most casual abusers won't bother creating new accounts with new cards

**What we can implement now:**
- The Stripe 7-day trial is tied to the payment method, so users need a unique card
- We can check if a Stripe customer with that email already exists and deny trial

---

## Solution

### Part 1: Fix Trial Banner Layout

**File: `src/components/AppLayout.tsx`**
- Move the `TrialBanner` inside the main content area, after the sidebar
- Add left margin/padding that respects sidebar width
- This ensures the banner content doesn't get hidden behind the sidebar

### Part 2: Require Payment at Signup

**File: `src/pages/Auth.tsx`**
- After successful signup, redirect to Stripe Checkout instead of the app
- The checkout already has `payment_method_collection: "always"` and `trial_period_days: 7`

**File: `src/hooks/useAuth.tsx`**
- Add a helper to trigger checkout flow immediately after signup

**File: `supabase/functions/create-checkout/index.ts`**
- Add check to prevent users who've already had a trial from getting another one
- Check if Stripe customer already exists with active/cancelled subscriptions

### Part 3: Update Trial Logic

Since payment is required upfront:
- The 7-day trial is now handled by **Stripe** (not local `user_trials` table)
- The `check-subscription` function will see `trialing` status from Stripe
- Simplify the trial system: remove daily search limits since they're paying customers

**File: `src/components/TrialBanner.tsx`**
- Update to show "7 days until first charge" instead of "free trial remaining"
- This is more accurate since they've already committed to paying

---

## Technical Changes

### Files to modify:

1. **`src/components/AppLayout.tsx`**
   - Restructure layout so trial banner respects sidebar width
   - Move banner inside the flex container after sidebar

2. **`src/pages/Auth.tsx`**
   - After successful signup, call `createCheckout()` to redirect to Stripe
   - Show loading state while redirecting to Stripe

3. **`src/hooks/useAuth.tsx`**
   - Add reference to checkout function or handle redirect in Auth page

4. **`supabase/functions/create-checkout/index.ts`**
   - Add logic to check if customer already had a subscription (trial abuse prevention)
   - Return error if user already used trial

5. **`src/components/TrialBanner.tsx`**
   - Update messaging to reflect that trial is Stripe-managed
   - Show "X days until first charge" for trialing users

---

## User Flow After Changes

```text
1. User signs up with email/password
2. Account created → Auto-redirect to Stripe Checkout
3. User enters card details → 7-day trial starts (no charge yet)
4. User gets full app access immediately
5. After 7 days: Card charged £19.99/month automatically
6. If they cancel during trial: No charge
```

## Trial Abuse Prevention

- Stripe ties trials to payment methods - reusing same card = detected
- Check if email already has a Stripe customer record with past subscriptions
- Consider adding email verification requirement (optional future enhancement)
