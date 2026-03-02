

## Bug Fix: Invalid enum value for next_action_type

### Root Cause
The error `invalid input value for enum next_action_type: "send_revision"` occurs in **`handleDateChange`** (line 351 of `PotentialWork.tsx`). When the user changes the date, it casts the local track action key directly as a `NextActionType` instead of looking up the mapped `dbValue` from `TRACK_NEXT_ACTION_OPTIONS`.

```typescript
// BUG (line 351):
const dbAction: NextActionType = isCustom ? 'follow_up' : nextAction as NextActionType;
// "send_revision" is NOT a valid DB enum — should resolve to "send_follow_up"
```

### Fix

**File: `src/pages/PotentialWork.tsx`**

1. **Fix `handleDateChange`** (line 351): Look up the `dbValue` from `TRACK_NEXT_ACTION_OPTIONS` instead of casting directly:
   ```typescript
   const trackOpt = TRACK_NEXT_ACTION_OPTIONS.find(o => o.value === nextAction);
   const dbAction: NextActionType = isCustom ? 'follow_up' : (trackOpt?.dbValue || nextAction as NextActionType);
   ```

2. **Apply the same safety pattern everywhere** the raw `nextAction` state is sent to the DB — scan for any other direct casts of track keys as `NextActionType`.

### Scope
- Label-only change in one file, no DB or layout changes
- No restrictions between status and action combinations (they are already independent; the bug was purely a mapping miss)

