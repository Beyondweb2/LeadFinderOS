# Website Build — Phase 3: Template Mapping + Build Preparation (2026-09-25)

Builds on Phase 2 (`docs/website-build-recon.md`). For a TEMPLATE REBUILD: source recon → approved
client data → selected template → a generated client config, with as little manual work as possible.
No GitHub / Cloudflare automation.

## A. Risk-based approval (`recon.ts` — `LOW_RISK_FACT_KEYS`, `STRONG_CLAIM`, `isHighRiskFact`)

- **Low-risk** (auto-accepted when visible, high-confidence, one value, nothing disagrees): business
  name, trade, phone, email, website, social / directory / review-profile links, base town. Stored
  with `basis: 'source_site'` ("verified from the source website"). Page URLs, headings, assets and
  design are manifest data, not facts.
- **Everything else is high-risk** (positive allowlist — an unlisted key is never low): prices, hours,
  24/7, guarantees, insurance, qualifications, DBS, memberships, accreditations, awards, ratings, years
  trading, payment methods, VAT, legal status, address, service areas, licences, compliance, tracking /
  ads IDs, owner, WhatsApp, anything custom. Always NEEDS APPROVAL, with the reason in the notes. A value
  carrying a strong-claim word (approved / certified / best / leading / 24/7 / insured…) needs approval
  whatever its key.
- **Services** from the site are SOURCE-DERIVED CANDIDATES (`recon.services`, from service facts and
  service pages); the ledger's services fact is never auto-verified. **Towns** likewise (`recon.towns`).
- Verified facts are never overwritten (unchanged from Phase 2).
- `BuildFact.basis`: `operator` (Paul approved — set by `decide`), `source_site`, `client` (onboarding).
  Editing notes keeps the basis.

## B. The template field model (`websiteTemplates.ts`)

A template DECLARES: `fields` (id, group identity / business / proof / commerce / tracking, label,
requirement required / optional / conditional + `requiredWhen`, source = a ledger fact / the project
domain / an operator choice, `configPath`), `serviceCatalogue` (id, name, synonyms), `minServices`,
`assetSlots` (requirement, multiple, suggestion types + words), `locations` policy
(`primaryLocationPage`). `CORE_FIELDS` / `CORE_ASSET_SLOTS` / `CORE_BUILD_MODEL` are the trade-agnostic
core; MCL extends them (mobile-or-premises choice, conditional address, 24/7, DBS, memberships, payment
methods, ads; 9 locksmith services; van / map slots; logo required). The engine contains no trade
words (tested).

## C–J. The engine (`templateMapping.ts` — `computeMapping`, pure)

- **Fields** map by priority: 1 verified client fact · 2 recon fact Paul approved · 3 low-risk source
  fact · 4 needs approval · 5 missing — each with its source label. The ledger holds one value per key,
  so the rank labels provenance; it never re-resolves. Editing in the mapping writes the ledger
  (approved by Paul) — one approval system.
- **Services**: every candidate is scored against the catalogue (longest synonym wins; multi-word or
  exact synonym in the name = high, single word / URL-only = medium). Verified or high → included
  (pre-selected, easy to untick); medium → needs review; nothing named → not found (never fabricated).
  Unmatched candidates are listed to map to a catalogue service or ignore (`mapping.candidate_map`).
- **Locations**: base town + verified areas + recon towns. *Serves this area* (default on only when
  verified) is separate from *Dedicated page* (default OFF except the template's base-location page;
  impossible for a town not served).
- **Assets**: slots suggested from type + purpose words; assign / unassign / auto-assign (fills empty
  slots, USE only). An assigned REVIEW / IGNORE asset stays out of the config and is named as omitted.
- **Readiness**: counts Ready / Needs approval / Missing required / Optional missing; blocks on missing
  or unapproved required data, fewer than `minServices` services, a required slot without a USE
  asset, or a blocking seed value. Optional items are omitted, never invented. The Build Pack stage is
  not done while there are blockers (`StageInputs.buildBlockers`).
- **Config**: only `ready` values, at their `configPath` (lists as arrays); included services with
  their evidence; served towns and dedicated pages; USE assets per slot; plus an omitted list.
- **Contamination** (`scanSeedValues`, whole-word): identity seed values (name, owner, phone, email,
  domain, address, image) always block; towns / credentials / profiles / brands block unless the
  client or Paul confirmed the same value (a site auto-accept does not count); trade words and claims
  warn. The seed client's own build skips the guard and says so. Scans the generated config now; the
  same function takes built output later.
- **Old URL → new plan** (`urlDecisions`, read-only): every manifest / plan old URL → KEPT / REDIRECTED
  / RETIRED / UNRESOLVED, flags for no decision, planned-but-not-in-the-map, homepage, unrelated page,
  destination not in the plan, chains, several old URLs into one ordinary page.

## H / M. Prompts

- **Asset Download** (new stage prompt, Build Pack): template = USE assets assigned to a slot;
  faithful = every USE asset; bespoke = assigned USE, else every USE. Originals kept, web copies,
  safe names, once per URL, never hotlink, nothing off-list, failures recorded in `downloads.csv`.
  LeadFinderOS itself downloads nothing.
- **Template Build prompt**: new section `E2. GENERATED CLIENT CONFIG` — the config JSON (not the raw
  recon), readiness, selected services only (the rest named for removal), location pages only, assets
  only from the config, omitted items, schema derived from the config (no street address when mobile),
  tracking only from the config, the seed values, and open unknowns. Flagged when the mapping is not
  ready.

## N. Faithful / Bespoke

No template, no service or location mapping: `CORE_BUILD_MODEL` gives core fields, core asset slots,
readiness ("Build preparation") and the old-URL view.

## Verification (2026-09-25)

`scripts/website-build-mapping.test.ts` (137 checks) plus the V1 / V2 / Phase 2 suites. The real page
was rendered in a throwaway harness with a Harbour Locks (Whitby) fixture: mapping panel, choice /
domain / serves / deselect edits autosaved, assets marked USE then auto-assigned → READY TO BUILD, config
without unapproved values; 42 route × stage × width views (375 / 390 px) with every disclosure open, no
horizontal overflow.
