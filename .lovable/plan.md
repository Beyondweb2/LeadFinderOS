

## Plan: Make Preview Mode Use the Full App Layout

**What changes:** Replace the stripped-down `PreviewLayout` with the real `AppLayout` for the `/preview` route, so guest users see the exact same UI as authenticated users (sidebar, navigation, all pages).

**How:**

### 1. Update `/preview` route in `src/App.tsx`
- Wrap the `/preview` route with `AppLayout` instead of `PreviewLayout`
- Add additional preview routes for other pages (`/preview/outreach`, `/preview/dashboard`, `/preview/templates`, etc.) so guests can navigate the full app

### 2. Make `AppLayout` guest-safe
- Guard all auth-dependent hooks/features with `user` null-checks:
  - `usePersistLastRoute` — already has `enabled: !!user`
  - `usePersistedScroll` — already has `enabled: !!user`
  - `useTrial`, `useSubscription`, `useChallenge10`, `useWalkthroughStatus` — wrap calls or default gracefully when `user` is null
  - `PaymentWarningBanner`, `PaymentFailureDialog`, `CheckoutActivationOverlay`, `WalkthroughOverlay`, `WelcomeWalkthroughModal`, `Challenge10Modal`, `DemoChecklistPanel`, `SkipWalkthroughButton` — conditionally render only when `user` exists

### 3. Make `AppSidebar` guest-safe
- Guard `useSubscription`, `useAuth`, `useAvatar`, `useDemoChecklist` calls
- When `user` is null: hide `UserMenu`, admin items, notepad; nav links point to `/preview/...` paths instead of `/...`
- Show a "Start Free Trial" CTA in the sidebar footer instead of the user menu

### 4. Add `PreviewBanner` inside `AppLayout` when `!user`
- Show the existing `PreviewBanner` component at the top of the main content area when there's no authenticated user

### 5. Keep existing behavior intact
- `ProtectedRoute` and `SubscriptionGate` are **not touched** — authenticated routes remain guarded
- All hooks continue working for logged-in users exactly as before
- The preview banner + search limit + locked CTA buttons continue functioning as already implemented

### Technical details

The key pattern for making components guest-safe:

```text
// In AppLayout
const { user } = useAuth();          // returns null for guests
const isGuest = !user;

// Skip auth-dependent features for guests
{!isGuest && <PaymentWarningBanner />}
{!isGuest && <SkipWalkthroughButton />}
{!isGuest && <WalkthroughOverlay />}
// etc.

// Show preview banner for guests
{isGuest && <PreviewBanner />}
```

For sidebar navigation in preview mode, links will use `/preview/outreach` etc., and corresponding routes will be added in `App.tsx` without `ProtectedRoute`/`SubscriptionGate` wrappers.

