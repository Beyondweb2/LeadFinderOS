
# Search Countdown and Upgrade Popup

## What Changes

### 1. Search Countdown Notification (after searches 1 and 2)
After each successful search, free users will see a brief, noticeable notification showing how many searches they have left:
- After search 1: "2 searches remaining"
- After search 2: "1 search remaining -- make it count!"

This will appear as a small banner above the results, not a blocking popup, so it doesn't interrupt the flow.

### 2. Convincing Upgrade Popup (after search 3)
After the 3rd search completes, a dialog will appear with:
- A bold headline: "You've found [X] businesses so far"
- A summary of what they've discovered (businesses found, ones without websites)
- Social proof messaging: "Users who upgrade close their first deal within 2 weeks"
- Clear value proposition with benefits list
- A prominent "Unlock Unlimited Searches" button
- A subtle "Maybe later" dismiss option

### Technical Details

**File: `src/pages/Index.tsx`**
- Add a `searchCountdownBanner` state that shows after each search with remaining count
- Add a `showUpgradeAfterLimit` dialog state triggered when `freeSearchCount` reaches 3
- Track cumulative businesses found across searches for the upgrade popup messaging
- The countdown banner auto-dismisses after 5 seconds or on next search

**File: `src/components/TrialLimitDialog.tsx`**
- Rework the dialog content to be more persuasive:
  - Dynamic stats showing what the user has already found
  - Benefit-oriented copy focused on ROI
  - Urgency/social proof elements
  - Keep the pricing and "Cancel anytime" reassurance

**Flow:**
```text
Search 1 complete --> Banner: "2 searches remaining"
Search 2 complete --> Banner: "1 search remaining"  
Search 3 complete --> Results shown + Upgrade popup appears
```

The popup won't block results -- users can dismiss it and still see their 3rd search results, but the search input will be locked after that.
