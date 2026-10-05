# Cleanup integration — 5 October 2026

Integration branch `integration/cleanup-2026-10-05`, worktree `C:\Users\paulj\LeadFinderOS-wt\integration-cleanup`, cut from
`origin/main` `b812af1f` (proved unmoved after `git fetch --all`; no unexpected work on main).

## Branches integrated (in order, `--no-ff`, history preserved)

| # | Branch | Commit | What |
|---|---|---|---|
| A | `fix/manual-onboarding-test` | `262ce9cc` | diagnostics only — the manual-onboarding failure names the findable-site folder it read; record `manual-onboarding-cleanup.md` |
| B | `fix/advanced-website-truth` | `c61c1efc` | **the one app change**: Simple and Advanced Website Build read one rule for the current website (`currentWebsite`) |
| C | `docs/current-workspace-path` | `cdd07d0a` | current guidance: PRIMARY `LeadFinderOS-current`, worktrees `LeadFinderOS-wt\<task>`, ARCHIVE `LeadFinderOS` |

Merge commits: `842d3fdd` (A), `600eb51b` (B), `c4fb9cdf` (C).

## Conflicts

None textual. B and C both edited `CLAUDE.md` and `docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` in different
hunks; both were read after the merge: B's "current-website one is FIXED" open-actions item and its `currentWebsite`
rule line survive, and C's PRIMARY / WORKTREES / ARCHIVE paragraphs survive.

## manual-onboarding — root cause

Not a product bug. The test compares the operator's onboarding questions with findable-site's customer flow, read from
the sibling `../findable-site`. In `LeadFinderOS-wt\` that sibling is a junction to `findable-site-wt\main-mirror`, which
was 3 commits behind findable-site `origin/master` and still held the retired "one page per town" wording. From the new
primary the sibling is `C:\Users\paulj\findable-site` — older and dirty. The production wording is correct and was
not touched.

## The clean findable-site checkout (developer tooling only)

- `C:\Users\paulj\findable-site-current` — a fresh clone of `https://github.com/Beyondweb2/findable-site.git`, `master`,
  HEAD `f23d42e` = `ls-remote` master, clean. Not deployed from, not edited. Refresh: `git -C … pull --ff-only`.
- `C:\Users\paulj\LeadFinderOS-wt\findable-site-current` — a NEW junction to it (the existing `findable-site` junction and
  `main-mirror` were left alone; older worktrees may read them).
- `scripts/findable-site-dir.mjs` — ONE resolver, built on the override that already existed:
  `FINDABLE_SITE_DIR` → `../findable-site-current` → `../findable-site`. Used by the runner (which exports the result so
  every spawned suite reads the same tree), `check-cross-repo-sync`, `manual-onboarding`, `onboarding-audit-fields`,
  `sales-readiness`, `self-sourced-handoff`, and two suites that read `../findable-site` directly with no override at all
  (`lead-lookup-failure`, `call-workspace`). `scripts/findable-site-dir.test.ts` pins the order and fails on any test
  that rebuilds the path itself. No production code reads it.
- Result: the runner prints `findable-site input: …\findable-site-current at origin/master (f23d42e), clean.` with no
  environment variable set.

## Dependencies

- `C:\Users\paulj\LeadFinderOS-current` now has its own `node_modules`: `npm ci` (package-lock is authoritative; `.npmrc`
  `legacy-peer-deps=true`), 337 packages, lockfile hash unchanged, working tree clean afterwards.
- The integration worktree junctions `node_modules` to `LeadFinderOS-current`, not to the archive. Current guidance
  (CLAUDE.md §0/§9, handover 00 / 09 / 12 / 13) now says new worktrees do the same.
- `tsx` is not a dependency and never was — the runner uses `npx tsx` from the npm cache, as before.
- The archive `C:\Users\paulj\LeadFinderOS` is no longer needed for NEW work. It is still not deleted: ~95 older worktrees
  hang off its `.git` and junction to its `node_modules`, and its `SQL_FOR_PAUL_*.sql` files are the only copies.

## Advanced Website Build truth rule (from B, preserved)

