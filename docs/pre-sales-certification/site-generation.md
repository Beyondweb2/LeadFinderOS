# Website Generation Certification — Session D

- **Session / date (UK):** D (website generation / Build delivery), Sunday 4 October 2026.
- **Stages owned:** J24 (Build / Optimise route consequences), J25 (website build: prompt, config, quality, SEO/GEO, schema, mobile).
- **Release audited:** `main` at `c0e85078` (the same release Sessions A, B and C audited). Worktree
  `C:/Users/paulj/LeadFinderOS-wt/cert-d`, branch `cert/d-site-generation`. No product code changed, nothing
  deployed, nothing merged.
- **Accounts:** none. No sign-in was needed: the build pipeline's deterministic half (facts, mapping, config,
  Site Intent Map, prompts) is pure code and was run locally on a hand-built `rebuild_context` payload in the
  exact column shape `paid-client-hub` serves (`HUB_ONBOARDING_COLUMNS`). No token was created.
- **Fixtures:** none created in the database. The D range (`1d000000-…d1` … `…d3`) was used only as LOCAL ids
  inside the two truth sets; no `outreach_leads`, `onboarding_responses` or `metric_exclusions` row was written.
- **Spend:** Google Places 0 · hook audits 0 · Discovery 0 · baselines 0 · **Apify $0** · **OpenAI $0**. The only
  compute was Claude Code itself (the two build sessions), which is not a Findable cost line.
- **External actions:** none. No GitHub repository, no Cloudflare project or deploy, no DNS, no domain, no GBP, no
  directory, no sitemap submission, no enquiry-form submission. The only network use was the npm registry for
  the two local `npm install`s.

---

## Executive verdict

### READY WITH FIXES — for the website itself. The Build *process* needs its P1s fixed before Paul sells Build at volume.

**The direct answer:** *If Paul sells a Findable Build tomorrow, can the current process produce a professional,
truthful, conversion-focused, SEO/AI-visible local-business website good enough to hand over without Paul
rescuing it?*

**The words on the page: yes.** Two complete builds were produced the way production would produce them: a
template build of a locksmith and a Bespoke build of a plumber. Each was run by an independent Claude Code
session given only the generated Build Execution prompt. Neither invented a single trust signal. There were no
fake reviews, years, accreditations, response times, prices, 24/7 or emergency claims, and no out-of-area towns.
Every explicit negative was respected: no car keys, safes, 24-hour call-outs, new boilers, drains, bathrooms or
landlord gas certificates. Schema matched reality, robots allowed the search crawlers, and the HTML was light and
crawlable. Both sites look like credible small-trade sites on a phone.

**The process around them: no, not yet.** Paul would have to step in for things the generator either cannot do or
gets wrong:
1. **No build can reach Preview Ready.** The page format LeadFinderOS itself suggests for a section-served intent
   (`section on /`) fails the site gate on every build. It failed 2 of 2 here (D-03).
2. **The enquiry form cannot work** until someone adds the client to `CLIENT_SITES` in code and redeploys an edge
   function (D-12).
3. **A client with no current website can never get photos or a map into the build** (D-08).
4. **The baseline-question → page map points not-offered services and out-of-area towns at real pages** (D-01, D-02).
   The executor ignored them this time. Nothing makes it.
5. **Truthfulness is enforced by nobody but the executing session.** The gate checks consistency, never claims (D-05).
6. **Production unlocks on a recorded preview URL alone**, whatever the gate said, and for any paid client including
   Optimise (D-04, D-06).

**No new P0 in Session D's scope.** The upstream P0 **A-01 / B-01** (a Build sale cannot reach a payment link
through Quick Close) still blocks a Build sale before any of this starts.

