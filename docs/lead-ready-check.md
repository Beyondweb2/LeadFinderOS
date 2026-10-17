# Lead ready check (2026-10-15)

> ⛔ **2026-10-17 (Paul): the "Needs info" tag, its one-click fix dialog and the add-time "still needs info" notice are REMOVED.** Find Leads now refuses a lead that cannot be added and counts it in the add summary (`docs/find-leads-bulk-add.md`). What remains below: the bulk audit skip list, the CSV import and Add a lead readiness lines.

**Problem.** Audits and sends were refused for a missing town, number, trade or name, and Paul only found out afterwards.

**Rule.** ONE function, `leadReadiness(lead, ctx)` (`src/lib/leadReadiness.ts`), says per feature what is missing. It
CALLS the gates' own predicates, never copies them:

| Feature | What it reads | The gate it mirrors |
|---|---|---|
| AI audit | `auditTownCheck` (`_shared/typed-town.ts`), name, `search_keyword \|\| category`, do-not-contact | bulk-jobs (now calls `auditTownCheck` itself), create-ai-audit's name and town gates |
| WhatsApp | `coldWhatsAppVerdict` with the WhatsApp markets switched on; opt-out; a name only for `TEMPLATES_NEEDING_REAL_NAME` | the drip / Inbox number + country rules, the sender's name rule |
| SMS | `isTextableMobile` with the SMS markets; the reason from the same number reading | `_shared/twilio-sms.ts` |
| Report offer | waits for a finished audit, then `reportOfferRefusal` | the report-offer check |

- **Pending is not missing:** a Coverage / Find Leads add looks up the phone and town itself, so those are "will be
  looked up" (`willLookUp`) and the check runs again on what was saved.
- **Needs info** = only what a person can fix on the lead (name, trade, town, phone). A country switched off, an opt-out,
  and a Google-found lead Google could not place (typing a town does not lift that gate) are shown but are not "info".
- **One contactable channel is enough:** a lead needs something for messaging only when neither WhatsApp nor SMS can reach it.
- `TEMPLATES_NEEDING_REAL_NAME` is mirrored (the sender is not bundled into the app); the test reads the sender's set.
- Computed on the fly. No migration. Opt-out / do-not-contact is read best-effort in the bulk audit dialog only; the
  server stays the authority.

**Where it shows.** Coverage multi-town add (before: pending lookups, fix name / town in place, add only ready;
after: re-check on what was saved, with a fix) · CSV import preview (grouped, fix name / town / number in place, import
only ready) · Add a lead (live "will still need") · Find Leads add (one notice after the lookups) · Outreach rows and
phone cards, Inbox header (`NeedsInfoTag`, tooltip, one-click `ReadinessFixDialog`: trade + town for both roles via
`lead_set_details`; name + phone admin only) · Run AI audits (skipped leads grouped, never sent).

**Columns.** `lead_source` joined `OUTREACH_LIST_COLUMNS` (53); the Inbox lead read gained `derived_town`,
`town_fetch_note`, `lead_source`, `import_batch` (all already in the sales view).

**Tests.** `scripts/lead-readiness.test.ts` — pins the server lines it mirrors, then runs 17 leads × 3 country-switch
settings × 2 openers through an oracle built from those server rules and through `leadReadiness`; plus every add path
and screen. Headless check (mocked data, desktop + phone): Coverage, Outreach, CSV import, Add a lead. The Inbox tag is
the same component and was not rendered headless.
