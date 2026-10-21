# Australia: find, audit and call — prospect-only (2026-10-21, branch `feat/australia-coverage`)

Scope: `C:\Users\paulj\Documents\Findable\australia-scope-2026-10-21.md`, pieces C (town table) and D (state in the key,
wrong-town guard), plus the prospect-only rule. Not built: Australia as a WhatsApp/SMS market, per-lead time zones,
pricing/checkout for Australian clients (all Paul decisions or later pieces).

## The town list

- Source: ABS Census 2021, Urban Centres and Localities (UCL). Population from the ABS Data API (`C21_G01_UCL`, total
  persons); state + boundary from ASGS Edition 3 (geo.abs.gov.au). CC BY 4.0, credited on the Coverage page.
- `scripts/build-australia-towns.mjs` downloads both and writes `src/data/australiaTowns.ts` (726 rows). Re-run it to
  refresh; never hand-edit the data file.
- Kept: Urban Centres with 1,000+ residents. Dropped: "(L)" localities (200–999), the ABS bookkeeping rows, Other
  Territories. A cross-border centre keeps each part's own name (Albury NSW / Wodonga VIC); a joined name keeps its
  first town (Forster NSW, aka "Forster - Tuncurry").
- The point per town is the area-weighted centre of its largest boundary ring.
- **No migration.** The list is bundled in code, the same pattern as Malaysia (`src/data/malaysiaPlaces.ts`). `uk_towns`
  is untouched, so UK Coverage cannot regress, and nothing waits on the one-session-migrates rule.

## The state rule (src/lib/australiaTowns.ts)

- An Australian town is ALWAYS written `Name STATE` ("Ballarat VIC"): the Coverage row, its key, the Find Leads search
  ("Ballarat VIC, Australia"), the stored `coverage_town`, and the audit question's town.
- Same-name towns in this list: Perth WA/TAS, Maitland NSW/SA, Maryborough QLD/VIC, Portland VIC/NSW, Mount Barker SA/WA.
- A bare name in two states is `ambiguous` and is never guessed: it stays as written (its own Coverage row).
- The state of an address comes from the state word, else from the postcode range (`auStateOfPostcode`).

## Coverage

- Australia is the fourth country in the picker (`coverageCountries.ts`). Region = the state's full name.
- Population band: its own remembered setting, default **10,000–250,000** (`AU_BAND_DEFAULT_MIN/MAX`) = 120 mid-size
  centres. Above 250,000 are the 11 metropolitan areas (Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast,
  Canberra, Newcastle, Central Coast, Sunshine Coast, Wollongong), worked suburb by suburb. Clear the boxes for all 726.
- The figure is the ABS count, shown without "≈" (Malaysia/Singapore keep "≈").
- The coverage endpoint gives an Australian lead its town WITH its state: `coverage_town`, else Google's town + the
  state from its own address.

## In-town check (search) and wrong-town guard (audit)

- `inTownVerdict` Australian order: the state (a different state → OUT, `other_state`), then a name match, then
  distance from the searched town's geocode, sized by the ABS population. No "different suburb → OUT" step: an urban
  centre is many suburbs.
- search-leads sizes an Australian town from the ABS list, never `uk_towns` (Perth/Newcastle would take the UK size).
- create-ai-audit: the question town gets its state (`withAuState`), then `australianTownCheck`
  (`_shared/town-distance.ts`): wrong state → BLOCK (overridable); otherwise the UK thresholds from the ABS centre.
  A metropolitan area (250,000+) is never distance-checked (its own suburbs are 40 km+ from its centre), only the state.
  A verified Coverage town gets the state check only. A wrong-state block sends `distance_km: null` and the AI Audit
  dialog says "may not be in" instead of "0 km".

## Prospect-only (src/lib/prospectOnly.ts)

One rule (`prospectOnlyLead`: country, or an address ending "Australia"; `prospectOnlyNumber`: +61):

| Surface | What happens for Australia |
|---|---|
| Report (`render-audit-report` → `prospectOnly`) | No sign-up button, no guarantee/refund line, no offer sentence in the no-website panel. Request a call and Ask me anything stay. |
| Quick Close | `save`, `approve_review`, `generate_link`, `share_link`, `share_setup` refused (`prospect_only_country`); an existing link is never handed over. Call notes and the email still save. |
| findable-checkout | Refused before Stripe (403 `prospect_only_country`, recorded in `client_error_reports`). |
| link-template-vars | No sign-up / set-up link variable is built. |
| send-whatsapp-message | A template carrying a sign-up/onboarding link (by its variables) or a £ template is refused to +61. |

Cold WhatsApp to Australia stays refused by the existing rules (+61 is not a market, not a UK cold destination);
`scripts/australia-coverage.test.ts` pins that too.

## Deploy list (when Paul says)

SPA (Coverage, AI Audit dialog, What's New). Edge, by hand: `coverage`, `search-leads`, `create-ai-audit`,
`render-audit-report`, `quick-close`, `findable-checkout`, `send-whatsapp-message`, plus every function that reaches
`_shared/link-template-vars.ts`, `_shared/town-distance.ts`, `src/lib/inTown.ts`, `src/lib/coverageCountries.ts` or
`src/lib/findLeadsBulkAdd.ts` (walk with `node scripts/check-import-graph.mjs --reached-by <file>`). ⛔ Skip
`whatsapp-status` (held).
