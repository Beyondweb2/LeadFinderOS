

## Root Cause Analysis

I traced the exact code paths that block when `user` is `null` (ad-entry guest):

### Blocker 1: `useDashboardMetrics` — dashboard spinner never resolves

**File:** `src/hooks/useDashboardMetrics.ts`, lines 106, 167-174

`isLoading` initializes as `true` (line 106). The effect on line 167 compares `user?.id` (null) to `userIdRef.current` (null) — they match, so it returns early. `fetchAllData` is never called. `isLoading` is **never set to false**.

Dashboard.tsx line 66 checks `if (isLoading || isSubscriptionLoading)` — `isLoading` is permanently `true` → infinite spinner.

### Blocker 2: `useTrial` — AppLayout walkthrough logic never initializes

**File:** `src/hooks/useTrial.ts`, lines 211-225

Same pattern. `isLoading` starts `true` (line 46). Effect compares null to null → returns early. `isLoading` stays `true`.

In `AppLayout.tsx`, `isTrialLoading` stays true → `isLoaded` stays false → `isDemoUser` / `showWalkthrough` stays false → walkthrough never starts.

### Blocker 3: `useChallenge10` — competing effects

**File:** `src/hooks/useChallenge10.ts`, lines 57-69

Effect 1 (line 57): calls `fetchState()` which sets `isLoading = false` for null user.
Effect 2 (line 64): when user is null, sets `isLoading = true` — overriding effect 1.

Not a direct cause of the spinner but keeps challenge state stuck.

---

## Fix (3 files, minimal changes)

### 1. `src/hooks/useDashboardMetrics.ts`

Add an effect (after the existing user-change effect) that resolves `isLoading` when user is null:

```typescript
// After line 174, add:
useEffect(() => {
  if (!user) {
    setIsLoading(false);
  }
}, [user]);
```

This mirrors the existing pattern in `useSubscription` (lines 258-261).

### 2. `src/hooks/useTrial.ts`

Add the same null-user guard after the existing effect (after line 225):

```typescript
useEffect(() => {
  if (!user) {
    setState(prev => prev.isLoading ? { ...prev, isLoading: false } : prev);
  }
}, [user]);
```

### 3. `src/hooks/useChallenge10.ts`

Fix the competing effect at line 64-69 — don't set `isLoading = true` when user is null (it was already resolved to false by fetchState):

```typescript
useEffect(() => {
  if (!user?.id) {
    setState(DEFAULT_STATE);
    fetchedRef.current = false;
    setIsLoading(false);  // was: setIsLoading(true)
  }
}, [user?.id]);
```

---

## What this fixes

- Dashboard renders fully for ad-entry users (empty data, no spinner)
- `isLoaded` resolves in AppLayout → `isDemoUser` computes correctly → walkthrough can start
- Challenge10 doesn't get stuck in loading

## What is NOT changed

- No changes to ProtectedRoute, SubscriptionGate, auth flow, Stripe, billing, schema, walkthrough UI, paywall logic, 3-search cap, or any other file
- Normal logged-in users are completely unaffected — the new effects only fire when `user` is null

