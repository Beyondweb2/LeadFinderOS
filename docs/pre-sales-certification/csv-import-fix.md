# CSV lead import fix (2026-10-05)

- **Branch and worktree:** `fix/csv-lead-import`, worktree `C:/Users/paulj/LeadFinderOS-wt/csv-lead-import`, off `origin/main`
  `9fd5a144`.
- **Status:** pushed, NOT merged, NOT deployed (parallel-session rule). The migration is NOT applied.
- **Where the rule lives:** `public.import_leads` (migration `20261010170000_csv_lead_import.sql`). The browser half is
  `src/lib/csvLeadImport.ts` + `src/components/CSVImportDialog.tsx`.

## 1. Root cause

- `bulkImportLeads` (`src/hooks/useOutreach.ts`) inserted each row straight from the browser with
  `list_type: 'imported'`.
- The live `outreach_leads_list_type_check` allows only `no_website` / `broken_website` / `manual`.
- So **every row was refused**. The loop counted refusals as "skipped" and never showed the error, and the dialog still
  said "Successfully imported N leads". The import has created nothing since the CHECK went in.
- Other faults in the same path:
  - Duplicates were judged by exact business name against the rows the browser happened to have loaded, then by
    `.eq('business_name')`. That is not the canonical rule (place id → phone → Maps link).
  - The browser chose every column. Nothing stopped a hand-made request from setting any field.
  - It was admin-only, and set no owner. Since the 2026-10-05 trigger, Paul's rows would have become his; there was
    no salesperson route at all.
  - The parser split on line breaks before quotes, so a quoted cell with a line break broke the row. It also kept the
    BOM in the first header, so `business_name` was never found in an Excel "CSV UTF-8" file.

## 2. The current representation (re-derived live, 2026-10-05)

| Fact | Live |
|---|---|
| `list_type` CHECK | `no_website`, `broken_website`, `manual` |
| Rows by `list_type` | all 5,550 = `no_website` |
| `manual` used by | `AddLeadDialog` → `sales_add_lead` (a lead a person adds by hand) |
| Origin record | `lead_activity` kind `lead_added`, `data.source` (already rendered as "Source: …") |
| Owner trigger | `trg_outreach_leads_added_by_owner` is LIVE |
| Canonical duplicate rule | `_lead_identity_rows` (place id → `phone_key` → Maps link), used by `sales_add_lead` and `lead_identity_lookup`; indexed on `phone_key(phone)`, `website_identity(website)`, `google_maps_url` |

**Decision:** an imported lead is `list_type = 'manual'`, which is how a hand-added lead is already stored. The CHECK
is **not** widened and no `imported` value is added. The ORIGIN is recorded where origin already lives: the lead's
history row `lead_added` with `data = {source: 'csv_import', import_id, file, row}`. History reads "Lead added ·
Source: CSV import".

## 3. New import behaviour

1. **Pick a file.** Up to `IMPORT_FILE_MAX_ROWS` rows and `IMPORT_FILE_MAX_BYTES`. The reader handles:
   - a UTF-8 BOM, quoted commas, `""` escapes and line breaks inside quotes;
   - CRLF / LF / CR, and blank lines;
   - `;` or tab separators.
   Row numbers match the spreadsheet: blank rows still count, and a multi-line cell is one row.
