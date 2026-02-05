

# Lead Finder Restructure - Simplified Workflow

## Implementation Status: ✅ COMPLETED

## Overview

Transform the app into a streamlined, saleable business lead generation and outreach tool with these core improvements:

1. Remove the 60-result search cap using grid-based deep search
2. Consolidate to a single unified lead list (remove "No Website" / "Broken Website" tabs)
3. Add "Select All" with bulk phone copy in the format: `447477932564, 447477932565, ...`
4. Create an Archive system for processed leads with search-by-phone functionality
5. Keep notes, status, and next action date tracking

---

## Your Simplified Workflow

```text
SEARCH → ADD TO LIST → COPY PHONES → TEXT VIA EXTERNAL APP → ARCHIVE

                    ┌─────────────────────────────────────────┐
                    │              ACTIVE LIST                │
                    │  • Select all / Select individuals      │
                    │  • Copy phones (bulk format)            │
                    │  • View business info                   │
                    │  • Update status if reply received      │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
                    │               ARCHIVE                   │
                    │  • Search by phone number               │
                    │  • View full business details           │
                    │  • Add notes, update status             │
                    │  • Track next action dates              │
                    └─────────────────────────────────────────┘
```

---

## Key Changes

### 1. Deep Search (Bypass 60-Result Cap)

**Current Limitation:**
- Google Places API returns max 60 results (3 pages of 20)
- This is a hard API constraint, not a bug

**Solution - Grid-Based Multi-Point Search:**
- When user searches a location, divide the area into overlapping grid cells
- Run separate searches at each grid center point
- Deduplicate results by Google Place ID
- Return 200+ unique leads for large areas

**Implementation:**
- Add `deepSearch: boolean` parameter to search function
- Calculate grid points based on search radius
- Merge and deduplicate all results
- Show progress indicator during multi-point search

### 2. Unified Lead List (Remove Tabs)

**Current:**
- Two separate tabs: "No Website" and "Broken Website"
- `list_type` column in database

**New:**
- Single unified list showing all leads
- Remove the tab navigation entirely
- Keep `list_type` in database for historical purposes but ignore in UI
- All leads appear in one scrollable, filterable table

### 3. Bulk Selection + Phone Copy

**New Features:**
- Checkbox column for row selection
- "Select All" button in header
- "Copy Selected Phones" button
- Phone format: `447477932564, 447477932565, 447477932566`
  - No country code prefix (removes the `+`)
  - Comma + space separator
  - Ready to paste into bulk SMS app

**UI Changes to OutreachTable:**
- Add checkbox as first column
- Add selection count indicator
- "Copy X Phones" button shows selected count

### 4. Archive System

**Concept:**
- Leads in "Active" list = businesses you're currently working
- When you're done with a lead (contacted, not interested, etc.), archive it
- Archived leads are searchable but out of the way

**Database Changes:**
- Add `is_archived BOOLEAN DEFAULT false` column to `outreach_leads`
- Active list shows `WHERE is_archived = false`
- Archive shows `WHERE is_archived = true`

**Archive Features:**
- Search bar specifically for finding by phone number
- View full business details when found
- Can update notes, status, next action date
- Can "unarchive" to bring back to active list

### 5. Security Considerations (For Selling)

**Already Secure:**
- Google API key stored in Supabase secrets (server-side only)
- Row Level Security (RLS) on all tables
- User authentication required
- Rate limiting on search function

**Additional Hardening:**
- Ensure no API keys leak in client-side code
- All sensitive operations run in edge functions
- Input validation with Zod on all endpoints

---

## Technical Implementation

### Phase 1: Database Updates

Add archive column:
```sql
ALTER TABLE outreach_leads 
ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_outreach_leads_archived 
ON outreach_leads(user_id, is_archived);
```

### Phase 2: Deep Search Implementation

Modify `supabase/functions/search-leads/index.ts`:
- Accept `deepSearch` boolean parameter
- Implement `generateGridPoints(lat, lng, radius)` function
- Run parallel searches at each grid point
- Deduplicate by `place_id`
- Return combined results

