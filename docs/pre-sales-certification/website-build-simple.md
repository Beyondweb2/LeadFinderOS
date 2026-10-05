# Website Build — simple operator flow

- **Date:** Monday 5 October 2026. **Branch:** `feature/website-build-simple`, cut from `origin/main` at `53bfece6`
  (proved equal before branching; it already held the sales workspace v2 + opener contact-guard fixes).
- **Principle:** complexity in the background, simple for Paul. Every Website Build V2 safety rule stays; Paul sees
  only what needs a human decision.
- **Code:** `src/lib/simpleBuild.ts` (all rules), `src/components/SimpleWebsiteBuild.tsx` (the screen),
  `src/pages/WebsiteBuild.tsx` (default view = simple; `?view=advanced` = the old command centre, unchanged).
  Small shared changes: `websiteBuildState.ts` (review items, gate-answered ticks), `websiteLaunch.ts` (reads them),
  `buildExecution.ts` (strength inventory in the result; X5d / X6 lines extracted into `enquiryFormLines` /
  `seoVisibilityLines`, byte-identical), `buildPack.ts` (three helpers exported).

## Old vs new

| Before | Now |
|---|---|
| 7 stages, ~10 prompts, ~20 PowerShell blocks, 23 QA ticks, Paul decides every fact, page, strength, intent and asset before a prompt exists | 5 steps: Gather → Prepare → Build → Review → Launch |
| Paul pastes a recon, maps services and towns, writes the page plan, inventories strengths | **Prepare Website** does it; Claude inventories strengths inside the build |
| Many prompts | **One Master Build Prompt** + a correction prompt + a launch prompt |
| Checklists of things that are fine | **Needs you** lists only material problems |
| 20 preview ticks | **8 review checks** after the preview exists; the technical ticks are answered by the site gate |

## Build types (derived from the route Paul clicks — never stored, never inferred)

| Type | Route fields it sets | Notes |
|---|---|---|
| A. New site — Findable template | `template_rebuild` + the template (auto-selected when there is only one) | Does not imitate the old site |
| B. Visual rebuild / improvement | `faithful_rebuild` + `new_design` | Old site = brand/content reference; no CMS access needed; marketing copy rewritten |
| C. Close recreation | `faithful_rebuild` + `replica` | Needs reproduction rights: onboarding `site_rights = yes` (recorded as `client_permission`) or Paul's click "the client has confirmed". `no` → only "switch to Visual rebuild". Never copies third-party template code |
| D. Improve existing site | nothing | Optimise — sends Paul to the page generator. An Optimise client (by plan) sees only that card; the master prompt refuses |
| Bespoke (legacy) | unchanged | BS4's record reads as "Bespoke build (set up earlier)" — not converted |

## Truth hierarchy (Prepare Website)

Client-confirmed > onboarding / sales record > the client's own public website (stored crawl) > sales notes >
Discovery / baseline. Prepare accepts **only** contact-identity facts (`business_name`, `trade`, `phone`, `email`,
`website`, `opening_hours`, `company_number`) and the client-submitted home town, and only when no source of equal or
higher standing contests them (`contestOf`: a Discovery / baseline / earlier-audit disagreement is "weak" and the higher
source wins). The client's own onboarding answer beats the lead record on name / trade / home town; a **phone, email or
address clash is never settled automatically** (blocker with both values). Services, areas, credentials, guarantees,
years, people and prices are never auto-accepted. Services for pages come from Workstream 4's truth
(`siteTruthFromBuild`); a service on both the offered and not-offered lists blocks. A website URL only a Discovery scan
offered is never the "current site" (`currentWebsite` / `trustedOldSite` — since 2026-10-05 the Advanced page reads the
same rule; `advanced-website-truth-fix.md`).