| Count | |
|---|---|
| P0 | **0** (in D's scope; A-01/B-01 upstream still open) |
| P1 | **14** |
| P2 | **10** |

---

## QA truth set

Two controlled businesses. Both are fictional: Ofcom drama-range phones, `.example` domains, never published.
Every fact entered the system exactly as a real client's would. The client-stated answers went in as the onboarding
row; the rest were added and approved by "Paul" on the fact ledger. The generator was given nothing else.

### D1 — Pengwern Lock & Key (template route: MCL Local Trades Template v2.0, the recommended route for a locksmith)

| Fact | Value | Entered as |
|---|---|---|
| Business name | Pengwern Lock & Key | onboarding + ledger |
| Trade | Locksmith | ledger |
| Owner | Gareth (consents to be named) | ledger |
| Phone | 01632 960471 | onboarding |
| Email | gareth@pengwernlocks.example | onboarding |
| Domain | pengwernlocks.example | project |
| Base | Shrewsbury; mobile, no public address | onboarding + mapping choice |
| Service areas | Shrewsbury, Bayston Hill, Pontesbury, Wem, Church Stretton | onboarding |
| Services | Emergency lockouts (non-destructive entry where possible); lock changes and upgrades; anti-snap cylinder upgrades; uPVC door mechanism and multipoint repairs; lock repairs after a burglary; key safe installation | onboarding |
| Hours | Mon–Fri 7am–7pm, Sat 8am–4pm, closed Sunday; lockouts attended within these hours only | ledger |
| Availability | Within opening hours only (not 24/7) | ledger |
| Years | Trading since 2019 | ledger |
| Insurance | Public liability insurance, £2 million cover | ledger |
| Guarantee | 12-month guarantee on parts and labour for locks we supply and fit | ledger |
| Payment | Card, bank transfer, cash | ledger |
| Differentiators / customers | TS007 3-star anti-snap cylinders as standard on every lock change; a fixed price before any work starts; residential only (homeowners, landlords, letting agents) | onboarding `standout` |
| **Negative facts** | **No car keys / auto locksmith. No safe opening. No 24-hour call-outs. Not DBS checked. Not an MLA member. Not "approved". No reviews. No commercial work.** | onboarding `must_not_say` + ledger N/A rows (accreditations, DBS, memberships, address) + mapping (commercial, safe opening, garage locks excluded) |
| Not supplied (must not appear) | Prices, response time, brands, review profiles, directory and social profiles, WhatsApp, photos, logo | — |
| Frozen baseline (20) | Deliberately includes Session C-style weak questions: keyword strings ("locksmith shrewsbury"), invented services ("car key replacement Shrewsbury", "auto locksmith near Wem"), not offered ("24 hour locksmith in Shrewsbury", "safe opening Shropshire"), out of area ("locksmith Telford"), price superlative ("cheapest locksmith Shrewsbury") | onboarding `baseline_questions` |

### D2 — Brookfoot Plumbing & Heating (Bespoke route: the recommended route for every non-locksmith trade)

| Fact | Value |
|---|---|
| Name / owner / phone / email / domain | Brookfoot Plumbing & Heating · Dean · 01632 960482 · dean@brookfootplumbing.example · brookfootplumbing.example |
| Trade | Plumber and heating engineer |
| Base / areas | Brighouse; Brighouse, Rastrick, Elland, Hipperholme, Lightcliffe; mobile |
| Services | Gas boiler servicing; boiler repairs and breakdowns; radiator installation and replacement; leak repairs; tap and toilet repairs |
| Credential | Gas Safe registered (no registration number supplied) |
| Price | Annual boiler service £85 (gas combi or system boiler) — the ONE verified price |
| Hours | Mon–Fri 8am–6pm; no evening, weekend or 24-hour call-outs |
| Differentiators | Same engineer every visit; dust sheets and shoe covers on every job; written quote before work starts |
| Payment | Card, bank transfer |
| **Negative facts** | **Does NOT fit new boilers. No drains. No bathroom fitting. No 24-hour or weekend call-outs. No landlord gas safety certificates. No insurance or years supplied.** |
| Page plan (typed by Paul) | 12 pages: home, services hub, four service pages, areas hub, Brighouse, about, FAQs, contact, privacy |
| Frozen baseline (20) | Includes "boiler installation Brighouse", "new combi boiler cost", "landlord gas safety certificate", "emergency plumber Brighouse 24 hours", "blocked drain Elland", "bathroom fitter", "plumber Halifax" (out of area), "cheapest boiler service" |

---

## Build workflow tested

### The real pipeline (mapped from code before judging output)

**LeadFinderOS does not generate websites.** It generates **prompts**. Paul pastes them into a Claude Code session,
which builds the site in a separate repository and pastes back a JSON result.

| Step | Where | Kind |
|---|---|---|
| Paid client → Paid Clients → 5. Website Build | `ClientHub.tsx:520,646` → `WebsiteBuild.tsx` | operator |
| One read: `rebuild_context` (lead, paid onboarding row, baseline audit + report, latest Discovery, stored crawl, client_pages) | `paid-client-hub/index.ts:660-718` | deterministic |
| **Facts ledger:** candidates from onboarding (client-stated → **auto-verified**), lead row, baseline, Discovery, crawl (all → needs approval); Paul approves / edits / rejects / N/A / adds | `buildFacts.ts:89-200`, `clientFacts.ts:254-330` | deterministic + **operator-approved** |
| Route: Template / Faithful / Bespoke. Recommended = a template whose trade matches, else Bespoke. **Only template = MCL (locksmith)** | `websiteTemplates.ts:420,440`, `buildRoutes.ts` | operator |
| Recon / Capture of an existing site (Claude Code crawls, JSON imported) | `recon.ts`, `reconSchema.ts` | **AI-generated**, imported with rules |
| Template mapping → **generated client config** (fields, catalogue services, towns, asset slots, seed-value scan) | `templateMapping.ts:327-366` | deterministic |
| Architecture: page plan + redirects (template seeds / cited URLs / crawl / typed lines) | `buildArchitecture.ts` | operator (+ optional AI proposal) |
| Quality standard: strengths, 11 content intents | `websiteQuality.ts` | operator |
| **Site Intent Map:** services, location pages, content intents and the 20 frozen questions → owning page | `siteGate.ts:75-135`, `intentOwnership.ts:86-125` | deterministic |
| **Build Execution prompt** (master brief A–O + X1–X11: destination, config, assets, seed scrub, pages, quality + build standard, form, SEO/AI, intent map, GitHub, Cloudflare preview, QA, gate, result JSON) | `buildExecution.ts:210-332`, `buildPack.ts` | deterministic text |
| **The website itself:** copy, page composition, design, schema, robots, sitemap | the executing Claude Code session | **AI-generated** (template structure inherited) |
| Site Quality Gate run by the executor (`--dist`, then `--url --preview`) | `scripts/site-quality-gate.mjs` | deterministic, self-run |
| Result JSON import → `siteGateResult` turns gate fails into errors → `previewReadyProblems` | `buildExecution.ts:443-503`, `websiteBuildState.ts` | deterministic |
| Preview QA ticks (Paul) → Production Deployment prompt / PowerShell commands → Final Production QA prompt | `stagePrompts.ts:199-240`, `buildPack.ts:921-1006` | operator + AI |
| Enquiry form backend: `site-enquiry` with a per-client `CLIENT_SITES` entry | `_shared/site-enquiry.ts:28` | **code change + edge deploy per client** |

**Optimise uses a different generator:** the `page-generator` edge function, which uses gpt-4o. It produces
service+town and Q&A copy blocks that Paul pastes into the client's own WordPress. It never publishes anything.

### What was run

1. Built `rebuild_context` payloads for D1 and D2 in the served column shape. Round-tripped the Website Build state
   through the server's save rule (`normaliseWebsiteBuild`), then ran the real `candidateFacts`, `mergeFacts`,
   `computeMapping`, `executionBlockers`, `siteIntentMap`, `stagePrompts`, `buildPack` and `executionPrompt`.
   Throwaway scripts were used and deleted.
   - **Both reached READY TO BUILD with 0 blockers.**
   - D1 prompt: 66,566 characters. D2 prompt: 50,893 characters.
2. Sealed a local sandbox: a push-disabled local clone of the template at its pinned commit `a2db9748`, plus the
   gate copied from `main`. A short harness preamble replaced only the external steps: no GitHub, no Cloudflare,
   no form submission, no network but npm. Every content and quality rule stayed verbatim.
3. Gave each prompt to an **independent Claude Code session** that knew nothing of this audit. That is the same thing
   Paul does in production. D1 took about 31 minutes of agent time; D2 about 23.
4. Audited the output myself:
   - re-ran the gate;
   - diffed the expect file against the generated map;
   - extracted every page's title, meta, canonical, headings, text, links and JSON-LD;
   - ran keyword sweeps for invented trust terms and seed-client values;
   - read every page of both sites;
   - viewed the executors' Playwright screenshots at 1440, 1024, 390 and 375;
   - measured page weight.
5. Ran the 11 Website Build test suites on `main`: **1,020 checks, 0 failures**. None of them catches D-01 to D-04.
6. Read the Optimise generator and the Build/Optimise separation in code. A research agent did this, and I verified
   its key lines (`intentOwnership.ts:159`, `page-generator/index.ts:690-699, 1185-1195`, `ClientHub.tsx:646`,
   `buildPack.ts:921-961`, `stagePrompts.ts:199-215`).
7. Read BS4 Electrical's git history, the first real Build. It shows the rescue that happened before the standard existed.

---

## P0 — Launch blockers

**None in Session D's scope.** No fabricated public claim appeared, no public or indexable fake site exists, and no
path in the generator sends, charges or corrupts anything.

Carried from upstream, not re-scored here: **A-01 / B-01 (P0)**. Quick Close drops `build_consents`, so a Build sale
never reaches the payment link. Until that is fixed, the pipeline below cannot start for a new Build client.

---

## P1 — Fix before rollout

| ID | Sev | Stage | Finding (one sentence) | Evidence | Failure scenario | Suggested fix (not applied) |
|---|---|---|---|---|---|---|
| D-01 | P1 | J25 | The Site Intent Map assigns baseline questions about services the client does not offer, and towns it does not serve, to real pages; the "unsupported" guard can never fire from it. | `siteGate.ts:111-117` calls `findNamed(q, ctx.services)`, which only searches the APPROVED list, so an unapproved service is never "named" and the question becomes `generic`. `intentOwnership.ts:93-94` "unsupported" is therefore unreachable. **D1:** "safe opening Shropshire" and "locksmith Telford" → `/`; "car key replacement Shrewsbury", "24 hour locksmith", "cheapest locksmith" → the Shrewsbury page. **D2:** "boiler installation Brighouse" and "new combi boiler cost" → `/services/boiler-servicing/` (the client says it does NOT fit boilers); "landlord gas safety certificate", "bathroom fitter", "emergency plumber 24 hours" → `/areas/brighouse/`; "plumber Halifax" → `/`. | X6b tells the builder that each owning page "must genuinely answer what the customer is asking". A less careful session writes a combi-installation paragraph on the servicing page, or "24-hour" copy on the Shrewsbury page. Both executors here chose not to, and nothing required that. | Classify a frozen question BEFORE ownership: named an approved service, named an unapproved service or trade term, named a non-served town. List the last two under `unowned` with the reason "not offered / not served — never answered". Test with C's real "car keys" question. |
| D-02 | P1 | J25 | Questions phrased differently from the catalogue name fall through to the home-town page, which then "owns" most of the baseline. The template route leaves that page's path blank for the executor to fill, so ownership is decided by whichever session runs the build. | **D1 generated map:** 13 of 20 questions owned by `Shrewsbury` with `page: ""`, including "Who can change the locks on my house", "anti snap lock upgrade", "Who fixes uPVC door locks" and "emergency locksmith" — all of which have a service page. The executor then re-routed them itself: "24 hour locksmith" → emergency page, "car key replacement" → `/`, "cheapest" → `/faqs/`. Compare the expect file with `07-intent-map.json`. **D2:** "Who can repair my boiler" → servicing page, not repairs. | Two builds of the same client get different intent ownership, and the "one primary page per intent" rule is not a system rule. Service intent and town intent compete on the town page (cannibalisation by design). | Match on the service's synonyms and the client's own service wording, not just the catalogue name. Always print the template's location path (`/locations/<slug>/`). Never emit a blank owner for a baseline intent. |
| D-03 | P1 | J25 | The page format the Website Build screen suggests for an intent served by a section, `section on /`, is read by the gate as a path and fails. **No build that uses it can ever reach Preview Ready.** | Placeholder `WebsiteBuild.tsx:1446` ('/faqs/ or "section on /"'); doc comment `websiteQuality.ts:89`; gate `site-quality-gate.mjs:563` (`its page section on / is not in the build`). Reproduced **2 of 2**: D1 and D2 each scored 16 pass / 1 fail, and that was the only fail. | Every real build where Paul follows the placeholder imports as `needs_attention`. The rules forbid editing the expect file, so Paul either can never reach Preview Ready or learns to ignore the gate. That second outcome erodes the one automated check. | Write `/` (or `/#anchor`) into the map for "section on X". Or have `siteIntentMap` translate it. Add a test that a section-served intent passes the gate. |
| D-04 | P1 | J25→Live | The production prompt and the PowerShell production commands unlock on a recorded preview URL, domain, folder and Cloudflare project. They do not need Preview Ready, a passing gate or the QA ticks. | `stagePrompts.ts:204-210`; `buildPack.ts:922-927` ("only after … the QA boxes are ticked" is a comment, not a check). `applyBuildResult` sets the preview URL on a `needs_attention` result too (`buildExecution.ts:475,491`). | A preview with gate failures (D-03 makes that every preview) or an invented claim is one copy-paste from production. The production prompt does ask Paul in chat first, but the system does not refuse. | Gate both production items on `previewReadyProblems(...).length === 0` and the three preview QA ticks. Show the reasons as blockers, as the build prompt already does. |
| D-05 | P1 | J25 | **Nothing automated checks claims.** The site gate checks consistency only: name, phone, email, approved prices, placeholders, schema shape, no rating markup. Bespoke builds have no seed scrub at all. Truth rests on the executing session and on Paul reading every page. | `site-quality-gate.mjs` checks are `robots, noindex, sitemap, canonical, domain, links, orphans, titles, descriptions, headings, duplicates, placeholders, prices, schema, identity, intents, mobile`. A search for `24/7`, insured, years, DBS or guarantee in the gate returns 0. The gate's own humanReview line says "The gate checks consistency, not truth". | Both builds here were clean, but that was this executor's behaviour. A build that says "fully insured, 10 years' experience, 30-minute response" passes the gate 17/17 and imports as Preview Ready. | Add a gate check against the Site Intent Map: the verified facts plus a forbidden-claims list derived from missing / N/A / `must_not_say` rows (years, insured, accredited, 24/7, response time, review count, "approved"). FAIL on a hit that is not a verified value. Print the claim inventory for Paul's single read. |
| D-06 | P1 | J24 | Website Build is open for every paid client, including Optimise, with no route or domain-authority check. Its production steps connect the custom domain. | `ClientHub.tsx:646` renders `WebsiteBuildStage` unconditionally; `WebsiteBuild.tsx` never reads `plan_tier` or `serviceRouteFromRow`; `buildPack.ts:957-961` "Custom domains → … Enter: <domain>" with only a comment-level STOP. | An Optimise client keeps their own site and Findable may never take it down (agreement 9.4). A wrong-client production run would replace their live site if their DNS were in our account. Today the main protection is that it usually is not. | Read `serviceRouteFromRow(onboarding)` on the page. For Optimise, hide or disable Build and Production with a plain sentence. Require the domain-authority state (READY) before any production item is generated. |
| D-07 | P1 | J24/J25 | "Save context" in the paid-baseline panel writes the **merged** service and area lists back into the onboarding row: onboarding, plus Sales' `lead.services_included`, plus Discovery's specialism, plus build facts. Website Build then treats everything in onboarding as **client-stated and auto-verified**. | `paid-baseline/index.ts:148,179` (`services_list: merged.services`) → `:300-309` (writes `services_list`, `areas_list` to `onboarding_responses`) → `clientFacts.ts:271-279` + `buildFacts.ts:64,74` (onboarding with no conflict → `verified`). Session C's C-08 found the merge; this is where it lands. | A service Sales typed or Discovery guessed (C-04's "car keys and auto locksmith") becomes a VERIFIED build fact, reaches section D of the prompt as "may be used", and gets a service page. | Save only what the operator edited, or record a separate operator-entered source. Never re-label merged values as onboarding. In `buildFacts`, verify onboarding values only from a client-submitted row whose lists the operator has not rewritten. |
| D-08 | P1 | J25 | A client with **no current website**, the typical Build client, can never get photos, a logo or a map into the build. Assets only enter through a recon of an existing site, and the questionnaire's photos answer is never read. | Assets come only from `recon.ts:690` `mergeManifest`; `WebsiteBuild.tsx:796` can only change approval on existing rows. The template route's Recon / Capture prompts are blocked "Existing website URL" (`09-stage-recon.md`). C reported photos as collected but unused. Both builds: `photosUsed: 0`, `heroImage: none`, `areasVisual: none`. | Every no-website Build ships text-only. The build standard's hero, about, our-work, process and map roles all stay empty, and "would I be comfortable charging for this?" weakens. The only way in is hand-writing a recon JSON. | An "Add client assets" step on Capture (upload, or a shared folder path, plus ownership), read from onboarding `photos_status`. Allow it for any route, with or without an old site. |
| D-10 | P1 | J25 | The home-town location page is **on by default** and comes out without genuinely local content. It restates the business facts with "in Shrewsbury" or "in Brighouse" added and competes with a homepage that already targets "<trade> in <town>". | Mapping default "Dedicated page OFF except the template's base-location page" (`docs/website-build-mapping.md` §C–J; `websiteTemplates.ts:380`). D1 `/locations/shrewsbury/` H1 "Locksmith in Shrewsbury…" vs `/` title "Residential Locksmith in Shrewsbury". D2 `/areas/brighouse/` "Plumber in Brighouse" vs `/` "Gas Safe plumber, Brighouse". Neither contains anything local beyond the town name. The gate's duplicate check passed because the wording differs. | Two pages compete for the client's single most valuable query. This is the pattern the brief tells us to fail: no local evidence, only the town name. | Default the home-town page OFF. The homepage owns "<trade> in <home town>". Allow a town page only with a recorded local-content note (real jobs, access, landmarks), and make the gate's intent check require that note. |
| D-12 | P1 | J25 | No new client's enquiry form can work or be tested until an engineer adds the client to `CLIENT_SITES` in code and redeploys `site-enquiry`. | `_shared/site-enquiry.ts:28-30` holds one entry (`bs4`). Both builds reported `formTest: not_run` and raised it as an operator question. | Paul cannot finish a build without a code change and an edge deploy, which he never does himself. Without it the contact page has a form that cannot deliver, or no form. | Move the site registry to a table that Website Build writes. Keep the recipient server-side, as now. |
| D-15 | P1 | Live | No change workflow exists after launch. Facts changed in LeadFinderOS do not reach a built site. The Retry prompt works only for a failed or needs-attention build. The production gate run is never imported, and "Live" is Paul's tick. | `retryPrompt` refuses unless failed / needs_attention (`buildExecution.ts:549-550`); `reviewPrompt` needs a preview; the Live stage is done on `production_url && qa.production_checked` (`websiteBuildState.ts:774`). Paul "never runs terminal commands" (CLAUDE.md §2), but production is PowerShell plus wrangler (`buildPack.ts:931-963`). | The monthly promise ("a new page each month", adjustments) has no generated prompt for a hosted Build site. Removing one invented sentence, changing hours or adding a review needs a free-form Claude Code session in the client repo. | A "Change request" prompt built from the fact-ledger diff since the last build, plus a "Post-launch check" that imports the `--url` gate report into the build record. |
| D-19 | P1 | Optimise generator | Page-generator service+town pages are kept from cloning only by a prompt line. Nothing compares one town's page with another's. | `page-generator/index.ts:163` ("Structure FREELY…"); there is no cross-page similarity check, and the gate's duplicate check runs only on Website Build output or a hand-run `--url`. | Six "lock changes in <town>" pages that differ by town name. This is the doorway pattern of RG's old agency (`pagePlan.ts:164`). | Run the gate's 5-word-shingle similarity across a client's generated pages before they are offered. Refuse at 60% or above. |
| D-20 | P1 | Optimise generator | On page-generator service pages the meta description, H1 and body have no code guard for invented claims. The credential and figure guard (`renderGuarded`) runs only in Q&A advice mode. | `page-generator/index.ts:747` (guard, Q&A only), `:1191` (`out.meta`, `out.h1` returned raw). The prompt's forbidden list omits "24/7" and "emergency". | "24/7", "fully insured" or "Gas Safe" in model prose reaches a WordPress page unless Paul spots it. | Run the D-05 claim check on every page-generator output field before returning it. |
| D-21 | P1 | Optimise generator | The Q&A heading "never the question verbatim" guard does nothing for keyword-style questions. An unapproved service or town in a free-typed question is accepted because, as in D-01, it is never "named". | `intentOwnership.ts:159` replaces h1 with `topicOf(question)`, which normalises to the same string. Reproduced: "24 hour locksmith in Cambridge" → H1 / title "24 Hour Locksmith in Cambridge \| RG Locksmiths". `page-generator/index.ts:696` refuses only `improve_existing`. | A Q&A page whose title claims 24-hour service in a town the client does not cover. | Shared fix with D-01. A heading equal to the question after normalisation falls back to the trade + town (approved only). Refuse when the question names an unapproved service or town. |

