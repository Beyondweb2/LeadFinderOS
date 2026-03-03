

## Admin Dashboard Data Collection Audit

### Current State

| Data Point | Being Collected? | How |
|---|---|---|
| Auth users (signups) | Yes | `auth.users` — 130 users |
| Stripe subscriptions | Yes | `subscriptions` table — 44 records |
| Checkout started | Partially | `checkout_started_at` in `user_trials` — only 11 of 60 checkout-starters have it |
| Funnel: demo_started | **No — 0 events** | Never logged anywhere |
| Funnel: trial_started | Yes | 85 events |
| Funnel: subscription_active | Yes | 4 events (only fires on `active`, not `trialing`) |
| Funnel: signup_with_trial | Yes | 2 events (new email-first flow) |

### Issues Found

**1. `demo_started` funnel event is never logged — 0 records**

The admin funnel page shows "Demo Started" as the top of the funnel, but no code ever inserts a `demo_started` event into `funnel_events`. This means your funnel conversion rates (Demo → Trial, Demo → Paid) always show "–" or 0%.

**Fix:** Log a `demo_started` funnel event when a user first uses the app (e.g. on first search, or on signup). Need to decide what "demo started" means in the current 5-day trial model — it may no longer be relevant since users now go straight to Stripe checkout.

**2. Email-first anonymous users are NOT tracked until they complete signup**

In your current flow:
- User enters email on landing → goes to Stripe checkout (anonymous, no auth user yet)
- If they complete checkout → `complete-signup` creates the user + logs `signup_with_trial`
- If they abandon checkout → **nothing is recorded** because no auth user exists yet

There's no way to track anonymous email submissions that never complete checkout. The `checkout_started_at` field only works for already-authenticated users.

**3. `checkout_started_at` was only recently added**

Only 11 users have `checkout_started_at` set (all with `checkout_abandoned=true`). The 49 users with `checkout_abandoned=true` but no `checkout_started_at` are from before the fix was deployed.

**4. Admin dashboard `billing_status` logic has a gap**

The admin-users function sets `billing_status = 'checkout_started'` only when `trial.checkout_abandoned === true`. But `checkout_abandoned` is a separate flag that may not always be set correctly — it's not updated by the `create-checkout` function, only `checkout_started_at` is.

**5. `subscription_active` funnel event only fires for `active` status, not `trialing`**

In `stripe-webhook`, the funnel event `subscription_active` only fires when `status === 'active'` (line 393). Since most users start with `trialing`, this event only fires after trial converts to paid. You have 24 trialing + 5 active subscriptions but only 4 `subscription_active` events.

### Recommendations

1. **Track anonymous email submissions** — Store email + timestamp in a lightweight table (e.g. `checkout_attempts`) when someone hits the `create-checkout` function with a `bodyEmail`. This captures the full top-of-funnel.

2. **Log `trial_started` funnel event from `complete-signup`** — Currently `complete-signup` logs `signup_with_trial` but the funnel page looks for `trial_started`. Either rename or add both.

3. **Retire or redefine `demo_started`** — It's meaningless in the current flow. Either remove it from the funnel page or redefine it as "user entered email on pricing card" (tracked via the new `checkout_attempts` table).

4. **Fix `billing_status` detection** — Use `checkout_started_at IS NOT NULL` instead of `checkout_abandoned` flag for detecting checkout-started users.

5. **Consider logging a funnel event for `trialing` status** — So the funnel accurately shows who started a trial via Stripe, not just who converted to paid.

### Plan

1. **Create `checkout_attempts` table** — columns: `id`, `email`, `created_at`, `converted` (boolean). Insert from `create-checkout` for both anonymous and authenticated flows. This captures everyone who clicks "Start Free Trial".

2. **Update `admin-funnel`** — Replace `demo_started` with `checkout_attempt` count from the new table. Keep `trial_started` (rename `signup_with_trial` to also log as `trial_started`). Keep `subscription_active`.

3. **Update `complete-signup`** — Also log `trial_started` funnel event (in addition to existing `signup_with_trial`). Mark the `checkout_attempts` row as `converted = true`.

4. **Update `stripe-webhook`** — Also log a funnel event for `trialing` status (e.g. `trial_started`) so existing authenticated users who subscribe also get tracked.

5. **Fix `admin-users` billing_status** — Use `checkout_started_at IS NOT NULL AND no subscription` as the `checkout_started` condition instead of relying on `checkout_abandoned` flag.

6. **Update AdminFunnel page** — Rename "Demo Started" to "Checkout Attempts" to reflect actual data.