Prepare also fills (never overwriting): repo name, GitHub owner `Beyondweb2`, folder `C:\Users\paulj\<Repo>`,
Cloudflare project / Git-connected / account `beyondwebcraft` (BS4's setup), the web address from the current site's
host (not a platform sub-domain), the automatic page plan (home, services hub + one page per confirmed service when ≥2,
areas hub only with ≥3 verified areas, about, contact, privacy — **no town pages**), every content intent assessed, and
the enquiry form switched on to the verified email when `siteFormProblems` passes (the same rule the server uses). If the
lead has no crawl and has a site, Prepare starts the free crawl and prepares again when it finishes.

## What blocks the build (blockers) — and what does not

Blocks: Optimise client · unsettled Build/Optimise route · no business name · no phone and no email · a contested
phone / email / address / name / home town · a service both offered and not offered · a rebuild with no trusted current
site · close recreation without rights · no web address · a template that cannot be filled (in Paul's words, e.g. "has
no pages for this client's services").

Shown but **not** blocking ("decide"): home town not confirmed, services from sales notes, no services confirmed, an
unconfirmed credential / guarantee / experience claim (one-click confirm), a template built for another trade.
Before launch only: domain handoff ("Preview can be built now. Domain handoff required before launch."), no form email.
Never flagged: no photos, no CMS access, no Google profile, no Checkatrade badge, no home-town page.

## Assets

The master prompt lets Claude reuse the business's own logo, photos (team, vans, premises, jobs) and graphics from the
current site; it must NOT assume ownership of stock, manufacturer imagery, platform/directory badges, other logos or
agency artwork — each is reported as `ASSET CHECK: <url> — <why>` and shown to Paul after the build. Badges only for a
verified membership; never fake. Assets Paul already approved as client-owned in Advanced are listed first; an approved
asset not recorded as client-owned is never downloaded (`assetsToDownload`, unchanged).

## The Master Build Prompt (`masterBuildPrompt`, `MASTER_PROMPT_VERSION = master-build-1`)

Refused (no text) until Prepare has run and no blocker stands. Sections: 1 client facts + confirmed / not-offered
services · 2 not to be published (+ template claim mapping, must-not-say) · 3 build type · 4 the current website (Claude
opens and reads it itself, strength inventory, `FACT CHECK` for trust claims only the old site states, every old URL to
a 301) · 5 assets · 6 site plan (page plan or the template's generated config + the Site Intent Map expect file) ·
7 content (question → answer → detail → evidence; quality standard) · 8 AI visibility + technical (Findable standard,
schema / breadcrumbs, OAI-SearchBot fetch) · 9 design · 10 functional (contact, site-enquiry form, privacy page, map) ·
11 quality gate (DO NOT INVENT + build standard) · 12 set up / build / preview deploy · 13 **open the current live site
and the new preview side by side** and compare branding, layout, missing content, facts, service coverage, imagery,
navigation, contact info · 14 QA + the Findable site gate · 15 report (plain English, then the build-result JSON, now
with optional `quality.strengths`). Copying it records `build_execution.started_at` + the config fingerprint.

## Terminal / operator steps shown

1. (first time) github.com/new — owner Beyondweb2, the repo name, Private, nothing ticked. 2. PowerShell:
`New-Item -ItemType Directory -Force -Path "C:\Users\paulj\<Repo>" | Out-Null; Set-Location "C:\Users\paulj\<Repo>"; claude`
3. paste the prompt. 4. let it build (Cloudflare one-time dashboard steps folded underneath). 5. paste Claude's last
message into "Paste Claude's result". 6. open old site + preview side by side (Win+← / Win+→). 7. review here.

## Automatic technical gate, review, corrections, launch

- **Technical check** = the imported result through the existing rules (`previewReadyProblems`: site gate on dist and on
  the preview, quality standard, build standard) plus unresolved redirects. Paul sees "✓ Passed" or the failures;
  "View technical details" folds the rest.
- `GATE_ANSWERED_QA` (assets_load, no_broken_links, seo_geo_qa, schema_valid, sitemap_robots, canonicals_domain,
  old_urls_handled) are answered by the gate **only** when the result is preview_ready with no problem
  (`gateAnsweredQa`); `productionReadiness` reads `outstandingPreviewQa`. Every preview QA key has exactly one owner
  (a review item or the gate) — swept by the test. A later non-ready result takes the answers away.
- **Review** = 8 checks (`SIMPLE_REVIEW_ITEMS`), each setting the existing QA keys it owns.
- **Corrections**: Paul's plain-English lines + main CTA + the technical failures → the existing `correctionPrompt`
  (one prompt, same folder / preview, ends in a new result).
- **Launch**: only when the one launch rule is empty → READY TO LAUNCH, the existing production prompt, then paste the
  live gate report; a passing `--url` report records production URL / verified / domain active / deployed / checked in
  one save (the server's `websiteBuildSaveRefusal` judges it with the same rule).
- **Domain**: an unsettled domain never blocks the preview; production stays blocked until it is settled (client access,
  authorised agency / provider DNS change, or a new domain — never a takeover).

## Tests

`scripts/website-build-simple.test.ts` — 145 checks: simple workflow (type choice, Prepare, zero blockers for an ordinary
client, one prompt with every section, exact PowerShell, old + preview, review after build), truth (client list beats
sales notes, not-offered excluded, Discovery never a fact or a site, unsupported / out-of-area baseline questions own no
page, unapproved areas never pages, contested phone blocks, service contradiction, no name / no contact), build types
(template end to end, visual without CMS, close recreation rights unclear / refused / yes, Optimise refused, unsettled
route), assets, technical gate (no report / failing check / pass / stale), domain, corrections, BS4-shaped legacy
record, one owner per QA tick, wiring. `client-copy-claims` now scans both new files.
`npm run check`: typecheck at the 9-error baseline, edge syntax / undefined / import graph clean, build, **312/313** —
the one failure, `manual-onboarding` (findable-site wording vs the stale local findable-site checkout), fails identically
on untouched `origin/main`.

## Visual QA

A throwaway harness (real `WebsiteBuild` page, fixture client "ZZ QA Brookfoot Plumbing & Heating", stubbed
`invokeEdge`, no network; deleted before commit) rendered: build-type choice, chosen, needs-you (contested phone + close
recreation rights), ready (master prompt + steps), technical failure, review, ready to launch, Optimise, template, and
Advanced — desktop 1440 and mobile (390 iframe), headless Edge. Clicked through choose → Prepare → paste result →
8 ticks in the Browser pane: status moved to "Approved — 1 thing before launch" (the fixture's unsettled domain).
No sideways scroll at 375 px on any simple state. Fixes made from it: button contrast inside coloured cards, the
Advanced link wrapping on phones, the build steps folding away after a result, plain wording for two launch lines.
Nobody has seen it with a real sign-in.

## Open items

- The only template is the MCL locksmith template: a non-locksmith New-site client with no old site is blocked with
  "has no pages for this client's services" → Bespoke in Advanced until a trade template exists.
- ~~The Advanced page still treats a Discovery-only "Current website" fact as the source site~~ — fixed 2026-10-05
  (`advanced-website-truth-fix.md`).

## Deployment (5 October 2026)

- `main` merge `592656f8` (from `origin/main` `53bfece6`, unmoved before the push; HEAD == origin/main proved after it).
- No SQL (no new stored key: the build type is derived; review ticks are the existing QA booleans).
- Edge, deployed from the merged tree after the push was confirmed: **`paid-client-hub`** (launch rule — verified: the
  deployed bundle contains `outstandingPreviewQa` and `GATE_ANSWERED_QA`) and **`prospect-preview`** (closure only, no
  behaviour change — v18 deployed; its bundle does not carry the changed names as text, so only the deploy timestamp
  proves it). **`whatsapp-status` NOT deployed** (still v114, 2026-09-30). No Meta / Move37 / Findable WhatsApp
  credential touched.
- SPA: Cloudflare auto-deploy from `main`; verified on `https://app.leadfinderos.com` and
  `https://leadfinderos-next.pages.dev` — the `WebsiteBuild` chunk contains "COPY MASTER BUILD PROMPT" and
  "Back to the simple view".