**P1 count: 14** (D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-10, D-12, D-15, D-19, D-20, D-21). IDs D-09,
D-11, D-13, D-14, D-16, D-17, D-18 and D-22 to D-24 are the P2s below.

---

## P2 — Improvements

| ID | Sev | Stage | Finding | Evidence | Suggested fix (not applied) |
|---|---|---|---|---|---|
| D-09 | P2 | J25 | The areas-hub map rule ("a static capture of the real map at 2x … with the provider attribution visible") gives no licensed source or operator step. Google Maps' terms do not allow screenshots on a website; OSM does with attribution. Both builds shipped no map and said why. | Prompt X5c (`websiteBuildStandard.ts` lines printed at 08-prompt :587). | Name OSM (or a licensed static-map API) as the source, and add it as an asset step (D-08). |
| D-11 | P2 | J25 | The only template is a live client's site, and locksmith only. Every other trade is designed from scratch by the executing session, so consistency, time and quality depend on that session. The canonical Findable template has not been extracted. | `websiteTemplates.ts:113-121,265,308-310`; `recommendedRoute('Plumber') = bespoke`. | `canonicalPlan`: extract `findable-local-trades-template` with a fictitious sample business and trade variants. |
| D-13 | P2 | J25 | The client's differentiators (`standout`) are in section D but missing from the template's generated config (E2), which X2 calls "the ONLY data". D1's executor used them anyway. | `05-config.json` has no standout; the template has no `standout` field in `fields`. | Add `business.standout` / `proof.differentiators` to `CORE_FIELDS`. |
| D-14 | P2 | J25 | Prompt contradictions and noise. E2's forbidden list includes `locksmith` and `Public Liability` for a locksmith with verified PL insurance. X4 excuses a seed value if it is "in the client config", so the config's own "not 24/7" excuses any built "24/7". The template route's section H says no page plan is approved, and the executor asked whether that was right. Prompts of 50–66K characters carry existing-site rules for clients with no site. "The rating … read at build time" invites a live fetch. | `08-build-execution-prompt.md` (D1 E2 rules; X4); `12-seed-scan-of-config.json` (24/7, Public Liability hits). | Drop a needle from the list when it equals a verified value. Treat negated phrases as non-matches. Print H as "template pages: …" for the template route. Omit existing-site sections when there is no site. |
| D-16 | P2 | J25 | Every page of a template build carries "Built by Findable · Improve your AI visibility", a promotional link to findable.live. It is on by default and not mentioned in the client agreement. | Template `src/data/site.ts showFindableCredit: true`; D1 footer; `clientAgreement.ts` grep for credit returns 0. | Make it a recorded client choice, and keep the wording neutral ("Website by Findable"). |
| D-17 | P2 | J25 | The copy is truthful but mechanical. Differentiators repeat across every page: D1 "fixed price" about 100 times across 15 pages; D2 "dust sheets and shoe covers" on every page. The voice is institutional third person ("Pengwern Lock & Key is…"). Area blurbs are identical town by town. D2 duplicates "£85 for a gas combi or system boiler" inside one card. | `audit-d1`, `audit-d2` page text. | Add a "say each differentiator once per page, prominent on home" rule. Default to a first-person plural voice where the client agrees. |
| D-18 | P2 | J25 | Mobile detail: D2 breaks the email address mid-word on phones ("dean@brookfootplumbing.exam / ple"). The D1 homepage is about 11,800px long at 375. | `390-areas.png`, `375_.png`. | `overflow-wrap:anywhere` on contact rows. Collapse secondary home sections on phones. |
| D-22 | P2 | J24 | `save_website_build` logs a "Launched" History event with route `build` hard-coded, even for an Optimise client's record. | `paid-client-hub/index.ts:484-486`. | Read the route from the onboarding row. |
| D-23 | P2 | Prospect | Prospect Preview pages carry no visible "concept / preview" label, so a forwarded screenshot can pass as a delivered site. They are noindexed and private. | `localTrade.ts:295`; `docs/domain-authority.md:77-78`. | Add a small visible "Preview concept" band. |
| D-24 | P2 | Optimise generator | Leftovers: the page-generator prompt still says "keyword density comfortably UNDER 3%", which code no longer measures; the draft HTML comment sits inside `body_html` and would publish as hidden markup if pasted whole; pages still flagged as stuffed after 3 attempts are returned with an "Edit before pasting" badge. | `page-generator/index.ts:139, 759, 851, 1125`. | Remove the density line, move the comment out of the body, and refuse rather than badge. |

