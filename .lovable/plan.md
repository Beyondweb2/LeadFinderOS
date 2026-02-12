

# Implementation Plan — All Remaining Tasks

This plan covers all 5 remaining tasks in a single implementation pass (one credit).

---

## Task 1: Move "Built for freelancers" paragraph on mobile

**What changes**: On mobile only, the "Built for freelance web designers..." paragraph currently sits inside the Value Proposition section (line 879-883). On mobile, it will be moved to appear **after** the Lead Toolkit carousel (below the slides), while staying in its current position on desktop.

**Technical approach**:
- Hide the existing paragraph on mobile (`hidden sm:block`)
- Add a mobile-only copy of the paragraph below the `MobileFeatureCarousel` component inside the Lead Toolkit section

---

## Task 2: Location search filter on CRM (Outreach) page

**What changes**: Add a "Location" text input to the Outreach CRM page that filters leads by their `address` and `country` fields.

**Key decision**: The outreach data is already fetched entirely client-side (all leads loaded into state). There is no server-side pagination endpoint to extend. Therefore this will be a **client-side filter** — efficient and simple, matching the existing search/filter pattern.

**Technical approach**:
- Add a `locationFilter` state variable in `OutreachTable.tsx`
- Add a Location input field (with placeholder "City, postcode, area, country...") next to the existing search input
- Add a clear (X) button on the input
- Debounce not needed since filtering is instant (client-side, already in memory)
- In the `filteredAndSortedLeads` useMemo, add location matching logic:
  - Normalize input (trim, lowercase)
  - Split on spaces to get tokens
  - Match ALL tokens against `address` and `country` fields (AND across tokens for relevance)
  - e.g. "London SW1" requires both "london" and "sw1" to appear somewhere in address+country
- Handles partial postcodes naturally (substring match)
- Composes with existing search, status, and country filters via AND logic
- No backend/database changes needed

---

## Task 3: Mobile emotional section below comparison

**What changes**: Add a new section on **mobile only** below the comparison section (which is currently desktop-only, so this goes after the `{!isMobile && ...}` comparison block). This section contains emotional copy and a CTA.

**Content**:
- Headline: "This is what changes."
- Subtext: "The difference isn't effort. It's leverage."
- 3 emotional statements stacked vertically
- Full-width "Start Free Trial" button
- Muted subtext: "No credit card. 24 hours. Cancel anytime."

**Technical approach**:
- Add a `{isMobile && ...}` block after the comparison section (around line 803)
- Use `ScrollReveal` for fade-in animation
- Clean typography, center-aligned, generous spacing
- Full-width CTA button with `btn-premium` class

---

## Task 4: Desktop emotional section below comparison

**What changes**: Enhance the existing desktop comparison section with emotional reinforcement and a strong CTA below it.

**Specific changes**:
1. **Headline update**: "Stop Scrolling Through Google Maps" becomes "Stop Wasting Mornings on Google Maps"
2. **Emotional transition block** below the two columns: headline + short paragraph + 3 projection lines
3. **Strong CTA block** with "Start Free Trial" button (enhanced glow/padding)
4. **Micro interaction**: Add subtle hover glow/elevation on "The LeadFinder Way" column; slightly dim "The Old Way" column

---

## Task 5: (No separate task — Tasks 3 & 4 cover the emotional/comparison sections)

---

## Files to modify

| File | Changes |
|------|---------|
| `src/pages/Landing.tsx` | Tasks 1, 3, 4 — move freelancer text on mobile, add mobile emotional section, enhance desktop comparison |
| `src/components/OutreachTable.tsx` | Task 2 — add location filter input and filtering logic |

No database migrations, no new files, no backend changes needed.

