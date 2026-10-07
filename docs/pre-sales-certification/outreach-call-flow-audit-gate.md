# Outreach call flow + call-script audit gate (2026-10-07)

Branch `fix/outreach-call-flow-audit-gate`. Frontend only — no SQL, no edge function (no changed lib is in any
function's import closure). `whatsapp-status` untouched.

## Root cause of "Open WhatsApp?"

Outreach's Call (row phone icon, the number in the phone column, the phone card's "Normal Call") and the
lead popup's header Call were `<a href="tel:…">` links. On a Windows laptop with WhatsApp Desktop installed,
WhatsApp registers itself as the `tel:` handler, so the browser asked "Open WhatsApp?". Nothing in our code
called WhatsApp — the operating system's tel: handler did. Every tel: link on the call path is gone (table,
phone card, popup header, popup facts line, Details contact row, ProspectFacts, the script sheet's prospect
line). `ClientMissingInfoPanel` (paid-client admin panel, not the call path) still has one.

## The flow now

Outreach CALL → `handleCallClick` → the lead popup on the Call tab with the small NUMBER window over it
(`openNumberPopup`; `src/lib/callArrival.ts`). The window (`src/components/CallNumberPopup.tsx`): business,
the number (`src/lib/callNumber.ts`: `toWhatsAppDigits`, so UK/Australia normalisation is the one rule;
shown as +44 / +61, stored form under it), Copy number ("Copied", window stays), **Call on WhatsApp**
(Paul, mid-build: opens `wa.me/<digits>` in a new tab — UK `44` / Australia `61` only, so India gets no
option), **Call manually** (closes the window only), Cancel. Light overlay so the prospect stays visible;
a bottom sheet under 640 px.

Both Call buttons only close the number window (`afterStartCall`): no write, no outcome, no navigation.
"What happened?" opens only from Log call (header, renamed from "Log") or the script's Log this call
(`afterLogCall`); the outcomes and their saving (`lead_log_contact` via `useLeadWork`) are unchanged.
The script sheet's own "Log this call" still arrives on the Log window (`openLogContact`).

## The audit gate

`src/lib/callScriptGate.ts`: the script (and voice note) shows only when the playbook's AI check is `ready`
AND it came from an audit of THIS lead (`auditLeadId === leadId`) AND the result has evidence. The audit is
still chosen by `resolveLeadReportAudit` (newest usable — `RUN_USABLE` complete/capped — of this lead; an
older usable one still counts while a newer runs; measurements excluded). Stale (> `PLAYBOOK_AUDIT_STALE_DAYS`)
keeps the existing rule: script shown with the warning. Locked reasons: no_audit / queued / running /
failed / cancelled / no_result / wrong_lead, read from this lead's newest audit (`callAuditProgress`). The
locked card says "Run the prospect check before using the call script" with "Go to the AI check" (scrolls to
LeadHookPanel). While queued/running the playbook re-reads every `CALL_SCRIPT_RECHECK_MS`. Log this call and
Quick Close stay available either way. The Outreach/Inbox script sheet is gated the same way.

## Tests

`scripts/outreach-call-flow.test.ts` (new): Call flow, number window markup (rendered), WhatsApp/manual,
Copy, no tel:, Log call as the only opener, the gate across every state against the real resolver + builder,
permissions (number = the popup's own row, read through the caller's session), regressions. Updated pins in
`call-log-from-script`, `lead-workspace-sales-flow`, `workspace-declutter`, `sales-workspace-v2`.

## Visual QA

Fixture harness (real `LeadDetailDialog`, mocked Supabase, headless Edge over CDP) at 1440×900 and 390×844 —
valid audit, no audit, running (Australian number): number window over the popup, Copy → Copied with the
window open, Call manually → window closed, popup + script/locked state remain, Log call → "What happened?";
no tel: links, no horizontal overflow. Not seen on live data (no session created).
