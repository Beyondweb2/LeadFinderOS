

## Plan: Outreach Attempt Tracking & Walkthrough Redesign — IMPLEMENTED

All 4 parts have been implemented:

### Part 1: Database ✅
- Added `outreach_attempts` (int, default 0) and `last_outreach_attempt_at` (timestamptz) to `outreach_leads`
- Created `outreach_events` table with RLS (insert/select own rows)

### Part 2: Attempt Logging ✅
- Created `useOutreachAttempt` hook with `logAttempt(leadId, channel)` and `logWhatsAppUnavailable(leadId)`
- Wired into SingleWhatsAppDialog, SingleSMSDialog, and OutreachTable call clicks
- Auto-sets status to 'waiting' when lead is 'not_contacted'
- Dispatches `outreach-attempt-logged` event for walkthrough

### Part 3: WhatsApp Return Check ✅
- Created `WhatsAppReturnCheck` component with visibility-based return detection
- localStorage markers for pending checks, 2-minute staleness window
- Yes/No confirmation modal on return
- Loading state on WhatsApp send button to prevent double-clicks
- Removed old `WhatsAppStatusPrompt` component

### Part 4: Walkthrough Redesign ✅
- New 8 steps: Search → Select 5 leads → Contact 1st → Contact 2 more → View Progress → Add Note → Set Next Action → Collapse Card
- Storage prefix changed to `demo_checklist_v4` (clean slate for all users)
- Steps 3 & 4 validated by `outreach-attempt-logged` events
- Step 2 now requires 5 leads instead of 3
- Updated sidebar/nav pulse indicators
