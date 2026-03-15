
Goal: fix the `/ads` bypass so ad entrants no longer fall through to `/landing`, without changing any non-ad auth/subscription behavior.

1) Root-cause focus
- Current code already sets `sessionStorage.adEntryAccess` in `AdEntryRedirect` and checks it in `ProtectedRoute`.
- Reproduction shows `/ads` still ends up on `/landing`, which strongly indicates the flag check can fail in some runtime contexts (timing/storage access edge cases), even though route wiring is correct.
- We will keep the existing sessionStorage architecture, but make it resilient so the flag is always available immediately after `/ads`.

2) Minimal corrective patch (frontend only)
- Add a tiny shared helper for ad-entry access state:
  - `markAdEntryAccess()`:
    - sets `sessionStorage.adEntryAccess = "true"` (existing architecture)
    - also sets an in-memory fallback flag for same-tab reliability
  - `hasAdEntryAccess()`:
    - returns true if sessionStorage flag exists
    - otherwise returns true if in-memory fallback is set
- This preserves sessionStorage as primary and only adds a fallback to avoid false negatives that currently send users to `/landing`.

3) Wire helper into existing ad-entry checks
- `src/components/AdEntryRedirect.tsx`
  - Replace direct `sessionStorage.setItem(...)` with `markAdEntryAccess()`
  - Keep redirect target as `/dashboard` (unchanged)
- `src/components/ProtectedRoute.tsx`
  - Replace inline sessionStorage check with `hasAdEntryAccess()`
- `src/components/SubscriptionGate.tsx`
  - Replace inline sessionStorage check with `hasAdEntryAccess()`
- `src/contexts/LeadSearchContext.tsx`
  - Replace ad guest detection checks with `hasAdEntryAccess()` so 3-search cap stays aligned with the same ad-entry state logic

4) Scope protection (what will NOT change)
- No changes to Stripe, billing, auth provider, onboarding, walkthrough, paywall UI/copy, or database/backend schema
- No changes to non-ad traffic flow (`/landing`, direct `/dashboard` access without `/ads`, normal signup path)
- No route redesign; `/ads` remains ad-entry only

5) Verification plan (exact)
- Should work:
  1. Open `/ads` in fresh incognito
  2. Confirm redirect to `/dashboard`
  3. Confirm app opens without signup
  4. Run searches 1, 2, 3
  5. Confirm search 4 triggers existing paywall/modal
- Should not work:
  1. Open `/landing` normally → existing signup flow remains
  2. Open `/dashboard` directly in fresh incognito (without `/ads`) → still redirected to `/landing`
- Must remain unchanged:
  - Normal signup walkthrough flow
  - Existing Add to CRM paywall behavior
  - Existing See more details paywall behavior
  - Unlimited searches for active trial and paid users

Technical details
- Files to change:
  - `src/lib/adEntryAccess.ts` (new, tiny helper)
  - `src/components/AdEntryRedirect.tsx`
  - `src/components/ProtectedRoute.tsx`
  - `src/components/SubscriptionGate.tsx`
  - `src/contexts/LeadSearchContext.tsx`
- No backend function edits required for this fix.
- This is intentionally a minimal reliability patch to the existing `/ads` session flag architecture.
