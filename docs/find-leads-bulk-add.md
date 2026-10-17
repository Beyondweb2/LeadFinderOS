# Find Leads: Add to CRM in one batch, UK mobiles only (2026-10-17)

Paul's brief: bulk Add to CRM in ONE batch with the duplicate check kept and an "added N, skipped M" summary;
the "Needs info" tag and feature removed; UK landlines skipped.

## What it does

Every Find Leads add — the row button (a batch of one), "Add to CRM (N)", "Add all" and "Add all with emails" —
goes through `src/lib/findLeadsBulkAdd.ts` (`runFindLeadsBulkAdd`, network injected; the hook is
`src/hooks/useFindLeadsBulkAdd.ts`):

1. One free preview call to `coverage_add_leads(_commit=false)` (migration `20261031090000`, live, unchanged):
   which rows are new. The database is the dedupe (place id → phone → Maps link, same name + country, added
   before, same website, repeated in the batch).
2. A Place Details lookup for each NEW lead, paced under google-place-details' 30/min (`PLACE_LOOKUPS_PER_MINUTE`).
   Google's text search returns no phone, so this is the only way to know a landline before adding. A limit
   refusal stops the lookups; those rows are "limit reached", never added blind.
3. The phone rule `findLeadsPhoneSkip`: UK = by the DIGITS (44 then 7, the cold-WhatsApp test). Every other UK
   number (01/02/03/0333/0808/0800/0845…) = landline. A UK (or blank-country) lead with no number = no number,
   even with an email. Non-UK (Malaysia, Singapore, Australia): unchanged — a phone is added; no phone keeps the
   old rule (kept with an email). A failed lookup with no number = "could not be looked up", not added.
4. ONE committing `coverage_add_leads(_commit=true)` call (chunks of 500, the function's ceiling).

Summary toast: `Added N, skipped M` + reasons (already in CRM · landline · no number · could not be looked up ·
limit · no search).

## What changed beyond Find Leads

- The "Needs info" tag (Outreach desktop + phone card, Inbox header), its fix dialog and the add-time "still needs
  info" toast are deleted. `leadReadiness` stays for the bulk audit's "will be skipped" list, the CSV import's
  optional "import only the ready ones" and the Add a lead dialog's lines (both outside Find Leads; untouched).
- `useOutreach.addLead` is unchanged and still used by Coverage's niche panel (outside Find Leads): that path still
  adds landlines. Making it match = route NichePanel's add through `useFindLeadsBulkAdd` too.
- Search adds through `coverage_add_leads` log `lead_activity` with `via: coverage_multi_town` (the function's own
  label) and do not write `log_usage_event('business_added')`; `guard_action('lead_add')` still counts each lead.
  Social links found at search time are no longer copied onto the lead (CLAUDE.md: never write those columns from code).

## Call lists (open decision — not changed)

Call campaigns take leads from Find Leads, so from today Find Leads gives a Call campaign mobiles only. If Paul
decides landlines belong in call lists, the change is one flag: pass the chosen campaign's method into
`runFindLeadsBulkAdd` and let `findLeadsPhoneSkip` accept a UK landline when the campaign is a Call campaign
(browser calling already reaches 44 1/2/3 numbers — `outreachMarkets.ts`). Existing call-list leads are untouched.

## Proof

- `scripts/find-leads-bulk-add.test.ts`: 22 fixtures (9 UK mobiles, 5 landlines incl. 0333/0808/+441, 3 duplicates,
  2 no number, 1 failed lookup, Malaysia, Singapore) + an on-screen repeat → 1 preview, 1 save of 11, "Added 11,
  skipped 11", right reasons; a lookup limit; a refused call; >500 rows chunked.
- Live, production, rolled back: one `coverage_add_leads` call as the admin with 22 ZZ rows → 20 created, 2 skipped
  (already_yours, duplicate_in_batch); 0 rows left after (the DO block raised to roll back).
