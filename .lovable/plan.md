
# Mobile-First Copy Cleanup and CRO Optimisation

## Summary
Audit and fix all user-facing copy across the app to remove inaccurate descriptions, eliminate banned terminology ("pipeline", "interested" as user-facing labels), fix the How It Works WhatsApp/SMS explanation, and optimise the mobile landing page for higher "Start Free Trial" conversions.

## Task 1: Inaccurate Copy Fixes

### Landing Page (src/pages/Landing.tsx)

**FEATURES array (lines 86-129):**
- "Smart Classification" description says "confidence scores" -- the app shows classification badges (Hot/Directory/Has Website) but no visible confidence scores. Rewrite to: "See which businesses have no website, a directory listing, or an existing site -- so you focus on the best leads."
- "Export Tools" description says "Full contact management with activity logs, notes, and action scheduling" -- this is not what export tools do. Rewrite to: "Export your leads as CSV files to use in other tools or keep as backup."
- "Contact Tracking" description says "from first contact to closed deal" -- overpromises. Rewrite to: "Log contact attempts, update lead status, and add notes as you reach out."

**Hero subheadline (line 453-456):**
- "Stop scrolling Google Maps--start closing deals." -- implies the app closes deals. Rewrite to: "Stop scrolling Google Maps -- start contacting prospects."

**Stats bar (lines 476-489):**
- Third stat shows infinity symbol with label "Unlimited" -- unclear what's unlimited. Change label to "Searches" to clarify it refers to unlimited searches on the paid plan.

**After-video CTA (line 316):**
- "Start Finding Leads" -- inconsistent with primary CTA. Change to "Start Free Trial" for consistency.

**After-comparison CTA (line 579):**
- "Try It Free" -- inconsistent. Change to "Start Free Trial".

**After-features CTA (line 741):**
- "Get Started Now" -- inconsistent. Change to "Start Free Trial".

**Final CTA section (line 857-858):**
- "Join hundreds of web professionals" -- unverifiable claim. Change to "Start finding businesses that need your services."

### Dashboard (src/pages/Dashboard.tsx)
- No inaccurate copy found. Looks accurate.

### Outreach page (src/pages/Outreach.tsx, line 60)
- "then track promising ones in your pipeline" -- uses "pipeline". Fix in Task 2.

### Conversion Card (src/components/dashboard/ConversionCard.tsx)
- "Interest rate" label and "Interested" count label -- these reference internal status names that exist in the database. Since "interested" is an actual status in the codebase (`LeadStatus`), and the task says to remove user-facing occurrences of "interested", change the dashboard label from "Interest rate" to "Conversion rate" and "Interested" to "Tracked".
- "Resp->Int" label: change to "Response rate".

### How To Use page (src/pages/HowToUse.tsx)
- Step 4 description mentions "pipeline" -- fix in Task 2.
- Summary mentions "sales pipeline" -- fix in Task 2.

## Task 2: Remove "Pipeline" and "Interested" Terminology

### Files requiring changes:

1. **src/components/landing/HowItWorksSection.tsx**
   - Line 41: "add promising leads to your pipeline" -> "add promising leads to your CRM"
   - Line 48: 'click "Interested" when they respond positively' -> 'click "Track" when they respond positively'
   - Line 55: "pipeline value" -> "lead progress"

2. **src/pages/Outreach.tsx**
   - Line 60: "track promising ones in your pipeline" -> "track promising ones in Track Leads"

3. **src/pages/PotentialWork.tsx**
   - Line 346: "through your sales pipeline from interested to completed" -> "from first response to completed deal"
   - Line 370: 'No interested leads yet. Mark leads as "Interested"' -> 'No tracked leads yet. Mark leads as "Track" in the Outreach CRM to see them here.'

4. **src/pages/HowToUse.tsx**
   - Line 47: "move them through your pipeline" -> "manage them through to completion"
   - Line 135: "manage interested prospects through your sales pipeline" -> "manage prospects from first contact to paid client"

5. **src/pages/Archive.tsx**
   - Line 237: 'mark as "Interested" to move them to Potential Work' -> 'click "Track" to move them to Track Leads'

