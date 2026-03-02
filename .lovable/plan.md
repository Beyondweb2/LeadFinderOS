

## Plan: Outreach Attempt Tracking & Walkthrough Redesign

This is a large feature spanning database changes, outreach tracking logic, WhatsApp confirmation UX, and a full walkthrough redesign. Here's the implementation plan.

---

### Part 1: Database Changes

**Migration 1 — Add columns to `outreach_leads`:**
- `last_outreach_attempt_at timestamptz null`
- `outreach_attempts int not null default 0`
- (Note: `whatsapp_status` and `whatsapp_checked_at` already exist)

**Migration 2 — Create `outreach_events` table:**
```text
outreach_events
├── id uuid pk default gen_random_uuid()
├── user_id uuid not null
├── lead_id uuid not null
├── channel text not null (whatsapp, sms, call)
├── event_type text not null (attempt, whatsapp_unavailable)
├── created_at timestamptz not null default now()
└── Indexes: (user_id, created_at), (lead_id, created_at)
```
- RLS: users can insert/select own rows, no update/delete

---

### Part 2: Outreach Attempt Logging

**Create `src/hooks/useOutreachAttempt.ts`** — a hook that provides a `logAttempt(leadId, channel)` function:
1. Increments `outreach_leads.outreach_attempts` by 1
2. Sets `outreach_leads.last_outreach_attempt_at = now()`
3. Inserts into `outreach_events` with `event_type: 'attempt'`
4. If lead's current status is `not_contacted`, auto-sets pipeline status to `waiting` (as "Attempted" equivalent)
5. Does NOT override statuses like `replied`, `interested`, `not_interested`, etc.

**Wire into existing contact flows:**
- `SingleWhatsAppDialog.tsx` → call `logAttempt(leadId, 'whatsapp')` in `handleSend`
- `SingleSMSDialog.tsx` → call `logAttempt(leadId, 'sms')` in `handleSend`
- `OutreachTable.tsx` / `OutreachMobileCard.tsx` → call `logAttempt(leadId, 'call')` on Call clicks
- Also dispatch `window.dispatchEvent(new CustomEvent('outreach-attempt-logged', { detail: { leadId, channel } }))` for walkthrough validation

---

### Part 3: WhatsApp Confirmation Loop

**Replace the current `WhatsAppStatusPrompt` flow** with a visibility-based return detection:

**In `SingleWhatsAppDialog.handleSend`:**
1. Set a per-lead loading state ("Opening..." with spinner) — prevent double-clicks
2. Store in localStorage: `pending_whatsapp_check_lead_id`, `pending_whatsapp_check_started_at`, `pending_whatsapp_check_lead_name`
3. Open WhatsApp link
4. Close dialog
5. Do NOT show the old prompt immediately

**Create `src/components/WhatsAppReturnCheck.tsx`** — a global component mounted on the Outreach page:
- Listens to `document.visibilitychange` and `window.focus`
- On return: reads localStorage pending markers
- If pending exists and `started_at` within 2 minutes → show confirmation modal
- If stale (>2 min) → clear localStorage, ignore
- Modal: "Did WhatsApp open with a chat for this number?" with Yes/No buttons
- Yes → update `whatsapp_status='yes'`, `whatsapp_checked_at=now()`, clear markers
- No → update `whatsapp_status='no'`, `whatsapp_checked_at=now()`, insert `outreach_events` with `event_type='whatsapp_unavailable'`, clear markers, dispatch event for UI badge update

**WhatsApp button behavior based on `whatsapp_status`:**
- `unknown` → normal green WhatsApp button
- `yes` → normal green WhatsApp button
- `no` → disabled/secondary button with "No WA" indicator; promote SMS as primary (swap button order/styling)

**Remove the old `WhatsAppStatusPrompt` component** and its inline trigger from `SingleWhatsAppDialog`.

---

### Part 4: Walkthrough Redesign (8 New Steps)

**Update `DemoChecklistContext.tsx`:**
- Replace state fields to match new steps:
  - `searchDone` (step 1, unchanged)
  - `leadsSelected` + `leadsSelectedCount` (step 2 — select/add 5 leads)
  - `firstContactMade` (step 3 — 1 outreach attempt logged)
  - `threeContactsMade` + `contactsMadeCount` (step 4 — 3 total attempts)
  - `viewedProgress` (step 5 — navigate to Track Leads)
  - `noteAdded` (step 6 — add note on tracked lead)
  - `nextActionSet` (step 7 — set next action on a lead)
  - `cardCollapsed` (step 8 — collapse a card)
- Change `STORAGE_PREFIX` to `demo_checklist_v4` to avoid conflicts with existing users
- completedCount counts these 8 booleans
- Event listeners:
  - Steps 3 & 4: listen for `outreach-attempt-logged` custom event (fired by `useOutreachAttempt`)
  - Step 2: listen for `crm-lead-added` (count to 5 instead of 3)
  - Step 5: navigate to `/potential-work`
  - Steps 6, 7, 8: reuse existing events

**Update `WalkthroughOverlay.tsx`:**
- Rewrite `getActiveStep()` for the 8 new steps with matching selectors and tooltip copy:
  1. Search → same as current
  2. "Select 5 leads you want to contact" → target add-to-CRM buttons
  3. "Contact your first lead via Call, SMS or WhatsApp" → target contact buttons on outreach page
  4. "Contact 2 more leads (3 total)" → same target, dynamic count
  5. "View your progress in Track Leads" → target track-nav link
  6. "Add a note to one lead" → target notes area
  7. "Set a next action for one lead" → target next action editor
  8. "Collapse a card" → target collapse button

**Update `DemoChecklistPanel.tsx`:**
- Update completion modal copy if needed (metrics references)

---

### Files to Create
- `supabase/migrations/...outreach_events_and_columns.sql`
- `src/hooks/useOutreachAttempt.ts`
- `src/components/WhatsAppReturnCheck.tsx`

### Files to Modify
- `src/types/outreach.ts` — add `outreach_attempts`, `last_outreach_attempt_at` to `OutreachLead`
- `src/hooks/useOutreach.ts` — add new fields to `updateLead` types
- `src/components/SingleWhatsAppDialog.tsx` — loading state, localStorage markers, remove old prompt trigger
- `src/components/SingleSMSDialog.tsx` — call `logAttempt`
- `src/components/OutreachTable.tsx` — call `logAttempt` on call clicks, WhatsApp button conditional styling, mount `WhatsAppReturnCheck`
- `src/components/OutreachMobileCard.tsx` — same WhatsApp button conditional styling
- `src/pages/Outreach.tsx` — mount `WhatsAppReturnCheck`
- `src/contexts/DemoChecklistContext.tsx` — new step definitions and event listeners
- `src/components/WalkthroughOverlay.tsx` — new step definitions and tooltips
- `src/components/DemoChecklistPanel.tsx` — update step references

### Files to Remove
- `src/components/WhatsAppStatusPrompt.tsx` (functionality moved to `WhatsAppReturnCheck`)

