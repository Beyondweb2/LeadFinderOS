

## Analysis

When users sign up from the landing page, the flow is:
**Landing → StartFreeTrial → Stripe Checkout → CompleteSetup → app**

In `CompleteSetup.tsx` (line 17), the default redirect is hardcoded to `/find-leads`:
```ts
const DEFAULT_IN_APP_ROUTE = '/find-leads';
```

This means new users from the landing page **never** hit the `FirstTimeRedirect` component (which lives on `/` and would send them to `/outreach`). They go straight to `/find-leads`.

## Plan

**File:** `src/pages/CompleteSetup.tsx`

Change `DEFAULT_IN_APP_ROUTE` from `'/find-leads'` to `'/outreach'` so that new users coming through the Stripe checkout flow land on the Outreach CRM page first — matching the intended first-time user experience.

This is a single-line change on line 17.

## Technical detail

- The `sanitizeReturnTo` function on line 19 will still respect any explicit `return_to` param if present, so existing deep-link flows are unaffected.
- The `FirstTimeRedirect` on `/` already sends first-timers to `/outreach`, so this makes both entry paths consistent.

