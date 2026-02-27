

## Problem

When a lead is added to the CRM, the phone number is fetched asynchronously via Google Place Details. If no phone is found, the lead remains in the CRM with only a Facebook option — which the user finds useless.

## Root Cause

In `useOutreach.ts`, `addLead` inserts the lead immediately with `phone: null`, then fires off `enqueuePhoneFetch` as a background task. When `fetchOnePhone` resolves with no phone (`no_phone` status), the lead simply stays.

## Plan

**Auto-remove leads that have no phone after enrichment** — in the `fetchOnePhone` callback (`useOutreach.ts` ~line 42-76):

1. When enrichment completes and no phone is found (status would be `no_phone`), automatically delete the lead from the database and remove it from local state.
2. Show a brief toast: `"[Business Name] — no phone number found, not added."` so the user knows why it disappeared.
3. Also clean up the `outreach_history` entry so the business isn't flagged as "previously added" and can be re-attempted later if desired.

**Same logic for `retryPhoneFetch`** (~line 191-243): if a retry still yields no phone, auto-remove the lead with a toast.

**Files to edit:**
- `src/hooks/useOutreach.ts` — modify `fetchOnePhone` and `retryPhoneFetch` to delete leads with no phone result