6. **src/hooks/useOutreach.ts**
   - Line 630: 'Added to Interested pipeline' -> 'Added to Track Leads'
   - Line 639: 'added to pipeline' -> 'added to Track Leads'
   - Line 676: 'Added to Interested pipeline' -> 'Added to Track Leads'

7. **src/components/dashboard/ConversionCard.tsx**
   - "Interest rate" -> "Conversion rate"
   - "Interested" metric label -> "Tracked"
   - "Resp->Int" -> "Response rate"

8. **src/hooks/useDashboardMetrics.ts**
   - Line 47: comment "Pipeline metrics" -> "Outreach metrics" (internal, but good practice)

Note: The `LeadStatus` type itself (`'interested'`) in `src/types/outreach.ts` and the database enum will NOT be changed -- these are internal data values, not user-facing labels. The `OutreachStatusBadge` label "Interested" is a status option users select from a dropdown that maps to the database value, so it stays as a functional status label (it describes a lead's state, not a page name or CTA).

## Task 3: Fix How It Works (WhatsApp -> SMS Flow)

**src/components/landing/HowItWorksSection.tsx - Step 3 description (line 48):**

Current: 'Copy numbers to text or call directly. Mark leads as contacted, then click "Interested" when they respond positively.'

New: 'Tap WhatsApp to message a lead directly. If they are not on WhatsApp, tap the SMS button instead. Mark leads as "Contacted" after reaching out, then click "Track" to follow up.'

**src/pages/HowToUse.tsx - Step 3 description (line 39):**

Current: 'In the Outreach CRM, copy phone numbers to text leads or call them directly. Update their status as you go - mark as "Contacted" after reaching out, then click "Track" when someone responds positively.'

New: 'In the Outreach CRM, tap the WhatsApp button to message a lead. If they don\'t have WhatsApp, an SMS button appears instead. Mark leads as "Contacted" after reaching out, then click "Track" when someone shows interest.'

## Task 4: Mobile-First Landing Page Optimisation

### Hero Section (mobile)
- Add reassurance microcopy under the CTA: "Set up in under 60 seconds. No credit card needed." (below the Start Free Trial button, mobile only)
- The current mobile hero already has video at top, headline, subheadline, and CTA -- good structure

### Mobile subheadline
- Current mobile subheadline (line 453): "Discover local businesses that need your web design services." -- this is good but could be more outcome-driven
- Change to: "Find local businesses without websites and reach out directly."

### CTA consistency
- Standardise ALL CTAs to "Start Free Trial" (currently inconsistent: "Start Finding Leads", "Try It Free", "Get Started Now", "Get Started")
- Header mobile button currently says "Start" -- change to "Free Trial" for clarity

### Feature carousel (mobile)
- Currently 6 slides -- reduce to 4 by removing "Export Tools" and "Customization" (least conversion-relevant for mobile users)
- Keep: Smart Classification, Smart Dashboard, Contact Tracking, Templates

### How It Works mobile carousel
- Already 4 steps -- good, no change needed to count
- Fix copy per Task 2 and Task 3

### Trust stats bar
- Already compact 3-column on mobile -- good

## Files to Modify

| File | Changes |
|------|---------|
| src/pages/Landing.tsx | Fix FEATURES copy, standardise CTAs, add mobile microcopy, reduce mobile features to 4, fix hero subheadline |
| src/components/landing/HowItWorksSection.tsx | Remove "pipeline"/"interested", fix WhatsApp/SMS explanation |
| src/pages/Outreach.tsx | Remove "pipeline" from description |
| src/pages/PotentialWork.tsx | Remove "pipeline"/"interested" from copy |
| src/pages/HowToUse.tsx | Remove "pipeline", fix WhatsApp/SMS step |
| src/pages/Archive.tsx | Remove "Interested" label |
| src/hooks/useOutreach.ts | Remove "pipeline" from toast messages |
| src/components/dashboard/ConversionCard.tsx | Rename "Interest rate" and "Interested" labels |
| src/hooks/useDashboardMetrics.ts | Fix internal comment only |

## What Will NOT Change
- Pricing (GBP 19.99/mo)
- Trial length (3-day)
- Stripe configuration
- Database schema or enum values
- Internal LeadStatus types
- Desktop layout (minimal changes, copy-only)
