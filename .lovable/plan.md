
# Fix: Track Button Not Completing Walkthrough Step 4

## Problem
The Track (star) button in the Outreach table calls `markMultipleAsInterested`, which only dispatches `track-lead-added` but **does not** dispatch `demo-checklist-track-pressed`. The single-lead `markAsInterested` function has the correct event dispatch, but the table uses the bulk version.

## Solution
Add the missing `demo-checklist-track-pressed` event dispatch to the `markMultipleAsInterested` function in `src/hooks/useOutreach.ts`.

## Technical Details

**File: `src/hooks/useOutreach.ts`** (line ~700)

Add the missing event dispatch after `track-lead-added`:

```typescript
window.dispatchEvent(new CustomEvent('track-lead-added'));
window.dispatchEvent(new CustomEvent('demo-checklist-track-pressed')); // ADD THIS
```

This single-line addition ensures that pressing the Track button on any lead (whether via the star icon on individual leads or the bulk "Track" button) will properly trigger the walkthrough step 4 completion -- provided the user has also changed the status (which fires `demo-checklist-status-change` separately).
