

# Fix White Flash When Navigating Back to Landing Page

## Problem
The `useLandingTheme` hook applies dark theme CSS variables in a `useEffect` (runs after paint). When navigating back to `/landing`, there's a visible white flash because:
1. The cleanup from the previous unmount restores the non-dark theme
2. The Suspense fallback and PublicRoute loading spinner render with default (light) background
3. The landing page mounts and `useEffect` applies dark theme — but only after the first paint

## Solution

Two changes to eliminate the flash:

### 1. `src/pages/Landing.tsx` — Add inline dark background style
On the root `<div>` (line ~519), add an inline `style` with the dark background color so it's applied immediately on first render, before any `useEffect` runs:
```tsx
<div className="min-h-screen bg-background overflow-hidden" 
     style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
```

### 2. `src/components/PublicRoute.tsx` — Match dark background on loading spinner
Change the loading spinner container (line 26) to also use the dark background inline, so the spinner doesn't flash white before the landing page mounts:
```tsx
<div className="min-h-screen flex items-center justify-center" 
     style={{ backgroundColor: 'hsl(220, 50%, 6%)' }}>
```

### 3. `src/App.tsx` — Dark Suspense fallback for `/landing`
The `FullPageLoader` Suspense fallback also shows a white background during lazy chunk loading. Add inline dark background to the `FullPageLoader` component as well.

These three changes ensure every intermediate state between navigation and the landing page fully mounting uses the same dark background — no white flash.