**P2 count: 10.**

**Cross-references, not re-counted:**
- **B-08** (P1): the Welcome Pack tells every client, Optimise included, "We own the website … we can take the site
  down". This was confirmed again in code (`welcomePackHtml.ts:456-462`, pinned by `welcome-pack-content.test.ts:185`).
- **C-07** (P1): the questionnaire promises "Each service in each town becomes its own page"
  (findable-site `OnboardingFlow.tsx:3661,3777`). The generator correctly does the opposite, so a client was promised
  something we deliberately do not build.
- **C-13**: the handoff's "promised / client wants" never reaches the build.

---

## Claim / hallucination audit

Every distinct claim class on both sites, read page by page. Repeated instances of the same claim are not listed
twice.

| SITE · PAGE | CLAIM | VERDICT | SOURCE |
|---|---|---|---|
| D1 · all (header, footer, schema) | Pengwern Lock & Key · 01632 960471 · gareth@pengwernlocks.example | SUPPORTED | onboarding / ledger |
| D1 · `/` H1 | "Shrewsbury locksmith for homes, landlords & letting agents" | SUPPORTED | standout + primary town |
| D1 · `/`, footer | "mobile, residential locksmith based in Shrewsbury, also covering Bayston Hill, Pontesbury, Wem and Church Stretton" | SUPPORTED | mode=mobile, areas |
| D1 · `/`, about, FAQ | "Trading since 2019" | SUPPORTED | years_experience |
| D1 · `/`, footer, FAQ | "£2 million public liability insurance" | SUPPORTED | insurance |
| D1 · `/`, FAQ | "12-month guarantee on parts and labour for locks we supply and fit" | SUPPORTED | guarantee |
| D1 · all services | "TS007 3-star anti-snap cylinders as standard on every lock change" | SUPPORTED | standout |
| D1 · FAQ | "Pengwern Lock & Key describes them as British Standard TS007…" | SUPPORTED (hedged) | standout. The executor flagged that TS007 is a Kitemark spec, not a BS — good judgement. |
| D1 · all | "a fixed price before any work starts" | SUPPORTED | standout |
| D1 · `/`, contact, schema | Mon–Fri 7–7, Sat 8–4, closed Sun; "lockouts are attended within these hours only" | SUPPORTED | hours, availability |
| D1 · emergency page H1 | "Locked out? Emergency lockouts in Shrewsbury, within opening hours." | SUPPORTED | service + hours |
| D1 · FAQ | "Entry is non-destructive where possible … If a lock has to be replaced … fixed price for that first" | REASONABLE PARAPHRASE | service wording + standout |
| D1 · `/`, about, FAQ | "does not take on commercial premises" | REASONABLE PARAPHRASE | "residential only" |
| D1 · contact, FAQ | "no shop or premises to visit" | REASONABLE PARAPHRASE | mobile, address N/A |
| D1 · `/`, areas, about | "all six services offered in every one of these five areas" | UNSUPPORTED (inference; the executor flagged it) | no fact links services to areas |
| D1 · `/` | "A key safe fitted for family, carers, tenants or trades" | REASONABLE PARAPHRASE | generic use of a listed service |
| D1 · FAQ | "A cylinder rated 3-star under TS007 is designed to resist the common attacks on its own…" | SUPPORTED (general product fact, correct) | public standard |
| D1 · FAQ, emergency | "If anyone is in danger, call 999 first" | SUPPORTED (general safety) | — |
| D1 · privacy | "not sold, not used for marketing", retention wording | UNSUPPORTED (a commitment made for the client; the executor flagged it) | none |
| D1 · footer | "Built by Findable · Improve your AI visibility" | not a client claim; Findable promotion (D-16) | template default |
| D1 · schema | `Locksmith`, @id `/#business`, telephone, email, areaServed ×5, opening hours, paymentAccepted; no address, no rating | SUPPORTED | config |
| D1 · anywhere | car keys, safes, 24/7, 24-hour, DBS, MLA, "approved", reviews, ratings, prices, response times, brands, Kent / Canterbury / Morgan | **ABSENT — correct** | keyword sweep: 0 hits each |
| D2 · all | Brookfoot Plumbing & Heating · 01632 960482 · dean@… · "you deal with Dean" | SUPPORTED | onboarding / ledger |
| D2 · `/` H1, all | "Gas Safe registered" | SUPPORTED | accreditations |
| D2 · `/`, servicing, schema Offer | "£85 annual service for a gas combi or system boiler" | SUPPORTED | prices (the gate's price check passes) |
| D2 · all | "Monday to Friday 8am to 6pm. No evening or weekend work." | SUPPORTED | hours |
| D2 · all | same engineer / dust sheets and shoe covers / written quote first | SUPPORTED | standout |
| D2 · about, servicing | "the same engineer is there next year", "the engineer who will come back next year" | UNSUPPORTED (a forward-looking promise beyond "same engineer every visit") | stretch of standout |
| D2 · about | "There is no call centre and no being passed around" | REASONABLE PARAPHRASE | one point of contact |
| D2 · `/`, areas | "Every service is available in every one of these areas" | UNSUPPORTED (inference; flagged) | — |
| D2 · `/`, FAQ | "Do you work for landlords? Yes" | REASONABLE PARAPHRASE | Paul's customer-types intent decision |
| D2 · FAQ, repairs, contact | National Gas Emergency Service 0800 111 999; "by law gas work needs Gas Safe registration"; stopcock advice | SUPPORTED (public safety facts, plain text, not a call link) | — |
| D2 · privacy | "passed to us by the company that runs the website for us, which acts only on our instructions"; "not used for marketing" | UNSUPPORTED (a legal processor statement made for the client; flagged) | none |
| D2 · schema | `["Plumber","HVACBusiness"]`, @id, areaServed ×5, hours, paymentAccepted, Service nodes with provider, Offer £85; no address, no rating | SUPPORTED | facts |
| D2 · anywhere | new boilers, combi installation, drains, bathrooms, 24-hour, weekend, landlord gas certificates, Halifax, insurance, years, reviews | **ABSENT — correct** | read in full |

**INVENTED: 0. MISLEADING: 0.** UNSUPPORTED: 5 classes, all mild. Three were flagged by the executors themselves
(areas × services, privacy commitments). The two "next year" lines were not flagged.

The negatives held because these sessions took `must_not_say` and the N/A rows seriously. **D-01 shows the system
pointed both of them at the forbidden topics.** On this evidence the generator's truthfulness depends on the
executing model, not on a guarantee (D-05).

---

## Entity clarity

**Strong on both: 9/10.** Within the first sentence of each homepage, a machine or a customer gets:
- the exact name;
- the trade;
- the base town and the five areas;
- who it serves;
- the phone and email;
- the genuine credential or proof;
- the differentiators.

The schema has one business node with a stable `#business` @id and the correct subtype (Locksmith;
Plumber + HVACBusiness). Every other page references it, and breadcrumbs are present. Name, phone and email were
identical everywhere (gate `identity` PASS, confirmed by my own extraction).

"Could ChatGPT, Google or Bing understand the entity without guessing?" Yes.

What is missing is **evidence a third party can verify**. No `sameAs` was possible: no GBP or profile was supplied,
and a Build client has nowhere to supply one before the build (D-08).

---

## Site architecture

- **D1:** 14 indexable pages + 404 (home, services hub, 6 services, areas hub, Shrewsbury, about, FAQs, contact,
  privacy). The template's commercial, pricing, safe-opening and garage pages were correctly dropped.
- **D2:** 12 + 404, exactly the typed plan.
- Both are no more than 3 clicks deep, with no orphans and no broken links (gate PASS, confirmed).
- Problems:
  - The home-town page duplicates the homepage's intent (D-10).
  - The intent map's town page was a catch-all (D-02).
  - D2's "Leak, tap and toilet repairs" is a sensible consolidation of three trivial variations. D1's "High-security
    upgrades" sits beside "Lock changes & upgrades" with anti-snap on both, and that overlap is defensible only
    because the lock-change page owns the planned change and the upgrade page owns the swap.

## Homepage

Both answer **who / what / where / why / what next** in the first screen:
- **D1:** "Shrewsbury locksmith for homes, landlords & letting agents" + the areas line + Call Gareth + an hours
  panel + three proof chips (2019, £2m PL, residential only).
- **D2:** "Your Gas Safe plumber and heating engineer in Brighouse" + services sentence + Call + Send an enquiry +
  a proof card (Gas Safe, £85, same engineer, written quote, areas).

The hierarchy is clear and scannable, the CTAs are prominent, and the problem-first service list on D1 ("What's
happened? Locked out / Locks damaged…") is genuinely good UX.

Weaknesses:
- No photography anywhere (D-08), so it reads as a well-made template rather than *this* business.
- D1's home page is very long on a phone.

## Service pages

Every service is genuine and each has distinct intent. Each page explains what it is, who needs it, what is
included, the limits ("within opening hours", "gas boilers"), where it is offered, why the business is credible
(the verified proof only) and what to do next.

Pattern: business → service → problem → who → what's included → process → areas → FAQs → related → CTA.

Weakness: every service page follows **the same section sequence and the same boilerplate blocks** ("Where this
service is available", the proof card). That is fine for crawlers but visibly machine-made to a reader (D-17).
There is no generic filler of the "we pride ourselves" kind, and no keyword stuffing (the gate `duplicates` check
passes; titles and descriptions are unique).

## Location pages

**FAIL on both, by the brief's own test.** The single town page in each build contains nothing local except the
town name (D-10). The other four towns per site were correctly NOT given pages: they appear only in the area
wording.

The areas hubs list each town with **identical text** ("Covered from Shrewsbury: all six services…", ×4). That is
honest but thin.

No map, because there is no way to supply one (D-08, D-09).

## Customer-question content

The CUSTOMER QUESTION → DIRECT ANSWER → DETAIL → EVIDENCE pattern is genuinely followed, both on FAQ hubs and
inside service pages:
- "Can someone come out at night or at the weekend? No. …"
- "How much does a boiler service cost? £85 …"

No title or H1 parrots a baseline question (the gate check passes). No page was created per question. The weak
and invented baseline questions were not turned into content — **in spite of** the intent map (D-01, D-02).

FAQ count is sensible (D1: 19 on the hub; D2: 14). No FAQ schema spam.

## Copy quality

Plain British English, confident, specific, with no clichés ("trusted partner", "look no further", "tailored
solutions" — 0 hits).

Weaknesses (D-17):
- third-person institutional voice;
- heavy repetition of the same three differentiators;
- identical area lines;
- one duplicated price sentence;
- small grammar slips (D2 "If you are in Brighouse, Rastrick, … and Lightcliffe" should be "or"; "Card or Bank
  transfer").

An owner would recognise himself and could share it. Some readers would sense it was generated because of the
repetition, not because of the wording.

## Conversion quality

**Strong on call:**
- `tel:` links everywhere;
- a sticky call (and email) bar on phones;
- the hero call button in the first screen at 375 (D2: H1 ends at 288px, call button at 491px, viewport 667);
- tap targets of 44px or more;
- hours stated at every CTA.

**Honest urgency:** "Locked out? Call within opening hours", with D2's "Outside working hours" block (gas
emergency number, stopcock).

**Weak on proof and forms:**
- no reviews, no photos (D-08);
- the enquiry form is built to the site-enquiry spec but cannot deliver until code is changed (D-12).

## Internal linking

Home links to every service, the areas hub and the town page. The services hub links to each service. Each service
links to its related services, areas and contact. Breadcrumbs appear on every page below home. Nav, footer and
in-content anchors are descriptive ("See boiler repairs", "Lock changes for rented homes").

No orphans and nothing deeper than 3 clicks (gate PASS). Footer link lists are long but not a link farm.

## Metadata

All titles and descriptions are unique (gate PASS) and follow the service · place · business pattern
("Boiler repairs in Brighouse | Brookfoot Plumbing & Heating"). Descriptions run 114–168 characters. There is one
H1 per page and the headings are in order. Canonicals are self-referencing https on the production domain.

No arbitrary town insertion: D1 does not mention "Shropshire" because it was not a recorded fact, and the executor
asked about it.

Minor: D1 H1s end with a full stop as a template style; some titles are near 70 characters.

## Structured data

Valid JSON-LD on every page (gate PASS; read by hand). One entity: Locksmith / Plumber + HVACBusiness. It has:
- a stable @id;
- name, url, telephone, email;
- areaServed = the five verified places;
- `openingHoursSpecification` matching the hours;
- `paymentAccepted`.

There is **no address**, correctly, because both businesses are mobile. There is **no AggregateRating, Review or
FAQ schema**. Service nodes appear only on built service pages, with provider → @id. D2 has a correct Offer
(£85 GBP). BreadcrumbList appears below home.

No `sameAs`, because none was verified. The template's own `schema.ts` emits `founder` and `PostalAddress` when
those are present, so it describes reality only if the config does.

## Technical crawlability

- Fully static HTML (Astro), with **0 bytes of JavaScript** on both sites. All content is present without JS.
- `sitemap-index.xml` + `sitemap-0.xml` list every indexable page and nothing else.
- `robots.txt` names the sitemap.
- Self-canonicals, a 404 page, trailing-slash directory URLs.
- `public/_headers` noindexes `*.pages.dev` only, never the production host.
- No `/*` noindex: the template hazard X1 warned about did not occur.
- The gate's `noindex`, `canonical`, `domain`, `links` and `sitemap` checks all PASS.
- Not tested live: status codes, redirects or https on a real host (no deploy).

## AI crawler access

- **OAI-SearchBot, ChatGPT-User, Claude-User and PerplexityBot are explicitly allowed on both** (D2 adds Googlebot
  and Bingbot), plus `User-agent: * Allow: /`.
- GPTBot and other training crawlers fall under the allow-all rule. Both executors recorded this as Paul's choice
  and did not change it, which is correct: the prompt separates search access from training access.
- No llms.txt, no hidden AI text (gate `placeholders` PASS; read by hand).
- Not testable without a host: WAF / Bot Fight Mode on the production zone (the Final QA prompt's `--url` run covers
  it).

## Mobile

Checked by the executors' Playwright runs at 1440, 1024, 768, 390 and 375 (no horizontal overflow; tap targets of
44px or more) and by my own viewing of their screenshots. Read via image, not seen in a browser by Paul.

What works:
- the D2 375 first screen is one coherent screen: H1, sentence, Call and Enquiry, with a sticky Call / Email bar;
- D1's phone hero is copy + call + hours panel;
- menus and accordions work, and forms validate.

Issues (D-18):
- D2's email wraps mid-word;
- D1's home page is about 11,800px tall at 375.

There are no photos to crop, which is itself the problem (D-08).

## Performance

| | Total dist | JS | CSS | Fonts | Home HTML |
|---|---|---|---|---|---|
| D1 (template) | 1.3 MB on disk | 0 | 47 KB | 10 woff2 files, about 364 KB on disk; 1 preloaded, subsets fetched by need | 75 KB |
| D2 (bespoke) | 360 KB | 0 | 22 KB | 3 woff2, 81 KB | 27 KB |

No images means no image weight and no layout shift from them.

Fonts are self-hosted with `font-display` from Fontsource. D1's HTML is heavy-ish for a text page (inline SVG
icons) but well under the gate's 350 KB warning. **No real performance problem.** No Lighthouse lab run: no host,
and not worth faking.

## Accessibility basics

Both have:
- a skip link;
- one H1 with ordered headings;
- labelled form fields with a hidden honeypot;
- real `<a>` and `<button>` elements;
- aria-labelled menus (D1 "Open menu / Close menu");
- `lang="en-GB"` (checked by the gate);
- decorative icons only.

Contrast on the dark / amber (D2) and dark / orange (D1) palettes looks adequate in the screenshots but was not
measured. No images, so no alt-text risk. No specialist audit was performed.

## Images

**None used on either site, by construction (D-08).** Nothing was stock, generated or seed-client (the seed scrub of
D1 found 0 MCL values in source or `dist`). Morgan's photos, maps, logo, DPOM script key and reviews were all
removed, so X1's inherited-hazard list worked.

No fake before/after. Text wordmarks only, as specified. D2 invented a "B" favicon monogram and asked for approval.
D1 shipped without a favicon (a console 404).

## Evidence / trust

Honest: only the verified proof is shown, and it is given visual weight (D1 proof chips; D2 Gas Safe card). There
are no years, insurance or reviews on D2, where none were supplied. Neither site filled the gap with generic trust
language.

The weakness is volume. A Build client's genuine evidence (reviews, photos, GBP, profiles) has no route into the
build before launch (D-08). Both executors raised "do they have reviews?" as a question for Paul.

## Cannibalisation

| Pair | Verdict |
|---|---|
| Home vs home-town page ("<trade> in <town>") | **Competing** — D-10 |
| Town page as owner of 13 baseline intents in the generated map | **Competing by design** — D-02 |
| D1 lock changes vs high-security upgrades | Defensible, intents distinct |
| D2 boiler servicing vs boiler repairs | Distinct |
| FAQ hub vs service FAQs | Short answers that link to the owner — correct |

There are no duplicate H1s or titles (gate PASS).

## Baseline → website integrity

**The truth set outranked the questions in the OUTPUT. The system did not make it.**
- The generated Site Intent Map assigned invented, not-offered, out-of-area and price-superlative questions to real
  pages (D-01).
- It assigned service questions to the town page (D-02).
- It listed genuinely served-town questions as "unowned" for Paul. That part is correct: they appear only in the
  area wording, and no doorway pages were made.

Neither executor created a page per question or made a location from question text. Both explicitly declined to
answer the forbidden-topic questions and told Paul so.

**Session C's warning holds**: weak questions reach the build prompt unfiltered. With a less disciplined executor they
would become copy.

## Discovery → website integrity

Discovery enters the build only as the lowest-ranked fact source (business name, type, location, specialism —
`paid-client-hub/index.ts:690-698`). Its measurement numbers are never read. That part is sound.

The leak is indirect (D-07). Discovery's specialism and Sales' services are merged into the onboarding row by
"save context", and Website Build then reads them as client-stated and auto-verifies them.

Facts traced in the truth sets:
- **Dropped:** none from section D in either output. `standout` was dropped from the template config (D-13) but used
  anyway.
- **Altered:** template catalogue names replaced the client's wording on cards and URLs ("Burglary repairs" for
  "Lock repairs after a burglary"; "High-security upgrades" for "Anti-snap cylinder upgrades"). These are mild
  re-labels, and the H1s restored the client's words.

## Template / design quality

The two sites look **different**: an orange / dark editorial trade look (the template) versus a navy / amber card
look (bespoke). Neither is a recoloured clone.

Inside each site, though, every service page has the same section skeleton (D-17), and D2 uses the card-grid rhythm
the standard warns against more than D1 does.

Would I be comfortable charging for this? **As a starting site at £99/month, yes.** It looks professional, not cheap
and not an obvious AI template. With the client's real photos and reviews it would be strong. Without them it is
clean but anonymous.

BS4's history is the counter-example. Before the build standard existed, the first real Build needed about 12
correction commits over 3 days (a redrawn logo replaced, reviews, map, hero, form; `BS4ElectricalServices` git log
25–28 Sep). The standard now front-loads most of those rules, and these two builds needed none of those content
rescues.

## Operator control

| Can Paul easily… | Before generation (LeadFinderOS) | After generation |
|---|---|---|
| Remove an invented sentence | n/a | **No** — a Claude Code session in the client repo (D-15) |
| Change a service / location | Yes: fact ledger + mapping, edits saved as needs approval (F13) | Re-run the whole build or edit by hand; no change prompt |
| Change a page title | Page plan (Bespoke); template paths are fixed | By hand |
| Add evidence (reviews, photos) | **No route without an old site** (D-08) | By hand |
| Remove a page | Page plan / mapping | By hand |
| Change the CTA | No field | By hand |
| Update schema facts | Fact ledger → config | By hand; nothing re-syncs |

Pre-generation control is good: the ledger is explicit, nothing unverified is publishable, and decisions persist.
Post-generation control is a developer workflow. Paul does not run commands, so in practice every correction is a
new Claude Code session.

## Build validation

- `npm run build`: PASS on both. Astro type check: PASS (D1, the template's own `npm run check` minus its
  `legacy-urls` step).
- Site gate `--dist`: 16 / 0 warn / 1 fail on both. The one fail is D-03. I reproduced it with an unmodified gate
  and expect file. The expect file differed from the generated map only in the blank pages the executor was told to
  fill (verified by diff).
- Route inventory = sitemap = build result `pages`. No malformed JSON-LD, no broken asset links, no build warnings
  reported.
- LeadFinderOS suites: website-build-v1 148, v2 108, recon 157, mapping 146, execution 163, standard 64,
  quality-standard 59, site-quality-gate 56, intent-ownership 40, pilot-hardening 55, fact-edit-persistence 24.
  **1,020 PASS, 0 FAIL.** None of them asserts D-01, D-02, D-03 or D-04.

## Pre-launch workflow

**Present and mostly right, but not enforced at the last step.** Preview Ready requires all of:
- technical gate checks (pages.dev, noindex confirmed, clean seed scrub, build and link checks);
- the quality standard (strengths decided, intents assessed, old-vs-new upgrade);
- the build standard (map, reviews, form, mobile hero, photos);
- both gate reports passing.

That is a genuinely thorough list. But:
1. D-03 makes it unreachable for any build using the suggested intent format.
2. Production does not require it (D-04).
3. Claim truth is not checked by anything (D-05).
4. The form cannot be proven without a code deploy (D-12).
5. Legal: the privacy notice is generated by the executor, with commitments made on the client's behalf, and
   there are no cookies / terms (both flagged for Paul).

There is no checklist item for client-specific promises (C-13's handoff "promised" never reaches the build).

## Post-launch workflow

The Final Production QA / Production Deployment prompt tells Claude to verify:
- https;
- http / www / apex in one hop;
- robots and sitemap served;
- canonicals and schema on the production domain;
- no noindex;
- the crawler user agents including OAI-SearchBot (`--url` gate);
- email obfuscation;
- forms.

That is complete on paper (`buildPack.ts:980-1000`). **It is not reliably part of the workflow.** The production gate
report is never imported, "Live" is Paul's tick, and nothing re-runs it later (D-15).

Not exercised: nothing was deployed.

## Optimise separation

**Not safely separated in the tooling. Correctly separated in the agreement and terms.**

- The Website Build page and its production steps are available for Optimise clients with no warning (D-06).
- The "Launched" event is hard-coded to Build (D-22).
- The Welcome Pack's ownership / take-down text applies to everyone (B-08).
- The Optimise generator (page-generator) never writes to a client site. It produces paste-ready blocks only, so it
  cannot overwrite an Optimise site. Its risks are content quality (D-19 to D-21, D-24).
- The agreement (9.4, 3.3, 8.6) and findable-site `/terms` are route-correct.

## AI visibility assessment

Against Findable's principles, the generated output is:
- **DISCOVERABLE / CRAWLABLE:** yes (static HTML, sitemap, robots with search crawlers allowed);
- **UNDERSTANDABLE:** yes (entity, services, areas and contact are consistent; one @id);
- **VERIFIABLE:** weakly (no `sameAs`, reviews or profile links, because none can be supplied, D-08);
- **CITABLE / DESCRIBABLE:** yes (direct-answer paragraphs, FAQ answers in plain sentences, prices and hours in text).

BUSINESS → SERVICE → LOCATION → EVIDENCE is extractable on every service page.

Nothing on either site promises AI recommendations. Nothing tries to game them: no llms.txt, no hidden text, no
prompt pages.

The weakest link for the measured outcome is **evidence on third-party sources** (directories, GBP). That is outside
the site, and per `findings.md` it is the only proven lever.

## Client-quality assessment

- **Would the client recognise himself?** Yes: every sentence is about his actual business.
- **Tone:** professional, a little stiff (third person).
- **Embarrassingly AI?** No, apart from the repetition.
- **Claims:** defensible except the two "next year" lines and the privacy commitments.
- **Would he share it?** Yes, especially once his own photos are added.
- **Does it make his business discoverable?** Yes. Recommendable? Possibly, which is the honest ceiling.

## Suggested launch decision

**Allow Build sales once A-01/B-01 (Quick Close) and these D items are fixed:**
- **D-03** (one-line class of fix; otherwise nothing reaches Preview Ready);
- **D-12** (a form registry Paul does not need code for);
- **D-08** (a way to add client photos without an old site);
- **D-04** (production gated on Preview Ready);
- **D-06** (Build hidden for Optimise).

D-01, D-02, D-05 and D-07 should follow before volume, because today they depend on a careful executor.

For the first one to three Build clients, Paul can proceed with a manual stop:
1. a hand claim-read of every page against the fact ledger, using the claim audit above as the template;
2. a hand edit of `section on /` → `/`;
3. a `CLIENT_SITES` deploy;
4. photos added by hand.

### Scores (0–10)

| Area | Score | Why under 8 |
|---|---|---|
| Truthfulness | **7** | The output scored 9: zero invented claims, all negatives held. The process scores lower: nothing enforces truth (D-05); the intent map points at forbidden topics (D-01); merged services become "client-stated" (D-07). |
| Entity clarity | **9** | |
| Architecture | **7** | The home-town page competes with home (D-10); the town page is the intent catch-all (D-02). |
| Content | **7** | Specific and honest but repetitive; institutional voice; identical area lines (D-17); no local content on town pages. |
| Conversion | **7** | Call paths are excellent. The form cannot work without a code deploy (D-12). No reviews or photos to persuade (D-08). |
| Technical SEO | **9** | |
| Local SEO | **6** | No genuinely local content, no map, no GBP / `sameAs` linkage; the town page duplicates the homepage. |
| AI visibility readiness | **8** | |
| Mobile UX | **8** | |
| Visual quality | **7** | Professional, but photo-less by construction, so it reads as a template rather than this business. |
| Operator safety | **5** | Production is ungated by quality (D-04). Build is open to Optimise (D-06). There is no post-launch change path, and every correction needs a developer-style session (D-15). The form needs a code deploy (D-12). |
| **Overall client readiness** | **6.5** | The site is good. The pipeline needs the five fixes above to deliver it without Paul's hands. |

---

## Twelve-question matrix (README §12)

| # | Question | J24 Build / Optimise route consequences | J25 Website build |
|---|---|---|---|
| 1 | Can the operator find what they need? | ⚠️ The route lives in 8 places (B); Website Build shows for every client (D-06) | ✅ Seven stages, one page, prompts on each stage |
| 2 | Obvious what to do next? | ⚠️ B-12 contradictions | ✅ derived stages and blockers; ❌ D-03 makes Preview Ready unreachable |
| 3 | Enough useful information? | ⚠️ handoff never reaches the build (C-13) | ❌ no way to add assets without an old site (D-08) |
| 4 | Unnecessary information? | — | ⚠️ 50–66K prompts with existing-site rules for no-site clients (D-14) |
| 5 | Asks for something it already knows? | ⚠️ the onboarding photos answer is unused (D-08) | ✅ facts preloaded from onboarding |
| 6 | Can they make a harmful mistake? | ❌ Build / production for an Optimise client (D-06) | ❌ production unlocks on a preview URL alone (D-04); merged services auto-verified (D-07) |
| 7 | Is the wording natural? | — | ⚠️ the output is natural but repetitive (D-17) |
| 8 | Does state update everywhere? | ⚠️ "Launched" logged as Build for any client (D-22) | ⚠️ the Live gate report is never imported (D-15) |
| 9 | Does admin receive what it needs afterwards? | — | ⚠️ the build result import is good; post-launch nothing comes back |
| 10 | Are permissions correct? | ✅ admin-only (`paid-client-hub`) | ✅ no GitHub / Cloudflare credential stored; the template is read-only (X1) |
| 11 | Does it work on desktop and mobile? | ⏸ the page UI was not rendered this session | ✅ output at 1440 / 1024 / 768 / 390 / 375 (via screenshots) |
| 12 | Does failure give a useful recovery path? | — | ⚠️ the Retry prompt is good for failed builds; nothing after Live (D-15) |

## Not tested, and why

- **GitHub repo creation, Cloudflare preview, production deploy, custom domain, DNS:** forbidden for D (§10). Gate
  `--url` preview and production runs, the noindex header, http → https, the WAF and crawler user agents: no host.
- **Enquiry form submission:** forbidden (and no `CLIENT_SITES` entry exists).
- **Faithful rebuild and recon / capture of an existing site:** a live crawl of a real business is not allowed, and
  `findable.live` is not a trade site. These routes were reviewed in code and docs only.
- **The Website Build page UI:** not rendered. The deterministic functions it calls were run directly on a payload
  in the served shape. `rebuild_context` itself needs a paid client and admin sign-in; Session C confirmed it complete
  for C1.
- **Page generator live run (gpt-4o):** code review only, two key lines verified. No Optimise fixture was needed for
  the conclusions.
- **Lighthouse / CWV lab numbers, measured contrast ratios, screen-reader pass.**
- **Human visual judgement:** I viewed the executors' Playwright screenshots. Paul has not looked at either site.
- **Run-to-run variance:** one build per route. A different executor or model could behave differently, which is
  why D-01 and D-05 are P1.

## Cleanup

- Local QA build outputs **deleted**: the two client folders with their `node_modules` and `dist`, the template
  clone, the gate copy, the extracts and the screenshots in the session scratchpad. Throwaway scripts
  `scripts/_certd_generate.ts` and `scripts/_certd_generate2.ts` were deleted from the worktree, never staged.
- Evidence files named in this report (`05-config.json`, `07-intent-map.json`, `08-build-execution-prompt.md`,
  `12-seed-scan-of-config.json`, `qa/site-gate.json`, the `390-*` / `375_*` screenshots) lived only in that
  scratchpad and are gone with it. Everything deterministic is reproducible from the two truth sets above, run
  through the functions listed under "What was run". Verified after deletion: `MCLocksmiths-New` is unchanged
  (clean, HEAD `4119c97`) and the primary checkout's `node_modules` is intact.
- **No public fake site exists.** Nothing was pushed or deployed. The template clone's remote was disabled before use,
  and the real `MCLocksmiths-New` repository was only read.
- **No sessions or tokens:** no magic link, no sign-in, no API key used.
- **No domain or DNS changed.** No GBP, directory, sitemap submission or Search Console action.
- **No real client data modified.** No SQL was run and no database row was written by Session D.
- **Persistent QA artefacts:** none in the database. D-range fixture ids were never created, so README §4.4's
  cleanup query has no `ZZ QA-D` rows to show. The only persistent artefact is this report on branch
  `cert/d-site-generation`.

## Cleanup check output (README §4.4)

No D fixtures were created. The §4.4 query was not run, because there is nothing of D's to check and running it
would only list other sessions' fixtures.
