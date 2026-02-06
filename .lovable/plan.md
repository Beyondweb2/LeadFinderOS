
# Prevent Re-adding Archived Businesses

## Problem
Users can currently re-add businesses that are already in the archive. The duplicate prevention system checks `outreach_history`, but this may miss leads that were archived before history tracking was implemented or edge cases where history wasn't properly recorded.

## Solution
Enhance the duplicate prevention to check both `outreach_history` AND `outreach_leads` (including archived leads) before allowing a new lead to be added.

## Changes Required

### 1. Update `addLead` Function in `useOutreach.ts`
Add an additional check against the `outreach_leads` table (including archived leads) before inserting a new lead.

**Current logic:**
- Checks `outreach_history` table for business_name or google_maps_url match

**New logic:**
- Check `outreach_history` table (existing)
- Also check `outreach_leads` table directly (new)
- Block addition if found in either location

### 2. Update `isInOutreach` Function
Expand the check to also look at archived leads stored in local state.

**Current:**
```typescript
const isInOutreach = useCallback((leadName: string, googleMapsUrl?: string): boolean => {
  return outreachHistory.some(
    (h) => h.business_name === leadName || (googleMapsUrl && h.google_maps_url === googleMapsUrl)
  );
}, [outreachHistory]);
```

**Updated:**
```typescript
const isInOutreach = useCallback((leadName: string, googleMapsUrl?: string): boolean => {
  // Check history
  const inHistory = outreachHistory.some(...);
  
  // Also check active leads
  const inActive = leads.some(...);
  
  // Also check archived leads
  const inArchived = archivedLeads.some(...);
  
  return inHistory || inActive || inArchived;
}, [outreachHistory, leads, archivedLeads]);
```

## Technical Implementation

| Check Point | Source | Purpose |
|-------------|--------|---------|
| `outreach_history` | Database | Permanent record of all ever-added businesses |
| `outreach_leads` (active) | Local state | Currently active leads |
| `outreach_leads` (archived) | Local state | Leads in archive |

## User Experience
- When trying to add an archived business: Toast message "Previously added - This business is in your archive"
- Search results will show a distinct indicator for archived businesses
- Maintains clear differentiation between "Already in CRM" (active) vs "In Archive"

## Files to Modify
- `src/hooks/useOutreach.ts` - Update `addLead` and `isInOutreach` functions
