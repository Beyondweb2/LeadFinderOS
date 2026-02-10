

# Reviews Section Layout Improvement

## Overview
Redesign the reviews section to feel more central and compact, using a carousel on mobile instead of stacking all cards vertically, and keeping a clean 2-column grid on desktop.

## Changes

### Mobile: Carousel Layout
- Replace the vertical stack of 4 review cards with a swipeable carousel (using the existing Embla Carousel component)
- Add dot indicators below to show progress
- Add a "Swipe" hint text for discoverability
- This dramatically reduces scroll length on mobile

### Desktop: Keep 2-Column Grid (no changes needed)
- The current 2x2 grid on desktop already looks good and centered
- No changes required for desktop layout

### Card Styling Refinement
- Make the cards slightly more compact with tighter padding on mobile
- Ensure the "Leave a Review" button stays below the carousel

## Technical Details

### File Modified
- **`src/components/landing/ReviewsSection.tsx`**:
  - Import `Carousel`, `CarouselContent`, `CarouselItem` from carousel UI
  - Import `Autoplay` from `embla-carousel-autoplay`
  - Wrap the mobile view in a Carousel with autoplay (5-second delay)
  - Use `useIsMobile` hook to conditionally render carousel (mobile) vs grid (desktop)
  - Add dot indicators below the carousel for mobile
  - Desktop grid remains unchanged (2-column layout)