2. **Match the columns.** The eleven fields are auto-matched from common header names, and each has a picker:
   business name, contact person, phone, email, website, address, postcode, town, trade / category, notes and
   Google Maps link.
   - Only the business name is required, plus a phone or an email (the admin's existing add rule).
   - A repeated header ("Phone", "Phone") uses the first column and says so.
   - Unused columns are listed as "Not imported".
   - A bare "Owner", "Assigned To" or "Status" column is never matched to anything.
3. **Check rows (preview).** `import_leads(_commit = false)` runs every rule and writes nothing. The screen shows:
   - counts: rows detected, valid, invalid, repeated in file, already exist, new, fill in blanks, skipped;
   - every row that will not be added, with its spreadsheet row number and the reason in words.
4. **Import.** The same call with `_commit = true`, in parts of `IMPORT_BATCH_MAX` (one transaction each). The result
   screen gives the same counts and the same list.
5. **After it:**
   - The list refreshes.
   - For **Paul only**, the created leads go through `backfill-lead-towns`. That is the existing "verify as it
     lands" rule, chunked as before.
   - A salesperson's import is not town-checked. That function pays per lead and reads only the caller's own data
     rows, so it does nothing for them. This matches their "Add a lead" without a lookup today.

**Normalisation (server-side, in `import_leads`):**
- Whitespace is collapsed and blank means absent.
- The email is lower-cased.
- A website gets `https://` when it has no scheme.
- A postcode is upper-cased and added to the address unless the address already holds it.
- Notes keep their line breaks.
- Phone:
  - `+44 (0)…` loses the `(0)`;
  - exactly ten digits starting 1–9 (a spreadsheet dropped the leading 0) gets the 0 back;
  - otherwise the number is stored as given.
- Nothing is truncated: a value over its limit is an error naming the field.

**Invalid** (reported, never written):
- no business name;
- a phone with letters, or whose canonical key is not 9–15 digits;
- a malformed email, website or Maps link;
- neither a phone nor an email;
- a field too long.

## 4. Ownership

| Who imports | New leads |
|---|---|
| Paul (admin) | `assigned_to_user_id` = `added_by_user_id` = Paul; `user_id` = the book owner (Paul's data account) |
| A Ready-to-Sell salesperson | owned by that salesperson; `user_id` = the book owner (same as `sales_add_lead`) |
| A salesperson not Ready to Sell | refused (`usage_paused` — the guard's `not_onboarded`); no Import button either |
| No role / anon | refused (`no_role`); `anon` has no EXECUTE |

- The owner is `auth.uid()`, decided inside the function.
- The function reads **only** the eleven fields plus the row number from a CSV row. An `assigned_to_user_id`,
  `user_id`, `status`, `amount_paid`, `sold_by_user_id`, `list_type`, `campaign_id`, `is_archived`,
  `paid_signup_id`, `contract_total_payments` or `subscription_status` in the payload is ignored. The live test
  sends all of them and proves none landed.
- **The browser cannot nominate an owner.** The dialog sends only `_rows`, `_commit` and `_file_name`, and each row
  carries only mapped fields. The visual QA dumped the real calls to prove it.
- A salesperson can never import into another rep's pool or create an unassigned lead.
- Permission: `perms.importLeads` = admin, or a salesperson who is Ready to Sell (`src/lib/access.ts`). The Team
  page's matrix has a row for it.

## 5. Duplicate handling

The order is the canonical one first, then two "possible duplicate" checks:

1. **Inside the file:** an earlier valid row with the same phone key, Maps link, email, website identity or business
   name → "Repeats row N of this file". Not written.
2. **`_lead_identity_rows`** (the canonical lookup, under the same `phone_key` advisory lock `sales_add_lead` takes):
   - **Yours** → only blank contact / email / website / address / trade are filled. Never an overwrite, never on a
     client lead, logged as `details_set` with source "CSV import". Otherwise "Already in your leads".
   - **Someone else's** → skipped. Paul sees "Already owned by test1 — not changed". A salesperson sees "Already
     belongs to another team member" — no name, no id.
   - **Unassigned** → skipped and **never claimed**. Paul is pointed to Unassigned → Claim.
3. **Same website identity** (`website_identity`, chains filtered) → "Possible duplicate", skipped.
4. **Same business name (UK)** → "Possible duplicate", skipped. This keeps the admin add's existing name rule.

Nothing changes ownership. A lead id is returned only for a lead the caller now owns.

## 6. Invalid rows and failures

- Every row is validated first and reported with its reason. One bad row never sinks the batch: the live test sends
  120 rows with one bad email and gets 119 created plus 1 invalid, by name.
- Each write runs in its own sub-transaction. A row that fails to write (e.g. someone added the same business a
  moment earlier) is reported as **failed** and the rest of that call lands.
- Each call of up to `IMPORT_BATCH_MAX` is one transaction. If a call fails (network, guard), nothing from that call
  is written. The result screen says which rows were NOT imported and that everything before them was.
- Re-importing the same file adds only what is missing: earlier rows now read "Already in your leads".

## 7. No contact

- Every new lead is inserted with `status 'not_contacted'`, `next_action 'none'`, no campaign and no queue field.
- The function contains no call to a sender, queue, campaign launch or stage function.
- The rows it writes are the lead, its `lead_activity` (`lead_added`, optional `note`, `details_set`) and the Find
  Leads exclusion row in `outreach_history`.
- `lead_activity` / `outreach_history` have no trigger that sends anything (read live). The lead's assignment
  notification triggers are UPDATE-only.
- The live test checks that nothing was queued or sent for any imported row. The dialog says "Nobody is messaged,
  nothing is queued and no status changes" before the button is pressed.

## 8. Security

- **Server-side:** role, owner, the row cap (`v_max`, too_many_rows), the field allowlist and the usage guard.
- **The guard:** a new action `lead_import` in `protection_settings`:
  - added by the migration only when absent;
  - unpaid, so the prospecting pause never blocks it;
  - defaults in `DEFAULT_PROTECTION_LIMITS`, with `max_rows` = the per-call ceiling.
  Every preview and every import is one guard row with the row count as its units. A salesperson is limited per hour
  and per day; the admin is logged only. The Security panel words it "CSV lead imports".
- **No information leak to Sales:** a salesperson learns only "belongs to another team member" or "already in the
  system". That is less than `lead_identity_lookup` already tells them (which includes the owner's name). Their
  previews count against the same guard.

## 9. Tests

- **`scripts/csv-lead-import.test.ts`** (in `npm test`, 84 checks):
  - **Reading the file:** basic file, quoted commas, `""`, BOM + UTF-8, blank lines and row numbers, line breaks in
    quotes, `;` and tab, header-only, and a 150-row file.
  - **Columns:** mapping, repeated headers, and owner / status / commission / paid / user_id columns never mapped or
    sent; missing optional columns.
  - **Sending:** 1,201 rows → 3 calls; a failed call stops and names the rows not imported; guard refusal wording.
  - **Wording:** the admin sees the owner's name and a salesperson never does.
  - **Permissions** and the guard default.
  - **Source checks on the migration:**
    - allowlist only, owner = caller, `manual`, CHECK not widened;
    - no WhatsApp / queue / campaign / seller / payment field;
    - canonical lookup + lock, fill-blanks-only on the caller's own non-client lead;
    - name and id never leaked; per-row failure; grants; nothing sends.
  - **Wiring:** the browser no longer inserts leads, and the dialog only calls `import_leads`.
  - **History wording:** "Source: CSV import (file, row)", and a fill-in reads "from: CSV import" (`src/lib/salesCrm.ts`).
- **`supabase/tests/csv-lead-import.sql`** (live, rolled back, **40 checks**, migration loaded inside the transaction):

  | Area | Checks |
  |---|---|
  | Preview | writes nothing |
  | Invalid rows | five, each reason named |
  | Duplicates | the in-file duplicate points at its row; own lead → fill blanks (phone untouched); B's lead → skipped with no name / id; unassigned → skipped, not claimed; same name / same website → possible duplicate; own client lead → not filled |
  | Ownership | new rows are owned by the importer with `user_id` = book owner and `list_type` manual; **every injected protected field ignored**; Paul's import is Paul's even when the CSV names a rep; Paul sees the owner's name; salesperson B importing A's phone is refused without a name; B still cannot read A's lead |
  | History | the lead's history says CSV import; the note saved; the Find Leads history written |
  | Cleaning | `+44 (0)` and the dropped zero repaired |
  | No contact | nothing queued or sent |
  | Volume | re-import creates nothing; 501 rows refused; 120 rows with one bad → 119 + 1 |
  | Access | not-onboarded rep refused; no-role user refused; anon cannot execute |
  | Guard | logs every call |

  **Result 2026-10-05: 40/40.** One earlier run hit a deadlock with another session's DDL and rolled back; the re-run
  was clean.
- **Updated pins:**
  - `access-matrix.test.ts` — `importLeads` is now both roles (ready Sales).
  - `sales-shared-workflow.test.ts` — `bulkImportLeads` is gone.
  - `abuse-cost-protection.test.ts` — `lead_import` is a later action.
  - `pre-sales-final.test.ts` — the migration is a later release.
  - `next-action-human-only.test.ts` — one hook insert, plus the import's `'none'`.
  - `outreach-list-columns.test.ts` — `csvLeadImport.ts` names `contact_name` as an import field.

## 10. Visual QA

- **How it was done:**
  - A throwaway harness rendered the REAL `CSVImportDialog` with only `@/integrations/supabase/client` replaced by a
    stand-in `import_leads`.
  - It was built from the worktree and captured in headless Edge at 1280 px, and at 390 px inside an iframe.
  - The harness was deleted before commit.
- **The fixture CSV:** a BOM, quoted commas, a blank line, a repeated "Phone" header, "Status" and "Assigned To"
  columns, a bad phone, a missing name, no contact, a bad email, an in-file repeat, own / other rep's / unassigned /
  same-name rows, and accents.
- **Seen:** mapping with the repeated-header note; preview counts and every reason; result screen; salesperson wording
  (no owner name); "no business column" and "header but no rows" errors; phone layout (one column, the dialog
  scrolls, no sideways overflow).
- **Dumped from the page:** the calls carried only `_rows`, `_commit`, `_file_name`, and rows carried only mapped
  fields. "Status" and "Assigned To" were never sent.
- **Not seen:** nobody has seen it on the live app — it is not deployed. The stand-in server was for display only;
  the real rules are proven by the live SQL suite.

## 11. Deploy (an integration session or Paul — not this branch)

1. **SQL first:** apply `20261010170000_csv_lead_import.sql`, then read back:
   - `select proname, prosecdef, proacl from pg_proc where proname = 'import_leads'` — SECURITY DEFINER,
     authenticated EXECUTE, no anon;
   - `select limits -> 'actions' -> 'lead_import' from protection_settings where id = 1`.
   Then re-run `supabase/tests/csv-lead-import.sql`: expect 40/40.
2. **Edge function: redeploy `security-admin` straight after the SQL.**
   - It validates saved limits against `GUARD_ACTIONS`, and the old build refuses the new `lead_import` key
     (`unknown_action`). Until it is redeployed, a save on the Security panel fails.
   - The other functions that reach `src/lib/protectionLimits.ts` (through `_shared/protection.ts`) import only names
     this change did not touch, so their behaviour is identical. Redeploying them is optional.
   - `src/lib/salesCrm.ts` (history wording) is reached by `admin-overview`, `business-summary`, `conversation-triage`
     and `sales-performance`. None of them calls `activityDetail`, so their output is unchanged. Redeploying is optional.
3. **The SPA** ships with `main`. Before the SQL, Check rows would call a function that does not exist yet and show the
   database's "function not found" error — nothing is written, but it looks broken. So SQL first.
4. **What's New:** `2026-10-05-csv-import-admin` and `2026-10-05-csv-import-sales` are in `src/lib/whatsNew.ts`.
