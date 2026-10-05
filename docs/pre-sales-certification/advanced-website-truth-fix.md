# Advanced Website Build — one truth rule for the current website

- **Date:** Monday 5 October 2026. **Branch:** `fix/advanced-website-truth`, cut from `origin/main` at `b812af1f`
  (proved equal before branching). **Not merged, not deployed** — no edge function changes, no SQL.

## The old inconsistency

The simple Website Build flow (`?view=` default) decided "the client's current website" with
`simpleBuild.trustedOldSite`: the recorded source URL, else the Current website fact only when it was verified or
Prepare would accept it. A URL that only a Discovery scan offered was refused.

The Advanced view (`?view=advanced`, `src/pages/WebsiteBuild.tsx`) had its own line:

    existingSiteUrl = state.source_site_url || <the Current website fact, if not rejected / not applicable>

so a Discovery-only (or baseline-context-only) URL — status *needs approval*, never confirmed — became the source
site there: "Using the Current website fact: …", an enabled "Open source website" link, the Recon / Capture prompts
pointed at it, the faithful-rebuild "no current website" warning disappeared, and the Build Execution blocker
"Source website URL" was satisfied by it. Two interpretations of one business fact. (The simple screen was protected
only because it re-derived its own pack.)

## The authoritative truth rule (`currentWebsite`, `src/lib/simpleBuild.ts`)

One function, read by both views. In order:

| Trusted as the current website | `basis` |
|---|---|
| The source URL recorded on the build (Paul typed it in Project details, or Prepare wrote it from this rule) | `recorded_source` |
| A VERIFIED Current website fact (the client said so at onboarding with nothing disagreeing, or Paul approved it) | `confirmed_fact` |
| A value Prepare accepts by the truth order — the client's onboarding answer, the paid lead row, a crawl of their own site — when nothing of equal standing contests it (a Discovery / baseline disagreement is a lower source and loses) | `client_record` |

Anything else — a URL only a Discovery scan or a baseline context offered, or the client's own records contradicting
each other — is **not** the current website. It is returned as `research` and shown with one sentence
(`researchSiteNote`), in both views:

> Research only: <url> was suggested by the Discovery scan — it is not confirmed as the client's current website, so
> nothing is rebuilt from it. Approve the Current website fact (Client Build Facts) or enter the address if it is theirs.

(A contradiction between the client's own records reads "Not settled: the client's records disagree …" instead.)
Rejected / not-applicable values are neither trusted nor shown. Paul approving a Discovery URL makes it trusted — a
human confirmed it.

`trustedOldSite` is now a thin wrapper over `currentWebsite`; there is one rule, not two.

## Code changed

- `src/lib/simpleBuild.ts` — `currentWebsite`, `CurrentWebsite`, `researchSiteNote`; `trustedOldSite` delegates; the
  simple "No current website on record to rebuild from" blocker now carries the research sentence.
- `src/pages/WebsiteBuild.tsx` (Advanced) — `existingSiteUrl = currentWebsite(state.source_site_url, websiteRow).url`;
  `factSiteUrl` is only a TRUSTED fact (placeholders and "Using / Blank uses the Current website fact" lines no longer
  show a Discovery guess); the research sentence appears in Project details, the Capture "Source website" panel and the
  faithful-rebuild warning, which now reads "No confirmed current website for this client …"; the Preview panel's empty
  state reads "No confirmed current website". Every existing control is kept.
- Not changed: the fact ledger and its sources (`buildFacts.ts`, `clientFacts.ts` ranking — Discovery already ranks
  below onboarding and the lead row), the service-truth rules, the stored record format, the server's save / launch rule
  (`websiteLaunch.ts` reads `stateHasExistingSite`, unaffected), any edge function.

## Historical records

Read-only check of the live database (5 Oct 2026): exactly two leads have a Website Build record.
**BS4 Electrical** (bespoke route, verified Current website fact) and **MCLocksmiths** (no route, website in onboarding
and on the lead row) — both resolve to the same site before and after the fix. Nothing is rewritten: the rule is
derived on read, no stored URL is deleted or altered, and `parseWebsiteBuild` is untouched.

## Tests

`scripts/advanced-website-truth.test.ts` — 59 checks, run through the real derivation on fixture clients:
client-confirmed URL accepted (alone, and with a Discovery scan disagreeing) · paid lead record accepted · recorded
source accepted · trusted crawl accepted · Paul-approved Discovery URL accepted · Discovery-only and baseline-only URLs
not authoritative, kept as research with the wording · the OLD Advanced derivation took the Discovery guess (proves the
bug) · Discovery cannot overwrite onboarding / lead row / recorded source · Prepare never writes the guess as source or
web address · Simple and Advanced give the same answer on eight fixtures · Visual rebuild and Close recreation still
need a trusted current site (simple blocker + Advanced "Source website URL" execution blocker) · a Findable-template
build needs no old website · Optimise unchanged (one refusal, no master prompt) · BS4- and MCL-shaped records load and
resolve as before · wiring (the page calls `currentWebsite`, the old `|| factSiteUrl` line is gone, controls kept).

`scripts/website-build-simple.test.ts` — its copy of "the page's derivation" now uses `currentWebsite`; all pass.
Service truth: `wave1-integration` and `pre-sales-final` pass.

`npm run check`: typecheck at the 9-error baseline (identical list), edge syntax (470 files), edge undefined
(68 entrypoints), import graph (0 unresolved, 0 edge-closure faults), production build, **313/314 suites**. The one
failure, `manual-onboarding`, compares onboarding wording with the local `findable-site` checkout (last commit
2 Oct) — the same failure recorded on `origin/main` in `website-build-simple.md`; this branch touches no onboarding text.

## Visual / behavioural check (fixture data only)

A throwaway harness (the real `WebsiteBuild` page at `?view=advanced`, stubbed `invokeEdge`, fixture client
"ZZ QA Brookfoot Plumbing & Heating" on a faithful rebuild, no network; deleted before commit) rendered Intake,
Capture and Build pack for three clients:

| Client | What Advanced shows |
|---|---|
| Verified current website | "Using the Current website fact: https://brookfootplumbing.example", Open source website enabled, no warning |
| Discovery-only website | Warning "No confirmed current website for this client …" + the Research-only sentence naming the guess; field placeholder blank; Open source website disabled; Recon prompt "missing: Existing website URL" |
| No website anywhere | The warning without a research line |

Copy Recon Prompt, Import Recon Result, Project details, the Claude task buttons and "Back to the simple view" are present
in every state. At 390 px (iframe) all nine states have `scrollWidth == clientWidth` — no sideways scroll; the research
line wraps. Headless Edge screenshots (desktop 1440, phone 390) were read; nobody has seen it with a real sign-in.
