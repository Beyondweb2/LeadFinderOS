# Website Build — the Findable quality standard (2026-09-25)

Paul's brief after the BS4 pilot: a Findable website is not finished because it builds, redirects
work, schema exists and the technical SEO is cleaner. It must be good enough to put side by side with
the OLD site in front of the owner. Preview Ready now means BOTH tests: technical / SEO / AI quality
AND perceived website quality.

## Where it lives
- `src/lib/websiteQuality.ts` — leaf module, edge-reachable. Strength categories + decisions, content
  intents, the upgrade review, the rules (`strengthProblems`, `intentProblems`, `upgradeProblems`,
  `qualityGateProblems`), `proposeIntents`, and the words (`QUALITY_STANDARD_LINES`,
  `STRENGTH_RECON_LINES`, `UPGRADE_QA_LINES`).
- Saved state: `website_build.quality` (`strengths[]`, `strengths_reviewed`, `intents{}`) and
  `website_build.build_execution.upgrade` (from the build result). Read / normalised by
  `parseWebsiteBuild` / `normaliseWebsiteBuild` like every other key — **`paid-client-hub` must be
  deployed before the SPA** or a save drops the new keys.
- THE gate: `previewReadyProblems(state, hasExistingSite)` in `websiteBuildState.ts` =
  `previewGateProblems` (technical, unchanged) + `qualityGateProblems`. `buildExecutionStatus`, the
  Build Pack and Preview panels and `retryPrompt` all read it; `website-quality-standard.test.ts`
  (section H) fails if the page or the retry prompt calls the technical-only gate again.
- UI: `QualityPanel` in `WebsiteBuild.tsx`, on the Build Pack and Preview steps.
- Definition of Done: three new preview QA ticks — `old_new_upgrade`, `strengths_kept`,
  `nothing_sparse` (Paul's own look; Claude's report is the gate, Paul's tick is the QA stage).

## The rules
1. **Existing-site strengths** (separate from problems): logo, colours, photography, projects,
   gallery, accreditations, qualifications, reviews, customer groups, service breadth, urgent work,
   pricing, quoting, FAQs, areas, working enquiry form, conversion routes, trust sections, customer
   questions, visual sections, brand cues. The recon lists them (`strengths` in the recon JSON) from
   the RENDERED page; Paul can add more. A re-import keeps Paul's decisions and never forgets one.
2. **No-downgrade:** every strength is Preserve / Modernise / Improve (with where it lives now) or
   Remove (with a reason). Undecided, unplaced, or removed-without-reason blocks the build prompt
   and Preview Ready. An existing site also needs the inventory marked reviewed (even if empty).
3. **Completeness:** each of 11 intents (services hub, service pages, areas hub, location pages, FAQ
   hub, quotes / pricing, about, our work, contact, customer types, urgent problems) is assessed.
   Needed → one primary page, which must exist in the build. Services hub / about / contact marked
   not needed must say why. A new business with no old site still gets this.
4. **Old vs new:** the build result reports `quality.oldVsNew` — verdict `upgrade` / `not_upgrade`,
   the widths compared (1440 and a phone width at least), and `stillStronger`. Not reported, not an
   upgrade, a missing width, or anything the old site still wins → not Preview Ready ("Preview is not
   visually complete"). No numerical visual score.
5. **Source-site fact rule** — ⚠ superseded 2026-09-30 by Paul's broader rule (`docs/website-build-seo-gate.md` §4: every stated fact accepted; only conflicts, ambiguity, 24/7 vs hours, superlatives, prices, tracking IDs held). The 2026-09-25 version, for the record (`recon.ts`, supersedes the same-day "every claim needs approval"
   rule): a fact the client's own site states verbatim and consistently — services, areas,
   qualifications, accreditations, memberships, years trading, guarantees, contact details, address,
   payment methods, hours, descriptions — is accepted with basis `source_site`, never "verified".
   Prices, insurance, awards, licences, legal / VAT, availability, and any value
   with a superlative or a 24/7 claim still need Paul (24/7 contradicts stated hours across fields,
   which the same-field conflict check cannot see — BS4).

## What BS4 taught (the first validation case)
- An HTML-only recon missed the old Wix site's **Google reviews widget** ("138 Google Reviews", 5
  stars) because it is drawn by JavaScript — the new preview had no reviews at all. Hence the
  rendered-page instruction in the recon.
- The old site's enquiry form submits; the new one opened the visitor's email app — a contact
  downgrade and a pre-go-live blocker until a real handler exists.
- **Fixed 2026-09-27: fn `site-enquiry`** (`_shared/site-enquiry.ts`, table `site_enquiries`) — the enquiry backend for every Findable client site. Recipient from `CLIENT_SITES` by site key, never the request; ONLY the production origin delivers, preview / localhost are test mode (Resend test inbox, `[TEST]`), other origins refused; honeypot + fill time + rate limits; stored before the email is sent. Add a client = one `CLIENT_SITES` entry + redeploy. Verified with a test-mode send (row + Resend id); the production path is the same code with the real recipient.
- The rest of the BS4 record: `C:/Users/paulj/BS4ElectricalServices` (its README and commits).

## Trade template family (direction, not yet code)
Findable core system (design quality, technical baseline, responsive behaviour, core components) +
a trade variant per trade (imagery, icons, terminology, customer questions, service structure,
high-intent problems, relevant proof). Never simply recolour MCL. BS4 is the electrician variant's
first instance; `WEBSITE_TEMPLATES` still holds only MCL.

