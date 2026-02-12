

# Make Demo Mode Visually Identical to Full App

## Problem
The `/demo` route currently renders the `Index` page without the `AppLayout` wrapper, so it has no sidebar (desktop) or bottom navigation (mobile). This makes it feel like a stripped-down sandbox rather than the real product, which reduces perceived value and conversion.

## Solution Overview

### 1. Create a DemoLayout component
A new `src/components/DemoLayout.tsx` that mirrors the full `AppLayout` structure (sidebar + bottom nav) but intercepts navigation clicks on gated features. Instead of redirecting to login, clicking a nav item will show an upgrade dialog.

- Renders `AppSidebar` on desktop, `MobileBottomNav` on mobile
- All nav items visible and styled identically to the real app
- Clicking any nav item (except Find Leads/demo) opens an upgrade modal

### 2. Create a DemoUpgradeDialog component
A new `src/components/DemoUpgradeDialog.tsx` modal that appears when demo users click locked nav items:
- Headline: "Create a free account to unlock this feature."
- Primary button: "Start Free Trial" (links to `/auth`)
- Secondary button: "Sign In" (links to `/auth`)

### 3. Create DemoAppSidebar and DemoMobileBottomNav
Lightweight wrappers (or props) around the existing sidebar and bottom nav that intercept link clicks for non-demo routes and trigger the upgrade dialog instead of navigating.

Two approaches:
- **Option A (cleaner):** Add an `isDemo` prop + `onLockedClick` callback to `AppSidebar` and `MobileBottomNav`. When `isDemo` is true, clicking a non-demo link calls `onLockedClick` instead of navigating.
- **Option B:** Create thin wrapper components that override link behavior for demo mode.

We will go with **Option A** to avoid duplicating the nav components.

### 4. Update the /demo route in App.tsx
Wrap the `<Index />` component in the new `DemoLayout` instead of rendering it bare:

```
<Route path="/demo" element={<DemoLayout><Index /></DemoLayout>} />
```

### 5. Update SearchForm for demo mode
- Change the search limit indicator from "2/2 searches left today" to "1 demo search available"
- After the demo search is used, show: "You've used your free demo search." with an "Unlock Full Access" button
- Add a `isDemo` prop to `SearchForm` to control this messaging

### 6. Update empty state in Index page
- When on the demo route, replace the large "Ready to find leads" empty state with a compact instructional hint: "Run a demo search to see live businesses."
- Detect demo mode via the current route path (`useLocation`)

## Files to Create
- `src/components/DemoLayout.tsx` -- Layout wrapper for demo mode
- `src/components/DemoUpgradeDialog.tsx` -- Modal for locked features

## Files to Modify
- `src/App.tsx` -- Wrap `/demo` route with `DemoLayout`
- `src/components/AppSidebar.tsx` -- Add `isDemo` + `onLockedClick` props
- `src/components/MobileBottomNav.tsx` -- Add `isDemo` + `onLockedClick` props
- `src/components/SearchForm.tsx` -- Add `isDemo` prop for demo-specific copy
- `src/pages/Index.tsx` -- Demo-aware empty state

## Technical Details

### DemoLayout.tsx
- Uses `SidebarProvider`, `AppSidebar`, and `MobileBottomNav` just like `AppLayout`
- Passes `isDemo={true}` and an `onLockedClick` handler to both nav components
- Manages open/close state for the `DemoUpgradeDialog`

### AppSidebar + MobileBottomNav changes
- New optional props: `isDemo?: boolean`, `onLockedClick?: (featureName: string) => void`
- When `isDemo` is true, nav links for all routes except `/demo` call `onLockedClick` via `onClick` with `e.preventDefault()` instead of navigating
- Visual appearance remains 100% identical

### SearchForm changes
- New `isDemo?: boolean` prop
- When `isDemo` is true:
  - Show "1 demo search available" instead of "X/Y searches left today"
  - After search used (searchesRemaining === 0): show "You've used your free demo search." with "Unlock Full Access" button linking to `/auth`

### Index.tsx changes
- Detect `/demo` route via `useLocation`
- When on demo and no leads: show compact hint "Run a demo search to see live businesses." instead of the large empty state block

## What This Does NOT Change
- Search logic, limits, or backend calls
- Stripe/subscription/webhook logic
- Database schema
- Existing authenticated user experience
- Demo search count (stays at 1)
- Admin logic
