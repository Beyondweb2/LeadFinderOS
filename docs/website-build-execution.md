# Website Build — Phase 4: Build Execution + Cloudflare Preview (2026-09-25)

Builds on Phase 3 (`docs/website-build-mapping.md`). READY TO BUILD → Copy Build Execution Prompt →
Claude Code builds a SEPARATE client repository, deploys a Cloudflare Pages PREVIEW → Import Build
Result → Open Preview. LeadFinderOS orchestrates; no GitHub / Cloudflare API is called from it.

## A. Logo or text wordmark

The MCL logo slot is optional. With no approved logo the generated config carries
`brand: { mark: 'text_wordmark', wordmark: <verified business name> }` and the build prompt renders it
in the template's typography — a logo image is never generated. Only "no logo AND no verified name"
blocks (brand identity).

## B. The build record (`website_build.build_execution`, `websiteBuildState.ts`)

started / completed, template, config fingerprint, repository (url, name, branch, commit), local path,
Cloudflare project, preview URL, deployment id / status, noindex, output dir, the imported result
status, warnings, errors, QA booleans, built pages / services / locations / assets, redirect summary,
seed hits, and `previous` (the last non-failed build). Status is DERIVED (`buildExecutionStatus`):
not started · prompt ready · building (prompt copied) · result ready (built, not deployed) · needs
attention · preview ready · failed. **Preview ready** additionally requires (`previewGateProblems`) a
pages.dev URL, confirmed noindex, a clean seed scrub with no listed hits, passing build and link
checks, and no errors — whatever Claude claimed.

## C–P. The Build Execution prompt (`buildExecution.ts` `executionPrompt`)

Refused (only the blockers are shown, the Copy button is disabled) while anything blocks: mapping
readiness, repository / owner / folder, Cloudflare project name, faithful style / ownership / source
URL, a missing or undecided page plan (non-template), or a destination that IS the template's
repository. Otherwise: the lean route-aware build brief (with the Phase 3 config section for
templates) + EXECUTION:
X1 destination (one expected remote, `git remote -v` before writing, template read-only, other
clients' / Findable repos forbidden, `gh repo create` or STOP with the operator action) · X2 the config
into the template's real config layer, unsupported fields reported · X3 only the listed assets,
originals + web copies, wordmark note · X4 post-build seed scrub of source AND build output — blocks the
preview · X5 selected pages only · X6 SEO / AI basics and the do-not list · X7 commit + push · X8
Cloudflare PREVIEW only (`--branch preview`, noindex header check, tracking off, no production branch /
custom domain / DNS, "wrangler login" as an operator step if unauthorised) · X9 QA (technical, content,
1440 / 1024 / 768 / 390 / iPhone SE) · X10 old-URL coverage on the real build · X11 the JSON result.
Faithful: the approved source architecture, old-domain scrub, every USE asset. Bespoke: the approved
Architecture, no template.

## Q–R. Result schema and import

`buildResultVersion: 1`, status preview_ready / built / needs_attention / failed, repository, local,
cloudflare, build (pages, services, locations, assets, unsupportedFields), redirects, qa, seedHits,
warnings, errors. `parseBuildResult`: raw JSON or a markdown reply; 600 KB limit; recon JSON refused
with a pointer; bad URLs / hashes dropped and named; non-pages.dev preview called out; unknown keys
named. Summary shown before Import. `applyBuildResult`: fills empty project fields; a CONFLICTING value
is kept (and recorded) unless Paul ticks "replace"; success sets preview URL / status / noindex /
latest commit; a FAILED result keeps the previous preview, status and commit. Facts, mapping, route,
page plan, redirects and QA ticks are never touched.

## S–V. Preview and retry

Preview stage (after a result): source and new preview links, repository, commit, deployment, QA, then
Faithful → Visual Comparison (now using the imported preview automatically), Template → Template Review
(no redesign for taste), Bespoke → Design Review. Retry (failed / needs attention): only the errors,
failed checks, seed hits, gate problems, unresolved URLs and the current config — never the build brief
(tested under a third of its length). `builtCoverage` checks every source URL against the routes the
build REPORTED: target missing, chains, loops, homepage, retired, unresolved.

## Verification (2026-09-25)

`scripts/website-build-execution.test.ts` (120 checks) + all earlier Website Build suites. The real page
in a throwaway harness: Build website panel (Prompt ready), import of a markdown-wrapped result →
Preview ready with the preview page and Template Review; a failed result with a conflicting repository →
Failed, project values kept, previous build shown, Retry Prompt offered; 42 route × stage phone views
(375 / 390) and desktop with prompts expanded — found and fixed a Preview-stage overflow (grid columns
needed `min-w-0`, a V2 leftover).