## The build standard (2026-09-27) — what MCL and BS4 had to be rescued for, now required up front

Paul's brief: a new build should START close to the finished MCL and BS4, not need several design-rescue
passes. Both reference sites were corrected by hand for the SAME things after generation, and the
generator had no rule for any of them — the prompt said "use genuine photos" in general, the template's
image slots had no map outside MCL, reviews were never required, the form rule said "must submit" but
named no backend, and Preview Ready could not see any of it.

**Where it lives.** `src/lib/websiteBuildStandard.ts` (leaf, edge-reachable): `IMAGE_ROLES` +
`IMAGE_ROLE_RULES`, `BUILD_STANDARD_LINES` (printed as X5c of the Build Execution prompt, and again in a
retry that fails it), `SITE_ENQUIRY_ENDPOINT` (X5d), the `StandardReport` the build must return as
`quality.standard`, and `standardProblems(report, evidence)`. `standardEvidence(state)` in
`websiteBuildState.ts` DERIVES what the client has (approved photos, review evidence, a working old form,
the areas-hub decision, verified credentials); the X5c prompt prints the same evidence, so prompt and gate
cannot disagree. `previewReadyProblems` = technical + quality + **build standard** — still one gate.
The Quality panel shows the reported standard and its problems. The map is now a CORE asset slot
(`CORE_ASSET_SLOTS`), so bespoke / faithful builds get it (BS4 was bespoke and had none).
Tests: `scripts/website-build-standard.test.ts` (rules, evidence, gate, slot, the two regressions) and a
block in `website-build-execution.test.ts` (prompt, result import, save round trip, retry).

**The lessons, and what became a rule:**

| Corrected by hand on | Lesson | Now |
|---|---|---|
| both | the hero photo sat as a block under the text on phones | mobile hero = the photo behind the copy (one first screen); `stacked` needs a stated reason |
| both | neither first build showed any genuine reviews | reviews shown by default when there is review evidence; never invented, no review schema |
| BS4 (`/areas/`, 2026-09-27) | the areas hub led with an EV-charger job photo | Areas hub → the MAP is the default primary visual; fallback = a genuine local / geographic image, then a genuine job photo only if it shows the locality — every fallback states why; an unrelated image always fails; a map is never a background; phone crop keeps labels legible |
| MCL (`/locations/`, 2026-09-27) | the map was scaled down whole on phones (~6px labels) | the same legibility rule; MCL got a phone crop |
| MCL (9780737) | a ring diagram stood in for a map | never drawn, no pins / radius / polygons |
| BS4 (cb5e08e) | a mailto / text-plain "form" | `mailto_form` always fails; a working old form cannot become `none`; a real form must pass a test-mode submission (site-enquiry) |
| BS4 (7e58ee2, c347e59) | photos repeated; the owner portrait twice | a photo once per page; repeats reported and gated; photographic strength JUDGED, not counted (`photographyPreserved`: roles covered, old gallery / project strength kept, not sparser than the source; never padded with weak shots) |
| BS4 (4cbefa8) | NICEIC / SMAS held back from the first build | verified credentials reported as prominent |
| both | card-grid sections, generic copy | section-rhythm and evidence-first rules in the prompt (judged in the old-vs-new review, not a number) |

**Refined 2026-09-27 (Paul, same day — do not overfit to MCL / BS4):** (1) the Areas image is a
preference order, not a ban — map, then a genuine local image, then a genuine job photo only where it
shows the locality, each fallback with a reason (`areasVisual` `job_photo`; `other` = unrelated, always
fails). (2) The "use half the approved photos" quota is gone — a large library must not force weak or
redundant images; the gate asks `photographyPreserved`. (3) Genuine source-backed reviews AND the
confidently sourced current rating / count show by default, the rating with a snapshot date
(`ratingAsOf`); held only for a conflict, uncertain identity, an unsourced figure or another evidence
concern (`ratingHeldReason`). `review_rating` / `reviews_on_site` joined the source-site fact allowlist
(`recon.ts`): they auto-accept on the same terms as any source fact and are no longer a routine Paul
approval. Still never invented, no automatic Review / AggregateRating schema, no fake stars.

**Deliberately NOT generalised (human / client judgement):** WHICH genuine photo is the hero (BS4 went
ceiling-light → owner portrait → conservatory on Paul's taste); the brand accent (MCL recoloured its logo
orange); which towns are listed (MCL waits on Morgan); a rating whose sources conflict or whose
profile identity is uncertain; a referral-only service (MCL car keys); whether the old site's content is Morgan's words.
The standard names the ROLE and the rule; the choice inside it stays Paul's.

**Regression.** MCL and BS4 are fixtures, not regenerated: each site as first generated fails the gate
for exactly the corrections made by hand, and each as it stands on 2026-09-27 passes
(`website-build-standard.test.ts` F).

**Deploy order.** `paid-client-hub` imports `websiteBuildState.ts` (the save rule) — deploy it BEFORE
the SPA, or a save strips `build_execution.standard`. `prospect-preview` also reaches
`websiteTemplates.ts` but only reads the seed values, which did not change.

**Still not decidable by the generator:** whether a photo is good enough at hero size, whether the
owner would feel the new site is an upgrade (the old-vs-new review stays Claude's report + Paul's tick),
whether a map crop is legible (reported, not measured), and whether the site key is registered in
`CLIENT_SITES` (an operator step; the build reports `formTest` `not_run` until it is).
