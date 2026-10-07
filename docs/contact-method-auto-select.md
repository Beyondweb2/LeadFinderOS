# Contact Method follows the route (2026-10-07)

**Rule (Paul):** the lead's Contact Method pill reflects how the rep is actually contacting them — Call when
they open the Call flow, WhatsApp when the lead is queued. Latest route wins; history is never rewritten.

- **One field:** `outreach_leads.contact_method` — the column the pill already reads. No second field.
- **Call:** `handleCallClick` (OutreachTable) sets `'call'` (skipped if already Call) through the page's
  one handler → `updateLead`. The pill only: no attempt, no status, no history row. A call is still
  recorded solely by the logged outcome (`lead_log_contact`).
- **WhatsApp:** already written by every queue path (bulk queue, per-lead button, `sales_queue_opener`);
  unqueue clears to null. Nothing invented in its place.
- **Salespeople have no direct write on `outreach_leads`**, so until now their `contact_method` edits were
  silently dropped (`NOT_STORED_FOR_SALES`). New `lead_set_contact_method(_lead_id, _method)` (migration
  `20261015110000`): `_require_work` first (own, non-client lead), accepts only `call` / `whatsapp`, writes
  that one column. `planSalesPatch` maps those two values to it; any other pill value stays a no-op for reps.
- **Side effect to know:** a called lead is no longer `isFreshLead` (it has a contact method), so Find
  Leads' "Remove untouched lead" toggle no longer offers it. This is why the 2026-10-05 tap used to write
  nothing; Paul's 2026-10-07 brief overrides it. Claimability is unaffected (it counts logged contacts).
- Tests: `scripts/contact-method-auto-select.test.ts`.

## Set by hand (2026-10-07, Paul)
The pill is a menu for admin (any method) AND a selling salesperson (Call / WhatsApp only, `REP_CONTACT_METHOD_OPTIONS` — the two `lead_set_contact_method` accepts). Flag `leadPermissions().setContactMethod`; offered on the Outreach row, the phone card and the lead window's Details tab (the existing Preferred channel menu). Tests: `scripts/contact-method-manual.test.ts`.
