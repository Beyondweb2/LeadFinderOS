

## Plan: Final Meta Ads Prep — Lead Dedup + Confirmation

### 1. Domain for Ads

The `/ads` route already exists in `App.tsx` and renders the `Landing` component wrapped in `PublicRoute`. Your custom domain `lead-finder-app.com` is connected to this Lovable project, so `https://lead-finder-app.com/ads` already works. No code change needed — this is a DNS/domain configuration matter, not an app change. The pixel, UTMs, and funnel all work identically on any domain serving this app.

### 2. Add sessionStorage Guard to Lead Event

**File: `src/pages/Landing.tsx`** — Update `handleCTA` to check a `sessionStorage` flag before firing `trackLead()`. Only fire on the first click per session.

```typescript
const handleCTA = useCallback(() => {
  if (!sessionStorage.getItem('fb_lead_fired')) {
    trackLead();
    sessionStorage.setItem('fb_lead_fired', '1');
  }
  if (user) {
    navigate('/start-free-trial');
  } else {
    navigate('/auth?intent=signup');
  }
}, [navigate, user]);
```

This is the only code change required.

### 3–6. Confirmations (No Changes Needed)

All other items are already implemented:

- **Pixel event order**: PageView (index.html) → Lead (Landing CTA) → CompleteRegistration (Auth.tsx) → InitiateCheckout (StartFreeTrial/useSubscription) → StartTrial (BillingSuccess) — correct and in place.
- **Pixel on /ads**: The pixel is in `index.html` globally — it fires `PageView` on every route including `/ads`.
- **UTM/fbclid persistence**: `RefSourceCapture` calls `captureUtmParams()` on mount, stores in localStorage with 30-day expiry. `useAuth` writes to `user_trials` on `SIGNED_IN`.
- **Database attribution**: `utm_source`, `utm_campaign`, `utm_adset`, `utm_ad`, `fbclid`, `traffic_source` columns exist on `user_trials` and are written on signup.
- **InitiateCheckout/StartTrial dedup**: Already guarded with `sessionStorage` flags.

### Summary

Only one file changes: `src/pages/Landing.tsx` — add a 3-line sessionStorage guard around the `trackLead()` call.

### Manual Test Checklist (will be provided after implementation)

1. Open `https://lead-finder-app.com/ads?utm_source=meta&utm_campaign=test`
2. Open browser DevTools → Console, filter for `[Meta Pixel]`
3. Confirm `PageView` logged on load
4. Click "Try it free" → confirm `Lead` logged once
5. Go back, click CTA again → confirm Lead does NOT fire again
6. Complete signup → confirm `CompleteRegistration` logged
7. Enter checkout → confirm `InitiateCheckout` logged
8. Complete payment → confirm `StartTrial` logged
9. Check Meta Events Manager → verify all 5 events appear
10. Check `user_trials` table → verify `traffic_source = 'meta_ads'`, `utm_source = 'meta'`, `utm_campaign = 'test'`

