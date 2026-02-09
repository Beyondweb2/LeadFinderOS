
# Add Feedback Page Link to Navigation

## Summary

The feedback page at `/feedback` exists and works correctly, but there's no way for users to find it - no links exist anywhere in the app. We need to add discoverable links so users can easily submit reviews, feature requests, and general feedback.

## Where to Add Links

I recommend adding the feedback link in **two strategic locations**:

### 1. Desktop Sidebar - Bottom Section (near "How to Use")

Add "Feedback" as the last item in the main navigation list, right after "How to Use". This keeps it visible but positioned as a secondary action.

**File:** `src/components/AppSidebar.tsx`

**Change:** Add to `navItems` array:
```text
{
  title: 'Feedback',
  url: '/feedback',
  icon: MessageSquare,
  description: 'Share your thoughts'
}
```

### 2. Mobile "More" Menu

Add "Feedback" to the mobile dropdown menu so mobile users can access it too.

**File:** `src/components/MobileBottomNav.tsx`

**Change:** Add to `moreNavItems` array:
```text
{ title: 'Feedback', url: '/feedback', icon: MessageSquare }
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/AppSidebar.tsx` | Add "Feedback" to `navItems` with MessageSquare icon |
| `src/components/MobileBottomNav.tsx` | Add "Feedback" to `moreNavItems` |

## Result

After implementation:
- Desktop users will see "Feedback" in the sidebar navigation
- Mobile users will see "Feedback" in the "More" dropdown menu
- Both link to `/feedback` which has the full feedback form with Review, Feature Request, and General tabs
