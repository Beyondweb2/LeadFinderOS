
# Plan: Improve Bulk WhatsApp Dialog

## Overview
Enhance the Bulk WhatsApp Sender with live preview showing the actual business name, and add important warnings about WhatsApp restrictions.

## Changes

### 1. Live Message Preview
**File:** `src/components/BulkWhatsAppDialog.tsx`

Add a preview section below the template editor that shows how the message will look with the current lead's business name inserted:

```text
┌─────────────────────────────────────┐
│ Message Template                    │
│ Use {{business_name}} to personalize│
│ ┌─────────────────────────────────┐ │
│ │ Hi {{business_name}},           │ │
│ │ I noticed your business...      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 📝 Preview for current lead:        │
│ ┌─────────────────────────────────┐ │
│ │ Hi Lite-Up Electrical Services, │ │
│ │ I noticed your business...      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- Show preview only when there's a current lead selected
- Update preview in real-time as user edits template
- Use a distinct background color to differentiate from editor

### 2. Add WhatsApp Risk Warning
Add a prominent alert/warning at the top of the dialog:

```text
⚠️ Important: Sending bulk messages may risk WhatsApp account restrictions.
   Tips: Space out messages, personalize content, limit to 10-20 per day.
```

- Use an `Alert` component with warning variant
- Keep it concise but informative
- Include a collapsible "Learn more" section with detailed tips

### 3. Add Delay Recommendation
Between each send, suggest users wait before clicking next:

```text
💡 Wait 2-5 minutes before sending the next message
```

## Technical Details

### Component Updates
- Add `useMemo` to compute the preview message
- Add an Alert component with tips
- Style preview section with different background

### No Database Changes Required
This is purely a UI enhancement.

## Third-Party Disclaimer
Add small text noting that LeadFinder Pro is not responsible for any WhatsApp account restrictions - users are solely responsible for their outreach methods (aligns with existing legal disclaimer in memory).
