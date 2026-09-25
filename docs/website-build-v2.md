# Website Build V2 — the foundation (2026-09-25)

V2 evolves V1 (`docs/website-build-v1.md`) in place. Same page (`/paid-clients/:leadId/website-build`),
same seven stages, same one read (`rebuild_context`) and one write (`save_website_build`), same
`outreach_leads.website_build` jsonb column. **No database migration.**

## What V1 had (kept)

Build mode (template / rebuild + style + copy ownership), the MCL Local Trades Template profile, the
Client Build Facts ledger (verified / needs approval / missing / rejected / N/A, preloaded from
onboarding, the lead row, the baseline and the crawl), page architecture + redirect map with loop /
chain / homepage-flood checks, the nine-item Build Pack (setup, capture, master, local, preview,
visual QA, SEO QA, production, final QA), the QA checklist, derived stage completion, and debounced
autosave with Saved / Saving / Not saved and flush-on-leave.

## Data model — `version: 2`

- **Versioned.** Every save writes `version: 2`. A row without it is V1 and is read through the
  V1 → V2 rules in `parseWebsiteBuild` (`src/lib/websiteBuildState.ts`):
  `build_mode 'template'` → `route 'template_rebuild'`; `build_mode 'rebuild'` →
  `route 'faithful_rebuild'` (rebuild_style kept as its fidelity); `deploy_status` →
  `preview_status` / `production_status`. An absent build_mode stays an absent route. The V1-only keys
  are dropped on the next save.
- Live data on 2026-09-25: **all four paid leads had `website_build = {}`** (V1's production test on SC
  Plumbing was reset after verification), so no stored V1 row existed to migrate. The V1 read path is
  covered by `scripts/website-build-v2.test.ts`.
- New fields: `route`; source (`source_site_url`, `source_still_live`, `source_platform`,
  `last_captured_at`); code (`dev_command`, `build_command`, `build_output_dir`); preview
  (`preview_status`, `preview_noindex_confirmed`); production (`production_status`,
  `custom_domain_status`, `www_redirect_status`); `design_references` (bespoke); `manifest` (Source
  Site Manifest: pages / assets / design / interactions / seo); `visual` (source URL, preview URL,
  widths default 1440/1024/768/390, per-family result not_checked / differences / approved);
  `promotion` (bespoke → template intent); `checks` (route-stage ticks). Facts gain `source_url` and
  `notes`. Crawl status is DERIVED from the stored crawl, never stored.
- Existing fields are reused, not duplicated: canonical domain = target domain, dev URL = localhost
  URL, the `trade` fact = trade/category, the `website` fact is the fallback source URL.

## Build routes (`src/lib/buildRoutes.ts`)

Faithful rebuild · Template rebuild · Bespoke / new trade. **Only the operator's click sets the
route** (one place in the page; a test counts it). The Template card wears "Recommended" when
`templateSuitsTrade` matches the trade fact against a template's trade / supported types — advice,
never a selection. Each route has a focus line and a tickable checklist for Intake, Capture,
Architecture and Preview. **Check keys are stored — never rename one** (it un-ticks every client).

Capture applies: faithful always; bespoke always (it is business discovery — with no site the capture
prompt becomes a discovery prompt); template only when there is an old site.

## Templates (`src/lib/websiteTemplates.ts`)

The MCL template is unchanged in substance and gains `version`, `trade`, `previewUrl` (blank — none
deployed), `optionalSections`, `imageRequirements` and typed **`forbiddenSeedValues`** (kind + value).
`leftoverNeedles` is now DERIVED from `forbiddenSeedValues` and equals the V1 list exactly (tested).
`findForbiddenSeedValues(text, template, verifiedValues)` is ready for the future QA gate. Seed values
live in the template definition only — a test asserts no MCL value is hard-coded in prompt code.

## Stage prompts (`src/lib/stagePrompts.ts`)

Eight: Recon, Capture, Architecture, Build, Preview Deployment, Visual Comparison, QA, Production
Deployment — a one-click strip in the header and a card on the matching stage. Each states the route
and carries only its stage's context (Recon ~1–2k chars; the Build prompt is `masterPrompt(…, {lean})`,
the V1 master without deployment / QA / definition-of-done). Production Deployment is refused until
Cloudflare project + preview URL + domain are recorded, and tells Claude to ask Paul in chat before
deploying. The Capture prompt asks for `capture/manifest.json` in exactly the shape the Capture step
imports. The V1 nine-item pack is still generated: its commands are on Build Pack, and the V1 master
+ QA prompts are under "Full brief (V1)".

⛔ A NEEDS APPROVAL value is never presented as confirmed: it appears only under "Detected but NOT
approved"; Recon / Architecture / Preview / Visual prompts carry no unapproved values at all (tested
with the detected lead-row phone).

## UI

Project details: one collapsible card under the header on every stage (open on Build Pack), grouped
Source / Target / Code / Preview / Production. Preview stage: Local preview vs Cloudflare Pages
preview side by side with the operator copy; Visual Comparison (faithful only) with a paste box for
Claude's per-family reply. Capture: Source Site Manifest panel (paste JSON; asset approvals; design /
SEO notes). Live: production statuses; bespoke shows "Promote to template — coming later" (disabled)
with the candidate intent fields.

Rendered through a throwaway harness (real page, fixture client, edge calls mocked, no network) on
2026-09-25: V1 fixture opened as Faithful rebuild with preview "deployed"; route switch autosaved
(`version: 2`) and survived reload; route-specific checklists changed; comparison reply recorded;
empty client opened with no route; all 21 route × stage views at 375px with no horizontal scroll
(two V1 buttons that overflowed were made to wrap). Clipboard writes are blocked in the embedded
browser, so Copy was not exercised there (the fallback toast was).

## Deploy

`paid-client-hub` imports `websiteBuildState.ts` (and now `buildRoutes.ts`) for the save rule — it
must be redeployed with any change to either, **before** the SPA (the old server would drop every V2
key on save). `paid-baseline` reads only `facts[].key/value/status`, unchanged — no redeploy needed.

## Next (not built)

Crawler → manifest; automatic GitHub / Cloudflare project creation; screenshot comparison; the
seed-value QA gate wired to a built site; template extraction (promote); a second template.
