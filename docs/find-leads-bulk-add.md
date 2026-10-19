# Find Leads: Add to CRM in one batch (2026-10-17) — every business addable since 2026-10-19

> **2026-10-19 supersedes the phone rule below** (section at the end). Every business is added; a duplicate is the
> only skip; WhatsApp is protected at every queue / send path instead. The 2026-10-17 text is kept as the record.

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

## 2026-10-19 — every business is addable; the add is fast (feat/coverage-addcrm-cleanup)

**Paul's decision (reverses 16 Oct):** add ALL selected businesses: landlines and leads with no phone included, UK,
Malaysia and Singapore alike. The only skip is a duplicate. No "Needs info", no popup: a small grey label beside the
number in Outreach ("Landline" / "No phone", `phoneLabelOf`). Leads the old rule skipped can simply be added again
(nothing stored them; the preview finds them new).

### The add, measured (mocks only: no real lookup or search was run)

The real engine (`runFindLeadsBulkAdd`) with 40 ZZ results and a mocked network that copies the live limits.
Each lookup is assumed to take 0.9 s (Place Details + the function's own reads); that figure was not measured live,
because a real lookup costs money. The database parts WERE measured live, on 40 ZZ rows in a rolled-back
transaction: preview 56–68 ms, save 175–263 ms of database time.

| | Before (origin/main 9c92e512) | After |
|---|---|---|
| 40 leads, total | **65.4 s** | **5.2 s** (8.2 s at 1.5 s a lookup) |
| Duplicate preview | 0.3 s | 0.3 s |
| Phone lookups | 64.8 s: 3 at a time, paced to 25 a minute by the browser, then waiting out the minute | 4.5 s: 8 at a time, no browser pacing |
| Save (one batch) | 0.3 s | 0.3 s |
| Added / skipped | 20 / 20 (10 landline, 10 no number) | 40 / 0 |
| 80 leads | (stopped at the limit) | 77.6 s: the guard's 40 a minute is waited out (40 retried), all 80 added |

What was slow: google-place-details had a fixed in-memory **30 a minute** counter in front of the real guard
(`guard_action('place_details')`, live: 40 a minute, 500 an hour), and the browser paced itself to 25 a minute
3 at a time to stay under it. A 40-lead add therefore always crossed a minute boundary.

The fix:
- the in-memory counter is removed; the guard (protection_settings) is the one limit;
- `PLACE_LOOKUP_CONCURRENCY` = 8;
- a 429 is waited out and retried (`LOOKUP_RETRY_DELAYS_MS`, about a minute in all);
- a hard refusal (403) stops further lookups but never the add;
- answers are cached for the page session (`LOOKUP_CACHE_MS`);
- a result that already has phone + address is not looked up;
- the one-batch save is kept;
- the list refreshes once at the end (one `crm-lead-added` event, coalesced by `useFindLeadsCrm`).

The bulk button reads "Checking 40…" → "Adding 23 of 40" → "Saving 40…", then the "Added N, skipped M" toast. A
second click does nothing (state + ref guard). The niche panel shows the same text. Only 7% of add-to-CRM lookups
in the last 14 days were cache hits, so nearly every add pays for real lookups — the speed comes from concurrency,
not the cache.

### WhatsApp: every place checked (none can send a template to a non-mobile)

| Place | Gate | Skip shown |
|---|---|---|
| Admin bulk "Queue for WhatsApp" (Outreach) | cold: `coldWhatsAppVerdict`; other templates: `classifyLineType` + `templateDestinationRefusal` (new) | "Queued N … n not queued — landline / no phone number (flagged No mobile)" |
| Admin per-lead queue toggle (`WhatsAppLeadControls`) | cold: the whole verdict (new: it used to queue a no-phone lead); any template: + the digit rule | toast "Skipped: landline, not sendable on WhatsApp." (new; was silent) |
| Sales bulk / per-lead queue → `sales_queue_opener` | `mobile_market` (SQL) | "Skipped: n no phone · n not a UK mobile" |
| Campaign launch → `sales_queue_opener` in chunks; Call campaigns never send | same | summed skip counts |
| Queue processor (drip), opener lane | cold: `isUkColdDestination` / `mobileMarketOf`; backstop `classifyLineType` + the digit rule (new) | lead flagged No mobile, `whatsapp_delivery_status` not_a_uk_mobile / non_mobile |
| Drip hook / contact follow-ups | need a real earlier send to the same digits | — |
| `send-whatsapp-message`: Inbox templates, Inbox bulk, Quick Close sign-up link, client-hub onboarding link, SubmissionsCard | cold: unchanged; **every other template: `templateDestinationRefusal` (new)** | `not_a_mobile`: "This number is a landline (not a mobile), so WhatsApp cannot reach it…" |
| Auto-reply drain, `audit_complete` pitch | **the digit rule (new)**; `first_reply` answers the number that messaged us | row `skipped_not_mobile` |
| Voice notes / media | open 24h window only (they messaged us) | `window_closed` |
| SMS (not WhatsApp) | `mobileMarketOf` | "No SMS" |

Proof: `scripts/whatsapp-non-mobile.test.ts`. Live, rolled back: `sales_queue_opener` on the four 19 Oct fixtures
answered `queued 1, skipped {no_phone: 1, not_a_uk_mobile: 2}`; nothing was left queued and no message exists.

### Calls

Call campaigns and the Outreach call list (`isCallableLead`) never read the line type, and browser calling reaches UK
01/02/03 and Malaysian / Singapore landlines (`callMarketOf`). A landline row keeps its Call button, with the grey label.

### Fixtures (19 Oct)

ZZ QA-A1 mobile (`ca4a1af0…`), -A2 UK landline (`c97e61db…`), -A3 Malaysian landline (`58e81f63…`), -A4 no phone
(`d24d08d8…`): all four were added by one live `coverage_add_leads` call. A3's national "03-0000 0002" and A2's
landline were recognised as already added (yours · Paul) by `lead_identity_lookup`. All four were archived, with
contacts cleared; their `metric_exclusions` rows (lead + phone) stay.
