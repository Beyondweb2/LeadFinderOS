# State of play as written 2026-09-09 — the original preamble and §0

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> The original CLAUDE.md preamble (lines 1–10), moved 2026-09-16:

# CLAUDE.md — read this fully before you touch anything

**You are starting blind. This file is the memory you don't have.** Read it end to end first. Then, when you
discover something that cost you time — a wrong assumption, a trap, a number — **add it here** instead of
letting the next session rediscover it. Correcting a line that has gone stale is also your job.

Facts and warnings, not prose. Keep it that way. If it grows too long to read, it stops working.

---


---

> Moved from CLAUDE.md §0 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: "Fourteen commits on main NOT PUSHED" was true on 2026-09-09 only. At the split (2026-09-16) `main == origin/main`.
> ⚠️ Corrected 2026-09-16: `npm test` is 117 suites and the honest green is **112/117** (2026-09-16) — the five known-stale suites are unchanged.
> ⚠️ Corrected 2026-09-16: Deployed functions with NO source in the repo numbered **17**, not 2, at the deep-clean inventory of 2026-09-15 (`INVENTORY_DEEP_CLEAN.md`).

## 🔴 0. READ THIS BEFORE ANY SECTION BELOW — 2026-09-09 DELETED A LOT OF WHAT THEY DESCRIBE

**Large parts of this file are now WRONG, and they are wrong in the dangerous direction: they
describe machinery that no longer exists, in confident detail.** Paul's brief that day was to audit
the app, delete what is unused, and make it run smoothly. Fourteen commits are on `main` and **NOT
PUSHED** — the live site and the edge functions are still running the OLD code until someone pushes
and deploys.

**⛔ THE FILE IS DUE A REWRITE AND PAUL HAS ASKED FOR ONE.** Until then, treat every section below
as *possibly describing something deleted*. Grep before you believe it.

### What was deleted (do not go looking for it, do not "restore" it)
| Gone | Was |
|---|---|
| The whole **barber / salon / booking / claim** product | 252 files, −32,419 lines. Routes `/p/`, `/s/`, `/claim/`, `/barber`, `/sites/`, `/admin/sites*`; `src/templates/**`; 17 edge functions incl. `generate-barber-site`; the two hostname branches that ran before the router on EVERY page load |
| **`generate-playbook`** (the LLM playbook) | The one that recommended Bing Places and ICAEW-to-an-ACCA-firm. §9's "kept on purpose" note is void |
| The **per-town market view** | `MarketPanel` (1,823 lines), `MeasureMarket`, `useMarketView`, `useInFlightMeasures`, the leads/market toggle on Find Leads, Coverage's measure/add-all/View row actions. **§6e is almost entirely about deleted code** |
| Coverage's **`measured`** rung | Graded off market audits. Coverage now has `worked` (contacted) / `leads` / `untouched` — which is all Paul uses it for, plus population sort |
| The LeadFinder **marketing pages** | `/landing`, `/start`, `/find-clients/:city`, `/terms`, `/guide`, `/how-to-use`. **Signed-out now lands on `/auth`** |
| **Hindi + Urdu**, the demo/walkthrough tour, 63 unimported files, 74MB of unused media, 19 npm deps | |
| **5 barber WhatsApp templates** | Removed from the sendable picker (all needed a claim link no lead has). History still renders them via `TEMPLATE_DISPLAY` |

### What is NEW and load-bearing
- **`npm test`** (85 suites) and **`npm run check`** (typecheck-vs-baseline + build + tests).
  **Run `npm run check` before claiming anything works.**
