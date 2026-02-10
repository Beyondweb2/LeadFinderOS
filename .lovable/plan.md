

# Landing Page Emotional Hooks & Conversion Boost

## Overview
Add emotional, benefit-driven content to the landing page, convert the features section back to a carousel on desktop, and insert a new trust/excitement section above the features. Also integrate the existing ReviewsSection component which is currently unused.

## Changes

### 1. New "Why LeadFinder" Benefits Section (above Features)
Insert a new section between "How It Works" and "Everything You Need to Close Deals" with punchy, emotionally-driven bullet points. This section will have a bold headline like **"What If You Could..."** or **"Stop Leaving Money on the Table"** with benefit statements like:

- Find 10x more leads in a fraction of the time
- Reach businesses before your competitors do
- Replace hours of manual searching with one click
- Turn cold outreach into warm conversations
- Close your first deal within days, not months
- Never run out of businesses to contact

Styled as a visually striking two-column grid with checkmark icons and subtle blue glow accents, matching the existing brand aesthetic.

### 2. Reviews/Social Proof Section
Add the existing `ReviewsSection` component (already built but not imported) into the page flow, placed after the new benefits section and before the features carousel. This adds real user testimonials for trust.

### 3. Features Section: Desktop Carousel
Convert the desktop features grid (currently a 3-column grid of 6 cards) back into an auto-playing Embla carousel with navigation arrows and dot indicators. Mobile stays as stacked cards. This dramatically reduces scroll length.

### 4. Page Flow (after changes)

```text
Hero
  |
Video Demo (desktop only)
  |
Before / After Comparison
  |
How It Works (5 steps)
  |
NEW: Benefits / Emotional Hooks Section
  |
NEW: Reviews / Social Proof (existing component)
  |
Features Carousel (desktop) / Stacked (mobile)
  |
Pricing
  |
Final CTA
  |
Footer
```

## Technical Details

### Files Modified
- **`src/pages/Landing.tsx`**:
  - Import `ReviewsSection` from `@/components/landing/ReviewsSection`
  - Import `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` from carousel UI
  - Import `Autoplay` from `embla-carousel-autoplay`
  - Add new benefits section JSX between HowItWorksSection and Features section
  - Render `<ReviewsSection />` after benefits section
  - Replace the desktop features `grid` with a `Carousel` component using `Autoplay({ delay: 4000 })`, showing 1 card at a time with prev/next arrows
  - Mobile features remain as stacked inline images (unchanged)

### Benefits Section Structure
- Section with dark glassmorphism card container
- Headline: emotionally-charged copy
- 6 benefit items in a 1-col (mobile) / 2-col (desktop) grid
- Each item: blue check icon + bold benefit text + supporting line
- CTA button at the bottom of the section

### Desktop Features Carousel
- Uses existing `Carousel` component with `Autoplay` plugin
- Each slide shows a single feature card (image + title + description)
- Navigation arrows on sides, dot indicators below
- Auto-advances every 4 seconds
- Maintains the existing card styling and expand-on-click behavior

