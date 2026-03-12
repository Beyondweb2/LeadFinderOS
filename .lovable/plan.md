

## Plan: Meta Ads Tracking & Attribution System

### Current State

**What exists:**
- Meta Pixel is initialized in `index.html` (deferred loading, ID `1888907435320624`)
- `PageView` fires on every page load
- `CompleteRegistration` fires on signup in `Auth.tsx`
- `Lead` event exists but is only imported in `Landing.tsx` (not clearly fired on CTA clicks)
- `StartTrial` event exists in `fbPixel.ts` but is **never called** anywhere
- `InitiateCheckout` does **not exist** at all
- `RefSourceCapture` only captures `?ref=` param — **no UTM or fbclid tracking**
- `user_trials.ref_source` stores a single string — no structured UTM fields
- No `/ads` route exists

**Gaps to fix:**
1. No dedicated ads landing URL
2. UTM params (`utm_source`, `utm_campaign`, `utm_adset`, `utm_ad`) and `fbclid` are not captured or persisted
3. No `InitiateCheckout` pixel event
4. `StartTrial` never fires
5. `Lead` event not firing on CTA clicks
6. No database columns for UTM attribution data
7. UTM data not passed through signup → stored on user record

---

### Implementation Plan

#### 1. Database: Add UTM columns to `user_trials`

Add columns via migration:
- `utm_source text`
- `utm_campaign text`
- `utm_adset text`
- `utm_ad text`
- `fbclid text`
- `traffic_source text` (e.g. `"meta_ads"`, `"organic"`, `"affiliate"`)

All nullable, no schema-breaking changes.

#### 2. New component: `src/lib/utmCapture.ts`

A utility that:
- On any page load, reads `fbclid`, `utm_source`, `utm_campaign`, `utm_adset`, `utm_ad` from URL params
- Stores them in `localStorage` with a 30-day expiry (same pattern as affiliate tracking)
- Derives `traffic_source = "meta_ads"` if `fbclid` or `utm_source=meta` is present
- Cleans params from URL without reload
- Provides a `getStoredUtmData()` function for retrieval at signup/checkout time

#### 3. Update `RefSourceCapture.tsx`

Expand to also call the UTM capture utility on mount, so all params are captured regardless of landing page.

#### 4. New route: `/ads`

Add route in `App.tsx` pointing to `Landing` component (same page, same funnel). The `/ads` URL exists purely for Meta Ads Manager — the component is identical. Wrap with `PublicRoute` like `/landing`.

#### 5. Update `src/lib/fbPixel.ts`

Add:
- `trackInitiateCheckout()` — fires `InitiateCheckout` standard event
- Keep existing `trackLead`, `trackCompleteRegistration`, `trackStartTrial`

#### 6. Fire pixel events at correct points

| Event | Where | Guard |
|---|---|---|
| `PageView` | `index.html` (already done) | — |
| `Lead` | `Landing.tsx` `handleCTA` click | Already imported, just call it |
| `CompleteRegistration` | `Auth.tsx` on successful signup | Already done |
| `InitiateCheckout` | `StartFreeTrial.tsx` when checkout URL is opened, and `useSubscription.createCheckout` | Fire once via sessionStorage flag |
| `StartTrial` | `BillingSuccess.tsx` after successful trial/subscription confirmation | Fire once using sessionStorage dedup |

#### 7. Deduplication

Use `sessionStorage` flags like `fb_initiated_checkout_fired` to prevent duplicate events on page reload. Clear on new action.

#### 8. Persist UTM data on signup

Update `useAuth.tsx` `SIGNED_IN` handler to also read stored UTM data and write it to `user_trials` alongside the existing `ref_source` and `affiliate_code` logic.

#### 9. Pass UTM data to checkout

Update `StartFreeTrial.tsx` and `useSubscription.createCheckout` to include UTM params in the `create-checkout` body so they flow through to Stripe metadata (optional but useful for cross-referencing).

---

### Pixel Event Flow (After Implementation)

```text
/ads?utm_source=meta&utm_campaign=test
  → PageView (automatic)
  → UTM params stored in localStorage

User clicks "Try it free"
  → Lead event fires

User creates account (/auth)
  → CompleteRegistration fires
  → UTM data written to user_trials

User enters checkout (/start-free-trial)
  → InitiateCheckout fires (once)

User completes payment (/billing/success)
  → Purchase event fires (already exists per memory)
```

### How to view ad vs organic users

Query `user_trials` where `traffic_source = 'meta_ads'` or `utm_source IS NOT NULL` to see ad-attributed users. Users without these fields are organic.

### Files changed

| File | Change |
|---|---|
| `src/lib/utmCapture.ts` | New — UTM capture & storage utility |
| `src/lib/fbPixel.ts` | Add `trackInitiateCheckout` |
| `src/components/RefSourceCapture.tsx` | Call UTM capture on mount |
| `src/App.tsx` | Add `/ads` route |
| `src/pages/Landing.tsx` | Fire `trackLead` on CTA click |
| `src/pages/StartFreeTrial.tsx` | Fire `trackInitiateCheckout` on checkout |
| `src/hooks/useSubscription.tsx` | Fire `trackInitiateCheckout` in `createCheckout` |
| `src/hooks/useAuth.tsx` | Store UTM data on signup |
| `src/pages/BillingSuccess.tsx` | Fire `trackStartTrial` on success |
| DB migration | Add UTM columns to `user_trials` |

