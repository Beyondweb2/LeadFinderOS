
# Add Explicit "Edit" Button to Track Leads Cards

## Problem
Currently, tapping/clicking anywhere on a tracked lead card opens the edit dialog. This is not discoverable -- users may not realize they can edit leads.

## Solution
Remove the full-card click handler and add a visible "Edit" button on each card that opens the detail/edit dialog.

## Changes

### File: `src/pages/PotentialWork.tsx`

1. **Remove `onClick` from the Card** (line 223)
   - Remove `onClick={() => setDetailOpen(true)}` and `cursor-pointer` from the Card's className

2. **Add an "Edit" / "Manage" button to the card**
   - In the RIGHT section of the card (around line 328), add a small button below the next action info that says "Edit" (with a Pencil icon)
   - This button will call `setDetailOpen(true)` with `e.stopPropagation()`
   - Styled as a compact outlined/ghost button so it's clearly clickable

### Layout
The button will sit in the right-hand column beneath the next action details, making it visible but not intrusive:

```
[Image] [Name / Status / Contact / Notes]  [Next Action info]
                                            [Due date]
                                            [Edit button]
```

On mobile, the Edit button will appear inline at the bottom of the card section.

## Technical Details

- Remove `cursor-pointer` and `onClick={() => setDetailOpen(true)}` from the `<Card>` element on line 222-223
- Add a `<Button>` with variant `outline`, size `sm`, containing a Pencil icon and "Edit" text
- Place it after the existing next action / due label content in the right column (around line 358)
- The button uses `onClick={(e) => { e.stopPropagation(); setDetailOpen(true); }}` for safety
- Keep existing `e.stopPropagation()` calls on other interactive elements (they remain valid)
