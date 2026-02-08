
# WhatsApp Number Verification Feature

## Summary
Add the ability to check whether a phone number is registered on WhatsApp **before** clicking the WhatsApp button, so you know in advance if contacting via WhatsApp will work.

## The Challenge
Unfortunately, WhatsApp doesn't provide a free, official public API to check if a number is registered. The options that exist require:

1. **Third-party WhatsApp API services** (like 2Chat, Wassenger, Maytapi, Green-API) - These cost money (typically $15-50/month) and require connecting your own WhatsApp number to their service
2. **WhatsApp Business API (official)** - Requires Meta Business verification and approval process
3. **Trial-and-error tracking** - Mark numbers as "No WhatsApp" after you discover they don't work

## Recommended Approach: Quick "No WhatsApp" Marking

Since third-party APIs add cost and complexity, I recommend a streamlined workflow that lets you quickly mark numbers when you discover they don't have WhatsApp:

### What You'll Get

1. **Quick "Mark No WhatsApp" button** - Right next to the WhatsApp button, a single click marks the lead as "No WhatsApp" status when you return and find the number wasn't on WhatsApp

2. **Visual indicator on leads already marked** - Leads with "No WhatsApp" status will show a clear indicator so you don't waste time clicking them again

3. **Hide WhatsApp button for "No WhatsApp" leads** - Once marked, the WhatsApp button disappears for that lead to prevent accidental clicks

4. **Filter out "No WhatsApp" leads** - Easy filter to hide leads you've already determined don't have WhatsApp

---

## Optional: Third-Party API Integration

If you'd like automatic verification before clicking, I can integrate with one of these services. This would:
- Check each phone number when you add leads to your Outreach CRM
- Show a WhatsApp icon (green checkmark = verified, gray X = no WhatsApp)
- Requires subscribing to one of these services and providing an API key

Let me know if you want to explore this option further.

---

## Technical Details

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/components/OutreachTable.tsx` | Add "Mark No WA" quick action button next to WhatsApp button; hide WhatsApp button if status is `no_whatsapp` |
| `src/components/OutreachMobileCard.tsx` | Same changes for mobile view |
| `src/components/OutreachLeadDialog.tsx` | Add quick mark button in the lead details dialog |

### UI Changes

**Desktop table row:**
```text
[Maps] [WhatsApp] [❌ No WA]  →  (after marking) →  [Maps] [No WhatsApp badge]
```

**Mobile card:**
```text
[Maps] [WhatsApp] [❌]  →  (after marking) →  [Maps] [No WA label]
```

### Logic Flow
1. User clicks WhatsApp button → opens WhatsApp
2. User returns, sees "number not on WhatsApp" message
3. User clicks "Mark No WA" button (single click)
4. Lead status changes to `no_whatsapp`
5. WhatsApp button is replaced with a "No WA" indicator
6. Lead can be filtered out of the active workflow

