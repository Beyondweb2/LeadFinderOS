# 05 — Website Build (the simple flow, live)

*Live since 2026-10-05 (merge `592656f8`, record `docs/pre-sales-certification/website-build-simple.md`). Code:
`src/lib/simpleBuild.ts` (all rules), `src/components/SimpleWebsiteBuild.tsx` (the screen), `src/pages/WebsiteBuild.tsx`
(default = simple; `?view=advanced` = the old V2 command centre, unchanged). Route: Paid Clients → a client →
**Website Build** (`/paid-clients/:leadId/website-build`, admin only).*

Principle (Paul): **complexity in the background, simple for Paul.** Every V2 safety rule still runs; Paul sees only what
needs a human decision.

## The normal operator flow

```
Choose build type
  → Prepare website            (automatic)
  → answer only material "Needs you" issues
  → Copy Master Build Prompt
  → Claude builds the preview  (a separate Claude Code session in the client's own repo folder)
  → paste Claude's result back
  → compare old site + preview side by side
  → review (8 checks)
  → corrections (one prompt, same preview) — repeat if needed
  → automated technical gate passes
  → launch (production prompt → paste the live gate report)
```

Old: 7 stages, ~10 prompts, ~20 PowerShell blocks, 23 QA ticks. New: 5 steps (Gather → Prepare → Build → Review → Launch),
one Master Build Prompt, 8 review checks.

## Build types (derived from the client's route — never stored, never guessed)

