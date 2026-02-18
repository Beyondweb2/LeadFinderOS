

# Fix: Video plays audio but is invisible on landing page

## Root Cause
Multiple previous attempts to fix the loading overlay have failed. The overlay (`bg-card/90 z-10`) covers the video, and the `onPlaying` event may not be firing reliably in all browsers/contexts, keeping `videoLoaded = false` and the overlay permanently visible.

## Solution: Remove the loading overlay entirely
Instead of continuing to debug event timing, completely remove the loading spinner overlay from both the mobile (`MobileHeroVideo`) and desktop (`VideoSection`) video components. The video already has `autoPlay` and `muted` set, so it will start playing almost immediately — a loading spinner adds complexity with no real benefit.

## Changes in `src/pages/Landing.tsx`

### 1. MobileHeroVideo (~lines 232-236)
Remove the overlay div entirely:
```html
<!-- DELETE THIS BLOCK -->
<div class="absolute inset-0 flex items-center justify-center bg-card/90 z-10 ...">
  <div class="spinner..." />
</div>
```

Also remove the `videoLoaded` state and `onPlaying` handler since they're no longer needed.

### 2. VideoSection (~lines 272-273, 304-307)
Same treatment — remove the overlay div and the `videoLoaded` state.

### 3. Cleanup
- Remove `useState` for `videoLoaded` in both components (since it's no longer used)
- Remove `onPlaying` handler from both `<video>` elements

## Files Changed
- `src/pages/Landing.tsx` — remove overlay divs and related state from both video components