Grid calculation:
- For 50km radius: use 5x5 grid = 25 search points
- For 10km radius: use 3x3 grid = 9 search points
- Overlap cells by 30% to catch edge businesses

### Phase 3: UI Changes

**Files to modify:**

| File | Changes |
|------|---------|
| `src/pages/Outreach.tsx` | Remove tabs, add Active/Archive toggle, add archive search |
| `src/components/OutreachTable.tsx` | Add checkbox column, select all, bulk copy phones |
| `src/hooks/useOutreach.ts` | Add `archiveLead`, `unarchiveLead`, `searchArchive` functions |
| `src/components/SearchForm.tsx` | Add Deep Search toggle |

**New OutreachTable Features:**
```tsx
// Selection state
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// Select all toggle
const handleSelectAll = () => {
  if (selectedIds.size === leads.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(leads.map(l => l.id)));
  }
};

// Copy phones in bulk format
const copySelectedPhones = () => {
  const phones = leads
    .filter(l => selectedIds.has(l.id) && l.phone)
    .map(l => l.phone.replace(/\D/g, '').replace(/^\\+/, ''))
    .join(', ');
  navigator.clipboard.writeText(phones);
};
```

### Phase 4: Archive View

**New Archive Section:**
- Toggle between "Active" and "Archive" views
- Archive has prominent search bar (searches by phone number)
- When lead found, shows full dialog with:
  - Business name
  - Phone
  - Google Maps link
  - Address
  - Notes (editable)
  - Status (editable)
  - Next action date (editable)

---

## Files to Create/Modify

### Modified Files
| File | Changes |
|------|---------|
| `supabase/functions/search-leads/index.ts` | Add grid-based deep search |
| `src/pages/Outreach.tsx` | Remove tabs, add Active/Archive toggle |
| `src/components/OutreachTable.tsx` | Add checkboxes, select all, bulk copy |
| `src/hooks/useOutreach.ts` | Add archive functions, phone search |
| `src/components/SearchForm.tsx` | Add Deep Search toggle |
| `src/types/outreach.ts` | Update types (optional) |

### Database Migration
| Migration | Purpose |
|-----------|---------|
| Add `is_archived` column | Enable archive functionality |
| Add index on archived status | Fast filtering by archive state |

---

## Phone Copy Format Details

**Current format (newline separated):**
```
+447477932564
+447477932565
```

**New format (comma-space separated, no +):**
```
447477932564, 447477932565, 447477932566
```

This format is compatible with most bulk SMS services that accept comma-separated recipient lists.

---

## Search-by-Phone in Archive

When user searches in archive:
1. Strip non-digits from search input
2. Query: `phone ILIKE '%' || searchDigits || '%'`
3. Show matching leads in results
4. Click to open full lead dialog

---

## Completed Changes

### ✅ Phase 1: Database Updates
- Added `is_archived` boolean column to `outreach_leads`
- Created index for fast filtering by archive status

### ✅ Phase 2: Deep Search Implementation  
- Added `deepSearch` parameter to search schema
- Implemented `generateGridPoints()` for grid-based searching
- Searches now run at multiple points in parallel with deduplication by `place_id`
- Toggle added to SearchForm under Advanced Filters

### ✅ Phase 3: UI Changes
- Removed tabs (No Website / Broken Website)
- Added Active/Archive view toggle
- Added checkbox column with Select All
- Added bulk "Copy X Phones" button (format: `447477932564, 447477932565`)
- Added Archive/Unarchive buttons for selected leads
- Added phone search in Archive view

### ✅ Phase 4: Hook Updates
- Added `archivedLeads` state
- Added `archiveLead`, `unarchiveLead` functions
- Added `archiveMultiple`, `unarchiveMultiple` for bulk operations
- Added `searchArchivedByPhone` function

---

## Summary of Core Changes

| Feature | Before | After |
|---------|--------|-------|
| Search results | Max 60 | 200+ with Deep Search |
| Lead lists | 2 tabs (No Website / Broken) | 1 unified list |
| Phone copy | Newline separated | Comma-space, no + prefix |
| Selection | None | Checkboxes + Select All |
| Archive | None | Separate view with phone search |