| Type | What it means | Notes |
|---|---|---|
| **A. New site — Findable template** | a fresh site from the Findable template | auto-selects the template when only one exists; does not imitate the old site |
| **B. Visual rebuild / improvement** | new design, old site as brand/content reference | no CMS access needed; marketing copy rewritten |
| **C. Close recreation** | looks close to the old site | needs reproduction rights (onboarding `site_rights = yes` or Paul's "the client has confirmed"); refused → only "switch to Visual rebuild"; never copies third-party template code |
| **D. Improve existing site / Optimise** | no rebuild | sends Paul to the page generator; the master prompt refuses for an Optimise client |
| Bespoke (legacy) | BS4's record | reads "Bespoke build (set up earlier)"; not converted |

## What "Prepare website" does automatically

- **Accepts only uncontested contact-identity facts**: business name, trade, phone, email, website, opening hours, company
  number, and the client-submitted home town — and only when no equal-or-higher source contests them. The client's own
  onboarding answer beats the lead record on name / trade / home town. **A phone, email or address clash is never settled
  automatically** (shown with both values). It never overwrites a decision already made.
- Fills (never overwriting): repo name, GitHub owner `Beyondweb2`, folder `C:\Users\paulj\<Repo>`, Cloudflare project /
  Git-connected / account `beyondwebcraft`, the web address from the current site's host.
- **Plans the pages automatically:** home; a services hub + one page per **confirmed** service (when ≥2); an areas hub only
  with ≥3 verified areas; about; contact; privacy. **No town pages** are generated automatically.
- Assesses every content intent; switches the enquiry form on (to the verified email) when the form rules pass.
- If the client has a site but no crawl yet, it starts the free crawl and prepares again when it finishes.

## What genuinely blocks preparation (blockers)

Optimise client · Build/Optimise route not settled · no business name · no phone **and** no email · a contested phone /
email / address / name / home town · a service on both the offered and not-offered lists · a rebuild with no trusted
current site · close recreation without rights · no web address · a template that cannot be filled (e.g. "MCL Local Trades
Template has no pages for this client's services").

**Shown but NOT blocking ("decide"):** home town not confirmed; services only from sales notes; no services confirmed; an
unconfirmed credential / guarantee / experience claim (one-click confirm); a template built for another trade.
**Before launch only:** domain handoff ("Preview can be built now. Domain handoff required before launch."); no form email.
**No longer flagged at all:** no photos, no CMS access, no Google profile, no Checkatrade badge, no home-town page.

## Asset rules

- Claude may reuse the business's **own** logo, photos (team, vans, premises, jobs) and graphics from the current site.
- Never assume ownership of stock photos, manufacturer imagery, platform/directory badges, other companies' logos or agency
  artwork — each is reported as `ASSET CHECK: <url> — <why>` and shown to Paul after the build.
- Badges only for a verified membership; never fake. Only client-owned assets are downloaded (`assetsToDownload`).
- Build standard: Areas hub → the MAP by default; genuine reviews and a confidently sourced rating shown with a date; no
  repeated photos; credentials prominent (`websiteBuildStandard.ts`).

## Truth hierarchy (Website Build)

Client-confirmed > onboarding / sales record > the client's own public website (stored crawl) > sales notes > Discovery /
baseline. Services for pages come only from the service truth (`siteTruthFromBuild` → `resolveServiceTruth`: onboarding /
verified build facts > Sales notes, **never Discovery**). The client's "not offered" list joins every exclusion. A website
URL only Discovery offered is never "the current site" (`trustedOldSite`). Services, areas, credentials, guarantees,
years, people and **prices are never auto-accepted** — prices stay Paul's, and the gate fails any £ figure not verified.

Current-site facts (Paul, 2026-09-30): anything the client's own site states (services, hours, credentials, FAQs,
history…) is approved source evidence by default; Paul decides only conflicts, ambiguity, 24/7 vs stated hours,
superlatives, prices, tracking IDs.

## What the site must get right (AI visibility + technical)

- **Service pages:** one main page per genuine, confirmed service / customer need.
- **Location pages:** only with real local information — never cloned town pages; an areas hub only with ≥3 verified areas.
- **Page ownership** (`src/lib/intentOwnership.ts`, the Site Intent Map): every service, location, content intent and frozen
  baseline question has ONE owning page. Supported → already owned (improve it) → competing → only then a new page. A
  baseline question is a QA label, **never a title or H1** — headings are built from the real service + place + business
  ("who does rewiring in Bristol" → "House Rewiring in Bristol").
- **Claims:** genuine claims only (`claimRules.ts`); unverified credentials/guarantees held; no superlatives without proof.
- **Schema:** Organization / LocalBusiness / Breadcrumb. No Findable surface emits rating / review schema.
- **Sitemap, robots, canonicals:** a real sitemap, robots that don't block legitimate crawlers, correct canonicals on the
  production domain, no stray `noindex` (preview builds on `*.pages.dev` ARE noindexed via `_headers`).
- **OAI-SearchBot / crawlability:** the master prompt makes Claude confirm the pages can be fetched by OpenAI's search
  crawler (and other legitimate crawlers); content must be in the HTML, not only behind JavaScript.
- **Old URLs:** every old URL gets a 301 to its new home.
- **Forms:** a real enquiry form through fn `site-enquiry` (recipient never from the request); a `mailto:` form always fails.

## The Master Build Prompt (`masterBuildPrompt`, `MASTER_PROMPT_VERSION = master-build-1`)

Refused (no text) until Prepare has run and no blocker stands. 15 sections: client facts + confirmed / not-offered services
· what must not be published · build type · the current website (Claude opens and reads it itself, inventories its
strengths, `FACT CHECK`s trust claims only the old site states, maps every old URL to a 301) · assets · site plan (page plan
or the template's config + the Site Intent Map) · content (question → answer → detail → evidence) · AI visibility +
technical (schema, breadcrumbs, OAI-SearchBot fetch) · design · functional (contact, form, privacy, map) · quality gate
(DO NOT INVENT + build standard) · set up / build / preview deploy · **open the old live site and the new preview side by
side and compare** · QA + the Findable site gate · a plain-English report then the build-result JSON. Copying it records
`build_execution.started_at` and the config fingerprint.

Operator steps shown on screen: (first time) create the private GitHub repo under `Beyondweb2` → PowerShell:
`New-Item -ItemType Directory -Force -Path "C:\Users\paulj\<Repo>" | Out-Null; Set-Location "C:\Users\paulj\<Repo>"; claude`
→ paste the prompt → let it build → paste Claude's last message into "Paste Claude's result" → compare side by side →
review.

## Corrections prompt

Paul's plain-English corrections + the main call-to-action + any technical failures → one `correctionPrompt` (same folder,
same preview), which ends in a new result to paste back. A later failing result takes the gate's ticks away again.

## Automated technical gate

- The imported result is judged by `previewReadyProblems` (the Site Quality Gate on the built output and on the preview,
  the quality standard, the build standard) plus unresolved redirects. Paul sees "✓ Passed" or the failures; details fold.
- The gate (`scripts/site-quality-gate.mjs` + `src/lib/siteGate.ts`) reads the REAL output: robots, sitemap, canonicals,
  noindex (incl. `_headers` scope), links, orphans, titles, H1s, cloned pages, schema, identity, intent ownership. The
  build's own `qa.*` claims are not trusted. Not run = an error. The gate script is fetched from LeadFinderOS **main**, so
  a change to it is live for every build once merged. ⛔ Never weaken a check to pass a build.
- Seven technical QA ticks (`GATE_ANSWERED_QA`: assets load, no broken links, SEO/GEO QA, schema valid, sitemap/robots,
  canonicals/domain, old URLs handled) are answered by the gate only on a preview-ready, problem-free result. The other
  ticks are the **8 review checks** (`SIMPLE_REVIEW_ITEMS`). Every QA tick has exactly one owner.

## Domain handoff and launch

- An unsettled domain **never blocks the preview**; production stays blocked until it is settled (client access, an
  authorised agency/provider DNS change, or a new domain — never a takeover).
- **Launch** only when the one launch rule (`websiteLaunch.ts`, server: `websiteBuildSaveRefusal`) is empty → READY TO
  LAUNCH → the production prompt → paste the live gate report; a passing `--url` report records production URL / verified /
  domain active / deployed / checked in one save. Build-only: Optimise clients never get a Findable production site.

## Advanced mode

`?view=advanced` is the full V2 command centre (recon import, template mapping, stage prompts, build pack). It still works
and keeps every record readable, but **it is not the normal workflow** — add complexity there, never back onto the simple
view. The current website is ONE rule in both views (`currentWebsite`, 2026-10-05): a Discovery-only URL is shown as
research, never used as the source site (`docs/pre-sales-certification/advanced-website-truth-fix.md`).

## ⚠️ Current limitation — only ONE template

`WEBSITE_TEMPLATES = [MCL_TEMPLATE]` (`src/lib/websiteTemplates.ts`):

- id `mcl-local-trades`, "MCL Local Trades Template" v2.0, **locksmith only** (`supportedTrades: ['locksmith']`);
- source `Beyondweb2/MCLocksmiths-New` (private), **pinned** to commit `a2db9748…` (`sourceKind: 'live_client_repo'`) —
  structure only; MCL's own data / reviews / photos are listed as `inheritedHazards` and must never reach another client;
- the planned Findable-owned replacement repo `Beyondweb2/findable-local-trades-template` **does not exist yet**.

So a **non-locksmith New-site client with no old site is blocked** ("MCL Local Trades Template has no pages for this
client's services … Choose a bespoke build in Advanced … until a template for their trade exists"); with an old site the
advice is a Visual rebuild instead. **Building trade templates (plumber, electrician, roofer…) is a likely next priority**
(`12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md`).

## Records for deeper work

`docs/website-build-v1.md` → `v2.md` → `recon.md` → `mapping.md` → `execution.md` → `pilot-hardening.md` →
`quality-standard.md` → `seo-gate.md` → `docs/pre-sales-certification/fixes-06-website-build.md` → `website-build-simple.md`.
