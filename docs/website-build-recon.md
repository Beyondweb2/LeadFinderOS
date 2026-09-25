# Website Build — Phase 2: Source Site Recon + Capture Engine (2026-09-25)

Builds on V2 (`docs/website-build-v2.md`). **Claude Code crawls; LeadFinderOS orchestrates and stores.**
No crawler was built. Flow on the Capture stage: existing website URL → Copy Recon Prompt → Claude Code
→ Import Recon Result (checked, summarised, then merged) → Needs Review.

## Modules

| | |
|---|---|
| `src/lib/reconSchema.ts` | The recon result schema (`reconVersion: 1`) + its rules — printed into every prompt that asks for it, so prompt and importer cannot drift. Leaf. |
| `src/lib/recon.ts` | `reconPrompt` (route-aware), `parseReconText` (safe import + summary), `applyRecon` / `mergeManifest` (the merge). Browser-only. |
| `src/lib/manifestSummary.ts` | Per-route manifest summaries for the Build and Architecture prompts, fenced as data; `pageFamilyGroups`. |
| `websiteBuildState.ts` | `recon` record (timestamps, totals, review list), manifest additions (page `status_code` / `sections`, asset `page_url` / `suggested_filename` / `ownership`, `redirect_candidates`), `reconStatus` / `reconInventoryReady` / `openReconReview` — status is DERIVED, never stored. |

`MAX_MANIFEST_PAGES` rose 300 → 600 (a full faithful crawl; MCL had 289 legacy URLs).

## Import

Accepts raw JSON or a Claude reply containing a ```json block (the last block that parses; else the
outermost `{…}`). Refused, with a reason: over `MAX_RECON_INPUT_CHARS` (2 MB), no JSON, invalid JSON,
not an object, an unsupported `reconVersion`, a list field that is not a list. A missing
`reconVersion` is read as v1 **and said so**. Before anything is saved Paul sees counts, page families,
every item not imported and why (bad URL, empty, over a cap) and every top-level key LeadFinderOS does
not store — then Import or Cancel. JSON.parse only; http(s) URLs only (`safeUrl`); control characters
stripped; every string and list capped. Imported text is rendered as text; links only via `safeUrl`
with `rel="noopener noreferrer"`; thumbnails `referrerPolicy="no-referrer"`.

## Fact merge rules (`applyRecon`)

Facts are grouped by ledger key (field aliases → the template fact keys; unknown → `custom_<label>`);
list keys (services, areas, credentials, brands, profiles, prices, guarantees, insurance, legal,
reviews on site) collect items; scalar keys with >1 distinct value are a contradiction. Phones compare
digits-only.

- **Already VERIFIED** (onboarding or Paul): never overwritten. If the site disagrees → a review item
  beside it ("kept").
- **Paul rejected / N/A**: left as decided (review item if the site disagrees).
- Otherwise: VERIFIED from source (`source: "source site (recon)"`) only when every observation is
  `confidence: high` + `evidence: visible`, no conflicts were flagged, one value, and nothing
  LeadFinderOS holds disagrees. Anything else → NEEDS APPROVAL with the reason in the notes; a
  contradiction also becomes a `conflict` review item naming every value. On a disagreement the value
  LeadFinderOS already showed is kept; the site's values are named — nothing replaced unseen.
- Source URL, source context and notes are kept; a re-import adds no duplicates and keeps Paul's
  dismissals.

Paul's decision (brief, 2026-09-25): a fact directly visible on the source site defaults to verified.
This is looser than the V1 rule for the crawl ("crawl only DETECTS"); it applies only to recon facts
Claude marks high + visible, and never over anything LeadFinderOS already holds.

## Review, families, assets, completion

- **Needs Review** reuses the fact ledger (`FactRowEditor` — the same Approve / Reject / N/A / Edit
  control as Intake). Conflicts clear when their fact is decided; unknowns can be parked ("Wait for
  client"); warnings dismissed. Also lists other needs-approval facts and required-missing facts.
- **Page families**: counts from the manifest pages, each opening to its URLs.
- **Asset inventory**: USE / REVIEW / IGNORE are labels on the stored `approved / pending / rejected`
  tokens. Everything imports as REVIEW; nothing is downloaded (ready for a download step).
- **Recon status**: not started → prompt copied (a copy timestamp) → imported → needs review →
  complete. **Capture is DONE once a recon with a page inventory is imported** (or, with no site to
  crawl, once imported at all) — unknowns do not hold it. The V1 manual "Captured" still counts.
- Redirect candidates never enter the approved map by themselves; Architecture has a button to add
  the ones with a target.

## Prompts

The Recon prompt (header strip + Capture) is now the full route brief: faithful = entire-site crawl,
structure, design system, assets with filenames, SEO/tracking, screenshots at 1440/1024/768/390, "do
not redesign"; template = business first, "the source site's design is not automatically the target",
still the URL inventory / metadata / schema / redirects; bespoke with a site = facts, evidence,
architecture, conversion flow; bespoke without = a structured missing-information list, nothing
invented. It shows only VERIFIED facts. The local Capture prompt now writes `capture/recon.json` in the
same schema (one import path; the V2 `manifest.json` paste box is gone).

The Build prompt (lean and V1 master) gains a fenced per-route manifest block: faithful = families
with examples, design system, interactions, USE assets, open redirect candidates; template = old
families briefly, brand fonts/colours only, USE assets; bespoke = families, design as reference. The
Architecture prompt gains the imported families. Never the raw JSON.

## Verification (2026-09-25)

`scripts/website-build-recon.test.ts` (157 checks) plus the V1 / V2 suites. The real page was rendered
in a throwaway harness (edge calls mocked, no network): paste of a markdown reply → summary → Import →
autosave (route, plan, redirects, QA, preview untouched) → Needs Review decisions and asset USE saved and
survived reload; malformed paste refused with a clear error; all 21 route × stage views at 375 px with
every disclosure open, no horizontal scroll.

## Next (Phase 3, not built)

Asset download step (USE assets → local files + `location`); screenshots attached to pages; the
seed-value QA gate against a built site; a deterministic diff of old URL inventory vs the built sitemap.