- 🔴 **THE HARNESS ITSELF WAS BROKEN ON WINDOWS UNTIL 2026-09-12, IN TWO PLACES, AND BOTH FAILED
  TOWARDS "everything is fine".** Fixed in `scripts/run-tests.mjs` and
  `scripts/check-typecheck-baseline.mjs` — both now pass `shell: true` on win32.
  - `spawn('npx', …)` cannot find `npx.cmd`, so all 83 tsx suites died `ENOENT` and the run read
    **"1/84 suites passed"** — which looks like a catastrophically broken codebase rather than a
    broken runner, and invites you to stop trusting the suite.
  - The baseline checker captured **nothing**, concluded *"typecheck: 0 errors, baseline 9 — 9
    baseline errors no longer occur, re-record the baseline"*, and would have recorded an EMPTY
    baseline from a run that never happened.
  - ⛔ **AND 40 OF 83 SUITES COULD NOT FAIL THE BUILD AT ALL.** They print `FAIL`/`N FAILURES` via
    the house `ok()` helper and never set an exit code, so the runner called them PASS.
    `re-engage-vars.test.ts` had been printing 3 FAILURES for days while `npm run check` was green.
    The runner now grades on **printed failures as well as exit code** (`FAILURE_IN_OUTPUT`), which
    is why this is fixed for the 41st suite somebody writes and not just the 40 that exist.
- ⚠️ **FIVE SUITES ARE KNOWN-STALE AND EXPECTED TO FAIL — do not lose an hour on them.** They went
  red the moment the runner started working; every one asserts something a deliberate change
  deleted, so the TEST is wrong, not the product. Triaged 2026-09-12; fixing them was not in scope.
  | Suite | Why it fails |
  |---|---|
  | `audit-push.test.ts` | asserts `site_gen`, a bulk-job type the 2026-09-09 barber deletion removed |
  | `coverage-lead-counts.test.ts` | asserts Coverage's `measured` rung, deleted in the same pass (§0) |
  | `report-attribution.test.ts` | asserts report copy that has since been rewritten |
  | `verdict.test.ts` | same — report wording ("once in 6 answers") that no longer renders |
  | `site-origin.test.ts` | needs **Deno**, which is not on PATH on this machine; passes under Deno |
  **So the honest green number is 85/90 (2026-09-13 late pm; was 80/85 — five suites added since).** If
  you make a change and see 85/90, you have broken nothing; if you see 84, you have.
- **`scripts/typecheck-baseline.txt`** — the 9 deliberate errors are ENFORCED now, compared as a
  LIST. §3's "baseline is 14" is stale; it is 9, and the gate tells you.
- **`scripts/report-origin.test.ts`** — every audit-report URL must be findable.live.
  `yoursites.uk/a/<id>` is now a **301 onto findable.live**, not a proxy (§12/§13 updated in place).
- **`src/components/InboxComposer.tsx`** — the reply box holds its own text. Typing used to
  re-render the whole Inbox and re-filter 3,432 messages *per keystroke*.
- **Inbox bulk send** — `src/lib/inboxBulkSend.ts`, immediate (never queued: these leads have
  already replied). A cold template is refused for the whole batch, by property.
- **`extract-competitors` retries** the ids the model drops (was ~8% of runs left dirty for ever).
- **The niche verdict is the ONLY market verdict now**, at the top of Coverage.

### State of play
- **Supabase CLI is authenticated** — reads and deploys both work. Use it; stop inferring.
- **findable-site is symlinked** at `/home/paulj/projects/findable-site` → the Windows copy, so
  `check-cross-repo-sync.mjs` runs (9/9 pass; price and guarantee agree).
- 🔴 **DENO IS NOT ON THIS MACHINE.** This line said it was installed at `~/.deno/bin/deno`; on the
  Windows host that path does not exist and `deno` is not on PATH, so **`deno check` cannot be run
  here at all** and §3's checklist item is unsatisfiable. §4's rule is what carries the weight
  instead: **the deploy is the only real gate for an edge function.** ⚠️ And the failure is quiet —
  `~/.deno/bin/deno check … ; echo exit=$?` prints `exit=0` from the **echo**, not from Deno, which
  is §3's own capture-the-exit-code-directly warning biting on the command meant to check it.
- ⚠️ **Nothing is deployed.** SPA deploys on push; edge functions need
  `npx supabase functions deploy <name>` — `extract-competitors` is the one with a real pending fix.
- See **`HANDOVER_NEXT.md`** (untracked) for the resume plan and the open decisions.

---

