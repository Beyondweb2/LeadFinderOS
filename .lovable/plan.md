

## Fix: TrialLimitDialog Missing DialogTitle Error

### Problem
The `TrialLimitDialog` component uses Radix `DialogContent` without a `DialogTitle` component. Radix UI throws a runtime error every time this dialog opens:
- `DialogContent requires a DialogTitle for the component to be accessible`
- `Missing Description or aria-describedby for DialogContent`

This is the recurring error you see. The "Try to Fix" button doesn't help because the app doesn't crash -- it's a runtime accessibility warning that Radix treats as an error.

### Solution
Add a visually hidden `DialogTitle` and `DialogDescription` inside the `TrialLimitDialog` so Radix is satisfied, without changing the visual design at all.

### Technical Details

**File: `src/components/TrialLimitDialog.tsx`**

1. Import `DialogTitle` and `DialogDescription` from the dialog component
2. Import `VisuallyHidden` from Radix (or use `sr-only` CSS class)
3. Add a screen-reader-only `DialogTitle` and `DialogDescription` inside `DialogContent` with descriptive text
4. No visual changes -- these elements will be hidden from view but satisfy the accessibility requirement

The fix is two extra lines inside the `DialogContent`:
```tsx
<DialogTitle className="sr-only">Start your free trial</DialogTitle>
<DialogDescription className="sr-only">Trial upgrade prompt</DialogDescription>
```

This will eliminate the recurring error completely.