`currentWebsite` (`src/lib/simpleBuild.ts`) is the one rule: the URL recorded on the build · a verified Current website
fact (client onboarding, or Paul approved it) · an uncontested value from the client's own records (onboarding, paid
lead row, own-site crawl). A Discovery-only / baseline-only URL is research — labelled "Research only: … not confirmed
as the client's current website" — never the source site and never above a confirmed one. `trustedOldSite` delegates
to it; Advanced (`WebsiteBuild.tsx`) calls it. BS4 and MCLocksmiths (the two live records) resolve as before; nothing
stored is changed. Detail: `advanced-website-truth-fix.md`.

## Gate

`npm run check` in the integration worktree, no `FINDABLE_SITE_DIR`: typecheck 9 = baseline 9 (identical list) · edge
syntax 470 files · edge undefined 68 entrypoints · import graph 1077 files, 0 unresolved, 0 edge-closure faults · build
OK · **315/315 suites passed** (313 before + `advanced-website-truth` + `findable-site-dir`). That includes the Website
Build, service-truth (`wave1-integration`, `pre-sales-final`), manual-onboarding, sales workspace, WhatsApp opener-guard,
payment / client-state and baseline / remeasure suites. The false 313/314 is gone.

## Mutation checks (each applied, run, then reverted with `git checkout`; `src/` diff vs HEAD = 0 afterwards)

| Regression | Caught by |
|---|---|
| Advanced takes a Discovery-only URL as the source site (old line restored) | `advanced-website-truth` (2 fails — wiring) |
| The shared rule itself trusts a Discovery-only URL | `advanced-website-truth` (11), `website-build-simple` (3) |
| Simple keeps its own, different rule (disagrees with Advanced) | `advanced-website-truth` (7), `website-build-simple` (3) |
| Discovery outranks the client's confirmed URL | `advanced-website-truth` (21), `website-build-simple` (45) |
| The retired "one per town you want work from" onboarding wording returns | `manual-onboarding` (1, against current findable-site) |

## Visual QA (fixture data only)

Throwaway harness built from the MERGED tree (the real `WebsiteBuild` page at `?view=advanced`, stubbed `invokeEdge`,
fixture "ZZ QA Brookfoot Plumbing & Heating"; deleted before commit). Intake, Capture and Build pack × verified /
Discovery-only / no website × 1440 and 390 px — 18 states:
- verified: "Using / Blank uses the Current website fact", Open source website is a live link;
- Discovery-only: "Research only: https://brookfoot-guess.example …" present, the rebuild warning on Intake, Open source
  website **disabled**;
- no website: the warning, no research line, Open source website disabled;
- every state: horizontal overflow 0; Copy Recon Prompt, Import Recon Result, Project details, Claude tasks, Back to the
  simple view all present. No regression from the A / C merges (they changed no app file).
The Simple screen was not re-rendered here (its rule is covered by `website-build-simple`, green).

## Deployment

Recomputed from the final diff against `origin/main`: app files changed = `src/lib/simpleBuild.ts`,
`src/pages/WebsiteBuild.tsx` only; no `supabase/` file, no migration, no SQL; `check-import-graph --reached-by
src/lib/simpleBuild.ts` = reached by NO edge function. So: operator-app only — merge to `main`, push, Cloudflare Pages
auto-deploy. No edge function deployed (`whatsapp-status` untouched), no Meta / WhatsApp / Stripe / database change.

## Production verification

- `main` merge `037d1e17` (parents `b812af1f` + integration `f771f571`), pushed after proving `origin/main` unmoved.
  The primary `LeadFinderOS-current` fast-forwarded to it (clean).
- Live bundle, resolved file by file (HTML → entry chunk → `WebsiteBuild` chunk + its 14 imported chunks), on
  **https://app.leadfinderos.com** and **https://leadfinderos-next.pages.dev** — the same build on both (entry
  `index-BZtqZS_o.js`, `WebsiteBuild-DolQxDPv.js`): PRESENT "Research only: ", "not confirmed as the client",
  "No confirmed current website for this client", "Not settled: the client"; GONE the old "No current website is
  recorded for this client". The previous build (`WebsiteBuild-CWrlOtxT.js`) was checked first and lacked them — the
  check can tell old from new. Live about one minute after the push. `leadfinderos.pages.dev` was not used.
- Not done on production: rendering the Advanced page with QA data behind a real sign-in. No QA client has a Website
  Build record, and creating one would mean writing to the live database; the behaviour was proved by the fixture
  render of the same code (above) plus the live-bundle markers.
- No edge function deployed (`whatsapp-status` untouched), no SQL, no Meta / WhatsApp / Stripe / database change.
