

# Plan: Update Admin Dashboard Columns

## Changes

### 1. Remove "Free Searches" column from table (AdminDashboard.tsx)

- **Line 427**: Delete the `<TableHead>Free Searches</TableHead>` header
- **Lines 466-468**: Delete the `<TableCell>` that renders `{u.free_search_count}/3`
- **Line 439**: Update `colSpan` from 11 to 11 (stays same since we add one column back)
- **Line 571-573**: In the detail drawer, remove the "Free Searches" grid item

### 2. Replace with "Messages Sent" column in table

- Add a new `<TableHead>Messages</TableHead>` where "Free Searches" was
- Add a `<TableCell>` rendering `{u.messages_sent_count}` in the same position

### 3. Walkthrough column — show tick when completed

The walkthrough column already exists (line 469-471) and already shows `✅` when `walkthrough_completed` is true. The backend already returns `walkthrough_completed` from `user_trials`. This is working correctly — the issue in the screenshot is that no users have completed the walkthrough yet (all show `—`).

No changes needed for the walkthrough column logic.

### Files Changed

| File | Change |
|---|---|
| `src/pages/AdminDashboard.tsx` | Remove "Free Searches" column header + cell, add "Messages" column, remove free_search_count from detail drawer |

