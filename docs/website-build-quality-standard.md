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
5. **Source-site fact rule** (`recon.ts`, supersedes the same-day "every claim needs approval"
   rule): a fact the client's own site states verbatim and consistently — services, areas,
   qualifications, accreditations, memberships, years trading, guarantees, contact details, address,
   payment methods, hours, descriptions — is accepted with basis `source_site`, never "verified".
   Prices, insurance, ratings / reviews, awards, licences, legal / VAT, availability, and any value
   with a superlative or a 24/7 claim still need Paul (24/7 contradicts stated hours across fields,
   which the same-field conflict check cannot see — BS4).

## What BS4 taught (the first validation case)
- An HTML-only recon missed the old Wix site's **Google reviews widget** ("138 Google Reviews", 5
  stars) because it is drawn by JavaScript — the new preview had no reviews at all. Hence the
  rendered-page instruction in the recon.
- The old site's enquiry form submits; the new one opened the visitor's email app — a contact
  downgrade and a pre-go-live blocker until a real handler exists.
- The rest of the BS4 record: `C:/Users/paulj/BS4ElectricalServices` (its README and commits).

## Trade template family (direction, not yet code)
Findable core system (design quality, technical baseline, responsive behaviour, core components) +
a trade variant per trade (imagery, icons, terminology, customer questions, service structure,
high-intent problems, relevant proof). Never simply recolour MCL. BS4 is the electrician variant's
first instance; `WEBSITE_TEMPLATES` still holds only MCL.
