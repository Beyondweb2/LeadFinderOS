

# Fix: Show All 511 Archived Businesses

## Problem Identified
The Archive page currently shows only **50 businesses** because of a hard-coded limit on line 163:
```typescript
filteredLeads.slice(0, 50).map((lead) => ...)
```

Meanwhile, the database contains **511 archived leads** that are all being fetched correctly - they're just not being displayed.

## Solution
Remove the `.slice(0, 50)` limit and add proper pagination or virtual scrolling to handle 500+ records efficiently.

## Changes Required

### 1. Remove Hard-coded Limit
Change from showing only the first 50 to showing all archived leads, with pagination to keep the page performant.

### 2. Add Pagination Controls
Since there are 500+ records, implement a simple pagination system:
- Show 50 leads per page
- Add "Previous" and "Next" buttons
- Display current page info (e.g., "Showing 1-50 of 511")

### 3. Show Total Count
Always display how many total archived leads exist, so you know all your data is there.

## File to Modify
- `src/pages/Archive.tsx`

## Expected Result
- All 511 archived businesses will be accessible
- Pagination will keep performance smooth
- Header will show total count ("511 archived businesses")
- Search by phone will still work across all records

