# Fix workstream 6 — Website Build + Optimise delivery pipeline

- **Date:** Sunday 4 October 2026. **Branch:** `fix/06-website-build`, cut from `origin/main` at `c0e85078`
  (proved equal before branching). Worktree `C:/Users/paulj/LeadFinderOS-wt/fix-06-website-build`.
- **Not merged. Not deployed. No SQL run. No database row written. No spend.** Ran in parallel with
  workstreams 1–5; nothing from Workstream 4's unmerged branch was read or copied.
- **Inputs:** `cert/master-launch-plan` (M-035 … M-043, WS-6, Gate 5) and `cert/d-site-generation`
  (D-01 … D-24). Live database read-only checks: which paid clients have a Website Build record (BS4 only;
  MCL's is empty and the engagement has ended), their route markers and BS4's domain answers.

## What changed, finding by finding

| Finding | Fixed how | Where |
|---|---|---|
| **D-03 / M-036** `section on /` failed the gate on every build | One parser (`parseIntentPage`) turns "section on /", "section on /about/", "/#reviews", "homepage section" into the page path + a `section` flag. The Site Intent Map writes the parsed path; the gate reads an old "section on X" the same way (its own copy, `intentPage`, held equal by a test table); `intentProblems` now refuses a page value that is not an address at all (before the build, not at the gate) | `websiteQuality.ts`, `siteGate.ts`, `site-quality-gate.mjs` |
| **D-04 / M-040** production unlocked on a recorded preview URL | ONE launch rule, `productionReadiness`: Build client · domain authority settled (when the onboarding row is known) · a build result that is **preview_ready by LeadFinderOS's own gate** (`previewReadyProblems`) · the recorded preview is the reported one, on the recorded Cloudflare project · a commit · every required preview QA tick · the form switched on when the site has one. The production prompt, the production PowerShell and the Live step all read it; **the server's `save_website_build` refuses** a save that newly records a production URL / status / custom domain / "Production deployed" while it fails | `websiteLaunch.ts`, `buildPack.ts`, `stagePrompts.ts`, `paid-client-hub` |
| **D-06 / M-040** Website Build open to Optimise | `websiteServiceRoute` reads plan_tier (+ website_addon), the older `website_route` (BS4 has only this), and the contract total; disagreeing records → no route. Optimise: every stage prompt, pack item, retry / review / corrections prompt refused with one sentence; the page shows a red banner; the server refuses production records and the form switch for Optimise. Unknown route: preview work allowed, production and the live form locked | `websiteRoute.ts`, `buildPack.ts`, `stagePrompts.ts`, `buildExecution.ts`, `WebsiteBuild.tsx`, `paid-client-hub` |
| **D-05 / D-20 / M-037** nothing checked claims | `claimRules.ts`: 11 claim classes (24/7 & out-of-hours, insurance, years / since, response time, credentials & named bodies, reviews & ratings, awards, job / customer counts, guarantees, price superlatives, "leading / No.1"). A claim is backed only by a verified fact that itself makes it, un-negated; a named body (NICEIC) and a figure (10 years) must appear in a verified fact. The expect file carries the rules; the gate's new **claims** check FAILS an unbacked one and lists the backed ones for Paul's read; it SKIPS (says so) without the block. Page generator: title, meta, H1 and body scanned, regenerated with the hit named, **refused** if it survives (never badged). The build prompt and page-generator prompt carry the exact DO NOT INVENT list | `claimRules.ts`, `siteGate.ts`, `site-quality-gate.mjs`, `buildPack.ts`, `page-generator` |
| **D-08 / D-09 / M-038** no assets without an old site | "Client assets" panel (Build pack step, any route): a shared https link or a file on the build machine (`file:///`), its type, what it shows, and a tick that the client owns it and gave it to us. Stored as approved, client-owned manifest assets marked `origin: client`; slots accept `file:///`; recon re-imports keep them. Profile links (Google Business Profile, Checkatrade) go in as a verified `review_profiles` fact. Prompt: no stock / generated image passed off as theirs, no before / after not given, a site with no photos is designed without them; map = OpenStreetMap-based with its credit or one the client supplied, never a Google Maps screenshot | `WebsiteBuild.tsx`, `websiteBuildState.ts`, `buildExecution.ts` |
| **D-12 / M-039** every form needed a code edit + deploy | The form is configured from the client's own record: `website_build.form` {enabled, site_key, recipient, thanks_path}. Paul switches it on in Website Build; the recipient must equal the **verified** business email. `site-enquiry` looks the key up on `outreach_leads` (service role), resolves the route, and serves it only for a Build client, not ended, with domain + project; production = `https://<domain>` + www twin; previews of that project + localhost = test mode. Unknown key, switched off, Optimise, unrecorded route, ended, or **two records claiming one key** → refused. BS4 keeps working from a transitional code entry until its record claims "bs4" (then the record wins; a record claiming it but switched off is refused, never the fallback). The gate's new **form** check fails a site with no form posting to its key, another key, or a mailto form; on `--url` it sends an OPTIONS preflight from the live origin (nothing submitted) | `siteForm.ts`, `_shared/site-enquiry.ts`, `site-enquiry`, `site-quality-gate.mjs` |
| **D-01 / D-02 / D-21 / M-035** unsupported questions owned real pages | `siteScope.ts`: a question is owned only when **every** meaningful word is accounted for by an approved service (name + catalogue synonyms), a served town, the trade, the business name, a verified price (price words) or a verified 24/7 fact (out-of-hours words). Kinds of work (repair / install / service) must match the service ("boiler installation" is not the servicing page). Must-not-say phrases, template services Paul left out and rejected service facts are "not offered". Everything else is UNOWNED with its reason, printed into the build prompt with "do not answer it". The home page is the first owner, so "<trade> in <home town>" is the home page's. No blank owners (template town pages get the template's own path). Q&A: refuses an excluded service or an unverified 24-hour ask before spending; a keyword-string question no longer comes back as its own heading | `siteScope.ts`, `siteGate.ts`, `intentOwnership.ts`, `page-generator` |
| **D-10 / M-025 (generator side)** thin home-town page on by default | The home-town page is **off by default** on the template (the home page owns it). Any town page — template toggle or bespoke plan row — needs a local-content note (≥ 6 words: real jobs, access, landmarks) or the build is blocked; the home town's message says the home page already owns it. The gate's new **locations** check warns on a page for the home town, a thin one (< 250 own words once town names are removed) and one repeating ≥ 30% of the home page or another town page | `templateMapping.ts`, `buildExecution.ts`, `site-quality-gate.mjs`, `WebsiteBuild.tsx` |
| **D-15 / M-042 (pre-launch half) + item 9** operator control | Page plan: a per-page **meta description** (Paul's wins). Site-wide **main call to action**. A **Corrections** prompt (Preview step) built from Paul's list + pages he marked remove that the build still has + built pages not in the plan + titles / meta / CTA — preview only, gate re-run, never production | `websiteBuildState.ts`, `buildPack.ts`, `buildExecution.ts`, `WebsiteBuild.tsx` |
| **D-15 (post-launch half) + item 11** "Live" was a tick | The Final production QA prompt runs the gate with `--url` on the real domain and writes `qa/site-gate-production.json`; Paul pastes it on the Live step. **"Production checked" (and production status "verified") are refused by the server until that report passed** — a `--url` run, not preview, on the canonical domain. The live run covers HTTPS, http / www / apex in one hop, every page in the sitemap, robots with OAI-SearchBot and the other search crawlers allowed, the crawlers getting the real page, canonicals, schema, no noindex, the trust claims and the form backend | `websiteLaunch.ts`, `buildPack.ts`, `WebsiteBuild.tsx` |

What was deliberately **not** changed: the gate's existing checks and the template design (Session D's
"static, light, crawlable, good technical SEO, sensible schema" is preserved — nothing was redesigned);
the existing "live" rule in `weeklyCheck.ts` / `deliveryStage.ts` (Workstream 3's files) — it stays
correct because the server now refuses the tick that feeds it; no llms.txt or any AI-ranking device.

## Paul's reading of the new behaviour

- **A new client's enquiry form:** Website Build → Build pack → *Enquiry form* → pick the verified email →
  *Switch the form on*. Nothing else; no engineer, no deploy.
- **An Optimise client:** the Website Build page says it is switched off and why. The page generator is
  their tool.
- **Production:** the Live step's *Cleared for production?* card lists, in words, everything still in the
  way. Production prompts and commands appear only when it says *Cleared*.
- **After going live:** paste the live gate report; *Production checked* unlocks only if it passed.
- **Claims:** the gate fails a page that claims what no verified fact says. It cannot prove every sentence
  true — **your read of every page is still required**, and the build prompt says so.

## BS4 (the one real Build record)

- Its route reads as **Build** (from the older `website_route = rebuild_existing`). Nothing it already has
  is locked: only NEW production records are judged.
- **Its domain-ownership answers are all blank** (manual onboarding), so the launch rule will hold BS4's
  production until they are recorded ("Fix in onboarding" on the client page). That is the domain rule
  doing its job; it is not a new decision.
- Its form keeps working through the transitional entry. To move it to the registry: switch the form on
  in its Website Build with key `bs4` and its verified email; then the code entry can be deleted.
- BS4's plan has no location pages, so the new location rule does not touch it.

## Tests

`npm run check` green in the worktree: typecheck at the 9-error baseline (identical list), edge syntax,
edge undefined names, import graph (0 faults), production build, **297 / 297 suites**.

New suites:
- `scripts/website-build-launch.test.ts` — Session D's D1 (template) and D2 (bespoke) truth sets through the
  real functions: `section on /` parsed the same by LeadFinderOS and the gate; **both routes pass the whole
  site gate** with section-served intents (and an old expect file still saying "section on /" passes);
  a failed / gate-errored / unticked / wrong-project / no-route / unsettled-domain / form-off preview does
  not unlock production (prompt, commands and the server save); a cleared Build client does; Optimise refused
  everywhere, Build allowed; no-asset and supplied-asset cases; every D1 / D2 unsupported question unowned
  with its reason, service questions on service pages, "<trade> in <home town>" on the home page, no blank
  owners; location note rule + the gate's thin / home-duplicate warnings; the Corrections prompt; the build
  prompt's DO NOT INVENT list and form text; the live gate report verifying "Production checked".
- `scripts/website-build-claims.test.ts` — what D1 / D2's verified facts back; a planted "fully insured,
  10 years, 24/7, 30-minute response, rated 4.9, NICEIC, award-winning, No.1, 500+ jobs" fails; the
  client's own wording passes; negations and ordinary sentences are not claims; **the shared rules and the
  standalone gate agree on every hit** (parity corpus); the gate's claims check fails / passes / skips;
  page-generator wiring (scan, regenerate, refuse; Q&A refuses before spend).
- `scripts/site-enquiry.test.ts` section F — a new fixture site works from its record with no code change;
  unknown / malformed / off / Optimise / unrecorded-route / ended / ambiguous keys refused; BS4 legacy and
  takeover; recipient only the verified email.

Updated (behaviour deliberately changed, assertions re-pointed, none weakened): `website-build-v1`, `-v2`,
`pilot-hardening` (production now needs a genuinely cleared fixture — `scripts/lib/website-launch-ready.ts`
states every gate explicitly, and each suite also asserts the old "project + preview + domain" state is
now REFUSED); `website-build-mapping`, `-execution` (no default home-town page; a town page without a note
blocks).

**Not done in this session:** the Website Build page was typechecked and built but **not rendered** — it is
an authed operator page and nobody has seen the new panels. No preview or production site was deployed;
the gate's `--url` form preflight was not exercised against the live function.

## Deploy order (for the merge session — nothing here was deployed)

1. **No SQL is required.** The form registry lives in `outreach_leads.website_build.form`. Optional, additive,
   for speed only (not run): `create index if not exists outreach_leads_site_form_key on outreach_leads ((website_build->'form'->>'site_key')) where website_build ? 'form';`
2. Edge functions (the `--reached-by` closure): **`site-enquiry`**, **`paid-client-hub`**, **`page-generator`**,
   and **`prospect-preview`** (reaches `websiteBuildState.ts` → `siteForm.ts`; no behaviour change for it).
   Verify `site-enquiry` by the `x-site-enquiry-build: site-enquiry-registry-1` header on an OPTIONS call, and
   that `?site=bs4` from BS4's preview origin still answers 204. Deploy `site-enquiry` BEFORE any record has
   the form switched on (the old function ignores the record).
3. SPA (main → Cloudflare Pages).
4. The gate ships with the repo: client builds fetch `origin/main:scripts/site-quality-gate.mjs`, so the new
   checks reach the next build automatically once merged.

## After Workstream 4 merges — the truth-service integration

These exact places read today's services / areas and must be switched to WS-4's verified service set (and
its "not offered" list) by the merge session. None of them hard-codes today's merged-service behaviour; each
takes a list:

1. **`src/lib/siteGate.ts` → `siteScopeFromBuild()`** — the ONE boundary for Website Build. Feed WS-4's
   verified services into `services` (keep the template catalogue synonyms as `aliases`) and its not-offered
   services into `excluded`. Today: the approved page plan / template config + must-not-say + excluded catalogue
   services + rejected service facts.
2. **`src/lib/buildFacts.ts` → `candidateFacts()`** (D-07 / M-030 consumer side, NOT changed here) — onboarding
   `services_list` / `areas_list` are auto-verified as client-stated; once WS-4 stops "Save context" writing the
   merged list back (or records provenance), verify only client-submitted, operator-unedited values.
3. **`supabase/functions/page-generator/index.ts`** — `qa_generate`: `qaServices` (onboarding `services_list`)
   and the `namesExcluded(...)` call's `excluded` list; `qa_plan`: `planServices`; the service-page path's
   `services`. Swap to WS-4's verified / not-offered lists.
4. **`src/lib/siteScope.ts` → `classifyQuestion()` / `namesExcluded()`** — unchanged contract; only their
   inputs change. If WS-4 adds service synonyms, pass them as `ScopeService.aliases`.
5. **`src/lib/intentOwnership.ts` → `ownershipFor()`** callers — `ctx.services` in `siteIntentMap` (already
   from the scope) and the page-plan queue (`pagePlanQueue.ts` callers in page-generator).

## Merge-conflict risks

- **`supabase/functions/paid-client-hub/index.ts`** (Workstream 3's file): three import lines after the
  `websiteBuildState` import, and the top of the `save_website_build` block (the read of `before` now selects
  `contract_total_payments, service_terminated_at`; one onboarding read; the refusal). The master plan
  deferred WS-3's edit of this block (D-22) to after launch, so the overlap should be small.
- **`supabase/functions/page-generator/index.ts`**: the service-page regeneration loop and the Q&A preamble.
  WS-4 may later touch the same service lists (integration point 3).
- **`src/lib/intentOwnership.ts`** `qaHeadings` (one block) — shared with the page-plan queue.
- **`docs/INDEX.md` and `CLAUDE.md` were NOT edited** (every workstream touches them); the merge session adds
  the one INDEX line for this file and, if wanted, a CLAUDE.md pointer ("Website Build launch rule:
  `websiteLaunch.ts`; form registry: `website_build.form`; claims: `claimRules.ts` ↔ the gate").
- `ClientHub.tsx` (WS-3) still shows the Website Build card for every paid client; the page it opens refuses
  Optimise. Hiding the card for Optimise is a one-line WS-3 change if wanted.
