

## Problem

The `/ads` route works correctly in code — it sets `sessionStorage.setItem('adEntryAccess', 'true')` then navigates to `/dashboard`. The `ProtectedRoute` checks for that flag and bypasses auth.

However, **you can test this right now in the preview without publishing**. The preview URL works the same way.

## How to test

Navigate to this URL in an **incognito/private browser window** (important — no existing session):

```
https://id-preview--da9919bb-3412-438c-91f0-7b1c8b8e5d96.lovable.app/ads
```

If that still redirects to `/landing`, it's likely a timing issue where React's `useEffect` in `AdEntryRedirect` hasn't fired before the navigation completes. The fix is simple:

## Fix: Set sessionStorage synchronously before navigate

Change `AdEntryRedirect.tsx` so the flag is set **outside** `useEffect` — directly during render — ensuring it's in sessionStorage before any route transition occurs:

**File: `src/components/AdEntryRedirect.tsx`**
- Move `sessionStorage.setItem('adEntryAccess', 'true')` out of `useEffect` and execute it at the module/render level (e.g., in the component body before the return, or use a `useMemo` with no deps)
- Keep the `navigate('/dashboard', { replace: true })` inside `useEffect` since navigation must happen after mount
- This guarantees the flag exists by the time `ProtectedRoute` reads it on the `/dashboard` render

This is a 1-file, ~3-line change. No other files affected.

