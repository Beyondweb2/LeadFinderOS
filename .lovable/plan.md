
# Track Leads Card Redesign

## Problem
The previous card redesign was applied to the wrong component (`OutreachMobileCard.tsx`). The Track Leads page at `/potential-work` uses its own `LeadCard` component defined inline within `PotentialWork.tsx` (lines 127-493). This component was never updated, so the cards still look the same.

## Changes to `src/pages/PotentialWork.tsx` (LeadCard section)

### 1. Bigger Avatar / Initials Block
- Increase from `w-10 h-10 / sm:w-12 sm:h-12` to `w-14 h-14 / sm:w-16 sm:h-16`
- Larger initials text (from `text-xs` to `text-lg sm:text-xl`)
- Stronger background contrast and border styling (`bg-primary/10 border-primary/20`)
- `rounded-xl` for a more modern look

### 2. Business Name Hierarchy
- Increase font size from `text-sm sm:text-base` to `text-base sm:text-lg`
- Keep bold weight
- Category label stays muted at `text-[10px] text-muted-foreground/60`

### 3. Contact Buttons Redesign
- Increase button height from `h-7` to `h-9`
- Increase font size from `text-[11px]` to `text-xs font-medium`
- Rounder corners (`rounded-lg`)
- Full-width row with even spacing
- Consistent color coding (green WhatsApp, blue SMS, amber Call)

### 4. Next Action + Date Section
- Add a "Next Action" label above the controls
- Wrap in a styled container (`bg-muted/20 rounded-lg border border-border/50 p-2.5`)
- Increase select height from `h-7` to `h-8` with better font sizing
- Increase date picker button size to match
- Keep the green checkmark for "mark as done"

### 5. Overall Card Spacing
- Increase padding from `p-3 sm:p-4` to `p-4 sm:p-5`
- Add more vertical spacing between sections
- Slightly stronger card border and hover state

### 6. Custom Next Action Fix
- Ensure the custom action input works properly with `stopPropagation` handlers (same fix applied to `NextActionEditor.tsx` previously but needs to be verified here since this page has its own inline action handling)

## Files to Modify
- `src/pages/PotentialWork.tsx` -- LeadCard component (lines ~235-493)

## No New Dependencies
All changes use existing UI primitives and Tailwind classes.
