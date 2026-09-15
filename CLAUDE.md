# CLAUDE.md — read this fully before you touch anything

**You are starting blind. This file is the memory you don't have.** Read it end to end first. Then, when you
discover something that cost you time — a wrong assumption, a trap, a number — **add it here** instead of
letting the next session rediscover it. Correcting a line that has gone stale is also your job.

Facts and warnings, not prose. Keep it that way. If it grows too long to read, it stops working.

---

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

## 1. What the business is

- Paul sells **AI visibility** to local UK businesses. **£99, one-off, ONE FLAT PRICE FOR EVERYONE**
  since 2026-09-12 — the founder-vs-full split stays deleted (history £49.99 → £99 on 2026-08-04 →
  flat £49.99 on 09-03 → **flat £99 on 09-12**). Price + guarantee wording live in
  **`src/lib/findableOffer.ts`** — one constant, shared by the SPA docs and the checkout/webhook
  edge functions. findable-site (separate repo) carries its own copy; changing either means a
  matching pass in the other, and `scripts/check-cross-repo-sync.mjs` fails the build on any drift.
  ⚠️ **THIS BULLET SAID "£49.99 … and £99 is charged to nobody" FOR NINE DAYS AFTER THAT STOPPED
  BEING TRUE**, which is the exact inversion §0 warns about: confident prose describing the opposite
  of what the code does, on the first page anyone reads. The constants were right the whole time.
- **THE WEBSITE BUILD IS INCLUDED IN THE £99 SINCE 2026-09-12** — the separate £49.99 build line
  item is **deleted from `findable-checkout`** and `WEBSITE_BUILD_PRICE_GBP` is gone from
  findable-site. Ticking "build my site" now adds **hosting only**.
- **£9.99/month hosting** is the product's only recurring charge, live since 2026-09-03. A ticked
  checkout is still `mode: subscription` (one line now, not three): **£99 today, £9.99/month after**.
  Unticked is `mode: payment`.
- 🔴 **THE OFFER IS £99 TO START **AND** £29.99 A MONTH. ONE SHAPE, TWO HALVES (2026-09-14).** The
  £99 covers the measurement, the pages and the work to get them named; the £29.99 keeps them there
  — more pages every month, replying to their Google reviews, and watching the technical side of
  their site. It is **automatic and delayed**: a real Stripe subscription
  (`_shared/delayed-subscription.ts`) starting on the day the claim window closes, which is the
  four-week results **plus 14 days**.
  - ⛔ **THIS BULLET SAID "£49.99/month, OPTIONAL and COPY-ONLY, sent BY HAND as a Payment Link"
    UNTIL 2026-09-14** — wrong price, wrong shape, and wrong about whether code charges it. §0's
    exact failure: confident prose describing the opposite of what the code does, on the first page
    anyone reads. The constants were right the whole time (`FINDABLE_MONTHLY_GBP`).
  - ⛔ **NO SURFACE MAY NAME ONE FIGURE WITHOUT THE OTHER.** The whole product read as a one-off
    with something bolted on because every screen led with the setup fee: "Pay once" headlined the
    pricing section, the card showed £99 alone, /terms opened "for the one-off fee", the Stripe
    receipt said "4-week cycle", and the report told the one customer who also pays hosting that
    there was "nothing extra to pay". Swept 2026-09-14, both repos, §26.
  - ⛔ **BINDING COPY COUNTS FROM THE RESULTS, NEVER "week six".** Week six is results + 14 days
    only when the results land on day 28 — later whenever the replay holds, and **day 56 for RG by
    contract, whose second payment is week ten.** /terms, /refunds, the pay screen, Stripe and the
    emails all say "14 days after you get your results". The pricing TIMELINE may say "From week 6"
    because it states day 28 in the row directly above it.
  - ⛔ **NEVER CLAIM AN SEO SCORE.** "watch the technical side of your site so nothing slips" is the
    ceiling and is written into the comments as one: nothing measures a score, and site quality is
    tested NEGATIVE for being named by AI (§5).
  - ⚠️ **"Reply to your reviews" is a REAL promise since 2026-09-14** (Paul is doing it) and it
    needs the client's GBP access. Every surface used to say *help* replying. If that access ever
    leaves the flow, the word goes back to "help". Asking for a review is still the client's.
- Audit whether **ChatGPT and Gemini name them** when a customer asks for their trade in their town.
- Fix what AI reads: pages on **their own site**, a page per service per town, plus consistency in
  the sources the evidence says matter for that trade.
- **Re-measure at 4 WEEKS** (since 2026-09-03; it was 8).
- 🔴 **THE GUARANTEE IS NO LONGER WORK-BASED. SINCE 2026-09-12 THE REFUND IS CONDITIONAL ON THE
  MEASUREMENT GOING UP**, on Paul's instruction and confirmed by him on the record. It used to
  promise the audit + the work + the re-measurement and explicitly disclaim the outcome; it now
  says: we measure before we start, we re-measure after four weeks on the same questions and the
  same engines, and **if that number has not gone up, they email us within 14 days of their
  four-week results and we refund their £99.** (Wording as of 2026-09-13 — Paul cut "we will show
  you both sets of numbers": the four-week results ARE both sets. One constant now, 236 chars, §21.)
  - ⛔ **EVERY HEDGE WENT WITH IT** — "we do not promise you will be named", "the engines decide
    that", "anyone who promises it is guessing" are deleted from both repos. **Do not reintroduce
    one next to a conditional refund**: a promise with a disclaimer stapled to it reads as walking
    it back, which is worse than either wording alone. The old "never write copy that promises the
    outcome" rule is SUPERSEDED for the refund sentence specifically.
  - ⛔ **`findable.live/refunds` IS THE CUSTOMER-FACING AUTHORITY** and carries Paul's exact
    wording. Nothing on either site may contradict it; if the guarantee constant changes, that page
    changes in the same commit.
  - ⚠️ **The refund now turns on something we do not control**, so the four-week re-measurement has
    to genuinely run on the SAME questions — `audit-baseline.ts`'s stored set and §17's measurement
    lock are what make a claim adjudicable. Do not loosen them.
  - ⚠️ **£99 is written INSIDE the guarantee string**, so the promise and the price can now
    disagree with nothing throwing. `check-cross-repo-sync.mjs` asserts the text contains
    `FINDABLE_SETUP_PRICE_GBP` — that is why the check counts 10 now, not 9.
  - The functional half is **`REMEASURE_OFFSET_DAYS = 28`** (`src/lib/deliveryCockpit.ts`); the
    words are `FINDABLE_GUARANTEE` ("the re-measurement at week four"), byte-locked to
    findable-site's copy by `scripts/check-cross-repo-sync.mjs`.
  - ⛔ **RG LOCKSMITHS IS PINNED AT 8 WEEKS AND MUST STAY THERE.** He is the one **legacy
    OUTCOME-guarantee** client ("named in more AI answers after 8 weeks than today"), and the
    constant only supplies a default for a lead with **no stored `remeasure_due_date`** — his was
    NULL, so the change would have jumped his re-measure from 6 Oct to **8 Sep, five days after the
    change**. His +56 date is stored by hand. The 8-week references in `audit-baseline.ts` are
    **deliberately unchanged**: they describe what he was actually sold, and rewriting them would
    misrepresent an existing customer's promise. Ronnie already carried a stored date (2026-10-13).
- **TWO PAYING CUSTOMERS: RG Locksmiths and Ronnie.** (This line read "zero" until 2026-09-08 and
  was months stale.) Nothing is yet proven at scale — don't write copy implying a track record —
  but "no paying customer has ever…" is now a false premise. **Re-count before quoting a number**;
  `paid` is `amount_paid > 0` with two 2026-09-03 refinements (a floor, and churn) — see §11.
- 🔴 **DELIVERY WORKS EXACTLY TWO WAYS, AND SOME CUSTOMERS CANNOT BE SERVED.** Either their site is
  **WordPress and we can have access** (pages publish automatically), or **they let us move the site
  to our hosting**, copied as-is. Hand-editing Wix/Squarespace is ~15 min a page forever and does not
  work at £99. Since 2026-08-05 the questionnaire asks both (`website_platform`,
  `willing_to_migrate`) and **`src/lib/serveGate.ts` decides**: serve / flag / block.
  - **`findable-checkout` refuses a blocked row before creating a Stripe session** — that is the real
    block; the site's `CannotServePanel` is only presentation. `notify-onboarding-submit` derives the
    same verdict and labels the email, keyed off the **submitted row** (a blocked visitor never
    clicks pay, so keying off the checkout would miss them).
  - **A BLOCK ONLY FIRES WHEN WE ARE CERTAIN.** A skipped or `not_sure` platform, WordPress with
    unconfirmed access, and unrecognised column values all **flag, never block**. `no_website`
    **serves outright** — it is the best case (we build it on our hosting). 20 of 144 states block,
    all requiring an explicit `migrate = 'no'` **and** a known hand-edit platform.
  - ⚠️ **The verdict is DERIVED, never stored.** No `serve_decision` column — a stored verdict
    freezes old rows at a stale rule and lets the three callers drift.
  - ⚠️ **findable-site carries a hand-kept MIRROR at its own `src/lib/serveGate.ts`.** Change both.
    Diff the two `serveDecision` bodies; they were byte-identical (3635 chars) on 2026-08-05.

---

## 2. How Paul works

- **He is non-technical.** He does ideation, scoping, plan review, product judgement. You write and run all code.
- **He never runs terminal commands.**
- ✅ **YOU CAN RUN SQL YOURSELF, AND PAUL ASKED YOU TO (2026-09-10).** His instruction: *"if there
  is ever an SQL to run, either you run it yourself if possible, or give it to me to run so I can
  copy and paste it."* **The supersedes the old "never run SQL yourself" rule.**
  - **How:** `POST https://api.supabase.com/v1/projects/<ref>/database/query` with
    `{"query": "..."}` and `Authorization: Bearer <token>`, where the token is read AT RUN TIME
    from `~/.supabase/access-token` (the Supabase CLI's own login). Returns 201 and a JSON array.
    ⛔ **Read the token inside the script; never echo it, never write it to a file.**
  - ⚠️ **THIS CONTRADICTS THREE OLDER NOTES THAT SAID IT WAS IMPOSSIBLE.** There is no `psql`, no
    SQL-execution RPC (`exec_sql` and four other names all 404), and `db push` needs the database
    password and is broken anyway — all true, and all about the *other* routes. The Management API
    was never tried. Verified 2026-09-10 by running the `ai_audits.archived_at` migration.
  - ⛔ **STILL STOP AND ASK BEFORE ANYTHING DESTRUCTIVE.** Being able to run SQL is not permission
    to drop, truncate, delete or rewrite rows. Additive and idempotent DDL (ADD COLUMN IF NOT
    EXISTS, CREATE INDEX IF NOT EXISTS) is what this is for. Anything else: show him first.
  - **Always verify afterwards by reading the schema back**, not by trusting the 201 — and say what
    you verified. A migration that "ran fine" while the code still cannot see a column is a
    recorded failure mode (§6).
  - If it ever fails, fall back to his stated second preference: **hand him the SQL in one
    copy-pasteable block** for the Supabase SQL editor.
- **Never assume a migration file is live** (see §6).
- **Shell is PowerShell**: `;` not `&&`. The Bash tool is Git Bash, separate syntax. Both are available.
- **Plain English, no jargon.** Lead with the answer. Questions at the very end.
- **Plan first, then stop** for a new piece of work. Once he approves, build the whole thing without stopping.
- **Hard stop and ask** before anything irreversible he hasn't already authorised: merges, pushes, SQL,
  deletions, payments, deploys, access changes. If the brief already authorises it, proceed.
- **Screenshots need him.** The in-app Browser pane does not display in this environment (`the Browser pane is
  not displayed, so the page is not compositing frames`). `read_page`, `get_page_text` and `javascript_tool`
  work fine without it — use text proof and say plainly that nobody has *seen* the thing.
- **There is no browser session at `localhost:8080`**, and RLS blocks the anon key, so an authed page cannot be
  loaded the normal way. What works: pull the service-role key from the linked Supabase CLI
  (`npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json`), run a **throwaway Vite
  harness** that patches `window.fetch` to attach it for Supabase URLs only, and mount the real page in a
  `MemoryRouter`. Real hook, real component, real rows; only auth and the router shell are substituted.
  Read-only, delete the harness before committing, and **tell Paul you used the service key**.
  If the harness fakes router history, make the fake previous entry match the case under test — a hardcoded one
  gives a real-looking but wrong destination.

---

## 3. The discipline checklist

Recon:
- [ ] Read the actual files before editing. Do not re-recon what a brief tells you is already verified.
- [ ] Grep to verify a list you were handed. Previous sessions got the reader list wrong three times.
- [ ] 🔴 **ANY PLAN APPROVED FOR BUILD MUST HAVE ITS NUMBERS RE-DERIVED FROM THE LIVE DATABASE BY
      THE SESSION THAT BUILDS IT.** Paul's rule, 2026-08-14, after the SECOND crossed-session
      approval: one referenced functions this repo does not contain (`deriveMarketState`), the
      other quoted populations that do not exist in production ("the 302", "Locksmith In"). An
      approval names intent; the building session re-establishes every fact. Both incidents were
      caught by grepping for the named symbols and counting the named rows FIRST — do that before
      accepting any scoped plan, including your own from an earlier session.

Git:
- [ ] `git fetch origin`, then prove `origin/main == HEAD` **before** branching. Print both.
- [ ] Branch per task off `main`. Branches are kept, never deleted.
- [ ] Prove every git step with **real command output**, using **variables** (`$o = (git rev-parse origin/main)`)
      — never a hand-typed hash.
- [ ] Prove `origin` is still unmoved immediately **before** pushing.
- [ ] **NEVER edit a source file with a PowerShell `Get-Content` / `Set-Content` round-trip.** Proven
      2026-07-30: removing a block from `AiAudit.tsx` that way double-encoded **194 lines** of
      non-ASCII (em dashes, curly quotes) — `Get-Content` decoded UTF-8 as cp1252 and `Set-Content`
      re-encoded the mojibake, also adding a BOM. Caught by the diff jumping to 296/465 and a
      `Select-String 'â€|â”€'` grep. Reversible (`GetEncoding(1252).GetBytes` → `UTF8.GetString`,
      write with `UTF8Encoding($false)`) but do not create the problem: use the Edit tool.
      🔴 **BIT AGAIN 2026-08-14, on THIS file, via a "harmless" one-line `-replace`** (commit
      `e488133b`): 640 lines mojibaked AND the intended correction silently never applied — the
      regex was built from real UTF-8 text and could not match the mis-decoded string, so the
      commit was pure damage that LOOKED like a fix. Caught a day later only because an Edit-tool
      old_string stopped matching. There is no safe PowerShell text edit on this repo's files;
      the rule has no exceptions for edits that look too small to matter.
- [ ] Commit with `-F <file>` (PowerShell mis-parses multi-line `-m`). End with:
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- [ ] Merge `--no-ff`.
- [ ] **Never stage `HANDOFF.md`, `ONBOARDING.md`, `HANDOVER_NEXT.md`, `RECON_PAGEDB.md` or
      `RECON_FOR_CLAUDE.md`.** Untracked on purpose. Stage files explicitly; never `git add -A` blind.

Checks:
- [ ] `npm run typecheck` — **baseline is 14 errors** (was 15 until 2026-07-30; one `TS2352` cast in
      `useOutreach.ts` went away when three hand-rolled lead updates became one function). Flag any
      change from 14. Do not "fix" the 14.
      **Compare the error LISTS, not the counts.** A count that matches can still hide one new error
      masking one removed one. `... | Select-String "error TS" | ForEach-Object {...} | Sort-Object`
      into a file for each side, then `Compare-Object`.
- [ ] **`npm run typecheck` PASSING AT BASELINE DOES NOT MEAN IT COMPILES.** Proven 2026-07-30: a
      stray backtick inside `playbookDoc.ts`'s CSS template literal terminated the string early and
      broke the Vite build outright — and `tsc` still reported exactly 14, the clean baseline. Vite
      (SWC) said "Expected a semicolon"; tsc recovered and reported the same 14 semantic errors.
      **Always run `npm run build` as well** — it is the only check that catches this class of fault.
      Related: never put a backtick inside a template literal, even in a comment inside one.
      🔴 **THAT LAST SENTENCE BIT AGAIN ON 2026-09-12, IN `aiAuditReportHtml.ts`, IN AN HTML COMMENT
      EXPLAINING THE CODE.** Writing `` `startBtn` `` inside a `<!-- -->` that lives inside the
      returned template literal TERMINATED THE STRING, and tsc reported nine syntax errors — the
      same COUNT as the clean baseline, so a count-only check would have read green. **Put prose
      about a template literal OUTSIDE it**, or name variables without backticks.
- [ ] **`deno check --sloppy-imports` on EVERY changed edge function file.** Capture the exit code
      **directly**, not through a pipe — a pipe reports the pipe's status, not Deno's.
      **`npm run typecheck` does NOT cover `supabase/functions`.** That gap put checkout down for 15 hours.
- [ ] `generate-barber-site` has 3 **pre-existing** supabase-js generics errors (~lines 59/693/895). Prove
      pre-existing with `git stash` + re-check. Don't fix them.
- [ ] `google-place-details` has **4 pre-existing** errors (1 × `TS2353` on `logUsage`'s insert, 3 ×
      `TS2345` passing the client to `logUsage`). Proven by `git stash` 2026-07-30. Line numbers move
      as the file changes — **match on the message, not the line.**

Deploy:
- [ ] **SQL FIRST, CONFIRMED, THEN DEPLOY.** When a task involves both SQL and code that depends on
      it, **run the SQL (§2) and verify it by reading the schema back** before deploying anything
      that reads or writes the new schema. If you cannot run it, hand it to Paul and **WAIT for his
      confirmation** — "assume the columns exist" is not confirmation either way. Proven 2026-08-04: `findable-onboarding` v18
      deployed before its five new columns existed and **every submission — including ones carrying
      no new fields — died `save_failed` for ~20 minutes**, because the insert always carried the new
      keys and the single-pass column-shedding fallback couldn't recover. The fix (v19) also made the
      code defensive both ways: null-valued new keys are omitted from inserts, and the fallback is
      multi-pass. "Assume the columns exist" is not confirmation.
- [ ] Edge functions **do not auto-deploy**: `npx supabase functions deploy <name>` by hand.
- [ ] **Redeploy every function that imports a shared module you changed**, and prove each one. They keep
      running old code until you do.
- [ ] SPA auto-deploys on push to `main` (Cloudflare Pages).
- [ ] 🔴 **findable-site DOES NOT. IT HAS NO CI AT ALL — `npm run deploy` IS THE ONLY WAY IT SHIPS.**
      `"deploy": "astro build && npx wrangler pages deploy dist --project-name=findable-site"`.
      There is no `.github/workflows`, no git integration, nothing watching `master`.
      🔴 **THIS COST TWO ROUNDS ON 2026-09-13.** The hero-button commit was pushed, confirmed on
      `origin/master`, and then watched for twenty minutes on a domain that was never going to
      change — reported to Paul twice as "Cloudflare is sitting on the build", which §4 makes an
      easy and wrong thing to believe. The assumption was that both repos behave like this one.
      ⛔ **THE TELL, AND IT WAS IN THE FIRST PROBE: `findable-site.pages.dev` WAS ALSO STALE.**
      A slow production rollout off a SUCCESSFUL build shows the new content on the preview domain
      first. **Both stale means nothing was ever deployed**, not that deploying is slow. Check the
      preview domain before blaming the pipeline, and if it is stale too, stop waiting.
      ⚠️ And `npm run deploy` ships whatever is in the working tree at HEAD, not the commit you
      pushed — wrangler warns `--commit-dirty` for exactly that reason. Build, verify the dist, then
      deploy.

---

## 4. Things that have misled you — read before claiming anything is verified

**The deploy check.** Only this sequence is trustworthy:
1. Fetch the **live HTML** and read the chunk name out of it.
2. Fetch **that exact chunk** by name.
3. Assert a **marker string from your own change** is present in it.
4. Retry **once** — production can lag ~90 seconds.

And the traps around it:
- **Comparing a local build hash to a live hash is invalid** across build environments. Same source can hash
  differently. Use it as a hint, never as pass/fail. Step 3 above is the real assertion.
- **A cache-buster query string can return a STALER file than a plain fetch.** Don't add one.
- **The entry chunk name does not reliably change when a route chunk does**, and vice versa. A lazy route lives
  in its own chunk — check the one your code is actually in.
- Chunk *byte size* changing is decent evidence; identical size with a new hash usually means only the
  referenced child-chunk hashes moved.
- **A shared component gets its OWN chunk**, so its strings are **absent from the chunks that use it**. Looking
  for `Back to ` in `Playbook-*.js` returns False even though the feature shipped. Check the shared chunk for
  the string, then check the consumer chunk for `import…from"./Shared-<hash>.js"`. Absence in the consumer is
  the *expected* result and is itself evidence the component is shared rather than duplicated.

🔴 **A 200 WITH ALL THE RIGHT STRINGS IN IT CAN STILL BE THE WRONG DOCUMENT.** The worst version of
the trap, because every signal reads green. Verifying the report's new BrightLocal caveat 2026-08-05
I fetched `https://findable.live/a/<slug>`, got **HTTP 200**, and **all three** caveat strings
matched — so I nearly reported it verified. It was the **home page**: `/a/*` is not a route on
findable.live, it fell back to `index.html`, and the home page contained those exact strings
*because I had just added them there in the same session.*
- **The tell was the byte count**: 82,046 bytes, identical to the home page I had fetched minutes
  earlier. The second tell was that a marker unique to the document type (`class="src"`) was absent.
- **The rule: assert on something ONLY the target document has**, not on the strings you were
  looking for. A content-type check is not enough either — Cloudflare served this as `text/html`
  with a 200.
- Reports are served by the **`render-audit-report` edge function**, and the reliable URL is the
  **audit UUID** (`…/functions/v1/render-audit-report/<auditId>`), which resolves directly with no
  `business_reports` lookup. The slug form needs the stored slug to end in the 8-hex code and only
  **69 of 123** report rows do.

**A negative result can also be your own check's fault, not the code's.** The mirror of the false positives
below, and it bit twice tonight:
- `SECTION 1 OF 2` was False because the source says `Section 1 of 2` — **CSS `text-transform` uppercased it**,
  the string never existed.
- `thin &middot;` was False because the markup uses a literal `·`, not the HTML entity.
- Before reporting a missing marker, grep the **source** for your own search string.

🔴 **A RATE COPIED FROM A PRICE LIST IS A GUESS UNTIL A BILLED ROW AGREES WITH IT. FOUR CONSTANTS
HAVE NOW BEEN WRONG THIS WAY, ALL FOUND WHILE LOOKING AT SOMETHING ELSE.** Swept 2026-08-06.
| Constant | Was | Real | The mistake |
|---|---|---|---|
| Text search, per page | $0.032 | **$0.035** | Priced at Text Search **Pro**; the mask asks for `websiteUri`, so it bills **Enterprise** |
| Place Details — **three copies** | $0.017 | **$0.020** | Matched **no published Google rate at all**. Each copy cited the others |
| Per-question audit | $0.0125 | **$0.0104** | Re-measured; `sources.ts` was left behind when `marketView` was corrected |
| SEO scan | $0.12 | **~$0.04** | Derived from "$40/1,000 pages × 3 pages" and never checked against spend. **3× high** |

- ⚠️ **THE RULE: a cost constant must name the PRODUCT and the TIER it was priced at, and cite a real
  billed row.** "$0.017" with no tier is unfalsifiable and propagated to three files. Google bills a
  request **once, at the highest tier any requested field touches**, so a rate is meaningless without
  the field mask it belongs to. Before trusting one, read the mask and find the dearest field in it.
- ⚠️ **A CONSTANT MUST NEVER BE VALIDATED AGAINST DATA IT WROTE.** The SEO figure looked confirmed
  because 57 usage rows read exactly $0.12 — that is the fallback in `process-ai-audit-queue` echoing
  the constant back when Apify reports no usage. Excluding those, the real values are $0.02 (×65),
  $0.04 (×41), $0.08 (×4), $0.20 (×1). **$0.04 is the top of a measured BAND, not a precise figure**;
  do not round it up "to be safe" — inventing a margin on top of a measurement is the same error in
  the other direction.
- ⚠️ **A CONSTANT THE SYNC CHECK CANNOT READ IS UNGUARDABLE.** It parses `const NAME =`, so the two
  values living as object properties inside `SOURCES` had silently drifted from their `marketView`
  twins. They are now `AI_SEARCH_USD_PER_QUESTION` and `SEO_SCAN_USD_PER_SCAN`, named exports for
  that reason alone. **If you add a value that must match another, make it a named const.**
- ✅ **Correct and verified, leave them:** Geocoding **$0.005**; OpenAI `gpt-4o-mini` at **$0.15 /
  $0.60** per 1M tokens; `SOURCES.place_details` at **$0.005** (that one really is the address-only
  **Essentials** call in `place-town.ts`).
- ⚠️ **STILL UNVERIFIED, AND MARKED AS SUCH — do not quote them as fact:** `maps` $0.003,
  `social_images` $0.01, `contact_scraper` $0.0011 (disabled), `whatsapp` $0.005. None are on the
  Findable path; Paul's call 2026-08-06 was that spending on Apify to check a disabled scraper is not
  worth it.
- **The resulting real costs:** a market measure **22p**, a 25-lead outreach batch **$2.28** (was
  quoted $4.36 — the SEO constant was nearly all of the gap), **full delivery ≈ 30p a customer.**
  Paul's read, and it settles the pricing question: *the offer works at £19.99 and the constraint has
  never been cost.*

🔴 **THE SHARED-FILE DEPLOY TRAP: `main` IS CORRECT AND THE FUNCTION IS STALE.** An edge function
keeps running the code it was deployed with. Changing a file under `supabase/functions/_shared/` or
`src/lib/` fixes nothing until **every consumer is redeployed** — and the consumers are invisible
from the file you edited, which is why this keeps happening.
- ⚠️ **THE RULE: after changing anything shared, walk the transitive import closure and redeploy
  every function that reaches it — then NAME THEM IN THE REPORT.** "Deployed" without a list is how
  a consumer gets missed. Walk it by following relative `from "..."` imports from each
  `index.ts`, not by memory and not by `grep -l <module-name>` (that matches comments — §4).
- Worked example, 2026-08-07 audit: 17 functions were behind. `render-audit-report`,
  `send-whatsapp-message` and `run-seo-scan` were all stale on the SAME file
  (`src/lib/aiAuditReportHtml.ts`); `findable-onboarding` was stale on `_shared/offer-price.ts`,
  i.e. **on what a customer is charged**.
- ⚠️ **Two functions are deployed with NO SOURCE IN THE REPO** — `claim-share` and
  `create-claim-link`, both 2026-06-12, old product line. Left alone deliberately, but recorded:
  a deployed function nobody can read is worse than one that is merely stale.

🔴 **THE LIMIT OF THE TIMESTAMP METHOD — do not read "36 up to date" as proven.** Comparing a
function's deploy time against the newest git commit in its import closure is the only cheap audit
available (`supabase functions download` fails on any function with shared imports:
*"invalid path in server response"*). It has two failure modes, and BOTH bit on 2026-08-07:
- **False positives.** A commit landing seconds after a deploy reads as stale. Nine functions showed
  sub-10-minute "gaps" that were pure commit-after-deploy ordering.
- **False negatives.** The walker only follows relative `from "..."` imports. Any other import form
  — dynamic, aliased, re-exported — is invisible, and the function reads as clean.
- ⛔ **AND THE VERIFICATION ITSELF CAN BE WRONG IN BOTH DIRECTIONS AT ONCE.** I reported
  `render-audit-report` as "verified stale, proven against a live document". It was not. I asserted
  two strings that exist **only inside a code COMMENT** describing what had been REMOVED (§4's rule:
  grep the SOURCE for your own search string first), and I rendered **ABLM**, which never shows the
  offer block at all — `showFounderOffer` hides it once `amount_paid > 0`. Two independent errors,
  both pointing the same way, producing a confident false alarm.
  **The fix: assert on strings that are RENDERED (grep the source and confirm they are outside
  comments), and render a document that actually contains the section under test.** Verified
  properly afterwards on OMP Electrical: four bullets present, old wording absent, short guarantee
  present, marketing tail absent.

**Substring false positives. You have been fooled by both of these twice each:**
- `"bing"` matches **plum*bing***.
- `"acca"` matches **M*acca*-Gas**.
- Use word boundaries (`/\bACCA\b/`) or match a distinctive full token. When a check comes back positive,
  print the surrounding characters before you believe it.

**`deno check --sloppy-imports` PASSING DOES NOT MEAN AN EDGE FUNCTION DEPLOYS.** It returned **exit 0**
on a file importing the Vite `@/` alias, which the Supabase bundler rejected outright:
`Relative import path "@/lib/directoryFacts" not prefixed with / or ./ or ../`. There is no
`deno.json` and no import map in this repo, so `@/` resolves to nothing for Deno — and the local
check said nothing. **The deploy itself is the only real gate for an edge function.** Same shape as:
typecheck at baseline does not mean the build passes.
⚠️ Practical rule: any `src/lib` file reachable from an edge function must use **relative imports with
an explicit `.ts` extension** (`'./directoryFacts.ts'`), never `@/`. Vite resolves that form too, so
it costs the SPA nothing — `auditReport.ts` has always done it this way, which is why it deploys.
Before deploying, walk the transitive import closure from the entrypoint and grep it for `@/`.
🔴 **AND THE EXTENSIONLESS FORM IS THE OTHER HALF OF THAT RULE — IT BIT ON 2026-09-12, ON A BRAND-NEW
`src/lib` FILE, WITH THIS PARAGRAPH ALREADY IN THE FILE.** `baselineReplay.ts` imported
`'./seedGuard'`; tsc, `npm run build` and the tsx test runner ALL resolved it, so the whole gate read
green and the commit went to `main` — and only then did the deploy answer *Module not found … Maybe
add a '.ts' extension*. **`main` therefore carried a server-side refusal that was not live, while
`create-ai-audit` sat on its previous version and every local signal said the work had shipped.**
Grep a NEW file's relative imports before deploying; the bundler names only the FIRST offender, so
fix and re-grep the whole closure rather than fix and re-deploy.

**CLOUDFLARE PAGES CAN SIT ON A PUSH FOR 15+ MINUTES — that is not the ~90-second lag §4 describes.**
Commit `56134630` was verified on `origin/main`, built clean locally, and the live site still served the
PREVIOUS `AiAudit-C55Dvb4S.js` after 15 minutes of polling. Before concluding a deploy failed, prove
where live actually IS: read the entry chunk, then check a marker from the **previous** confirmed
deploy. If the old markers are present and the new ones absent, it is the pipeline, not the code — say
so rather than claiming success or hunting a phantom bug. Also confirm which chunk your marker lands in
locally (`grep -l <marker> dist/assets/*.js`) before trusting a False.

**THE MEASUREMENT CAN BE RIGHT WHILE THE DOCUMENT LIES.** A bulk audit of five tattoo studios found
from one "Wisbech" search stored the correct derived town on every audit (`location_source =
derived`) and the questions genuinely asked about Cambridge — but the playbook and client form both
printed **Wisbech**, because `usePlaybook` resolved the town as `search_location || location_text`,
the searched town FIRST. Wrong on **102 of the 121** leads that have a derived town. Fixed
2026-07-30 to `audit.location_text || derived_town || search_location`: the audit row already IS the
resolved answer, so preferring it keeps the documents agreeing with the measurement by construction.
Before concluding an audit is invalid, check whether it is the DATA or only the RENDERING.

**QUESTIONS CAN MEASURE THE WRONG INTENT AND STILL LOOK FINE.** "tattoo design for beginners
cambridge uk" was answered accurately by the engines — with ucas.com, barnsley.ac.uk and camre.ac.uk.
A third of that niche's citations measured people wanting to LEARN the trade, not hire one. The
prompt banned "near me", head-terms and two-intents-per-question; it never required BUYING intent.
Guarded 2026-07-30 in `seedGuard.ts` (`researchIntentReason`, `dropResearchIntent`).
⚠️ **Two tiers, and the second is the whole difficulty:** for a driving school "learn to drive" is
the BEST buying question, "dog training" is what a dog trainer sells. Tier A (salary, career,
apprenticeship, qualification, "how to", "become a") rejects for everyone; Tier B (course, training,
learn, lessons, "for beginners", class) is skipped when `isTeachingTrade()` says teaching IS the
product. A flat keyword list would have broken every driving school in the lead book.

**A CATCH-ALL ERROR MESSAGE IS WORSE THAN NO MESSAGE.** The AI Audit page printed one hardcoded line
for every failed question — *"Couldn't check — term too broad to complete. Retry or narrow it."* — while
the real error sat unread in `ai_audit_queue.result.error` AND `ai_audit_runs.results.error`. On
2026-07-30 it displayed that for `Apify start apify~google-search-scraper HTTP 402` (account out of
money) and sent Paul off to rewrite questions that had worked two hours earlier. **There was never any
breadth detection in the codebase** — the phrase existed only in that JSX string. Fixed in
`src/lib/auditErrors.ts` (`explainAuditFailure`), which always prints the raw string too. When a UI
explains a failure, check the explanation is derived from the failure.

🔴 **AN EDGE FUNCTION'S REFUSAL THAT IS ONLY `console.error`'d IS UNDIAGNOSABLE AFTERWARDS — THE CLI
HAS NO `functions logs` SUBCOMMAND.** Two lanes were dead for days in September with the reason
existing only in a log nobody here can read: the free-check auto-audit (silently 409'd by the town
gate) and a Stripe checkout Stripe itself rejected. **Write the refusal to `client_error_reports`**
— `findable-checkout`, `findable-onboarding`, `submissions`, `notify-onboarding-submit`,
`stripe-webhook` and `audit-baseline.ts` all do now. Store the message, **return only the opaque
code**, and name the SHAPE of a bad secret rather than its contents (§11's `prod_` paste). Without a
table, diagnosing the free-check lane meant inferring from which leads happened to have audits.

🔴 **AN ALLOWLIST IS NOT AN ADDRESS BOOK, AND THAT CATEGORY ERROR PUT 27 SENT LINKS ON A PREVIEW
DOMAIN AND STRIPE'S RETURN URL WITH THEM.** Two functions read `FINDABLE_ALLOWED_ORIGINS[0]` as the
canonical public host. **§12 has the whole record** — including that `Access-Control-Allow-Origin`
is `*`, so "payments work from findable.live" was never evidence findable.live is in that list. The
transferable rule: **when a fallback has to guess an outward-facing address, refuse instead** — a
refusal is loud, a plausible preview URL is silent and reaches a customer.

**An end-of-day-UTC timestamp formats as the NEXT DAY in British Summer Time.** Apify's cycle end is
`2026-08-03T23:59:59.999+00:00`; `toLocaleDateString('en-GB')` without a `timeZone` rendered
"4 Aug" — a day late, on the one date the operator was waiting for. Always pass `timeZone: 'UTC'`
when formatting a stored UTC instant that represents a *day*.

**RLS-enabled-with-NO-policies reads as "no data", not as "denied".** `apify_account_usage` is
service-role-only by design, so a SPA read returns **HTTP 200 with `[]`** — indistinguishable from a
healthy empty table. Its own migration comment says "so the figure is visible in the app" and the
policy was never added, so nothing ever displayed it. Route such reads through an edge function.

**Not being able to see something is not evidence it isn't there.**
- The **anon key cannot read most tables** — RLS returns **HTTP 200 with `[]`**, not an error. An empty result
  proves nothing about the data.
- Grep output in this environment sometimes **path-mangles matched lines** — `path="/playbook/:id"` displayed as
  `path="\playbook:id"`, and `{/*` as `{\*`. **Never conclude code is broken from grep output alone.** `Read`
  the file.

**`grep -l <module-name>` finds COMMENTS, not just imports.** Building the redeploy list 2026-07-30,
`grep -rln "place-details"` returned `generate-barber-site` and `grep -rln "audit-baseline"` returned
`findable-checkout`. **Neither imports either module** — both merely mention the name in a comment
("Mirrors google-place-details", "MIRRORS audit-baseline.ts's own bizType line"). Two unnecessary
deploys, avoided only by re-grepping for a real `import ... from "…"` line. Match the import
statement, then read it.

**A stale COMMENT is a load-bearing bug.** `google-place-details` fetched phone + website only,
justified by a comment saying the address "is already returned by Text Search at lead-creation time".
`search-leads`' field mask had since been slimmed to
`places.id,places.displayName,places.googleMapsUri,places.websiteUri` — no address. So `address` was
null on **every** search-added lead, and with no address there were no `addressComponents`, so no
`derived_town`. Nobody re-checked the layer the comment was asserting about. When a comment explains
why something is safe to skip, **verify the claim, don't inherit it.**

**`findable-onboarding` SILENTLY DROPS ANY ANSWER KEY IT DOES NOT LIST.** It builds its insert from an
explicit key list, so a field the flow sends and the column accepts still vanishes if nobody added it
there. Proven 2026-08-05: `willing_to_migrate` — the column existed, the site sent it, the row saved
with **HTTP 200**, and the value was null. The checkout then read "not answered", which never blocks,
so a Squarespace customer who had said no to moving **reached Stripe**. Three places to add a field:
the `answers` object, `NEWER_COLS`, and the `optional` shedding list. Caught only by a live end-to-end
test; no local check can see it.

🔴 **THE TEST EXERCISED ONE PATH AND THE BUG LIVED ON THE OTHER. TWICE, ON THE SAME FEATURE.**
Paul's framing, and it is the sharper version of the layer rule below: **ask not whether the guard
is correct, but whether the case it guards can reach it.**
| Guard | It was correct | The path it never ran on |
|---|---|---|
| The market **cooldown** | refused a 3rd audit per window, as designed | the measure flow's OWN second audit — verified against historical rows, while the two-audit sequence was only ever checked in logic-only tests. Norwich got one audit |
| The **search gate** | blocked when a search returned 0 | it sat inside `if (!poolFresh)`, so a pool that was **fresh AND empty** — precisely what it exists for — could never reach it. Soham ran two paid audits against zero businesses, **reported twice** before it was found |
- ⚠️ Both passed review because the reviewer checked the predicate, not its reachability. When you
  add a guard, **enumerate the ways control can arrive at the decision** and assert one case on each
  — `scripts/soham.test.ts` does this by restating the predicate and driving it with every
  (skipGate × poolFresh × searched × poolCount) combination, including the null one.
- ⚠️ The same shape hides in "optimisations": `poolFresh` was reviewed as a *pricing* shortcut ("the
  search was free") and nobody asked what else was being skipped along with the search.

**The mistake you keep making: reasoning from one layer without checking the next.** Real examples:
- "No address is stored" — the insert writes one.
- "`place_id` isn't available" — it's populated on **758 of 758** leads.
- "This choke point covers all paths" — **two callers pass the town in as an argument**, so a fallback there
  fixes nothing.
- Fix: before asserting what a function receives, read its **callers**. Before asserting a column is empty,
  read the **writer**.

---

## 5. Established findings — what actually works

Facts with numbers. These are measured, and several contradict the older docs.

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two different levers.
- Across **76 audits**: ChatGPT names the client **~17%** of the time, Gemini **~2.5%**.
- **Being cited is not being named.** ABLM is on Yell's Wisbech page and was named **0 times in 80
  measurements**.
- **Directories are trade-specific, and only citations can tell you which:**
  - Checkatrade — **662 citations across 58 of 59 plumber audits**, and **ZERO** for accountants.
    (Was "657 across 57 of 58"; re-measured live 2026-07-30 — the data grows, so re-read it rather
    than quoting this line. The whole fold: **109 audits, 10,615 citations, 1,275 hosts**; trade
    totals plumber **59**, locksmiths 25, accountant **12**, electrician 12.)
  - Yell works for **both**.
  - Hospitality is **Tripadvisor and Wanderlog**.
- **A business with no website cannot be named by Gemini at all** — it has nothing of theirs to read.
  MK Plumbing: 0/10 on Gemini, 3/3 on ChatGPT via directories.

**TESTED AND NEGATIVE — never present these as levers:**
| Lever | Result |
|---|---|
| Website quality | Firms Gemini names have **WORSE** sites than our clients |
| Schema markup | **35% vs 32%** — no difference |
| Reviews | Three named businesses have **0–1 reviews** |
| Bing Places | **Zero citations across all 10,615** (re-measured 2026-07-30; `bingplaces.com` and `bing.com` appear in NONE of the 1,275 hosts) |

- **The only supported lever:** presence in the sources AI reads **for that trade**, plus **a website where
  there isn't one**.
- ✅ **THE FIRST BEFORE-AND-AFTER WAS MEASURED 2026-08-18, AND IT MOVED: ABLM 0 → 3 of 18.**
  Runs 12–15 (21 Jul, before Paul hand-built town pages on their Wix site) asked 9 questions ×2
  engines four times: **0 named in every answer**. Runs 23+24 (18 Aug, the identical 9 questions
  verbatim) named ABLM **3 of 18** — and all three are **GEMINI**, on the town questions
  (Whittlesey ×1, Chatteris ×2). ChatGPT: still 0 of 9. **This is §5's model confirmed in a
  before/after for the first time: pages on their own site moved the engine that reads their own
  site, and not the one that reads directories.** One measurement of one client — evidence, not
  proof; the wording rules (never promise the outcome) stand unchanged.
  ✅ **INDEPENDENTLY REPRODUCED 2026-09-08 by the before/after fold** (§17), from the raw queue rows:
  21 Jul (6 runs, 9 questions) **0 of 52** vs 18 Aug (4 runs) **3 of 18**, +16.7 points, "improved",
  the three named questions being Whittlesey once and Chatteris twice — matching this note exactly.
  ⚠️ **And each of those three reads `within_noise` on its OWN row while the overall reads improved.**
  That is the intended shape: **the claim lives in the overall figure, never in a single question.**
  ⚠️ Re-run mechanics for next time: `create-ai-audit { audit_id }` re-runs the LATEST run's
  questions verbatim; `{ audit_id, questions }` honours a pasted set verbatim; neither passes the
  question filters. **The operator path hard-caps at WIZARD_MAX_QUESTIONS (5)** — a longer set
  must be split across runs (23+24 was 5+4) or go through the internal baseline branch, which is
  unreachable from outside since the key rotation. `question_count` cannot raise the cap.
- 🔬 **RG LOCKSMITHS IS THE MIRROR-IMAGE EXPERIMENT — de-stuffing test, baseline locked 2026-08-18.**
  Paying customer, locksmith, Huntingdon. **He was NEVER invisible** (the premise that started this
  was wrong): his paid baseline (audit `f64920ce`, 11 Aug, 3 runs, 12 questions ×2 engines) is
  **8/24 named per run ≈ 33%, stable** — but the split is the EXACT INVERSE of ABLM:
  | | Baseline (11 Aug 2026) |
  |---|---|
  | **ChatGPT** (directories) | 20 of 36 — 6–7/12 per run, his home-town directory strength |
  | **GEMINI** (own site) | **3 of 36 — 1/12 every run, and ALWAYS the same one question, "best locksmiths in Huntingdon UK"** (a generic "best" query, arguably directory-fed) |
  - ⛔ **THE LINE TO BEAT IS 3/36 GEMINI, AND SUCCESS NEEDS A NEW DISTINCT QUESTION.** Gemini names
    him on ZERO service+town queries (lock changes Cambridge, emergency lockouts St Neots, upvc
    Huntingdon, …) — exactly what his town pages target. A post-rewrite Gemini rise that is still
    only "best locksmiths Huntingdon" does NOT count; a service+town query naming him does.
  - **The experiment:** RG's site (WordPress/Elementor, 20i-hosted) ALREADY has ~30 town pages
    (5 per town: locksmith / locksmith-services / lock-repairs / lock-replacements /
    emergency-locksmith), published 2025-10 — so they PREDATE the baseline. They are **keyword-
    stuffed doorway duplicates**: Huntingdon and Cambridge pages are byte-identical 333-word
    templates with the town swapped, "locksmith(s)" at 5.7% density, and there was a **Camborne
    (Cornwall) page** proving template-spinning. Paul is REWRITING them in place (keep Elementor
    layout, ABLM-natural honest copy), leaving 5 pages/town for now — de-stuffing is the cheap
    change tested first; **consolidating each town's 5 pages into 1 is the NEXT experiment if
    Gemini doesn't move.** Contrast with ABLM, whose natural pages moved Gemini 0→3.
  - ⏱️ **RE-MEASURE ON PAUL'S WORD, ~2–3 weeks out (early Sep 2026), IDENTICAL 12-question set**
    (run 1's questions, split 5+5+2 across runs — operator cap is 5). He purges his site cache and
    diarises it. This is the first controlled single-variable test the product has: same pages,
    same layout, only the copy quality changes.

---

## 6. Architecture rules that must not be broken

- **Never add a `trade` (or `trades`) field to `DirectoryFact`** (`src/lib/directoryFacts.ts`).
  *Why:* the moment a fact says "Checkatrade is for plumbers", the file becomes the hardcoded list the evidence
  layer exists to replace — and it would be wrong by construction, because Checkatrade has 657 citations for
  plumbers and zero for accountants. That is a fact about the **evidence**, not about Checkatrade.
- **Facts are per-host. Evidence is per-trade. The join can only SUBTRACT.**
  Citations decide *which* hosts matter. `directoryFacts` only says *what a host is* and *who may action it* —
  things you can only learn by visiting the site. A fact may remove or downgrade a host the evidence surfaced.
  It may never add one. `townOnly` is legitimate on that test (geographic scope of the site); `trade` is not.
- **Unknown hosts route to WHO'S WINNING, never to tasks.** An unclassified host is almost always a
  competitor's own site. Surfacing it as intelligence means a new competitor appears automatically with no
  entry to write; making it a task would invent work.
- **No winnability scoring anywhere.** It reads a single run, and competitor lists differ between runs, so its
  output flips between identical inputs. Counts only.
- **No outcome promises in anything customer-facing.** Say what was measured, what was done, and what changed.
- **Migrations are applied ONE AT A TIME, never with `supabase db push`** — that is broken here
  (history desynced) and would try to apply every migration missing from the remote history table.
  Run the single migration's statements through the Management API (§2), or hand them to Paul.
  **A migration file existing does not mean it is live.** For DB functions, check the live
  definition: `select pg_get_functiondef('public.<fn>'::regproc);`
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`.** `isSentStatus` and
  `isRepliedStatus` in `src/types/outreach.ts` are traps for aggregates. **`paid` means `amount_paid > 0`,
  everywhere.**
- **Paginate PostgREST reads** — it truncates at `db-max-rows` silently. Use `src/lib/fetchAllRows.ts` with
  `.order('id')` as a unique tiebreaker.
- 🔴 **`instantly-push`'s INTERNAL GATE IS NARROWER THAN EVERY OTHER ONE, ON PURPOSE. Do not
  "make it consistent".** It accepts **CRON_SECRET + `x-internal-job` ONLY** — not the service key,
  which every other internal branch (bulk-jobs included) also accepts. The reason is blast radius:
  this is the function that **sends email**, and a key whose job is database access should not also
  be a licence to email 1,000 prospects. Built 2026-08-08 for `audit_and_push`.
  - `acting_user_id` is read **only inside** the internal branch, so a stolen JWT cannot name a
    different actor. UUID-checked, then confirmed to be a real user.
  - **No admin escalation on the internal path** — owner-scoped only. bulk-jobs' create already
    filters a job to leads the creator owns, so narrowing costs the flow nothing.
  - Suppression, the completed-audit gate and the already-pushed stamp run **after** auth and are
    identical on both paths. Auth decides *whose leads may be read*, never *who is safe to contact*.
  - ⚠️ **`mode: 'auth_probe'` exists because there was no other honest way to test this.** Every
    other mode either sends email or calls a paid API, so exercising the gate would have meant
    emailing someone to find out whether the auth was right. It reaches no Instantly endpoint, reads
    no lead, writes nothing, and reports only which branch admitted the caller.
  - ⚠️ **PROVING A 401 PROVES NOTHING BY ITSELF.** Nine non-internal shapes were refused
    2026-08-08 — and the OLD code would have refused all nine identically, so the negatives were
    worthless until the new bytes were shown to be live. The marker that did it: **`x-cron-secret` in
    the OPTIONS preflight's `Access-Control-Allow-Headers`**, which exists only in the new version and
    needs no credential to read. Same rule as §4's report trap — assert on something only the target
    can produce.
  - ⚠️ **The positive path cannot be tested from here** — CRON_SECRET is not readable without
    asking Paul to hand over a secret. It is proven by the first real job. **The failure mode is
    safe**: a broken gate means `push failed (HTTP 401)` on every item and **zero emails sent**,
    never a wrong send.

- 🔴 **`audit_and_push` — THE TWO-PHASE JOB, AND THE THREE RULES THAT COST MONEY.**
  `bulk-jobs` job type added 2026-08-08. Triage → phase A (audit, `skip_seo`) → phase B (one Instantly
  call for the whole set). Cap **25 on ACTIONABLE items**, so a selection full of already-pushed
  leads is not refused.
  - **ALREADY IN INSTANTLY = no audit and no push.** Re-auditing is money spent preparing a pitch
    that has already gone out.
  - ⛔ **A FINISHED AUDIT HANDS OVER, IT DOES NOT COMPLETE.** `resolveAwaiting` returns the item to
    `pending` + `phase: 'push'` and does **not** touch `done_count`. **`done` on this job type means
    PUSHED.** Marking it done would be the 2026-08-08 bug in a new place: paid for the audit, never
    sent the email, counter reads complete.
  - ⛔ **AN ITEM INSTANTLY DID NOT TAKE IS NEVER RECORDED AS PUSHED.** Outcomes map from
    instantly-push's own **id lists**; a lead in none of them fails with "gave no reason". A
    **missing `pushedIds`** — the real state if instantly-push is deployed older than bulk-jobs —
    fails loudly rather than guessing either way.
  - ⚠️ **DEPLOY ORDER: SQL → `instantly-push` → `bulk-jobs` → SPA.** `bulk_jobs.job_type` carries a
    CHECK constraint (§8: it lives only in the DB, not in migrations) that rejects the new value, and
    the SPA's `action: 'triage'` 400s against an older bulk-jobs.
  - ⚠️ `purpose: 'market'` stays keyed on the **param** `skip_seo`, not on the derived value —
    audit_and_push forces `skip_seo` but is **not** a market batch, and deriving both from one flag
    would have hitched cross-audit intent coverage onto a cost decision.
  - ✅ **Seventh instance of the absent-value shape, caught by writing the test first.** The triage
    ladder ends in `cannot` and `push_now` requires a positive; `scripts/audit-push.test.ts` drives
    every rung with null / empty / whitespace and asserts none reaches the bucket that emails.

- ⚠️ **THE BULK-JOB PROGRESS LINE CALLED EVERY BULK AUDIT "site generation" FOR MONTHS.** It was
  `job_type === 'enrich' ? 'enrich' : 'site generation'` — a two-branch expression over a set that
  has had four members since `audit` was added. Nothing broke, which is why it survived: the label
  was wrong and the numbers beside it were right. Now `src/lib/bulkJobProgress.ts`, which labels from
  a map and renders an **unknown job type raw** rather than borrowing the last branch's name. It also
  derives the phase from `items` (never stored) and reports **no phase** when there are no items.

- ⛔ **THE GUARANTEE IS BYTE-IDENTICAL ACROSS BOTH REPOS, AND A SCRIPT NOW ENFORCES IT.**
  `FINDABLE_GUARANTEE` (`src/lib/findableOffer.ts`) and findable-site's `GUARANTEE`
  (`src/lib/site.ts`) **had drifted** — this repo's ended at "…you will be named." while the site's
  carried "The engines decide that, and anyone who promises it is guessing." So the sentence a
  customer **agreed to at Stripe checkout** was not the sentence on the page that sold it to them.
  Both files already carried a comment asking for them to be kept in sync; a comment cannot fail a
  build. Run **`node scripts/check-cross-repo-sync.mjs`** — it exists in **both** repos, each reading
  across to the other, and exits non-zero on any difference. It covers the **guarantee AND the price**
  (`FINDABLE_SETUP_PRICE_GBP` vs `SETUP_PRICE_GBP`), and exits **2** if the sibling repo is absent.
  Proven by injecting a drift in each value on each side — four cases, all caught by both scripts.
  🔴 **A THIRD COPY EXISTS THAT NO SCRIPT CAN REACH: the Stripe PAYMENT LINK's own description**,
  typed into Stripe's dashboard. The founder link's copy is **out of date** — it drops "at week eight
  with before-and-after evidence" and the entire "The engines decide that…" clause. Edit it in Stripe
  by hand whenever the constant changes.
  ✅ **Stripe renders the full 222-character string untruncated** — verified 2026-08-06 by creating a
  real Checkout Session and reading `document.body.innerText`. Stripe documents no length limit for
  `line_items[].price_data.product_data.description`, so this could only be answered empirically; the
  page HTML is a JS-rendered shell and contains nothing, so fetching it proves nothing.
  ⚠️ **STRIPE ADAPTIVE PRICING CANNOT BE TURNED OFF FOR PAYMENT LINKS.** Stripe's docs:
  *"Adaptive Pricing is always enabled for Payment Links. Manage Adaptive Pricing for Checkout in your
  payment settings in the Dashboard."* So the Dashboard toggle governs **Checkout Sessions only** —
  the `findable-checkout` path. The founder link is a Payment Link and is not covered by it.
  Observed 2026-08-06 from a Thai IP: the Checkout Session presented **THB 4,582.95** with a stated
  4% conversion fee; the founder Payment Link showed **£19.99 only**, minutes apart in the same
  browser. One observation does not disprove the docs — treat the link as capable of converting.
- 🔴 **ONE RULE WRITTEN OUT IN N PLACES IS THE OTHER RECURRING SHAPE, AND EVERY COPY LOOKS CORRECT
  FROM INSIDE ITS OWN FILE.** Measured: **five** copies of "is the questionnaire complete" (two still
  demanded a column dropped on 2026-08-22, so a paying client read "awaiting details" for ever and
  every real first payment was emailed as unpaid); **four** copies of the literal `"audit_reply"`;
  **two** constants in two repos, which drifted the guarantee a customer had agreed to at checkout.
  ⚠️ **A CHECK CANNOT SAVE YOU HERE — EXTRACT THE RULE INTO A LEAF AND IMPORT IT.** A static sweep
  for "a column nothing writes" misses it (the column is still written when a value arrives), and
  the copies do not diverge until the product moves. The test to write is not "is the predicate
  right" but **"is there only one of it"** — grep the importers and fail the build on a local copy:
  `questionnaire-complete.test.ts` and `audit-kind.test.ts` are the pattern.
- 🔴 **AN ABSENT VALUE FALLING THROUGH AS THOUGH IT WERE A REAL ONE. THIS HAS NOW HAPPENED SIX
  TIMES, in six unrelated files, and it will happen again.** The shape is always the same: code
  branches on the *known* values and lets everything else drop into the `else`, where the default
  means something the data never said.
  | Where | The absent value | What it was silently treated as |
  |---|---|---|
  | `findable-onboarding` | a null questionnaire column | "they said no" |
  | `clientHeld.ts` (pre-fix) | `''` / whitespace / placeholder | "we hold this" |
  | `market-view` (pre-fix) | tier `unknown` (below the evidence bar) | "AI names them" → subtracted |
  | `offTradeMark` (**caught before shipping**, 2026-08-06) | a pool row with no `primaryType` | "Google does not call this a locksmith" |
  | `marketPlainRead` (Soham, 2026-08-07) | a pool Places returned **0** businesses for | "every one is already named by AI" |
  | `MeasureMarket` gate (Soham, 2026-08-07) | the gate skipped when no search ran | a fresh EMPTY pool = "fine, proceed" → 2 paid audits |
  The market one is the clearest: the branch kept `tier === "thin"` and dropped the rest, so
  `unknown` — which is what *every* entry is below the bar — was subtracted as established. **The
  guard inverted in exactly the case it was written for.**
  ⚠️ **The test: never branch on the states you expect and let `else` carry the rest.** Enumerate
  the absent case explicitly, and when a value is graded, assert on the grade you *want*
  (`=== 'established'`), never on the one you want to exclude (`=== 'thin'`). A new grade added
  later joins the wrong side of a negative test and nothing throws.
  ✅ **THE FOURTH ONE WAS CAUGHT BY APPLYING THIS RULE RATHER THAN BY AN INCIDENT** — the first time
  that has happened. `primaryType` arrived in `search-leads`' field mask on 2026-08-06, so **every
  pool row cached before that has none**. Marking a row "not the trade" on a missing type would have
  flagged an entire market as non-locksmiths — the Norwich subtraction again, in a new file.
  `offTradeMark` asserts on the grade it WANTS (a known type differing from a known modal type) and
  returns nothing for an untyped row whatever the consensus. `scripts/off-trade.test.ts` asserts a
  20-row pre-field-mask pool produces **zero** marks. Write the absent case into the test, not the
  comment.
  🔴 **SOHAM ADDED TWO MORE, AND ONE OF THEM IS A NEW SHAPE: A GUARD THAT IS SKIPPED RATHER THAN
  WRONG.** The search gate was correct — it just sat inside `if (!poolFresh)`, so it only ran on the
  path where a search ran, and a pool that was FRESH AND EMPTY (exactly what the gate is for) could
  never reach it. **Ask not only "is the guard right?" but "can the case it guards reach it?"**
  Reported twice before it was found, because both the review and the test exercised only the search
  path. A separate lesson from the same market: **every ratio in `marketView.ts` was correctly
  guarded against a zero denominator and it still printed "lockrite.org (47 of 0)"** — the total was
  only ever *interpolated into a sentence*, never divided by. A guard on the arithmetic is not a
  guard on the copy; grep for printed denominators separately.
- ⛔ **ABSENCE IS NEVER AN ANSWER — the second place this rule lives.** `serveGate` was the first (a
  skipped question flags, never blocks). `src/lib/clientHeld.ts` is the second: `heldValue()` is the
  ONLY way the client sheet decides it holds a value, and null / undefined / `''` / whitespace / an
  empty array / an array of blanks / buildPlaybook's placeholders (`NOT HELD — ask the client`,
  `none`) all mean "we do not have it". A null column inside a **submitted** row means what no
  questionnaire means, for that field — `findable-onboarding` writes `incomplete` rows by design and
  deletes null-valued new keys from the insert, so partial rows are normal.
  `ASKING_PHRASES` in that file is the enforcement table; the suite asserts the asks vanish when a
  column is held **and come back when it is not**, which catches a "fix" that deletes an ask instead
  of suppressing it. Don't re-derive this rule per-caller.
  ⚠️ **`onboarding_responses` had ZERO rows on 2026-08-06** (`client_listings` too). So the
  no-questionnaire path is not an edge case — it is the only path that has ever rendered, and any
  questionnaire-driven branching is untested until Paul submits one for real.
  ✅ **NO LONGER ZERO — 2 rows as of 2026-08-10** (`gbp_exists` = `not_sure` and `yes`). Small, but it
  means the questionnaire path has now rendered for real and the line above has stopped being true.
  **Re-count before quoting it; do not inherit either number.**

---

## 6b. 🔴 THE REPORT THAT COST TWO PROSPECTS — QUEUED BEHIND §6c

⚠️ **§6c IS FIRST.** Paul reordered on 2026-08-09: the "it loses my place" state work comes
before this. Everything below is still current and measured — it is next, not now.

Paul's order, agreed 2026-08-09. Build 1, then 2, then 3, then the derivation. All four measured, none
built. **Wilson's Mobile Valeting rejected his report and was right to.**

⚠️ **FIRST, A PREMISE THAT WAS WRONG AND WILL BE REPEATED IF NOT WRITTEN DOWN.** Wilson's report did
NOT say "0 of 6". Rendered live it says **"1 time … out of 6 answers"**. Paul was about to apologise
for something that never happened. Render the document before diagnosing what it says (§4's rule).

### 1. RANK REPORT COMPETITORS BY FREQUENCY, AFTER NAME-GROUPING
- The report leads with **`gutPunch.rivals`** — the competitors from the ONE curated best answer —
  not the cross-question frequency ranking. `auditReport.ts:719` already computes the frequency list
  and the report does not lead with it.
- Wilson's report printed **Get A Splash, Fresh Car, Clean Me**. His OWN audit ranked by frequency:
  **Ultimate Valet Cambridge (5)**, Washdoctors (3), Get a Splash! (2), Chapman's (2). The top firm in
  his own data never appeared on his document. That is what lost the prospect.
- ⛔ **GROUPING MUST COME FIRST OR THE FIX MAKES IT WORSE.** The counter does not normalise
  apostrophes: `Chapman’s … (13)` and `Chapman's … (8)` are counted separately, so the market's real
  leader has **21** and ranks below a split of itself. Ranking by a split count names the wrong firms
  with MORE confidence. `_shared/market-match.ts`'s `groupNames` exists for exactly this.

### 2. THE FRAMING AT LOW QUESTION COUNTS — DECIDED: 5 QUESTIONS, BUILD IT
"1 of 6" from three questions is a weak measurement stated strongly.
✅ **DECIDED 2026-08-09, not a proposal: raise the audit_and_push question default from 3 to 5.**
The dialog already offers 3/4/5, so it is the default that changes. +2 questions = **+2p a lead**
(8p → 10p) and "1 of 6" becomes "1 of 10".
⚠️ **AND THE REASON MATTERS MORE THAN THE NUMBER**, because it is the rule to reach for next time:
it fixes the MEASUREMENT rather than hedging the sentence. The alternative on the table was softening
the verdict wording, which would have made a thin sample read as less thin without making it less
thin. Paul rejected that and was right to.
The market audit's 16 questions is still the real fix; this is the interim, not a substitute for it.

### 3. THE DISTANCE CHECK — AND WHY THE OBVIOUS ANSWER IS WRONG
Measured 2026-08-09: **0 of 202** audits provably ask about a town their lead is not in — but that
number must not be reported as "none".
- **124 of 326 (38%) have no `derived_town` AND no `address`**, so the question cannot be answered for
  them. Mostly the 168 rows from the sessionStorage bug.
- ⛔ **STRING EQUALITY CANNOT ANSWER THIS.** Wilson is a village-near-Cambridge case whose
  `postal_town` is very likely *Cambridge*, so he PASSES an equality test while sitting outside the
  built-up area — the Southsea/Portsmouth caveat in §8, live again. A real answer needs distance from
  the town centroid: `uk_towns` already holds lat/lng.

### 🔴 0. THE WRONG-TOWN RATE, MEASURED 2026-08-09 — THIS IS NOW FIRST
Paul reordered the list after this landed, and he is right: cheaper reports about the wrong town are
worse, not better, and the derivation keys a prospect to their town's market audit so it inherits the
fault.

**Of 44 audits now measurable, 31 (70%) are more than 10 km from the town they were audited against.**
```
>  5 km: 34      > 10 km: 31      > 15 km: 29      > 25 km: 28
71.5 km  Locksmith Northampton - KMI   audited against "spalding"
58.2 km  DSB Locksmiths                audited against "wisbech"
57.6 km  Uno Accountancy Services      audited against "spalding"
```
A locksmith with **Northampton in its own name** was asked who AI recommends in Spalding and told it
does not appear. That is RG Locksmiths and Wilson, thirty-one times over.

⚠️ **THE 70% IS A WORST-CASE SUBSET, NOT A RATE — do not quote it as one.** Those 44 are exactly the
leads that had NO location evidence, i.e. the ones whose audit had to fall back to `search_location`.
The true rate across all audits is unknown until more leads carry coordinates.

✅ **How it became measurable:** `outreach_leads.lat/lng` (migration 20260809120000) storing the
`location` field that ESSENTIALS_FIELDS had always fetched and place-town.ts discarded, plus
`uk_towns` lat/lng on all 733 rows. 262 lookups run 2026-08-09, 49 of them audited leads
(25 locksmiths + 24 accountants), **100% got a town** — not one "no town in address".

**THE ORDER, agreed with Paul:**
1. **Backfill the remaining 63 audited leads without coordinates (~32p)** and report the TRUE rate
   across all audited leads, not the worst-case subset.
2. **The >10 km guard**, which is what stops this recurring. ⚠️ **PROPOSE BLOCK-vs-WARN BEFORE
   BUILDING IT.** Blocking means Paul cannot audit a business whose coordinates we do not have, which
   is most of them today — so a naive block would stop the product working. Warn-with-the-distance,
   block only when we KNOW it is far, is the shape to argue for.
3. Then the derivation (§4 below).

**TWO QUESTIONS PAUL WANTS ANSWERED WHEN THIS IS PICKED UP:**
- **How many of the 31 had a REPORT SENT to them?** Those prospects were told something wrong about a
  town they do not work in. He would rather have the number than meet it one complaint at a time.
  (§8 already records 37 reports sent with the wrong-town problem — reconcile the two figures.)
- **Why did the audit use `search_location` at all when the business had no location evidence?** A
  71 km gap means a radius search pulled in a business from another county and nothing questioned it.
  Say whether the fix belongs at audit time, at lead-add time, or both.

⚠️ **AND QUOTE THE REAL NUMBER OF LEADS, NOT THE INTERESTING ONE.** I told Paul the backfill would
cost ~56p, from the 112 AUDITED leads with no location evidence. The button's rule is not restricted
to audited leads, so it ran 262 lookups and cost **$1.31** — 2.3x the quote, on a spend he had
approved on the strength of it. Fine in itself; the quote was still wrong. Count what the code will
actually do, not the subset the analysis was about.

### 4. THEN THE MARKET-AUDIT DERIVATION — RECON DONE 2026-08-09, IT HOLDS UP
Generate a prospect's report from the town's market audit instead of a per-business audit.
- ✅ **Business audits ask NOTHING business-specific.** 925 questions: **0** carry a business-identity
  token. Naive passes read 47% then 20% then 3.46% — every apparent hit at every level is a generic
  trade noun ("plumbing", "gasman", "recovery"). The substring trap in a new coat, three times.
- ✅ **Specialisms: 4 of 223 audits (2%)**, one of them Paul's own bar. Nothing lost.
- ✅ **The decisive test** (accountant/Chichester, the only trade+town with both): 6 businesses,
  **5 agree, 0 FALSE NEGATIVES**, 1 case where the market audit found a firm its own 3-question audit
  MISSED. Structural reason: 8 questions give strictly more chances to appear than 3.
- ✅ **No new matcher risk.** `named` is already set by `nameMatches(answer_text, businessName)` at
  scan time (`ai-search.ts:430`) — same function, same answer text.
- ⚠️ **But `named` is STORED, not derived**, and a market audit's stored flags are against its own
  (non-)business name. A derived report must **recompute per prospect**. Free, no API call, and it is
  the one real code change: `buildReportData` reads `r.result[e].named`.
- ✅ **THE GATE IS BUILT, TESTED AND — SINCE 2026-09-15 — WIRED: `_shared/derivable.ts` +
  `scripts/derivable.test.ts`.** It was deleted with the market-audit pass (§19 slice 5) and
  **restored from `0930ca57^`**; do not rebuild it and do not delete it again. Its caller is
  `market-view`'s niche fold — **§27 is the record.** Two bugs in it were caught by writing the test
  first: it leaned on `candidateCores` to strip the trade and town (it does not — that truncates for
  MERGE purposes, a different job), and a trade word in another grammatical form still passed
  ("Chichester Accountancy" vs trade "accountants"), now a shared 5-character stem.
- ⚠️ **THE FAIL-SAFE PAUL ASKED FOR:** strip trade and town tokens from the business name; if nothing
  distinctive remains ("Chichester Accountants Ltd"), **refuse to derive** and fall back to a paid
  per-business audit. A zero there means "we could not tell", not "you are invisible", and those must
  never print the same sentence.
- **Cost:** per prospect `3 × $0.0104 + $0.070` (cleaner) ≈ **8p** — 138 accountants = **£11**. One
  market audit `8 × $0.0104 + $0.070` ≈ **12p for the whole town**.
- ⚠️ Sample is 6 businesses in one town. Suggestive, not settled.

---

## 6c. 🔴 NEXT SESSION STARTS HERE — "it loses my place", the state audit (2026-08-09)

Paul's words: *"I use this all day and losing my place is the single most annoying thing about it."*
Audited across every page. **It is ONE root cause with two halves, not a per-page bug** — so do not
patch pages, fix the two.

### THE ROOT CAUSE

**Half 1: the operator app has no data cache.** React Query is installed and correctly configured in
`App.tsx` (`staleTime: 5 min`, `refetchOnWindowFocus: false`) and is used by **6 files, every one a
PUBLIC customer-facing page** — BookingPage, PublicSite, SiteByToken, SubdomainSite, the barber and
salon shells. **Not one operator page or hook uses it.** Twelve data hooks own rows in `useState` and
refetch in a mount effect:
```
useApifyUsage  useAvatar  useBulkJobs  useCampaignStats  useCampaigns  useCheckedBusinesses
useContactTracking  useInbox  useLeadNotes  usePersonalActions  usePlaybook  useTeamFeedback
```
⚠️ **THAT LIST IS THE 2026-08-09 AUDIT AND IS NOW STALE** — twelve of them were migrated on
2026-09-10 and two never existed by the end. It is kept as the record of the original finding;
**the current state is in THE ORDER below, and the way to check is to re-derive from the code.**
```
```
`useInbox:124` is `useEffect(() => { fetchAll(); }, [fetchAll])` with `isLoading` starting `true` —
leave the Inbox, come back, full refetch and a spinner.

**Half 2: the layout remounts on every navigation.** `App.tsx` has **12 `<AppLayout>` wrappers inside
Route elements and 0 `<Outlet/>`**. Each route renders its own copy of the shell, so React unmounts
and remounts sidebar and scroll container on every navigation. Nothing inside can survive by staying
mounted; it can only be restored from storage afterwards.

✅ **Checked and ruled out:** no `key=` anywhere forcing a remount. Normal navigation unmount is the
whole story — there is no third cause to hunt.

### THE SPLIT-LIFETIME FAULT IS THE PATTERN, NOT AN INSTANCE
The search bug (results restoring without the search that produced them) is everywhere:
```
Inbox.tsx          2 persisted vs 22 plain useState
AiAudit.tsx        6 persisted vs 61 plain
Index.tsx          2 persisted vs 10 plain
useOutreach.ts     2 persisted vs  6 plain
useMarketView.ts   1 persisted vs  6 plain
```

### WHAT SURVIVES WHAT (before the work)
| | navigate | reload | tab close |
|---|---|---|---|
| Data (all 12 hooks) | ✗ refetch + spinner | ✗ | ✗ |
| Scroll (`usePersistedScroll`, in AppLayout) | ✓ | ✓ | ✓ |
| A few filters (`usePersistedState`) | ✓ | ✓ | ✗ |
| Selections, expanded rows, dialogs | ✗ | ✗ | ✗ |

### ⛔ THE RULES AGREED WITH PAUL — APPLY THESE, DO NOT RE-DECIDE THEM
- **The URL is for WHAT I AM LOOKING AT. `usePersistedState` is for HOW THE PAGE IS CONFIGURED.**
  A conversation, a selected market, an open record → URL (back button, linkable, survives
  everything). A filter, a sort, a toggle → persisted state. `Index.tsx` already says this for the
  market view; it is now the app-wide line. **Report every move to the URL.**
- ✅ **AND A MODAL MUST NOT ARRIVE OVER THE THING THAT WAS CLICKED, EITHER — fixed 2026-08-10.**
  Coverage's market link carried `confirm=search` on every row, so clicking through to a town already
  measured opened "Run the lead search? ~$0.14" on top of the market numbers that were the reason for
  the click. Two guards, and the second decides: `wantsSearchConfirm(state)` (`coverageState.ts`) keeps
  the param off the measured/worked rungs, and `openArrivalSearchConfirm` + `auditsInView`
  (`marketView.ts`) refuse it in the panel off the market's own audit count — which is what covers a
  bookmarked URL and a stale Coverage cache. The panel decision now happens **in the same effect as the
  load, on the view `load` RETURNED**; it used to fire before any market data existed, so it could not
  consult the fact that decides it. A refusal states itself with the override beside it — the button
  must not become a link that visibly does nothing.
- ⛔ **COVERAGE HAS TWO ACTIONS PER ROW, AND IT USED TO HAVE ONE DOING THE WRONG JOB — split
  2026-08-11.** The button labelled **Find leads** carried `mode=market`, so it never ran a lead
  search: it opened the market read (and, on an untouched town, a spend confirm over that). Now
  **Find leads** → `mode=leads&keyword=&location=&run=search`, the normal search, prefilled and run
  once; **Market view** → `mode=market&trade=&town=[&confirm=search]`, unchanged. `wantsSearchConfirm`
  therefore belongs to **Market view** now, not to Find leads — the rule did not change, the control
  it hangs off did.
  - Both hrefs are built by **`findLeadsHref` / `marketViewHref` in `coverageState.ts`**, not inline in
    the JSX, so `scripts/coverage-actions.test.ts` can assert the one property that matters: the
    Find-leads href carries **no `mode=market` and no `confirm=search` on any rung**, including an
    unknown one. An inline template string is how the two drift back together.
  - 🔴 **THE SEVENTH INSTANCE OF THE ABSENT/STALE-VALUE SHAPE, CAUGHT BEFORE SHIPPING.** `keyword`,
    `location` **and `mode` are all `usePersistedState`**, and the URL seeds are applied in an effect —
    so on the first commit the form still holds the PREVIOUS search. A plain boolean `autoSubmit` would
    have run **"plumber / Bourne" from a button that said locksmiths in Wisbech**, spent the money, and
    then painted the right town above the wrong results. Worse, because the MODE is persisted too, an
    operator whose last visit was a market view would have fired **a market view from the Find leads
    button** — the exact fault being fixed.
    **So `autoSubmit` is a MODE, not a boolean**, and the effect fires only when the form HOLDS WHAT
    THE URL ASKED FOR (same mode, same keyword, same town). A seed that has not landed spends nothing.
  - ⚠️ **`run=search` is a one-shot intent** — ref'd on first render, stripped from the URL whether or
    not the search fires. Left there it re-runs a **paid** search on every refresh and back button.
  - ⚠️ **Find leads SPENDS ON ARRIVAL, and that is Paul's call 2026-08-11**: ~$0.11 of Places quota,
    and **nothing** within 72h of the last search of the same trade and town (search-leads
    short-circuits on its own cache). The confirm was guarding the wrong flow.
  - ⚠️ One place builds the filters (`runSearch` in `SearchForm`), so the arrival run and the Search
    button cannot send different searches — the radius, country and town-only that run are the ones on
    screen.
- ⛔ **NEVER PERSIST AN OPEN DIALOG.** A modal springing open on return is worse than losing it —
  you did not ask for it and it blocks the page you came back for. `AiAudit.tsx` already refuses to
  persist `formOpen` for this reason. Persist what you were LOOKING AT, never what was INTERRUPTING.
- ⛔ **THE MUTATION RISK IS THE WORK, NOT THE MIGRATION.** Paul: *"losing my place annoys me, a stale
  list makes me act on wrong data."* Take **one hook at a time and prove the invalidation** — never
  migrate several and test at the end. Every mutation needs its `invalidateQueries` demonstrated.

### THE ORDER
1. ✅ **DONE 2026-08-09 (stage 1a, `9a0ba920`)** — Inbox conversation → URL (`?c=`), half-typed reply
   → `src/lib/inboxDrafts.ts`, keyed BY CONVERSATION and in **localStorage** (the one place that tier
   is right: a closed tab must not take a message you were partway through).
   ⚠️ A bug caught before shipping: `startFromLead` called `setText('')` AFTER switching thread,
   which with per-conversation drafts clears the thread you just LEFT. The line was removed, not
   patched — a new thread opens empty by construction.
2. **`useInbox` → React Query**, with invalidation proven on **`send`** and **`patchLeadStatus`**
   specifically. This is the headline fix and the first real mutation test.
3. ✅ **DONE 2026-08-28 — the layout route.** One `<Route element={<AppLayout/>}>` with `<Outlet/>`
   replaced the fifteen wrappers, after checking they were byte-identical. The shell mounts ONCE;
   §6c's "half two" is closed. `usePersistedScroll` now sees route changes without a remount.
4. ✅ **DONE 2026-09-10 — twelve hooks, one at a time.** `useDashboardMetrics`, `useCampaignStats`,
   `usePlaybook`, `useFreeCheckProgress`, `useAvatar`, `useCheckedBusinesses`, `useTeamFeedback`,
   `useTemplates`, `useCampaigns`, `useBulkJobs`, `useCopiedPhones`, `useMeasurementLock`.
   ⚠️ **THE LIST IN THIS SECTION WAS WRONG IN BOTH DIRECTIONS and cost time before it was
   re-derived from the code.** `useLeadNotes` and `usePersonalActions` do not exist (deleted in the
   September cleanup); `useCopiedPhones`, `useMeasurementLock` and `useSubscription` were missing.
   **Re-derive the list, do not inherit it.** `useSubscription` was then deliberately SKIPPED: it is
   a provider mounted ABOVE `BrowserRouter`, so it loads once per session and never refetches.
   ⚠️ **The recurring trap: every one of these exported a `refetch` bound to the function being
   converted.** Once the loader returns data instead of writing state, calling it directly fetches
   and discards — a refresh button that silently does nothing. They invalidate now.
5. 🔴 **`useOutreach` IS THE ONE LEFT, AND IT IS ITS OWN PIECE OF WORK — do not tack it on.**
   Measured 2026-09-10: **1,603 lines, 38 direct `setLeads`/`setArchivedLeads` calls, 29 DB writes,
   33 exported functions, 9 consumer files**, on the screen Paul works in all day. Each of those 38
   is an optimistic update that has to stay correct under a shared cache, which is 38 invalidation
   proofs, not one. ⚠️ `leadsWithOptimistic` — named here for months as the hard part — **no longer
   exists**; check what the optimistic layer actually is before planning around it.

### ✅ COVERAGE READ-PATH — two bugs fixed 2026-08-19 (`e33d190e`), verified live

- ⛔ **"MEASURED" NOW NEEDS `MARKET_AUDIT_MIN_AUDITS` (2), MATCHING THE PANEL.** Coverage used to
  call a town measured at ONE completed market audit while the panel needs two before it calls a
  shape — so a 1-audit town read "Measured" on the row and "needs measuring" in the panel, and View
  looked like it re-ran the audit. The fix lives in **`coverageStateFor` (`coverageState.ts`)**, NOT
  the edge fn: the endpoint returns FACTS (one entry per completed audit, raw), the client COUNTS
  them per `coverageKey` (`countMeasuredByPair`) and grades `measured` at `>= MARKET_AUDIT_MIN_AUDITS`.
  Counting client-side is load-bearing: a real Eastbourne market typed both `Locksmiths` and
  `locksmiths` folds to one 2-audit market through coverageKey; a raw server count split it into two
  1-audit halves. `CoverageFacts.measuredPairs` (a Set) became **`measuredCounts` (a Map)**.
  - ⚠️ **THE CONSTANT MOVED to a zero-dep leaf `src/lib/marketAuditThreshold.ts`**; marketView.ts
    imports AND re-exports it (a bare `export … from` broke marketView's own internal uses — import
    at the top so the name is in local scope). coverageState.ts imports the leaf.
  - ⚠️ **CONSEQUENCE ON REAL DATA:** two of Paul's markets have only 1 completed audit (incomplete
    measures — §8's Colchester and Norwich). **locksmiths/Colchester drops Measured → Untouched**
    (no leads); **Norwich is unaffected** (it is Worked, which outranks Measured). Both correct.
- ⛔ **THE COVERAGE MOUNT IS TWO EDGE READS NOW, NOT ONE.** It was one ~3s sequential read (733
  static towns THEN the ~1,500-lead scan) that a lead-add refetched in full. Split into edge actions
  **`towns`** (static ONS list, React Query `staleTime: Infinity` / `gcTime: Infinity`, key
  `coverage-towns`; suppression patches this cache) and **`pairs`** (measured/leads/worked, on the
  existing `coverage` key that `useOutreach` invalidates). They fire in parallel. The edge fn keeps a
  combined **`view`** action for deploy back-compat. ⚠️ **Deploy the edge fn BEFORE the SPA** — the
  new hook calls `towns`/`pairs`, which an old deploy 400s as unknown actions.
  - ⚠️ **First COLD load is still ~1.8s — that floor is the LEAD SCAN (pairs), not the towns.** The
    split's real win is repeat loads (towns cached, instant) and lead-add-returns (only pairs
    refetch, never 733 towns). Getting the town table on screen in ~1s would mean rendering it before
    grades land — declined, because a measured market flashing "Untouched" for ~1s is the "act on
    wrong data" harm §6c warns of. A real sub-1s fix needs a grouping RPC (a migration → Paul's SQL).
- ⚠️ **Bath was a TEST ARTIFACT (mine), deleted 2026-08-19** — a single direct create-ai-audit with
  no pool, showing a phantom "Measured Bath". Deleted its 8 queue rows + 1 run + the audit (no
  orphans). Norwich/Colchester single-audit markets are NOT mine (real pre-session incomplete
  measures) — left alone.

---

## 6d. ✅ THE PAID CLIENTS PAGE IS GONE — paying customers live in Outreach + Inbox (2026-08-12)

`/paid-clients` deleted. Paul's reason: a customer is a lead who paid, not a different kind of
record, and a separate page meant leaving the two screens he actually works in to see them.
**No SQL — every column already existed.** Nothing was migrated; only the editors moved.

- ⛔ **`paid` MEANS `amount_paid > 0`. THE FILTER IS A SENTINEL, NOT A STATUS, AND THAT IS THE WHOLE
  DESIGN.** ⚠️ **Still true for the FILTER; the dashboard's paying-CUSTOMER count needs two more
  rules since the £9.99/mo hosting shipped — a price floor and a churn test (§11).** The scalar
  cannot express "bought once, hosting since cancelled". `OUTREACH_STATUS_FILTER_OPTIONS` leads with `PAID_FILTER_VALUE` (`'__paid__'`), labelled
  **"Paid (money in)"**, which the row filter special-cases against `amount_paid` — the same shape the
  Inbox already uses for `__opened__` / `__claimed__` / `__upsell__`. Filtering on the STATUS
  `payment_received` is wrong in **both** directions and each costs something real: a customer moved on
  to `in_delivery` is **still paid** (a status filter hides exactly the people mid-delivery), and a £0
  lead dragged to `payment_received` by hand is **not** paid (a status filter counts it as revenue).
  The deleted page had made precisely this mistake once already.
  - ⚠️ **`statusesForFilter(PAID_FILTER_VALUE)` returns `[]` ON PURPOSE**, and the row filter tests
    `isPaidFilterValue` **first**. Falling through would render an **empty table**, which reads as
    "no paying customers" rather than as an error — the `'contacted'` failure in a new place.
  - ⚠️ **Its label is deliberately NOT the bare word "Paid".** `payment_received` already carries that,
    and two options reading the same word with different row counts is the 53-vs-509 "No WhatsApp"
    failure. `scripts/status-constants.test.ts` asserts no two FILTER options share a label.
- ⛔ **A CLEARED AMOUNT WRITES `null`, NEVER `0`** — eighth instance of the absent-value shape, and
  aimed at the one column that decides whether someone is a customer at all. `0` would silently drop
  them from the filter, from the Inbox exemption and from every revenue figure, with nothing thrown.
  `src/lib/leadPayment.ts` (`parseAmountPaid` / `isPaidLead`) owns it; `scripts/lead-payment.test.ts`
  drives empty / whitespace / null / undefined / unreadable **and the clear-after-save round trip**,
  which is the case a build writing 0 would fail alone. A **deliberately typed 0 is kept as 0**.
- ⛔ **THE INBOX EXEMPTS A PAID CONVERSATION FROM THE STATUS FILTER** — `useInbox` builds
  `paidLeadIds` off the same paginated leads read (it already selected `amount_paid`), `WaConversation`
  carries `isPaid`, and the filter reads `leadStatus === statusFilter || unassigned || isPaid`. Same
  convention as `unassigned`: a bucket that must always be visible is **exempted**, never relied on to
  happen to match.
  - ⚠️ **SCOPE, STATED: the status filter ONLY.** The campaign filter and the default hide of
    `not_interested`/`closed` are unchanged — the latter deliberately, because *Remove from inbox*
    works by setting `status = 'closed'`, and exempting paid leads there would make a paid thread
    **unremovable**. If a paid customer ever vanishes from the Inbox, check those two before the code.
- ⚠️ **THREE COLUMNS LOST THEIR ONLY EDITOR AND NOBODY HAS NOTICED YET:** `project_duration`,
  `next_checkin_date`, `checkin_notes` were editable **only** on that page. **The data is untouched**
  and still on `outreach_leads`; there is simply nowhere to set them now. The whole check-in feature
  (overdue counts, "due today") went with the page. Not an oversight — the brief named the four fields
  to move and these were not among them. `useOutreach.updateClientDetails` is now **dead code**, left
  in place rather than removed mid-task.
- ⛔ **THE `wa.me` ROW BUTTONS WERE NEVER CALL BUTTONS.** `OutreachTable` and `OutreachMobileCard` each
  had a **"WhatsApp Call"** item in the phone dropdown whose href was `https://wa.me/<number>` — which
  **opens a CHAT, not a call**. So they were a second way to message someone *outside* the app: no
  `whatsapp_messages` row, no thread, no reply window, invisible to every count (§6: counts come from
  `whatsapp_messages`). Both now open the **in-app thread** via the same handler as the green WhatsApp
  button, relabelled **"WhatsApp thread"**.
  - ⚠️ **Routed through `handleWhatsAppClick` / `onWhatsAppClick`, NOT a hand-built `/inbox?c=<key>`.**
    The key is `${user.id}::${normalizeWaNumber(phone, country)}`; building it at the call site would
    be a second copy of that rule and would open an **empty** Inbox for a lead with no thread yet.
    `startFromLead` resolves it, creates a synthetic conversation when there are no messages, and
    **then writes `?c=` into the URL itself** — so the destination the brief asked for is reached by
    the path that cannot miss.
  - ⚠️ **AND IT DOES COST SOMETHING: there is no longer any route from the app to a WhatsApp VOICE
    call.** Flagged to Paul; a one-line revert if he wants it back.
  - ✅ **`generateWhatsAppUrl` (`leadUtils.ts:87`) HAS NO REACHABLE CALLERS.** Its two callers are
    `SingleWhatsAppDialog` — mounted in `OutreachTable`, but `setWhatsappDialogLead` is **never called
    with a lead**, only with `null`, so the dialog can never open — and `openBulkWhatsApp`, which has
    no callers at all. Left alone; changing it would achieve nothing. Don't re-derive this.
- **Untouched on purpose:** the Inbox thread header's `wa.me` fallback (`Inbox.tsx`), `Landing.tsx`,
  `Start.tsx`, and the report's WhatsApp CTA (`aiAuditReportHtml.ts`).
- ⚠️ **VERIFIED AGAINST REAL DATA, AND THE HARNESS REPRODUCED THE 1,000-ROW TRAP WHILE DOING IT.** A
  read-only service-key script drove the real exported predicates over the real lead table: **exactly
  one lead has `amount_paid > 0`** (RG Locksmiths, £19.99, `payment_received`, not archived, thread
  `user_id` matching the lead's) and `isPaidLead` returns true for him. The first draft asked for
  `limit=2000`, **got exactly 1000 rows back, and RG was one of the ones that fell off the end** — the
  same truncation that hid him from the Inbox for real. Paginate, always.
  ⚠️ **The divergence the sentinel exists for is currently ZERO** — with one customer whose status is
  `payment_received`, a status filter would coincidentally agree today. The design is right for the
  second customer, not provable on the first. **Nobody has SEEN any of this** (§2: screenshots need Paul).

---

## 6e. ✅ DETERMINISTIC MARKET TARGETING — built 2026-08-14, Paul's spec. Read before touching the market view.

**A pool business is scored by `nameMatches` over the stored chatgpt/gemini `answer_text`, exactly
as the report and the week-8 guarantee score an audited business.** `TARGET_MAX_NAMED_SHARE = 0.4`
(`src/lib/marketView.ts`, INCLUSIVE — ≤40% of answers = target, Paul will tune it): targets sort
worst-first, >40% is excluded as already winning, and both exclusions are itemised expandables in
`MarketPanel` — never silent, Paul's explicit rule.

- ⛔ **EXTRACTED COMPETITOR NAMES ARE NO LONGER AN INPUT TO TARGETING, AND MUST NOT BECOME ONE
  AGAIN.** The old path joined the pool to the extracted fold via one shared `groupNames` pass and
  subtracted `established` (leader-relative) entries. Three measured faults, each sufficient alone:
  junk polluted the counts ("Here" in 17/37 Aylesbury answers); the LEADER-RELATIVE threshold
  subtracted Chester's Saltney Locksmiths while AI named it in **16%** of answers; and — the worst —
  **junk BRIDGED real firms in the union-find**: the single raw mention "Lock" welded Lockforce,
  LockFit, Lock Around The Clock and Aylesbury Lock and Key Centre into one 23-name group scored as
  one firm. The named-intel fold still groups mentions for display and the shape verdict; the pool
  now has its own `groupNames` pass over Places names alone (chain folding), which junk cannot
  enter.
- ⛔ **`search_cache` IS NO LONGER DELETED** (`cron-run`, 2026-08-14). The nightly 72h delete
  physically destroyed the scraped list — measured that day: **113 of 123 measured markets had no
  pool to show**, which was the "never-named businesses don't appear" bug in practice. `market-view`
  now serves an old pool as poolState **`stale`** (same fields as `ready`): businesses visible with
  the search date on them, and **every freshness/spend gate still keys on `ready` alone**
  (MeasureMarket's `poolCount`, the measure flow's search skip). `expired` survives only for pools
  the old cleanup already destroyed — a re-search rebuilds them (~11¢). Do not "tidy" a TTL delete
  back in.
- ⛔ **WRONG-TRADE IS A DISPLAY FILTER WITH AN ITEMISED ESCAPE HATCH, NEVER A SILENT CUT.**
  `offTradeMarkForGroup` (group-level: untyped branches never vote; ONE on-trade branch clears a
  chain — Timpson has branches typed both "Services" and "Locksmith"). Off-trade rows sit in an
  expandable "Excluded: N (wrong trade)" with their scores, Google's own label, and an **Add
  anyway** button, because Google's categories are imperfect and Paul wants to catch a real
  locksmith filed under "Services" by reading the list.
- ⛔ **ZERO SCORED ANSWERS = `unmeasured`, NEVER `target`** — `poolTargetVerdict` owns this (ninth
  instance of the absent-value shape, caught at design time). `scripts/market-targets.test.ts`
  drives it, the boundary inclusivity, the group off-trade absence rules, and the
  junk-cannot-score integration cases.
- ⛔ **OPENING A MARKET NEVER SPENDS — the auto-clean-ON-OPEN was built 2026-08-14 and REMOVED THE
  NEXT DAY. Do not rebuild it.** It fired a "Cleaning up the names… ~14p" toast plus a minute of
  spinner on every arrival at a dirty market (its once-per-session ref lived in MarketPanel, which
  remounts on every navigation — §6c), and with every recent market dirty from the cleaner outage
  it read as "Market view starts a new scan" — reported by Paul as exactly that. His rule, stated
  twice now: **Market view shows what exists, free; only Find leads and the measure/audit buttons
  may spend, and each says its price on its face.** New measurements still self-clean at
  finalisation (the process-ai-audit-queue hook — automatic, part of the run already paid for);
  the backlog keeps the manual "Clean the names" button under the refusal.
  - 🔴 **CONSEQUENCE, STATED, NOT HIDDEN: a market with a dirty fold shows its targets and named
    counts but keeps the "Names not cleaned · no verdict" refusal until SOMETHING cleans it** —
    the manual button (~7p/run) or a re-measure. The deterministic scoring grades TARGETS only;
    the verdict grades who's-WINNING, which needs the extracted names (firms with no Places
    listing, the cross-town national test), so it cannot be derived from the pool — that trade-off
    was examined and kept 2026-08-14.
  - ✅ **THE CLEANER'S SILENT FAILURE — CAUSE CAPTURED 2026-08-19: THE OPENAI ACCOUNT IS OUT OF
    CREDIT.** Fired live on a dirty Eastbourne run: `openai_http_429 · "You have no credits
    remaining" · credit_balance_exhausted`. The key is VALID (it authenticated; a dead key 401s),
    the auth plumbing and the queue's auto-clean hook are healthy — every fold since ~08-10 died at
    OpenAI's paywall. **The fix is Paul topping up at platform.openai.com → Settings → Billing;
    nothing in Supabase changes.** Once credited, new audits self-clean immediately (no deploy);
    the backlog was 25 dirty markets / 49 runs ≈ **$3.43** to catch up. ⚠️ The first diagnostic
    401 that session was the probe's own EXPIRED JWT — mint fresh before believing a 401.
  - ⛔ **SINGLE-WORD JUNK CAN NO LONGER REACH ANY FOLD (2026-08-19): `src/lib/knownEntities.ts`.**
    Marker words are dropped from the fold's GROUPING INPUT in `market-view` (they cannot occupy an
    entry, bridge firms in the union-find, or inflate counts) while `uncleanedCount` still reads the
    RAW mentions — multi-word junk ("Services LTD", "AM Wed") still needs the LLM cleaner, so the
    "Names not cleaned" refusal deliberately still fires. The marker set + `isUncleanedName` MOVED
    to that leaf; marketView.ts re-exports (import-at-top pattern).
  - ⛔ **KNOWN NATIONALS/DIRECTORIES ARE A CURATED LIST THAT CLASSIFIES, NEVER ADDS** (same law as
    directoryFacts §6). `classifyKnownEntity` — whole word-token matching (substring traps designed
    out; a single-word entity only matches ≤2-token names, so "Bark & Birch Locksmiths" is never
    the directory Bark). Consumers: named-fold rows carry `known: 'national'|'directory'` (panel
    badges); the national-led verdict counts a known national as national even at otherTowns=0
    (Able Group topped electrician/Portsmouth's naming with ZERO cross-town evidence — the scan is
    blind in a trade's first town) and EXCLUDES directories from its top-N; the report's
    `isRealCompetitor` drops directories (Checkatrade passed every filter and could print as a
    client's rival) and marker words. **Paul appends names to the two arrays himself.**
    `scripts/known-entities.test.ts` pins all of it. ⚠️ send-whatsapp-message +
    process-whatsapp-queue import the changed auditReport.ts but stayed UNDEPLOYED (§6g hold) —
    their WhatsApp {{2}} lists keep the old filtering until that hold lifts; redeploy them with it.
  - ✅ Coverage's row buttons carry their prices: "Find leads · ~{asPence(MARKET_SEARCH_USD)}"
    (derived — never hand-type a pence figure, §4's constants rule) and "Market view · free". The
    measure button already priced itself ("Refresh this market · free" included).
- ⚠️ **THE TARGET LIST'S FLOOR IS STILL GOOGLE PLACES.** A firm AI names that has no Places listing
  in the town stays in the named-intel list only — there is nothing to contact. Aylesbury is the
  honest example: in-town Places holds 3 real entities (2 already winning at 50%/84%, Timpson a
  chain), so the winnable businesses are the **11 nearby** locksmiths, all real, all typed
  `locksmith`, listed under "Nearby, outside the town boundary".
- ✅ **THE FRAGMENTATION VERDICT — built 2026-08-15, Paul's spec: one mass-outreach pass/fail per
  market.** `fragmentationVerdict` (`marketView.ts`, pure; `market-view` computes it into the
  REQUIRED `fragmentation` payload field; MarketPanel renders it at the top of the summary box).
  Metric = targets ÷ gradeable (right-trade entries, CHAINS IN THE DENOMINATOR never the
  numerator, off-trade outside both). **Junk-immune by construction** — inputs are the
  deterministic nameMatches scores, so it never waits for the LLM cleaner.
  - ⛔ **Thresholds MEASURED 2026-08-15 over all 20 pool-bearing markets** (§4's constants rule):
    target-share distribution `80 80 77 71 70 63 61 58 57 55 54 50 50 45 44 43 38 │ 29 14 0` —
    the known-skip markets (Southport 29, Nuneaton 14, Aylesbury 0) sit below a 29→38 break, so
    **`FRAG_MIN_TARGET_SHARE = 0.35`** (mid-gap, inclusive). **`FRAG_MIN_GRADEABLE_ENTRIES = 5`**
    (the three smallest live pools — 2, 3, 4 entries — are exactly the ones whose verdicts would
    be noise). Both named exports, Paul tunes them.
  - ⛔ **Zero scored answers = `unmeasured`, tiny pool = `pool_too_small`** — never a confident
    word (11th absent-value instance). `scripts/fragmentation.test.ts` pins the guards, the
    inclusive boundaries, the chain/off-trade sides, and the Nuneaton/Halifax/Aylesbury shapes.
  - The panel line carries a **confidence tag** (scored-answers count) and a **"Deepen · +1 audit ·
    ~7p"** button that opens the EXISTING market-audit confirm — a third audit is never automatic.
- ✅ **BATCH ADD + BATCH MEASURE — built 2026-08-15, Paul's spec, both explicit and priced:**
  - **"Add all N targets · ~Xp"** (MarketPanel, renders ONLY on a measured market): loops the
    SAME `addLead` the per-row button uses over `auditable` — a list that is structurally pure
    (winners never enter `view.pool`, wrong-trade and chains filtered), worst-named first.
    Duplicates return null and are counted, never re-added. **Adds ONLY**: leads land
    `not_contacted`; nothing is queued or sent, and the toast says so. ~$0.02/lead (the Places
    lookup, which also verifies the town for free).
  - **Coverage ROW actions — built 2026-08-16, Paul's spec.** Per row: **"Market view"** (smart:
    one FREE market-view read; measured → reveals **"Add all N · ~Xp"** instantly; unmeasured →
    priced confirm → in-place spinner, NO navigation, polls every 30s until `measureAction`
    resolves to 0-audits; in-flight audits re-attach) and **"View"** (the old nav link, renamed —
    plain navigation to the panel, always free). The row's add-all and the panel's share ONE
    target filter (`auditableTargets`) and ONE lead mapping (`poolRowToLead`), both in
    `marketView.ts` — the no-drift rule. Row gates (ambiguity, zero businesses) SKIP with the
    reason and point to the panel; a row action never overrides a gate. Row state is
    session-only and re-derived from the DB on every press — nothing persisted, mid-measure
    navigation is safe (audits continue server-side; re-press re-attaches).
  - **"MEASURING NOW" — built 2026-08-17, after Paul lost his place mid-measure.** The spinner no
    longer lives in session state: `useInFlightMeasures` (pure fold in
    `src/lib/inFlightMeasures.ts`, tested) derives what is measuring from
    runs(pending/running) → audits(`is_market === true` STRICTLY — a paid baseline in flight must
    NEVER render here; absence excludes, instance twelve) → queue counts, all owner-RLS client
    reads (MeasureMarket set the precedent). Polls every 30s ONLY while non-empty. Rows
    self-restore their spinner on return with no press; a market leaving the list auto-reveals
    "Add all N" via one free read; the strip above the table names every in-flight market with
    progress and age (stalled graded by `MARKET_AUDIT_STALE_MS`); and the concurrency guard +
    disabled confirm read this list and NAME the running markets instead of greying out
    silently. The per-row market-view polling loop was DELETED — one watcher, not two.
    (Was a one-at-a-time lock until 2026-08-17 — superseded by the concurrency cap below.)
  - **CONCURRENT MEASURES + THE BASELINE-PRIORITY CLAIM — built 2026-08-17, Paul's spec, four
    parts shipped together ("item 2 is the seatbelt for 1/3/4").** He runs 5-market waves
    routinely now; his own morning wave (5 markets, 12 runs, all complete) proved the queue
    absorbs it.
    1. **`MEASURE_CONCURRENCY_CAP = 5`** + `measureSlotsLeft()` (`marketView.ts`, named exports,
       Paul tunes) — ONE slot pool for the row buttons and the batch. At the cap the row confirm
       disables and **names every running market**; the batch offers
       `min(MEASURE_BATCH_CAP, free slots)` towns and its dialog says so. ⛔ Still not a spend
       guard — every measure keeps its own priced confirm, and free reveals are never blocked.
    2. **`process-ai-audit-queue` claims baseline rows FIRST each tick** (two-phase CANDIDATE
       selection: pending rows whose `audit_id` is in `ai_audits.baseline_target_runs NOT NULL`,
       oldest-first, then fill oldest-first; the atomic
       `.update().in(ids).eq(status,'pending').select()` claim is UNCHANGED, only which ids are
       offered changed). The returned `claimed` array is also **sorted baseline-first before the
       in-flight-headroom handout** — the update returns rows in arbitrary order, and without the
       sort a baseline could be deferred while a market row took the last Apify slot. ⛔ A paying
       customer's guarantee measurement (RG's ~6 Oct re-measure) must never queue behind
       prospecting — that is the whole point. `audit-baseline.ts` untouched. With no baseline
       pending, the fill query IS the old oldest-first behaviour.
    3. **Finished-while-away reveal** (Coverage mount, per trade): complete market runs from the
       last 2h minus in-flight, up to 6 FREE market-view reads → idle rows open on "Add all N
       targets". Never overwrites a pressed row (`rowFlow` guard), and the live spinner takes
       render precedence, so a premature reveal self-corrects. Reads only — nothing measured,
       nothing spent.
    4. **`useInFlightMeasures` refreshes on window focus/visibility** — a measure started from
       the market panel in another tab appears without waiting for a poll that may not be
       running (the interval stops at empty).
    `scripts/in-flight-measures.test.ts` pins the slot arithmetic, including cap ≥ 2 (the
    multi-measure contract — 1 would silently reinstate the one-lock) and over-cap clamping to
    zero (panel-started measures can exceed the cap; the count must never go negative).
  - **"Measure next N unmeasured · up to ~Xp"** (Coverage, `MEASURE_BATCH_CAP = 5`/press): strictly
    sequential towns; per town it re-checks via a FREE market-view read and routes through
    `measureAction` (already-measured → refresh → **0 audits, skipped**), skips fresh-pool searches,
    and applies the ambiguity + zero-businesses gates as SKIPS (batch never overrides a gate —
    overrides live on the panel). Worst case ~22p/market (search + 2 audits). ⛔ **The free-on-click
    rule stays absolute: nothing on Coverage measures on navigation.** Verdict words on Coverage
    rows were DECLINED 2026-08-15 — do not build them unasked. (The baseline-priority queue lane
    was also declined that day, then **explicitly APPROVED and built 2026-08-17** as the seatbelt
    for concurrent measures — see the concurrency bullet below.)
- ✅ **THE NICHE VERDICT'S FRONT DOOR IS ON COVERAGE, BESIDE THE TRADE PICKER (2026-08-28).** It was
  reachable ONLY from inside `MarketPanel`, which needs a chosen trade AND town — so the read that
  decides whether a whole trade is worth outreach sat behind picking one town and pressing a per-town
  button, and read as though it were about that town. **The fold was always trade-wide**
  (`market-view`'s `niche` action takes a trade and no town, and folds every business audit of that
  trade across every town); only the door was wrong. `NichePanel` gained `autoLoad`, so opening the
  panel loads it — safe ONLY because the fold is free (§6e's opening-a-view-never-spends rule holds:
  it re-reads stored audits and touches no paid API).
  - ⛔ **`key={trade}` ON THE PANEL IS A CORRECTNESS GUARD, NOT A PREFERENCE.** Without the remount,
    switching Plumbers → Locksmiths leaves the plumber fold on screen under a Locksmiths heading
    until the refetch lands — a stale read presented as a decision, which §6c weighs above losing
    your place.
  - The open state persists (session, user-scoped): a panel you chose to open is configuration, and
    it is not a dialog, so the never-persist-an-open-dialog rule does not apply. Session not local
    because re-opening re-reads, and free is not instant.
  - ⚠️ **Auto-load removed the implicit retry** (the invitation card's own button), so the error state
    got an explicit one — an auto-loaded panel that fails must not be a dead card.
  - **Measured live 2026-08-28, Plumbers:** 75 businesses · 18 towns · 85 audits · 1,100 answers →
    **worth_outreach, tier INDICATIVE.** ChatGPT 112/485 (23.1%), Gemini 22/485 (4.5%), AI Overview
    5/130 (3.8%); directory share ChatGPT 46.9% vs **Gemini 12.5%** (Gemini reads other businesses'
    own sites 85.8% of the time) — §5's model, at trade scale, from one free click.
- ⚠️ Old-SPA/new-payload overlap is a 10-minute sessionStorage cache (`useMarketView`), same as
  every market-view deploy. Deploy `market-view` BEFORE pushing the SPA.

---

## 6f. ✅ THE TOWN GATE — verify-on-import + five server gates, built 2026-08-14, Paul's spec

**The Wilson's Valeting rule: money and messages never move on an unverified town.** One predicate,
`src/lib/townVerdict.ts`, read by every gate and the Outreach badge: `verified` (derived_town
present), `unverifiable` (no town AND a settled note), `unchecked` (everything else).

- ⛔ **DERIVED, NEVER STORED — there is NO town_status column and there must not be one** (§6's
  serveGate rule). The state already lives on the lead: `derived_town` + `town_fetched_at` +
  `town_fetch_note`, written only by `resolveDerivedTown`. `SETTLED_TOWN_NOTES`
  (`_shared/place-details.ts`) holds the ONLY two notes that gate: `no_town_in_address` (Google
  answered; no town) and `no_place_id` (nothing to ask about). Every transient failure — 429,
  outage, cost cap, missing key — stamps a retryable note or nothing, and `scripts/town-verdict.test.ts`
  pins that a transient or unknown note NEVER gates. **Gates fire only on `unverifiable`;
  `unchecked` always passes** (absence is never an answer — instance ten).
- **The five server gates, each reporting its skip, never a silent shrink:**
  | Where | Behaviour |
  |---|---|
  | `process-whatsapp-queue` | excluded in the claim query (like archived); `unverifiedQueuedCount` in the status payload; own empty-queue skip code. ⛔ **BLANKET by Paul's call** — holds the plain opener too |
  | `instantly-push` | own id list `townUnverifiedIds` + count (bulk-jobs maps outcomes from id lists — a lead in none reads "gave no reason") |
  | `bulk-jobs` | triage rung → `cannot` with the shared reason; item branch → `skipped_town_unverified` (own status member, like `skipped_suppressed`) |
  | `create-ai-audit` | 409 `town_unverified` on BOTH auth paths (covers wizard, Inbox, whatsapp-inbound chain). ⚠️ **Baselines exempt, deliberately** — the paid path runs on the customer's own confirmed_location, and a prospect-era flag must not break the guarantee chain. Market audits have no lead_id and never reach it |
  | `derive-audit` | 409 before deriving — its town line falls back to search_location, the exact wrong-town fault |
- ⛔ **CSV IMPORT VERIFIES AS IT LANDS** (`bulkImportLeads` → `backfill-lead-towns` with the new
  ids, chunked at MAX_PER_CALL so a big file is verified in full). Id-less rows get the
  **three-guard place resolution** in `backfill-lead-towns`: Text Search **Pro** ($0.032, mask
  places.id/displayName/formattedAddress — the IDs-only mask is free but returns no name, and a
  resolver that cannot check the name is a blind top-result), then (1) `nameMatches` both ways,
  (2) exactly ONE distinct survivor, (3) whole-token town-hint agreement; **no location text on the
  row refuses outright**. A refusal runs `resolveDerivedTown` with no place_id → settled
  `no_place_id` → gated, with the specific reason itemised in the response. Transient search
  failures stamp NOTHING (stamping a settled note on our own outage would permanently gate a good
  lead) and are never cached.
- ⚠️ The residual false match that survives all three guards is a same-name business in the same
  hinted town — whose derived_town is still the right town, the quantity being verified.
- ✅ **DECIDED 2026-09-15, PAUL'S CALL: A FREE-CHECK LEAD GOOGLE CANNOT RESOLVE IS HANDLED BY HAND.
  NOTHING IS BUILT, AND THAT IS THE DECISION — do not re-open it without a third case.** The
  question was what to do when a free-check visitor's business cannot be found on Places, so the
  lead grades settled-unverifiable and every message lane refuses it.
  - ⛔ **THE NUMBER IS WHAT SETTLED IT, AND IT SHOULD BE RE-COUNTED BEFORE ANYONE BUILDS ANYTHING.**
    Measured that day: **4 leads have EVER been town-unverifiable; 2 unarchived; both free checks;
    ZERO have a phone; ZERO are in the queue.** One of the two is Paul's own test (`richard` /
    `plummer` / rich@move37.fun). **The real population is one lead.**
  - ⚠️ **AND THE GATE WAS THIRD IN LINE FOR IT, NOT FIRST.** Power pulse has no phone and a
    non-resolving email, so opening the gate changes nothing for it. Paul's instruction was
    explicit: **do NOT resolve Power pulse.** Unblocking one lane of three is not a fix.
  - **The handling, when one matters:** set `derived_town` on the lead and clear `town_fetch_note`.
    Every gate passes immediately, no deploy. ⚠️ **Stated cost: afterwards it is indistinguishable
    from a town Google verified** — there is no record that a person decided it.
  - **The three options that were REJECTED as more machinery than the problem**, kept so they are
    not re-invented: (B) extend the audit's `town_confirmed` exemption to the message lanes on the
    strength of the visitor's TYPED town — the delicate part is the queue's `.or()` SELECT filter;
    (C) a recorded operator-override state so "a person vouched" stays distinguishable from "Google
    said so"; (D) an operator screen over the three-guard place resolution's rejected candidates,
    which is the only one that would have solved Power pulse end to end — **and is worth doing for
    the phone, website and address it would buy, never for this gate.**

- **Backlog** (measured 2026-08-14): 498 leads lack derived_town, **384 unarchived** — all with
  place_ids, ≈ $1.92 via the Outreach table's **"Fix missing town" button — ONE press** (the
  explicit lead_ids path has no per-call slice, and $1.92 sits inside PLACE_DETAILS_CAP_USD
  $6/day). The archived 114 are skipped by design.

---

## 6g. ✅ THE OWNER'S NAME + THE PAYMENT NUDGE — built 2026-08-17, Paul's spec. Read before touching the questionnaire or templates.

**The pre-pay screen asks THREE things now** (consent, name, email — "Three things and you're in").
`contact_name` feeds directory registrations at delivery and the `questionnaire_followup` greeting.

- ⛔ **`outreach_leads.contact_name` is FILL-EMPTY-ONLY from the questionnaire** — the same
  convention as the email write-through beside it: an operator's hand-entered note ("Ronnie — ask
  for Sharon") beats a form field, and the onboarding row keeps the submitted value regardless.
  Verified before shipping: contact_name was NULL on all leads (0 non-null, 0 blanks), so
  `.is(null)` is the correct narrow form.
- ⛔ **THE FIRST NAME IS DERIVED AT SEND TIME, NEVER STORED** — `firstNameFrom` in
  **`src/lib/questionnaireFollowup.ts`**, a deliberately Deno-free module BOTH sides import: the
  edge sender builds the transcript body from it and the SPA renders the confirm-preview from it,
  so the two cannot drift. ⚠️ whatsapp-send.ts has Deno reads, which is why the SPA must never
  import it directly — put anything the SPA needs in the src/lib module.
- **Q2 gained `confirmed_phone`** (client-REQUIRED, loose shape) + the "directories will text you"
  helper line. ⛔ **Deliberately NOT in complete_q2's 400 gate**: nothing automated depends on it,
  and a hard server gate would brick every Q2 submit from a site bundle published before the field
  existed. **The Q2 owner-name fields were SHRUNK AWAY** (Paul, 2026-08-17) — the pre-pay name
  covers them; do not re-add.
- **`q2_prefill`** (findable-onboarding): the lead's phone for the post-payment form. PAID rows
  only — same id-as-capability model as complete_q2, and deliberately not part of `prefill`, whose
  contract is "never phone/email to the public page". Seeds only an EMPTY box (functional set).
- **`submissions` has a per-lead mode** (`lead_id` in the body): latest onboarding row via
  `select("*")` (columns absent pre-migration come through as absent, never a hard error) +
  `followup_sent`, whose filter MUST stay identical to `pitchEverSent` **including
  `.neq(status,'failed')`** — a failed attempt must not read "already sent" while the server would
  allow the retry.
- **The lead card's Questionnaire section** (`LeadQuestionnaireSection.tsx`): read-only answers
  through the endpoint (RLS-no-policies table — §8), absence worded by whose turn it is: unpaid →
  "Not asked yet (comes after payment)", paid → "Not answered yet", pre-field rows → "Not
  captured". **Never a refusal** (the serveGate wording lesson).
- 🔴 **`questionnaire_followup` — MANUAL ONLY, ONE SEND PER LEAD, NO OVERRIDE.** Registered at
  Meta BY PAUL 2026-08-17 ({{1}} first name, {{2}} business name, Marketing). Unlike audit_reply
  there is deliberately no `allow_resend` — a second "just the payment step left" nudge is
  pressure, never service. The server refuses a blank contact name (`no_contact_name`); the UI's
  confirm prompts for the first name and saves it to the lead BEFORE sending, so {{1}} always
  resolves from the lead row.
  - ⚠️ **`lang: "en_GB"` IS UNCONFIRMED** — Paul's registration said English (UK) but the Manager
    check came back with the bracket unfilled. Confirm in WhatsApp Manager before deploying the
    send path; if it shows plain English, flip the constant in BOTH registries (whatsapp-send.ts +
    process-whatsapp-queue's mirror) in the same commit.
  - 🔴 **DEPLOYS HELD: `send-whatsapp-message` + `process-whatsapp-queue` carry the entry in git
    but are NOT deployed with it** until Paul confirms Meta approval. Until then a button press
    fails safe with the deployed version's `unknown_template`. Everything else shipped.

- ✅ **`send-whatsapp-message` mode `test_send` — ONE REAL SEND, TO ONE NUMBER, WRITING NOTHING**
  (built 2026-09-12 on `instantly-push`'s `auth_probe` precedent). It returns BEFORE the
  conversation lookup, so no lead is read or adopted by phone, no `whatsapp_messages` or
  `whatsapp_sends` row is written and no status moves — while still building the payload with the
  real `claimTemplatePayload` and posting it with the real `sendViaGraph`. It echoes the posted
  payload so the header component and variable order are inspectable without a redeploy.
  - ⛔ **THE DESTINATION IS `WHATSAPP_TEST_NUMBER`, READ FROM THE SECRET, NEVER FROM THE REQUEST.**
    It first required the caller to supply a MATCHING phone, and that was unusable for its only
    job: **`supabase secrets list` returns SHA-256 DIGESTS**, so nobody operating the function can
    read the number back to retype it — and retyping was the sole way to get a digit wrong. A
    supplied phone is now an optional confirmation that must still match. Unset secret → refuse.
  - ⚠️ **ADMIN-JWT ONLY, AND THERE IS NO UI FOR IT**, so running it means minting an operator
    session (§8's magic-link route) — a real sign-in on Paul's account. Tell him, and revoke.
  - ⚠️ **It costs a real template send and there is no dry-run**, deliberately: a dry-run proves
    nothing about Meta, which is the only thing this mode exists to prove.
  - ✅ **Proven live 2026-09-12**: `video_template` accepted, `wamid.HBgMNDQ3OTQzMjYyNzQy…`, and the
    before/after row counts plus a targeted per-number and per-wamid search came back **0 rows in
    every table** — the counts prove no NET change, the targeted search proves no row at all.

---

## 6h. ✅ HONEST DASHBOARD METRICS — built 2026-08-19, Paul's spec. Read before touching any dashboard number.

- ⛔ **A SEND IS `isRealSend` (src/lib/realSend.ts): status `sent`/`delivered`/`read`, POSITIVE test.**
  whatsapp_messages carries `failed` (Meta refused — 82 rows) and `simulated` (old test mode — 3),
  and every counting surface used to treat "an outbound templated row exists" as sent: 38 unarchived
  leads (37 of them status `no_whatsapp`) counted as Reached, deflating the funnel reply rate 56%→52%
  and Locksmiths 60%→56%. One predicate, imported by useDashboardMetrics (funnel + channel card) and
  useCampaignStats (reached / per-template); `scripts/real-send.test.ts` pins failed/simulated/
  pending/null out. **Lead statuses never polluted the rebuilt funnel** — the pollution was the
  failed message row, not the status.
- ⛔ **onboarding_responses IS READ THROUGH `submissions` (`action: "lead_statuses"`), NEVER
  DIRECTLY.** The direct read hits RLS-with-no-policies → 200 [] → per-campaign `started` was
  structurally 0 forever and the Chase task NEVER fired (§8's third instance, finally fixed).
  Returns EVERY lead-linked row; the hooks fold sticky-paid client-side. Both callers are
  deliberately non-throwing — an endpoint hiccup degrades one rule, never blanks the dashboard.
- **The hook IS `audit_reply`, and the funnel names it now**: tiles read "Hook sent (msg 2)" / "Hook
  reply"; Paid carries "N of M hook replies". Measured 2026-08-19: all 313 hook sends followed a
  first reply (the auto chain), so funnel "Replied" ≈ replies to the opener.
- **Per-campaign conversions**: `repliedToPaidPct` (of who ANSWERED, who bought) + `reachedToPaidPct`
  in useCampaignStats, rendered under the money row once `replied > 0`.
- ⛔ **FOUNDER TILE COUNTS ACROSS `[FOUNDER_PRICE_GBP, ...FOUNDER_PRICES_HISTORICAL_GBP]`** (Paul's
  call 2026-08-19) — current-price-only made RG's £19.99 sale vanish (tile read 1 with 2 customers
  paid). Append to the historical list when the price moves; never remove an entry a sale was taken
  at. ⛔ **AND SINCE 2026-09-03 IT IS A FLOOR, NOT AN EXACT MATCH AGAINST THAT LIST** — the website
  add-on lands `amount_paid` at £109.97, which an exact match dropped entirely. `PAYING_FLOOR_GBP`
  is derived (`Math.min` of the two), and a **churned** subscription stops counting on a POSITIVE
  match against `canceled`/`incomplete_expired`. **§11 has the rules; `scripts/paying-customer.test.ts`
  pins them.** ⚠️ **check-cross-repo-sync parses `FOUNDER_PRICE_GBP` as a bare number in useDashboardMetrics
  — keep the name, and NEVER write the declaration pattern in a comment: the regex takes the file's
  FIRST match, comments included** (it broke the guard for ten minutes; so did moving
  MARKET_AUDIT_MIN_AUDITS without repointing BOTH repos' scripts at marketAuditThreshold.ts).
- ✅ **RESOLVED 2026-08-19: D Aston and Fortify were Paul's TEST businesses (flow experiments,
  never real charges) — DELETED in full on his instruction.** 83 rows across 9 tables (2 leads,
  2 phantom-paid onboarding rows, 15 messages, 9 sends, 2 auto-replies, 3 activities, 3 audits
  incl. Fortify's test baseline, 5 runs, 42 queue rows), FK-safe, zero orphans verified. So §8's
  "Fortify got a full 3-run baseline minutes after paying" remains true as HISTORY (it proved the
  bearer path) but the rows no longer exist — do not go looking for them.
  ⚠️ **Two consequences, stated:** their numbers (+44 7833 617226, +44 7595 953838) are no longer
  guarded by the phone-history seatbelt or any suppression row, so a future search can re-add and
  re-message two businesses whose owners already engaged once; and the deleted onboarding rows
  were exactly the ones that proved complete_q2 live on 2026-08-13 — RG + Ronnie are the remaining
  proof. ⚠️ **The substring trap struck again during scoping:** a name search for "aston" matched
  Thurm**aston** Key Solutions and **Aston's** Access Auto Locksmiths, both REAL leads — the
  deletion keyed on the two exact lead ids, never on names.
- ✅ Audited clean, leave alone: Paid = amount_paid everywhere; PipelineCard (labelled status
  counts); channel card's `not tracked` rows; SMS sent 0 (sms_sends is truly empty); SubmissionsCard;
  receipts; hook-reply timestamp attribution. `ActivityCard.tsx` is dead code (no importer).

---

## 6i. ✅ THE PAGE GENERATOR — delivery pages from the questionnaire × baseline overlap (2026-08-19)

- **`/page-generator` + the `page-generator` edge fn + `src/lib/pagePlan.ts` (pure, tested).** A
  page exists ONLY when the (service, town) pair is BOTH wanted (services_list × areas_list +
  confirmed_location, newest onboarding row) AND measured (a verbatim baseline question targets
  it) — so every page aims at a query the week-8 re-measure will test. RG's real 12 questions →
  exactly 10 pages; "uPVC door and window locks" answers the upvc-door AND window-locks queries as
  ONE page with two queries. Output is paste-ready per page (slug/title/meta/H1/body, per-part
  copy); NOTHING publishes — Paul pastes by hand.
- ⛔ **BASELINE QUESTIONS ARE READ FROM THE LATEST `baseline_target_runs` RUNS ONLY** — Ronnie's
  baseline audit still carries his replaced wrong-category locksmith runs; the latest-runs rule
  drops them and the overlap is the second guard (no matching service → no page, itemised).
  The questions themselves are pristine verbatim strings — the competitor mess lives only in the
  ANSWER side of audit data.
- ⛔ **EXCLUSIONS ARE ITEMISED, NEVER SILENT**: generic trade-level queries ("best locksmiths in
  Huntingdon UK") → "homepage covers it"; measured-but-not-offered services (Ronnie's "cobbler",
  "key cutting") → excluded with reason; wanted-but-never-measured areas (RG: St Ives, Brampton,
  Godmanchester, Chatteris) listed as no-page.
- ⛔ **ANTI-STUFFING IS CODE, NOT PROMPT — AND IT MEASURES PHRASE+TOWN+NOUN-SPAM, NOT RAW DENSITY
  (rebuilt 2026-08-27).** The old `stuffingCheck` summed EVERY occurrence of the service's stemmed
  tokens (lock/locks, change/changes) as "keyword density" ≤ 3% — so a genuinely CLEAN locksmith
  page hit 3.6-5.2% purely from unavoidable use of "lock" and false-flagged as stuffed. A locksmith
  page HAS to say "lock" a lot; that is not stuffing. `stuffingCheck` now grades the three real
  doorway signals: town over-use (`MAX_TOWN_MENTIONS` 3), **exact contiguous SERVICE-PHRASE repeats**
  (`MAX_SERVICE_PHRASE_REPEATS` 5 — multi-word phrases only; a single-token service is left to the
  backstop), and a **bare-noun-spam backstop** (`MAX_SINGLE_WORD_PCT` 6% — the most-repeated content
  word EXCLUDING the service tokens and the town, so natural "lock" use trips nothing while
  "locksmith"×30 still does). `MAX_KEYWORD_DENSITY_PCT`/`serviceTokenCount`/`densityPct` are GONE.
  ⛔ **Caps are MEASURED, not guessed** (§4): 4 freshly generated RG pages 2026-08-27 all graded ok
  (top word ~2%, exact phrase up to 4x → cap raised 4→5 to sit above the observed natural ceiling);
  doorways hammer the phrase 7-11x and a noun 26-41%, so every cap keeps a clear margin. The
  mechanical backstop still HARD-guarantees the town cap + no-other-towns; natural copy now passes
  the metric on its own (no more "fix it yourself" warnings). gpt-4o, `must_not_say` is a hard prompt
  rule (RG: never claim MLA), no outcome promises, invent nothing. ⚠️ **The SPA fix was TYPE-ONLY**
  (PageGenerator's `Naturalness` interface renamed) so the SPA bundle is unchanged — the real change
  is the edge fn (v4, deployed), proven live because generations now return `phraseCount`/`topWord`/
  `topWordPct`, fields only the new code produces.
- ⛔ **GENERATED PAGES ARE CACHED CLIENT-SIDE, PER CLIENT, IN localStorage (2026-08-27).** The edge
  fn stores NOTHING (its DB calls are all reads), so every `generate` is a live paid OpenAI call —
  and before this, navigating away wiped the in-memory `gen` map (AppLayout remounts, §6c), so
  returning meant regenerating and paying again. `PageGenerator.tsx` now holds generated pages in
  `usePersistedState` (`pagegen-cache`, tier `both`, scoped by `user.id`), keyed by clientId. ⛔ **The
  rules that must not regress:** restoring is a PURE READ — it never calls the generator, so returning
  costs nothing; only an explicit "Regenerate" click spends. busy/error/no_credits are TRANSIENT
  (in-memory only) and never persisted (no stuck spinner on return — the §6c "never persist an
  interruption" rule). Pages are scoped by clientId so one client's pages never show under another.
  A page cached >24h shows a "generated earlier" note (`STALE_MS`); the Clear button wipes a client's
  pages but keeps the plan visible. No DB, no server storage — held per-browser, not cross-device.
- ⛔ **PAGE COMPLETENESS: real CONTACT + INTERNAL LINKS + LOCAL AREAS are appended MECHANICALLY,
  after enforceNaturalness (2026-08-27).** Four completeness fixes, all grounded in REAL data, none
  invented:
  - **Contact CTA + NAP**: the edge fn now reads `outreach_leads.phone/website/address` (+ onboarding
    `confirmed_phone/business_address/contact_name`) and appends a "Get in touch" block with the REAL
    phone. The street ADDRESS is added ONLY on the home-town page (`normTown(page.town) ===
    normTown(homeTown)`) — on an away-town page it would name the home town and break the single-town
    rule. Missing field → drops, never faked.
  - **Internal links**: Home (`{site}`) + Contact (`{site}contact/`, operator-confirmable per client)
    as real `<a>`. hrefs live in tags so they don't affect the density check.
  - **Local areas**: there is NO verified neighbourhood source — the audit stores COMPETITORS +
    `answer_text` junk, `uk_towns` only has "East of England"/lat-lng (⚠️ this line said "Cambridge
    isn't even in it" — FALSE, checked 2026-09-13: Cambridge IS present; what is absent is every
    major CITY — London, Birmingham, Manchester, Leeds, Bristol, Liverpool, Sheffield, Nottingham,
    Newcastle upon Tyne — see §22),
    and RG's own site just says "surrounding areas". So neighbourhoods are an OPTIONAL operator field
    (`local_areas`, per-client, persisted), woven in verbatim, invent-none; empty → "the surrounding
    area". ⛔ Do NOT try to mine neighbourhoods from the audit — proven three ways they aren't there,
    and competitor names must never go on the client's own page (§6).
  - ⛔ The CTA/NAP/links block is appended AFTER enforceNaturalness so it's never trimmed/mangled;
    the naturalness verdict is computed on the MODEL body only (the factual block isn't "copy").
  - **Title/meta application**: the generator always produced them; the UI now maps each output to its
    WordPress home (Yoast SEO title / Yoast meta / WP slug / Elementor H1 / body → HTML widget) so they
    stop being dropped on paste. ⚠️ The 3 live RG Huntingdon pages predate this — set their title/meta
    in Yoast retroactively.
  - ⛔ **CATCHMENT HONESTY (2026-08-28): "based here" is allowed ONLY on the client's real home town
    page** (`isHomeTown`, from questionnaire confirmed_location). On covered-from-a-distance towns a
    base claim is a doorway signal AND dishonest — and `enforceNaturalness`'s town strip could
    MANUFACTURE it ("based in Huntingdon" → neutral swap → "based here"). Three layers: prompt
    branch; `FALSE_BASE_RE` joins the regeneration trigger (proven live: Peterborough draft 1 was
    dishonest, regenerated clean); `enforceCatchmentHonesty()` as the hard guarantee AFTER the town
    strip. Catchment CTAs open with the honest line "We cover {town} from our base in {homeTown} —
    we come to you" (appended post-strip; "our base in X" deliberately does not match FALSE_BASE_RE).
- ⛔ **SECOND MODE — "ARTICLE / Q&A" — built 2026-08-27, SAFETY IS STRUCTURAL.** A toggle picks
  Service+Area (unchanged) or Article/Q&A (informational pages for national/regulated clients like
  Solene, a menopause clinic). Q&A actions are **`qa_clients` / `qa_plan` / `qa_generate`**,
  AUDIT-BASED not lead-based — Solene has an audit but **no lead_id, no questionnaire, no contact
  data**, so it is invisible to the service path; the service path is untouched.
  - 🔴 **THE MODEL NEVER EMITS A FACT — BY CONSTRUCTION, not by prompt trust.** `qa_generate` asks
    gpt-4o for STRUCTURE ONLY (`return_qa`: generic intro, 3-5 related sub-questions, and *labels*
    naming the facts an expert must supply — `factSlots`). The edge fn then ASSEMBLES the page in
    code with every specific fact rendered as a `[CLIENT INPUT: …]` blank. The model cannot output a
    price/dose/eligibility/medical claim because those slots are written by code as blanks. The
    model's only prose (intro, meta) is **digit-guarded** — anything with `[0-9£$%]` is dropped for a
    safe template. Verified live: "How much does AndroFeme cost in the UK?" → 13 blanks, banner
    present, **zero invented figures in the prose**. The failure mode is a visible blank, never a
    wrong fact.
  - ⛔ Every draft carries a review banner (UI + an HTML comment in the body) and Sources +
    "Reviewed by [CLIENT INPUT]" blanks. **Do not weaken this into free-writing medical content** —
    that was examined and rejected; the human/clinician is the accuracy gate.
  - 🔴 **NARROWED 2026-08-29, AND THE RULE ABOVE STILL HOLDS FOR THE TRADES IT WAS WRITTEN FOR.**
    An accountancy Q&A page came out as nothing but blanks under health framing, so `qa_generate`
    now has **TWO MODES, chosen in code by the client's trade** — `src/lib/qaAnswerGuard.ts`,
    `qaModeFor(business_type)`, never by the model and **never by a request parameter** (a caller
    must not be able to ask for the permissive mode).
    - **`structured` — UNCHANGED, and it is what health/clinical/legal/mortgage/insurance/
      financial-advice trades get.** All-blanks, sources, named reviewer. `REGULATED_TRADE_PATTERNS`
      is the list; Paul tunes it, and adding a trade only ever makes its pages MORE cautious.
    - **`advice`** — accountancy, trades, everything else: real drafted answers.
    - ⛔ **A BLANK OR UNRECOGNISED `business_type` GETS `structured`.** Absence is never permission
      (instance fourteen). A useless page of blanks for an accountant is a complaint; free-writing
      clinical copy for a client whose trade we could not read is a real harm.
    - ⛔ **THE SAFETY PROPERTY IS UNCHANGED, ONLY ITS SHAPE.** Structured mode's guarantee was that
      the model *cannot* emit a fact. Advice mode's is that a fact *cannot get out unconfirmed*:
      every sentence of model prose passes `renderGuarded` **on the way out**, and anything matching
      `FIGURE_RE` (any digit/£/$/€/%), `isOwnedPriceClaim` (a money word **plus** a first-person
      marker — see the narrowing below), `CREDENTIAL_RE`
      (registered/chartered/accredited/insured/member of/guaranteed) or `COMMITMENT_RE` (a
      first-person promise — **the PRONOUN is the boundary**: "an accountant files your return"
      publishes, "we file your return" does not) becomes
      `[CLIENT CONFIRM — reason: <the drafted wording>]`. The prompt asks for the same restraint;
      the prompt is the polite request and the guard is the guarantee.
    - ⚠️ **Guarding is SENTENCE-level, never paragraph-level** — flagging a whole paragraph over one
      clause rebuilds the all-blanks page this change exists to fix.
    - ⚠️ **The draft value stays INSIDE the marker** (Paul's requirement): a human approves or
      corrects a suggested number rather than meeting an empty blank.
    - ⚠️ Sources render **only when the model actually named one** — an empty Sources heading
      invites an invented citation. No reviewer line on the advice path.
    - 🔴 **PRICE WAS NARROWED THE SAME DAY, AFTER A MEASURED OVER-FLAG — and the lesson generalises
      beyond this file.** It first matched the money word ALONE, which held three sentences on a
      real "what does an accountant do" page that carry no number and make no claim about the
      client: *"identifying cost-saving opportunities"* (on `cost`) and *"avoid penalties and
      interest charges"* (on `charges`). **Money vocabulary is ordinary English in this trade** — an
      accountancy page cannot say what an accountant does without "cost" and "charges" — so the bare
      word carried no signal. ⛔ **A guard that flags the unremarkable trains the operator to stop
      reading it, which costs more safety than it buys.** Price now requires a money word **and** a
      first-person marker in the same sentence (`isOwnedPriceClaim`), exactly as COMMITMENT already
      keys on the pronoun: "most accountants charge by the hour" publishes, "we charge by the hour"
      is held. FIGURE is **pronoun-blind and tested first**, so every real number is still held
      whoever it belongs to.
      ⚠️ Accepted gap: a third-person self-description ("the firm's fees are competitive") would
      publish. These pages are written as "we"; widening to catch it re-admits the general sentences.
      ⚠️ Paul reported a third sentence, *"improving overall profitability"*, as held on `profit` —
      **it was not, and `profit` has never been a trigger word.** Measured before changing anything;
      it must have been held by another word in the same sentence. **Reproduce a reported over-flag
      against the real predicate before removing the rule someone believes caused it.**
    - `scripts/qa-answer-guard.test.ts` (90 assertions) pins both absent cases, the word-boundary
      substring traps ('vet' in "private", 'gp' in "gps", 'care' in "careful"), the abstract-money
      sentences that MUST publish, the first-person ones that must not, and the property that no
      figure ever publishes unconfirmed.
  - ⚠️ SPA: `mode` toggle (persisted); Q&A picks a client + a question (baseline list or free-type).
    `activeClientId` = qa audit id or service lead id (different id spaces → one cache serves both).
    Draft pages carry no naturalness/applied badges; `renderDone` is shared by both modes.
- ⛔ **THE PAGE-PLAN QUEUE (Stage 1, 2026-08-28) — `/page-plan` + `plan_build`/`plan_get`/
  `plan_update` on the page-generator fn + `src/lib/pagePlanQueue.ts` (pure, tested).** Measured
  questions → ONE AI clustering call (indices, not echoed strings) → **`validateClusters` enforces a
  perfect partition in code** (dropped/duplicated/unknown index → LOUD singleton fallback, never a
  silent drop) → deterministic scoring + **waves keep a topic's pages together** (the doc's
  "publish complete clusters"; a topic takes its best page's band, `WAVE1_MIN_SCORE`). Held pages
  carry reasons, un-holdable; near-dups flagged (`NEAR_DUP_JACCARD`), stage-1 gate only.
  ⛔ **Three rules from Paul's eyeball of the real RG plan (2026-08-28) — do not regress them:**
  - **TOWN IS A HARD SPLIT DIMENSION** for local clients: `enforceTownSplit` (towns = the lead's
    questionnaire confirmed_location + areas_list) splits any cluster spanning towns AFTER
    validation — the model is also told, but the CODE is the guarantee. Within-town merges stay
    allowed; national clients (no towns) untouched; splits reported, never silent.
  - **HOLDS ARE PER QUESTION, FROM RUN COUNTS — AND GEMINI-FIRST (Paul's rule, 2026-08-28).**
    Pages are the GEMINI lever (§5: ChatGPT reads directories, Gemini reads the own site), so the
    THREE-WAY rule in `scoreCluster`: Gemini named in ≥`DEFEND_NAMED_RATE` of ≥2 runs → **DEFEND,
    the ONLY hold**; ChatGPT-named but Gemini-absent → **BUILD tagged "Gemini gap"** (amber badge,
    derived in the SPA from the stored counts; scored low → later wave, no absence bonus);
    neither → plain BUILD, wide-open first. A page holds only when EVERY measured question defends;
    reasons print the counts ("ChatGPT 3/3 · Gemini 0/3"). The old cluster-max rule held
    Peterborough (0/3) on Huntingdon's 100% — the exact fault. `named_rate` is stored as COUNTS
    (`{named,runs}` per engine); the UI renders counts and legacy fractions.
  - **LOCKED MARKETS HOLD AGAIN, PRIORITY 1 (corrected 2026-08-28 — the Gemini-first rule was only
    ever meant for the defend case).** Page order: locked → HOLD with its OWN wording naming the
    incumbents ("Held — market locked: X, Y dominate… revisit as the site's authority grows",
    incumbents = classifyWinnability's namedFirms on the majority run, `QuestionSignals.incumbents`);
    then Gemini-defend; then gap-build; then build. Locked+open variants still BUILD on the open
    one. ⚠️ No real client currently has a locked page under the majority grader (the earlier
    Solene "locked" came from the OLD computeWinnability grader) — the path is test-pinned, not yet
    seen live.
  - **WAVES ARE BY SCORE (2026-08-28, supersedes topic-grouped waves).** Each page's OWN score
    picks its wave (≥`WAVE1_MIN_SCORE` → wave 1); positions follow score order. A score-35 gap page
    can no longer ride wave 1 on a topic sibling's 85. `topic` survives as the hub grouping.
  - ⚠️ **`client_pages.lead_id` is NOT NULL in the live table** (2026-08-21 legacy shape) — a
    lead-less national client (Solene) FAILS to persist until Paul runs the drop-not-null ALTER
    (handed 2026-08-28). Dry-runs unaffected. RG persists fine (has a lead).
  - **WINNABILITY IS `classifyWinnability` PER RUN folded by `majorityVerdict`** (the audit page's
    own vocabulary: named/open/contested/locked/no_local_race; `unmeasured` for no data) — NOT
    computeWinnability's internal labels, which read "unclear" on nearly everything and matched
    nothing Paul sees on the audit screen.
  - ⛔ **Tables `client_pages` + `client_page_questions`** (migration `20260828090000`, owner RLS
    policies IN the migration — the RLS-no-policy trap). **SQL is hand-run by Paul**; until it runs,
    plan actions return typed `plan_tables_missing` and the UI says "run the SQL". `plan_build`
    without `dry_run` REPLACES the stored plan (the confirm says so); `dry_run: true` computes
    without tables — how the samples were produced.
  - 🔴 **`CREATE TABLE IF NOT EXISTS` AGAINST A TABLE THAT EXISTS IN A DIFFERENT SHAPE IS A SILENT
    NO-OP — it bit this exact feature on day one (2026-08-28).** BOTH tables already existed,
    created 2026-08-21 in the RECON_PAGEDB shape (11 RG capture rows, old baseline `f64920ce` —
    KEPT, invisible to the queue). Paul ran the migration "successfully" (policies + ALTERs
    succeeded) yet 10 queue columns never materialised → `plan_get` 500'd on `ORDER BY wave`
    (42703). Fix: migration `20260828130000` (additive ALTERs, idempotent) — which also had to
    WIDEN the old status CHECK (`draft/approved/live/archived`) or every `'planned'` insert would
    have been refused next. ⚠️ **The compounding trap: supabase-js errors are PLAIN OBJECTS, not
    `Error` instances** — `String(e)` = `"[object Object]"`, so the 500 read `unknown_error` and
    the typed fallback regex could never match. `errMsg()` in the edge fn now reads `.message`;
    never write `e instanceof Error ? e.message : String(e)` around a supabase call. Rule: when a
    migration "ran fine" but the code still can't see a column, diff the LIVE columns against the
    CREATE TABLE — do not re-run the migration and do not trust IF NOT EXISTS.
  - ⚠️ Verified on real data 2026-08-28 (dry-run, ~4p total): RG 12→12 (service+town questions,
    nothing to merge — partition held) with **8/12 held as defend** (his re-measured baseline now
    names him 100% on Huntingdon questions); Solene 20→9 with sensible merges (6 testosterone-route
    variants → one page). ⚠️ **Clustering is non-deterministic across rebuilds** (a Solene re-run
    gave 12 pages, both partitions valid) — a Rebuild is a fresh proposal, not a refresh. ⚠️ **No
    SPLIT control exists** — an over-merged cluster is fixed by Rebuild or not at all; stage-2
    candidate. Stage 2 = research-question input + full quality gate; Stage 3 = hand-off to the
    generator + content on the same rows.
  - ✅ **Per-page CITED SOURCES (client feedback: the most valuable output — "where to get
    listed").** `topSources()` (pure, tested) counts the cited domains across a page's questions;
    `plan_build` attaches top 5 (`client_pages.top_sources`, jsonb [{domain,count}]) with a
    **column-shed retry** so a pre-column DB still takes the plan; the row renders "engines
    currently read: …". Migration `20260828110000` is the idempotent ALTER for a DB that ran the
    base migration before the column existed.
- ⚠️ `page_key` is RE-DERIVED server-side on generate — a client can never request a pair the
  overlap didn't produce. Hosting format is a dropdown (`website_platform` is NULL for both
  current clients; it seeds the default when a future client fills it). Typed `no_credits` while
  OpenAI is dry (plan half works regardless). `scripts/page-plan.test.ts` pins RG's and Ronnie's
  real shapes.

---

## 6j. ✅ BUILT + LIVE: free check → funnel top (MVP shipped 2026-08-20). ⛔ PHASE 2 IS NOW BUILT — READ §15 FIRST.

🔴 **§15 SUPERSEDES THIS SECTION WHERE THEY DISAGREE (2026-09-03 → 09-07).** The auto-audit shipped,
the result is emailed to the visitor, and four faults in that lane have been found and fixed since
(the town gate refusing every unresolvable business, the dedupe merging different businesses, the
operator email asserting states it never checked, and the result never reaching a MATCHED lead).
Everything below is still true as the MVP's record.

**PHASE 1 IS LIVE.** Deployed 2026-08-20: `findable-onboarding` v39, `notify-onboarding-submit` v9,
`backfill-lead-towns` v9, and findable-site. Confirmed live with a ZERO-SPEND probe — a submission
carrying an EXISTING lead's exact name, which the dedupe catches at rung 1 before any paid call:
response came back `{"ok":true,"lead":"matched"}` (the `lead` field exists only in the new version),
the row was written with `source='free_check'` and linked to that lead, and the lead count stayed at
1,646 so no duplicate was created. Probe row deleted afterwards.
⚠️ **A REAL SUBMISSION HAS STILL NEVER HAPPENED, AND THE PAID PATH HAS NEVER RUN.** The probe
matched at the free rung on purpose, so Text Search / Place Details / resolveDerivedTown are proven
only by code and by `deno check` — not by a live call. Paul is watching for the first real one.
⚠️ **THE NOTIFIER'S NEW EMAIL WAS NOT OBSERVED.** Its copy is proven by code + deploy only. The
probe row existed for ~60s with the delay bypassed, so the cron may have sent one
`FREE CHECK — MCR Heating and Plumbing ltd` email; if that arrived, it was the probe, not a prospect.

**⛔ PHASE 2 (AUTO-AUDIT) IS DELIBERATELY NOT BUILT.** ⛔ **OUT OF DATE — IT WAS BUILT AND IS LIVE;
free checks now run an audit and email the visitor their result. §15.** The paragraph below is the
record of the hold, not the current state. Paul: "I want to watch a real submission
create a lead first." Generic mode's lockdown #1 (never fires an audit) is UNTOUCHED — nothing in
this flow queues a question, spends Apify, or sends anything.

**What shipped, and where the reasoning lives (read the file headers, they carry the detail):**
- `_shared/place-resolve.ts` — the guarded place-id resolver, EXTRACTED VERBATIM from
  backfill-lead-towns. Two consumers now, so **both redeploy together** (§4's shared-file trap).
- `_shared/free-check-lead.ts` — `createFreeCheckLead`. Owner resolved FROM THE DATA (newest lead's
  user_id). Dedupe = the database, FAILS CLOSED, ordered by COST (name free → place_id → phone) so a
  repeat submission spends nothing. Cap `FREE_CHECK_DAILY_LEAD_CAP = 10` per rolling 24h, checked
  BEFORE the first paid call. Town via `resolveDerivedTown` so a refusal leaves the lead town-GATED.
  Never throws. Real cost when all three calls run: **$0.057 ≈ 4.5p**.
- `findable-onboarding` — validated `source` in all THREE places; lead creation runs AFTER the row is
  saved and can never fail the request; the row is linked for `matched` as well as `created`.
- `notify-onboarding-submit` — free-check subject/heading/opening/tail, the TRADE finally included
  (`services` was missing from the SELECT), and the 20-min delay bypassed for these rows only.
- `scripts/free-check-lead.test.ts` — ladder order + spend, fail-closed on every dedupe read, cap
  boundary, blank name/town, absent place/phone, and the source gate against 9 junk values.

🔴 **THE NUMBER TO STOP QUOTING: "1000 leads" WAS PostgREST'S TRUNCATION, NOT A COUNT.** Re-derived
2026-08-20 with paginated reads: **1,646 outreach_leads, 465 ai_audits, 515 ai_audit_runs, ALL owned
by the single account below.** §6's paginate rule, caught in this file's own notes.

**What exists today (verified in deployed code + live DB, 2026-08-19):**
- findable.live's FreeCheck posts `findable-onboarding` `action:"submit"`, no lead_id,
  `incomplete:true`, answers = business_name / confirmed_location / services / contact_email →
  GENERIC MODE: one `onboarding_responses` row (`lead_id` null, `status 'submitted'`), then stops.
- Paul WOULD see it: the notify cron picks generic rows (its query has no lead_id filter) after the
  20-min delay — but the email is MISLABELLED ("Questionnaire submitted, not paid" / "reached the
  payment screen and stopped") and OMITS the trade (`services` isn't in its SELECT; its trade line
  reads only off a linked lead). The dashboard SubmissionsCard lists generic rows fine.
- **NO edge function inserts `outreach_leads` — lead creation is 100% client-side** (`useOutreach`).
- `create-ai-audit`'s question generator falls back to DETERMINISTIC TEMPLATES on ANY non-OK OpenAI
  response (`if (!res.ok) return fallback`, ~line 1091) — audits run end-to-end while OpenAI is dry.
- `backfill-lead-towns` is operator-JWT only (no internal branch) and address-only (NO phone);
  phone comes from the `_shared/place-details.ts` machinery (`fetchPlaceDetails`, ENTERPRISE_FIELDS,
  `townFromComponents`) — a server flow should IMPORT the shared module, not call the fns over HTTP.
- addLead's DB-keyed dedupe to replicate server-side (useOutreach.ts ~:489): place_id → exact phone
  → exact name, archived rows count, FAILS CLOSED. The queue's phone-history seatbelt + suppression
  live in `process-whatsapp-queue` and apply to ANY lead regardless of origin — nothing to build.

**The approved decisions (all four SHIPPED except #4, which is held):**
1. SQL (handed to Paul 2026-08-19): `onboarding_responses.source text`, nullable, no default, no
   CHECK — old deploys unaffected; unknown source flags, never blocks. ⚠️ Confirm it has RUN before
   deploying anything that writes it (§3 SQL-first).
2. MVP FIRST (phase 1 only): submit → row saved with `source='free_check'` → server-side lead
   creation (owner = **the account that owns the data, NOT ADMIN_EMAIL** — see the 🔴 note
   directly below; dedupe as above; trade →
   `search_keyword`, town → `search_location`, email fill-empty, status `not_contacted`,
   provenance in enrichment_source/notes; three-guard place resolution + place-details → place_id/
   phone/address/derived_town, ≈5p; resolution refusal = lead still created, town-gated, flagged in
   the email; onboarding row's lead_id linked to the created/matched lead) → notify email
   free-check-aware (subject "FREE CHECK — {name}", trade line added, NO 20-min delay for these
   rows). findable-site FreeCheck adds `source:"free_check"`. Keep the honeypot.
   **Deploy order: SQL → findable-onboarding + notify-onboarding-submit → findable-site.**

   🔴 **THE OWNER IS `pauljsales455@outlook.com`, NOT `paul@move37.fun`. RESOLVING IT BY
   ADMIN_EMAIL WOULD HAVE MADE EVERY FREE-CHECK LEAD INVISIBLE.** Corrected 2026-08-19 — the
   original plan said "operator user_id resolved by ADMIN_EMAIL lookup" and that was wrong.
   Measured live that day: **user_id `9d5a7629-3171-4091-b3a4-43010a1d424d`
   (`pauljsales455@outlook.com`) owns ALL of it** — 1000 outreach_leads, 457 ai_audits, 507
   ai_audit_runs, with no second owner on any of the three. `paul@move37.fun`
   (`a3ce543d-fc8a-46c3-8072-723351b7138e`) is **ADMIN_EMAIL, the notification recipient, and owns
   NOTHING.**
   - ⛔ Because RLS scopes the SPA's reads by `user_id`, a lead created under the ADMIN_EMAIL
     account saves with HTTP 200 and then **cannot be seen in Outreach, the Inbox or any count** —
     the RLS-returns-200-with-`[]` failure (§8) in a new place, on the funnel's front door.
   - ⚠️ **DO NOT hardcode either UUID.** Resolve the owner from the DATA (e.g. the `user_id` on the
     most recent `outreach_leads` row) or from an explicit new secret — never from ADMIN_EMAIL, and
     never from a literal pasted out of this file, which goes stale the day the account changes.
   - ⚠️ **The same trap applies to any future server-side writer of an owner-scoped table**
     (leads, audits, runs, notes). ADMIN_EMAIL answers "who do we email", never "whose row is this".
   - **How it surfaced:** a minted session for `paul@move37.fun` got `forbidden` from
     extract-competitors' ownership check on all 51 runs of the cleaner catch-up. Nothing was spent
     (the ownership check precedes the OpenAI call), and the catch-up succeeded once the session was
     re-minted for the outlook account.
3. Auto-spend cap: **10 free-check leads/day** — rows past the cap still save + notify, they just
   don't spend Places money automatically (generic mode has NO rate limit today and each submission
   starts costing real pence).
4. Phase 2 (ONLY after Paul has seen MVP work): auto-audit via internal create-ai-audit call
   (service-bearer pattern whatsapp-inbound already uses), 5 questions, skip_seo, NO auto-pitch —
   approved to run with template questions even while OpenAI is dry. Phase 3 is nothing: the lead's
   phone puts it in the normal Outreach → queue flow with all guards.

---

## 7. Parked and unmerged — do not merge these

| Branch | Hash |
|---|---|
| `edge-check-gate` | `d3fd6713` |
| `findable-product-rename` | `a8365707` |
| `short-signup-url` | `c8896003` |

---

## 8. Known open problems — don't rediscover these

- 🟡 **OPEN AS OF 2026-09-08, from the September work (§12–§17). None is a defect in what shipped;
  each is a state or a gap somebody has to decide about.**
  - **Two free checks were STRANDED** (audit complete, result never sent — SUPREME PLUMBERS and one
    sinners-and-saints). The Free checks card now shows that stage and carries a **resend** button,
    so this is a "has Paul pressed it" question, not a code one. **Check the card before assuming
    either way** — a stranded audit never retries itself.
  - **`FINDABLE_ALLOWED_ORIGINS` may not contain `findable.live` at all, and it is unfalsifiable
    from here** (the CLI returns secret hashes, and CORS is `*` so nothing observable depends on
    it). §12 removed the dependency rather than answering the question. Do not re-attempt to read it.
  - **Website clicks other than the report link are still untracked** — no redirect endpoint, no
    click table for them. The per-template column **says so** rather than printing 0 (§14).
  - **A `past_due` hosting subscription counts as paying, by design** (Smart Retries is still
    running). Nobody has yet decided what to do if it stays there.
  - ⚠️ **STALE CODE COMMENTS FOUND WHILE WRITING THIS AND DELIBERATELY NOT CHANGED** (flagged to
    Paul, code untouched): `src/lib/findableOffer.ts:30` still says "week-eight guarantee";
    `useDashboardMetrics.ts`'s sync note still names `founderOffer.ts` and the deleted
    `FOUNDER_OFFER_PRICE_LABEL` / `FOUNDER_OFFER_COUNT`; and `baselineContract.ts`'s
    `decideGuarantee` prose reasons from a £99 current price (§11 has the consequence). §4: a stale
    comment is a load-bearing bug — fix these next time you are in those files.
- 🔴 **A 3-RUN MEASUREMENT ONLY REPEATS 20 QUESTIONS. FOUND 2026-08-28, NOT FIXED — PAUL'S CALL
  BECAUSE THE FIX COSTS APIFY.** Solene's 47-question measurement (audit `c2be3e5d`) ran
  **47 questions in run 1 and 20 in runs 2 and 3** — the same 20 both times, all drawn from run 1.
  So **20 questions have 3 runs and 27 have ONE**, which is exactly the "single-run audits give
  unreliable winnability" problem the measurement path exists to avoid.
  - **Cause:** `advanceBaseline` (`_shared/audit-baseline.ts:300`) fires every repeat run with
    `purpose: "baseline"`, and create-ai-audit clamps that to **`BASELINE_MAX_QUESTION_COUNT = 20`**
    — not `MEASUREMENT_MAX_QUESTION_COUNT` (75). A measurement's own repeats are re-graded as
    baselines on the way out.
  - ⚠️ **The comment at `create-ai-audit:306` warns about this exact failure** ("a baseline REPEAT
    run … would silently truncate 10 questions to 5 and average two different question sets"). The
    measurement path re-introduced it because advanceBaseline hardcodes the purpose. Fixing it means
    passing `purpose: "measurement"` when `is_measurement` is true — one line, but re-running the
    missing 27 questions twice is **~54 Apify calls**, so it is a spend decision, not a code
    decision.
  - ⚠️ **Any "5 of N" figure on a measurement is therefore over an UNEVEN denominator.** Solene reads
    5 named of 174 answer-cells; 27 of its questions contribute a third as many cells as the rest.
- ✅ **RE-AUDIT — ONE PATH, ONE PRICING RULE, AND `baseline_target_runs` IS THE LOAD-BEARING WRITE.**
  `src/lib/reAudit.ts` mints a NEW `ai_audits` row from a source audit (the source is never touched)
  for both callers — the AI Audit page's Re-audit button and Baseline's "Re-run this measurement".
  Since 2026-08-28 the dialog carries a **Quick / Full measurement** toggle, seeded from the source
  so leaving it alone reproduces the old behaviour.
  - ⛔ **`purpose: 'measurement'` ALONE DOES NOT GET YOU 3 RUNS.** `advanceBaseline` returns early on
    `!(target > 1)`, and `create-ai-audit` writes `baseline_target_runs` **only in its new-audit
    INSERT branch** — never on the reuse path a re-audit takes (it has no `.update()` on `ai_audits`
    at all). So the copy row must carry **`is_measurement: true` AND `baseline_target_runs`** itself,
    or a Full-measurement press runs ONCE at the three-run price.
  - ⛔ **THE PRICE AND THE CHARGE ARE ONE FUNCTION CALL, NOT TWO THAT AGREE.** The cost line and the
    `baseline_target_runs` write both go through **`runsForReAuditMode(mode, sourceTargetRuns)`**
    (`src/lib/measurementRuns.ts`). The predecessor `runsForReAudit(isMeasurement)` was **DELETED**
    rather than kept — it priced from what the source WAS while the dialog prices from what the
    operator PICKED, and two pricing rules in one leaf is one autocomplete away from the original
    fault (the screen said "× 1 run" while the server ran `MEASUREMENT_RUNS`, pricing a 47-question
    Solene re-audit at ~47p against a real ~£1.17). `scripts/re-audit-mode.test.ts` asserts the
    property, not the numbers.
  - ⚠️ **An absent source target (null / 0 / 1) falls back to `MEASUREMENT_RUNS`, never to 1** — the
    absent-value rule on the one column that decides what is charged.
  - ⚠️ **`isMeasurementSource` survives on purpose**: what the source WAS is a different question
    from what to run, and it is the only thing that can warn about a downgrade. A downgrade is
    allowed (it can only cost less) but named — a 1-run "after" does not compare against a repeated
    "before".
  - ⚠️ **`RE_AUDIT_EST_USD_PER_QUESTION = 0.0104`**, measured off `ai_audit_runs.actor_cost_usd` for
    Solene's own 3-run 20-question baseline (§4's constants rule). It was 0.0125, ~20% high.
- ⛔ **THERE IS NO REGEX COMPETITOR EXTRACTOR ANY MORE. DELETED 2026-08-28 — DO NOT REINSTATE ONE.**
  `ai-search.ts` stores `competitors: []` at scan time and **`extract-competitors` (the LLM) is the
  field's ONLY writer**. The scraper took every run of 1–4 capitalised words out of `answer_text`
  and stored it, so its output was the field's DEFAULT state and the cleaner merely overwrote it —
  meaning any answer the cleaner did not reach kept scraper output that no consumer could tell from
  a real firm. A better word list cannot fix that: judging whether a capitalised phrase is a
  **hireable firm** is a judgement about meaning, which is exactly why the display filters (built on
  accountancy/trades/hospitality vocabulary) passed medical nouns straight through.
  - ⚠️ **`nameMatches` CANNOT BE REUSED FOR THIS, and the brief that asked for it assumed otherwise.**
    It is a deterministic string matcher answering "does this text contain **this one known** name?"
    — it cannot discover unknown firms. So competitor extraction keeps an OpenAI dependency;
    what changed is that the dependency can no longer fail *silently*.
  - ⛔ **THE NEW AMBIGUITY, CLOSED IN THE SAME COMMIT: an empty list means EITHER "AI named nobody"
    OR "the cleaner never ran".** Printing them the same way is the absent-value fault inverted.
    `countAnsweredCells()` supplies the denominator, an empty list with answers and **no completed
    receipt** warns instead of reading as "no competitors", and empty **with** a completed receipt is
    `clean` (a known answer). `process-ai-audit-queue` now stamps a FAILURE receipt when the
    extract-competitors invoke cannot be reached at all, so **every finalised run carries a receipt
    either way**.
  - ⚠️ **SUPPRESSION IS A SEPARATE FIELD FROM THE VERDICT (`suppressNames`), and the split is
    load-bearing.** The report withholds names only when we HOLD names we cannot trust. Keying it on
    `verdict === 'dirty'` would also blank the gut-punch on historic runs whose regex list happened
    to be empty — silently changing reports already sent.
  - ⚠️ **Market path consequence:** an uncleaned fold is now EMPTY rather than dirty, and
    `marketShape` returns **`unmeasured`** with no leader, so it cannot grade arithmetic over
    fragments. The `names_uncleaned` refusal still fires for historic folds, which keep their names.
  - **Deployed for it:** `create-ai-audit`, `process-ai-audit-queue`, `market-view`, `derive-audit`,
    `check-directory-listings`, `backfill-lead-towns`, `render-audit-report`, `findable-onboarding`.
- ⛔ **A BARE `complete:false` RECEIPT NO LONGER BLANKS A CLIENT'S COMPETITORS (2026-09-14).**
  `assessCompetitorCleanliness` suppressed on an incomplete stamp at ANY junk count. **The junk rule
  is unchanged and still blanks** (≥ `JUNK_NAMES_PROVING_UNCLEANED`, and ANY junk beside an
  incomplete receipt); a receipt with **zero** junk now WARNS — verdict stays `dirty`, so the amber
  banner stands, and it reads `suppressNames` for its wording instead of hardcoding "do not send".
  - 🔴 **WHY THE RECEIPT IS WEAK EVIDENCE, and this existed only in code comments:
    `extract-competitors` asks gpt-4o for one entry per answer id INCLUDING an empty list when an
    answer named nobody — so a model that OMITS the id is indistinguishable, at that layer, from one
    that failed to read it.** A clean run whose last answer named nobody is stamped incomplete.
  - **Measured 2026-09-14** over the 147 newest lead-linked audits with a completed run: 6 had their
    whole rival list withheld, **all 6 from this branch with ZERO junk** — AD Locksmithing 25/25
    items cleaned, 106 real names, withheld on "model omitted 1 of 25 ids". Five now print; the
    genuine "cannot name three competitors" rate is **1 in 147**, not 6.
  - ⚠️ **RG's report is NOT affected and must not be "fixed": his pointer audit `f64920ce` is
    suppressed by the JUNK rule (109 provable junk names) and is his FROZEN baseline.** Paul's call
    2026-09-14 — re-extracting it would rewrite the evidence the four-week comparison is judged
    against. AD was a code fix; RG would have been editing evidence.
- 🟡 **`audit_followup` — THE SECOND STEP OF THE TWO-STEP FLOW. Registered both sides, AWAITING
  META (2026-09-15).** Sent to a lead who REPLIED to `initial_contact` but has had no report yet.
  {{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}}{{4}}{{5}} rivals, {{6}} report link. No
  header, no buttons. Same three-names-or-fall-back-to-`video_template` rule as competitor_hook,
  inherited from `templateNeedsRivals` rather than written again.
  - ⛔ **THE TRADE IS PLURAL BECAUSE THE SINGULAR MADE IT UNUSABLE FOR THE TWO BEST TRADES.** The
    first registration said "for a {{1}}", which puts it under normaliseTrade's article check:
    **179 of 1,066 lead-linked audits held (16.8%), almost all ACCOUNTANTS and ELECTRICIANS.**
    Deleting one word — "I asked chatgpt for {{1}} in {{2}} this morning" — and moving to
    `pluraliseTrade` took the block to **1 (0.1%)**, the survivor being "shoe repairs & watch
    battery replacement", which is genuinely not a trade name. Nothing was loosened but the
    article: pluraliseTrade still refuses uncountables and multi-clause values.
    ⚠️ It also fixed an incoherence — "asked chatgpt for A plumber… it came back with X, Y and Z".
  - ⛔ **IT IS A CONTINUATION, AND "COLD" DOES NOT MEAN "HAS NOT SEEN A REPORT".** It means MAY NOT
    REACH AN EXISTING CONVERSATION. Listed cold it was refused for every lead it exists for — the
    seatbelt's query is `.eq(phone).neq(status,'failed')` with **no direction filter**, so the
    outbound opener AND the inbound reply both match. The audit_reply_warm trap, one template later.
  - 🔴 **AND THE QUEUE CANNOT SEND IT AT ALL, WHATEVER THE LIST SAYS.** `process-whatsapp-queue`'s
    already-sent guard (`whatsapp_ever_delivered`, or a lead-linked outbound `sent` row, or any
    non-test `whatsapp_sends` row) is **template-blind** — it never reads the name. So the queue is
    structurally incapable of a SECOND message to a lead under any template, which is the
    never-double-send chokepoint working as designed. **The two-step flow runs from the INBOX**
    (`send-whatsapp-message`), exactly as audit_reply_warm does. Paul's call 2026-09-15: he does
    not want that chokepoint weakened.
  - ⚠️ **THE STATED COST OF THE CONTINUATION CLASSIFICATION, ACCEPTED:** a continuation is exempt
    from the phone-history seatbelt, so **if audit_followup were ever QUEUED to a number with no
    history it would go out as a first touch.** Nothing catches that — the already-sent guard needs
    prior contact to trip and a stranger has none. **Same exposure `re_engage_49` already carries.**
    The containment is operational, not structural: it is sent from the Inbox, never queued. If it
    is ever put in a campaign, close this first.
- 🟡 **`competitor_hook` — the rival-naming outreach hook, REGISTERED BOTH SIDES, AWAITING META
  (2026-09-14).** {{1}} name, {{2}} trade as a LOWERCASE PLURAL (`pluraliseTrade`, no article check —
  it unblocks the 113 audits, 12%, that video_template's "for a" holds), {{3}}{{4}}{{5}} rivals,
  {{6}} report link, same video header. Fewer than three usable names → **falls back to
  `video_template` on the drip and the manual send** (`src/lib/rivalHook.ts`, one constant) and
  **HOLDS on the first-reply lane**, deliberately: the fallback is a cold opener and the
  phone-history seatbelt does not run there. Never pads, never sends a blank.
- ✅ **THE COMPETITOR-NAME CLEANER SILENTLY CLEANED PART OF A RUN AND RETURNED `ok:true` — FIXED
  2026-08-28.** `extract-competitors` packed every answer into ONE OpenAI call capped at
  `MAX_ITEMS = 60` (question × engine) and `break`ed out. Solene's 47-question run is **137 items**,
  so **77 answers were never shown to the model**, the 60 that were went in a single ~302,000-char
  prompt with no output bound (long enough for the tool-call arguments to truncate and fail
  `JSON.parse`), and the function reported success. The run shipped **381 raw regex strings as
  competitor firms** — "Testosterone", "Estrogen", "Sleep", plus 48 scraped tracking ids
  ("AAAAABqkCA", "Xdaj6AH7genL7KP9o") — and the "who AI named instead" headline counted them.
  - ⛔ **IT WAS NOT THE OPENAI CREDIT OUTAGE, and that was the first hypothesis.** Measured: **43 of
    the last 45 completed runs cleaned fine over 25–27 Aug**, including Solene's own 20-question
    run 2. Every clean run in the book is ≤20 questions (≤60 items) — **47 questions is the first
    thing that ever tripped the cap**, so the bug was latent from the day the cleaner was written.
    Before blaming credit again, grade the last N runs' names; the tell is a run with an engine
    block holding **more than `MAX_PER_ENGINE` (8)** names, which proves it was never rewritten.
  - **The fix:** items are BATCHED (`BATCH_ITEMS = 24`, sequential — concurrency on a big run is the
    fastest route to a 429), `max_tokens` is stated, one failing batch no longer loses the others,
    `MAX_TOTAL_ITEMS` is a real ceiling that REPORTS when it bites, and a model that omits ids is
    recorded rather than assumed complete. Cost scales with answer volume, not batch count:
    **137 items ≈ 20p**, all three Solene runs **34p** (measured, gpt-4o).
  - ⛔ **THE FAIL-SAFE IS DERIVED FROM THE NAMES, NOT READ FROM THE RECEIPT.**
    `src/lib/competitorCleaning.ts` grades a run clean/dirty from the stored names themselves;
    the new stamp (`ai_audit_runs.results.competitor_cleaning`, jsonb — **no migration**) is only
    corroboration, because **every audit before 2026-08-28 has no stamp and absence must not read
    as clean**. A stamp claiming `complete` over provable junk is still graded dirty. A **dirty run
    withholds every rival name from the client report** (gutPunch included — it LEADS the report)
    and the AI Audit page shows "Competitor names not cleaned — do not send to client" with the
    offending strings.
  - ⛔ **THE STRUCTURAL TESTS CANNOT CATCH CONTENT-WORD JUNK, AND MUST NOT PRETEND TO.**
    `isRealCompetitor`'s word sets are accountancy/trades/hospitality, so **medical nouns sail
    through** — no test can know "Testosterone" is not a clinic. That is why the CLEANER is the fix
    and the withholding is the seatbelt; do **not** answer this by adding a medical word list (the
    "Safe printed as RG Locksmiths' third competitor" lesson, one trade later).
  - ⛔ **TWO THRESHOLDS, BOTH MEASURED, BOTH FOUND BY A FALSE POSITIVE ON REAL DATA:**
    - the code-like-name test's **uppercase ratio is 0.50 because 0.35 deleted `GenderGP`**, a real
      clinic (3 upper of 8 letters, 2 case flips — identical arithmetic to `AAAAABqkCA` on every
      clause except the ratio, where the id sits at 0.80). Found by sweeping the predicate over all
      **1,090 distinct names Solene really stored**: final result **123 flagged, ZERO multi-word and
      ZERO firm-shaped names**. Re-run the sweep, not just the unit test.
    - **`JUNK_NAMES_PROVING_UNCLEANED = 3`, because 1 blanked a correctly cleaned run.** gpt-4o
      properly returned **"Hers"** (forhers.com, a real brand) and "hers" is a pronoun in
      `UNCLEANED_MARKER_WORDS`. Measured gap: cleaned runs **0, 0, 1, 2** markers; uncleaned
      **123, 73+**. The threshold governs ONLY whether to withhold the whole run's rivals — every
      individual junk name is still filtered from display at any count.
  - ⚠️ **`named` IS UNAFFECTED BY ANY OF THIS** — it comes from `nameMatches(answer_text, …)` at scan
    time and never reads `competitors` (Solene: 5 named, before and after cleaning). **Winnability
    DOES read them** (`classifyWinnability` counts distinct real firms), so junk inflates `U` and
    grades questions `contested`/`locked` that are really `open`/`no_local_race`. After cleaning,
    Solene's 87 question-cells read **43 no-local-race, 31 open, 8 contested, 5 named**, mean 1.69
    real firms per question.
  - **Redeployed for it:** `extract-competitors`, `render-audit-report`, `process-ai-audit-queue`,
    `findable-onboarding`, `market-view`, `page-generator`, `instantly-push`. ⚠️ **`send-whatsapp-message`
    and `process-whatsapp-queue` also import `auditReport.ts` (via `_shared/audit-reply.ts`) and were
    left on the §6g hold** — their WhatsApp `{{2}}` competitor lists keep the old filtering until
    that hold lifts. Redeploy them with it.
- 🔴 **REPORT-ACCURACY BUG, LOGGED 2026-08-28, NOT FIXED: `classifySource` (`src/lib/sourceType.ts`)
  grades ANY `.org`/`.org.uk` domain as 'authority', so real businesses on .org read as official
  bodies** — seen live: `cbsaccountants.org` and `spriggsandco.org` (actual accountancy firms)
  graded authority in the book-wide scan. Affects the "which sources each engine reads" output in
  client reports and the page-plan queue (the most valued client output — David), the winnability
  source-mix, and the authority-locked hold. Sits alongside the @graph crawler bug as
  report-accuracy work. A fix needs care: many
  genuine authorities ARE .org (nice.org.uk, thebms.org.uk, cochrane.org) — do not patch blind.
  ✅ **THE "@GRAPH CRAWLER BUG" IS RESOLVED (2026-08-28) AND WAS NEVER A PARSER BUG.** Recon proved
  the Apify actor (smart-digital~complete-seo-audit-tool) steps into @graph fine (Solene's single
  @graph script → jsonLd:true; all 5 jsonLd:false sites checked genuinely have zero ld+json). The
  real fault: `collectIssues` (seo-scan-core.ts) hoisted the actor's PER-PAGE issues into
  site-sounding headlines — Solene's report said "No structured data found" while its own baseline
  said hasStructuredData:true, 2/3 pages. Fixed presentation-only: with `IssueScope`, the schema
  issue reconciles against the site-level truth ("Structured data missing on N of M crawled pages
  (present on the others)") and every partial issue carries "— on N of M crawled pages"; full-
  coverage and 1-page crawls keep plain titles; no-scope callers unchanged. Deployed run-seo-scan
  v23 + process-ai-audit-queue v98 + check-directory-listings v7. ⚠️ Findings are STORED per scan —
  the fix reaches NEW scans only; old reports keep their stored wording until re-scanned.
- 🔴 **THE WHATSAPP DAILY CAP IS ALMOST OUT OF ROAD, AND REPLIES SPEND IT WITHOUT BEING LIMITED BY
  IT.** `DAILY_CAP` in `process-whatsapp-queue` — **200**, and `SEND_GAP_FLOOR_MIN` is **3** (both read from the live file 2026-09-02; this line said 120/10 for weeks). Raised 40 → 60 → 100 → 120 → 200, each
  raise on a Green quality rating). Two facts neither file reveals on its own:
  - ⛔ **RAISING IT PAST ~140 DOES NOTHING.** Simulated 5,000 days on the measured cron grid (ticks
    every 10 min, one send per tick — 441 of 619 real sends land on a +0 minute-of-10 mark):
    **100 → 77.4/day, 120 → 84.4, 140 → 87.0, 200 → 87.0.** Above cap 60 the target gap
    (`minutesUntilWindowEnd()/(DAILY_CAP - sentToday)`, 870/119 ≈ 7.3 min at 120) is already **below
    `SEND_GAP_FLOOR_MIN`**, so the FLOOR sets the rate and the cap only decides how far into the
    ⚠️ **THE ~87/day CEILING BELOW WAS MODELLED AT A 10-MINUTE FLOOR AND NO LONGER HOLDS: the
    floor is 3, so the queue drains ~4x faster than every figure in this section implies.** That is
    why 16 hook sends went out inside an hour on 2026-09-02 — re-run the simulation before
    quoting any rate here.
    evening the floor keeps being hit. **~87/day is the ceiling.** Next levers in order:
    `SEND_GAP_FLOOR_MIN`, then the cron schedule (DB-only, above). The model reproduces both figures
    previously recorded in the file (60 → 54.4, 100 → 77.4), which is what makes it trustworthy.
  - ⛔ **`send-whatsapp-message` IS EXEMPT FROM THE CAP BUT STILL COUNTS AGAINST IT.** It deliberately
    does not enforce `DAILY_CAP` (in-window replies must always go), yet it writes `whatsapp_sends`
    rows and `sentToday` counts **every** row. So Inbox replies and auto `audit_reply` sends **spend
    the outreach queue's budget while being immune to it** — a busy reply day throttles the *queue*.
    Busiest real day, **2026-08-11: 85 of 100** = 48 `initial_contact` (queue) + **37 unpaced
    reply-path sends**. Queue-at-pace plus that reply volume is 77 + 37 = **114**, which at 100 would
    have stopped the queue mid-afternoon. **At 120 that day is still 114 of 120.**
  - ⚠️ **The queue's 07:00–21:30 London window binds the QUEUE ONLY.** The reply path answers Meta's
    24-hour window instead, so `whatsapp_sends` legitimately contains out-of-hours rows (24 of 619,
    all `audit_reply`/free-text). **Do not read those as the queue sending overnight** — the queue's
    own simulated sends are 0 outside the window at every cap.
  - ⚠️ **Never write the cap as a number in prose.** Two comments have already gone stale this way:
    the queue header once said 40 while the constant was 100 (Paul believed his cap was 40), and
    `send-whatsapp-message` said "the 10/day outreach cap" until 2026-08-12. Name the constant.
  - ⛔ **YOU CANNOT READ THE LIVE CAP FROM HERE, AND THAT IS NOT A DEPLOY FAILURE.**
    `mode:"status"` returns the whole payload (`cap`, `sentToday`, `windowOpen`, …) and sends
    nothing — but every credential available to a script is refused (see the service-role-bearer
    finding in §8 above). It needs CRON_SECRET or Paul's admin JWT. **The queue panel reads `cap`
    straight from that payload**, so the one-glance check is Paul opening it: "x / 120". Do not
    re-derive this, and do not read the 401 as the deploy having failed.
- **TWO LIVE CRON JOBS EXIST ONLY IN THE DATABASE, NOT IN MIGRATIONS.** Confirmed from `cron.job`
  2026-08-04: **`notify-onboarding-submit-run`** (every minute — the "submitted but not paid" email
  to Paul WORKS) has no migration file, and the `bulk_jobs` `job_type` constraint has the same gap.
  A rebuild from migrations would silently lose both. Do not "discover" the notifier as unscheduled
  (a repo-only recon reads it that way), and don't fix the gap without Paul asking.
- ✅ **GOOGLE PLACE DETAILS COST — SETTLED 2026-07-30 against Google's docs.** A Place Details request is
  billed **ONCE, at the highest SKU tier any requested field touches** ("if you select fields in both the
  Essentials and the Pro SKUs, you are billed based on the Pro SKU").
  | Field | Tier |
  |---|---|
  | `formattedAddress`, `addressComponents`, `location` | **Essentials** |
  | `internationalPhoneNumber`, `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount` | **Enterprise** |

  So **rating and review count are FREE on any call that already asks for a phone number** — same tier.
  And adding one Enterprise field to an Essentials-only call re-prices the whole thing, which is why
  `place-town.ts`'s audit-time call deliberately stays address-only.
  ⚠️ An earlier comment in `sources.ts` said rating moves a call to "the **Pro** SKU at ~4x" — **wrong
  tier**, now corrected in the file. The `$0.017` in `google-place-details`' `logUsage` is an inherited
  constant, **never verified against a bill.** Don't quote it as fact.
- ✅ **LEAD-CREATION ENRICHMENT — FIXED + DEPLOYED 2026-07-30** (`80efe108`). The phone lookup that
  already runs on add now also returns **address, rating, review count and the derived town**, at no
  extra cost, and `useOutreach.ts` writes all of them. Consequences worth knowing:
  - `resolveDerivedTown` at audit time now normally hits a fresh 30-day stamp and calls Google **zero**
    times. It is the backstop, not the main path.
  - **`phone_cache.details_version`** gates pre-v2 rows as a MISS. Without it every already-cached lead
    would have stayed unenriched for 30 days.
  - **⚠️ `postal_town` can be COARSER than the name a customer would use.** "Dogs of Southsea" derives
    **Portsmouth**, because Southsea's `postal_town` *is* Portsmouth (it's `locality` that says
    Southsea). The precedence `postal_town > locality > admin_2` is unchanged and still correct for the
    Huntingdon-from-a-Wisbech-search bug it was built for, but for a district of a larger city it will
    ask AI about the city. **Not yet decided whether that's right.** Verified by unit test, not guessed.
  - Still outstanding: **`search_keyword`/`search_location` can be written as null.** `addLead` writes
    them, and `Index.tsx` passes them, but they live in page state (`Index.tsx:41-42`) set only by
    pressing Search — while the RESULTS are restored from `sessionStorage`
    (`LeadSearchContext.tsx:150-168`, filters persisted only on the demo path). So search → leave the
    page or reload → come back → Add writes nulls, with results still on screen. **Paul is testing the
    exact trigger before this is fixed.**
- **Audits use the SEARCHED town, not the real town.** Lead search has a radius, so a Huntingdon locksmith came
  back from a Wisbech search and was told AI doesn't know he exists — he ranks first in his own town. He caught
  it. Spec is ready; **not built**.
  - `outreach_leads.place_id` is populated on **758/758**; `address` was on **0** — fixed for NEW leads
    2026-07-30 (above). **Existing 758 are not backfilled**; Paul said backfill isn't needed.
  - `getPlaceDetails()` is restorable from **`a8fd7003^:supabase/functions/search-leads/index.ts`** — verified
    2026-07-30: `a8fd7003` is the commit that deleted it. Not in `_shared/`; don't go looking there.
  - Town extraction is reusable as-is at `generate-barber-site:307-310` (UK `postal_town` → `locality` →
    `administrative_area_level_2`).
  - **THREE callers BUILD `location_text` themselves and pass it in**, so `create-ai-audit` must treat an
    incoming value as **overridable**, not merely fall back when absent. Verified by grep 2026-07-30:
    | Caller | Line | Expression |
    |---|---|---|
    | `bulk-jobs` | 229 | `lead.search_location \|\| lead.address` |
    | `_shared/whatsapp-inbound` | 226 | `lead.search_location ?? lead.address` |
    | `_shared/whatsapp-inbound` | 333 → 376 | `locText`, same expression, **the live auto-audit chain** |
    ⚠️ **Earlier briefs listed only the first two.** The third is a separate call site in the same file and is
    on the `AUTO_AUDIT_REPLY_ENABLED` path that is ON in production — miss it and the highest-volume path keeps
    using the searched town. A textbook case of §4's "check the next layer".
    Also a setter: `_shared/audit-baseline.ts:412` — `confirmed_location || search_location`, **the paid
    baseline, i.e. the guarantee path.** And `src/pages/AiAudit.tsx:753` for the wizard.
    Intended precedence everywhere: `confirmed_location || derived_town || search_location`.
- 🔴 **HOW MANY REPORTS WENT OUT WITH THE WRONG TOWN — TWO NUMBERS, AND THEY MEASURE DIFFERENT
  THINGS.** Leaving both without this note reads as a contradiction.
  - **37** was the earlier estimate: every report sent before the `derived_town` fix, regardless of
    whether the distance was ever checked.
  - **28** is *proven*, measured 2026-08-09 once `outreach_leads.lat/lng` existed: of the 31 audits
    now known to be >10 km from their town, 28 had a report reach the prospect on some channel
    (26 WhatsApp carrying a report link or `audit_reply`, 6 pushed to Instantly, 10 with status
    `report_sent`) and **20 were opened**. RG Locksmiths cambs is in that list at 42 km — the
    prospect who complained.
  - ⚠️ **28 IS A FLOOR, NOT A TOTAL.** It counts only the 44 audits whose business coordinates are
    known, out of **195** audited leads. The real figure is very likely above 37. It rises as
    coordinates are backfilled — do not quote 28 as "the number affected".
- ✅ **AUDIT COST — SETTLED 2026-07-30 from measured spend.** Paul ran the query against
  `ai_audit_runs.actor_cost_usd`: **81 runs, mean $0.04207 per run, $3.41 total, 26–30 July.** Those runs are
  the 3–5 question outreach size that dominates the table, which puts a question at roughly **$0.0125**.
  | Thing | Real cost |
  |---|---|
  | One run (measured mean) | **$0.042** ≈ 3.4p |
  | 3-question re-audit | ≈ **3p** |
  | 10-question × 3-run baseline | ≈ **30p** |

  **Both previous figures were wrong, in opposite directions.** `$0.0025`/question was ~5× too LOW; the
  `$0.0498`/question and £1.50 baseline quoted in earlier briefs were ~4× too HIGH. Neither had a cited source.
  Never quote a cost from a constant again — `actor_cost_usd` is the only measured number.
  ✅ Server constant corrected to **$0.0125** 2026-07-30 (`_shared/enrichment/sources.ts`) and all 7 importers
  redeployed. It is **per QUESTION**, not per run — `startRow()` charges it once per queue row and
  `create-ai-audit` multiplies by question count. Setting it to the per-run $0.042 would over-count ~3.6×.
- 🟢 **THE SPEND CAP WAS NEVER ACTUALLY UNDER-COUNTING — don't "fix" it again.** This was assumed twice (once
  in this file) and it is wrong. `recordCostCorrection` in `_shared/enrichment/runner.ts:139` writes a SECOND
  `enrichment_usage` row holding `delta = actual − estimated` once an async actor finishes, so
  **`sum(cost_usd)` over the window already equals real billed spend whatever the estimate was.** Deltas may be
  negative. Measured 2026-07-30: in one 24h window, `ai_search` logged $0.22 across 88 questions and
  `ai_search_correction` added $0.743 — $0.963 total, i.e. $0.0109/question, the real figure.
  So `estCostUsd` only governs the *reservation* in the pre-check and how many rows a tick starts; it never
  distorted the accounting. Correcting it is still right (a realistic reservation, a realistic UI estimate, a
  smaller correction delta) but it was not the emergency it looked like.
  ⚠️ Consequence for any cost query you write: **you must include the `*_correction` rows.** Filtering
  `enrichment_type = 'ai_search'` alone reads ~5× too low, and filtering lifetime rows reads too HIGH for the
  older ones that were estimated at $0.05. Sum everything, or use `ai_audit_runs.actor_cost_usd`.
- 🔴 **APIFY IS A SINGLE POINT OF FAILURE FOR THE WHOLE PRODUCT, AND IT HAS A MONTHLY CAP.** Every
  AI-visibility question check *and* every SEO scan runs through it, so at 100% **both stop at the
  same moment**. Incident 2026-07-30: the account hit **$90.02 of a $90.00 cap** and audits failed
  with `HTTP 402` (then `403`). Cycle runs **4 July → 3 August**; Paul raised the cap to **$100** the
  same day (90.0% used, ~$10 headroom).
  - **It was not caused by that day's audits.** The account was already at **$89.78 (99.8%) by
    12:38**; the day's own audit spend was **$0.67**. It crossed 90% on **28 July**.
  - `apify-usage.ts` had logged `CRITICAL` **170 times over two days** — into edge-function logs
    nobody reads. Now surfaced on `/ai-audit` via the **`apify-usage-status`** function +
    `useApifyUsage` + `ApifyUsageLine`. Amber ≥75%, red ≥90%, thresholds shared with that module.
  - ⚠️ **Recompute the percentage from used/cap; never trust `usage_pct`.** The cap can be RAISED
    mid-cycle, and the stored figure is only true for the cap in force when the row was written —
    after the rise it still read 100% while the truth was 90.0%.
  - Distinguishing OUR cap from THEIRS: the queue writes the exact tokens `capped` and `daily_cap`.
    Anything else — including a raw `Apify start … HTTP nnn` — is the vendor, not us.
  - ⚠️ **Still outstanding:** the queue spends **`MAX_ATTEMPTS = 3`** attempts per question against a
    402/403 hard stop. Failing fast on those is deliberately **not built** — Paul deferred it as a
    live-queue behaviour change while he was testing.
- **A MARKET AUDIT SITTING AT "1 completed run" IS PROBABLY STILL WORKING, NOT DEAD.** Investigated
  2026-08-04: Ipswich showed "2 audits, 1 completed run" and looked like a silent failure. Audit
  `c39d755f` was **3.9 minutes old** with one question in flight on Apify against
  `MAX_RUN_AGE_MS = 12 min` — an Apify question legitimately runs up to ~9 minutes — and it finished
  unaided, 8/8, $0.083. **Before diagnosing a market audit as failed, read
  `ai_audit_queue.result._apify.startedAtTick` and compare it to 12 minutes.**
  - The real bug was that **nothing on the panel said which state it was in**. `market-view` now
    returns `marketProgress` per unfinished market audit (questions done/total, run age, and the
    **raw** error off the queue row), and `MarketPanel` grades it running / stalled
    (`MARKET_AUDIT_STALE_MS`, 20 min) / failed, polling every 45s while anything is unfinished.
  - ⚠️ **The evidence gate counts COMPLETED audits, never audits.** It used to count audits, so 2
    market audits with 1 completed run cleared `MARKET_AUDIT_MIN_AUDITS = 2` and the view called a
    shape on ONE audit's data — the degenerate-`auditShare` case the bar exists to prevent. The
    `MarketShapeInput` fields are named `marketAuditsComplete` / `businessAuditsComplete` so the
    audit counts cannot be passed in again by accident.
- ⛔ **THE AREA/MARKET AUDIT ALREADY SKIPS SEO AND ALREADY RUNS ITS QUESTIONS IN PARALLEL. MEASURED
  2026-08-13 — do not "optimise" either again.** Paul asked for the SEO scan to be stripped out of
  the targeting audit to make it faster. There was nothing to strip: **44 of 44 market runs carry
  `results.seo = { skipped: "seo_scan_not_requested" }`, and 0 carry a real grade.** The skip is
  STRUCTURAL, not a flag — `create-ai-audit:815` seeds the marker on `skipSeo || marketOnly`, and
  `MeasureMarket` always sends `market_only: true`. Removing SEO from this flow saves **zero
  seconds and zero pence**.
  - ⚠️ **AND THE AI CALLS ARE NOT SEQUENTIAL.** `START_BATCH = 12` rows claimed per 30-second tick,
    `AUDIT_IN_FLIGHT_CEILING = 24`. Proof from the data, not the code: in **19 of 24** clean measure
    runs all 16 questions finished **within ~2 seconds of each other**. Parallelising saves nothing.
  - ⛔ **THE COROLLARY THAT MATTERS FOR EVERY FUTURE "make it faster" ASK: cutting the question
    count saves MONEY, NOT TIME.** 8 questions and 16 questions take the same wall clock, because
    they run concurrently. The wall clock is **one Apify scrape**, ~2.5–6 min, and that is the floor.
  - **The measured shape** (25 measure runs, Soham incident excluded): wall clock min 3.3, **median
    6.5**, worst 17.8 min. Per-question median has FALLEN to ~2.8 min since 10 Aug — but a **tail
    appeared at the same time**: 12/13 Aug ran **17.7 and 13.9 min**, both with a retried row, while
    11 of 16 questions were done inside 2.4 min.
  - ⚠️ **The tail is NOT queue congestion** — Royal Sutton Coldfield took 13.9 min with **zero**
    other queue rows moving in the window. It is one Apify run hanging, and `MAX_RUN_AGE_MS = 12 min`
    means a hung run burns 12 minutes before the retry even starts (17.63 min = 12 + a normal 5.6).
    ⛔ Lowering that constant is the trap already recorded above: at 5 min it culled healthy-but-slow
    runs into a retry storm. It also governs the paid baseline, not just targeting.
  - ✅ **BUILT 2026-08-13: A TARGETING AUDIT NOW FINALISES ON 7 OF ITS 8 QUESTIONS.**
    `_shared/targeting-straggler.ts` (`mayFinishWithoutStragglers`) + the drop branch in
    `finaliseSettledRuns`. Only `process-ai-audit-queue` imports it, so that is the whole deploy
    list. **No SQL** — `is_market` and `baseline_target_runs` already existed.
    - ⛔ **THE UNIT IS THE AUDIT (8 questions), NOT THE 16-QUESTION PAIR.** A measure run is two
      audits and each folds independently, so "15 of 16" is really "7 of 8, twice". Quoting the
      pair figure would overstate what the code does.
    - ⛔ **IT IS NOT A TIME CAP AND MUST NOT BECOME ONE.** Nothing reads how long a question has
      run; the test is only whether it is the LAST ONE LEFT in its own batch. That is why the
      uniformly-slow runs are untouched — **Leyland 12.13→12.13 and Ipswich 17.77→17.77, saving
      nothing, correctly**. `MAX_RUN_AGE_MS` above is the record of what happens when you do cap it.
    - **A 60s grace (`TARGETING_STRAGGLER_GRACE_MS`) is measured from the SETTLED rows**, so a
      question thirty seconds from returning is not thrown away for thirty seconds of saving, and a
      batch that is slow all over can never qualify. It costs ~1 min on the runs that benefit.
    - **Expected**: Royal Sutton Coldfield **13.9 → ~6.9 min**, Accountants/Wakefield
      **17.7 → ~12.2 min**. Median barely moves (6.45 → ~6.0) because most runs have no straggler —
      **this fixes the bad days, not the typical one.**
    - ⚠️ **The dropped row is stored `status: 'failed'` with error `straggler_dropped`**, because
      that is the only settled status `MeasureMarket`'s poll and `QUESTION_STATE_SCORE` already
      understand — a bespoke status would leave the progress bar running forever.
      `explainAuditFailure` renders it as a deliberate choice, not a failure, and
      `summary.dropped_questions` records the count separately from real failures.
    - ⚠️ **STATED LIMIT: a row still `pending` counts as the straggler too.** If the queue is
      congested enough to defer a row for a full minute while its seven siblings finish, it is
      dropped without ever running. Cheapest possible drop (nothing spent) and it still saves the
      time, but it is a breadth loss caused by congestion rather than by a hung question.
    - ⚠️ **THE BASELINE IS EXCLUDED TWICE** (`is_market !== true` → refuse, `baseline_target_runs > 1`
      → refuse) and `scripts/targeting-straggler.test.ts` drives **720 baseline shapes, including
      `is_market: true`, and asserts none reaches the drop.** Proven separate in live data: 333
      audits, 44 market, 5 baseline, **zero overlap either way**, no market audit with a `lead_id`.
- 🔴 **IT HAPPENED AGAIN ON 2026-09-02, THROUGH THE ONE GAP THE AUG-18 FIX LEFT: THE SEATBELT WAS
  KEYED TO A TEMPLATE NAME.** 16 `audit_result_hook` sends, **12 to numbers already in
  conversation**, 9 of those had replied, **4 were marked `not_interested`**. Nothing was deleted
  and no guard was bypassed — the audit-first flow simply started queueing a DIFFERENT template,
  and `if (templateName === "initial_contact")` stopped applying to the traffic that had replaced
  the opener. **A guard written as a name expires silently the day the product moves.**
  - ⛔ **THE PREDICATE IS NOW `isColdOutreachTemplate` (`src/lib/coldOutreach.ts`), READ BY ALL
    THREE PLACES THAT DECIDE** — the drip's guard, the enqueue filter and send-whatsapp-message.
    **UNKNOWN AND BLANK ARE COLD** (the absent-value law pointed the safe way): a new template is
    covered the moment it is registered, and a new FOLLOW-UP must be named in
    `CONTINUATION_TEMPLATES` before it can reach an existing conversation. It fails safe and loud.
  - ⚠️ **CONTINUATIONS ARE EXEMPT AND MUST STAY SO.** `re_engage` is the case that looks wrong and
    is right — it exists to restart a conversation that went quiet, so guarding it would block its
    only audience. ⛔ **Do NOT merge this with `TemplateGroup`** in `whatsappTemplates.ts`: that
    field says of itself "for optional visual labelling only", and it calls re_engage an 'opener'.
  - 🔴 **11 OF THE 12 ARRIVED ON A SECOND LEAD ROW FOR THE SAME PHONE, so every per-lead guard
    correctly saw a fresh lead.** Measured that day: **101 numbers carry 234 unarchived rows.** Two
    classes — same `place_id`/name (pre-dating the Aug-18 add-path fix, catchable today) and
    **different place_id, different name, same phone** (two genuine Google listings for one
    operator: 'Luna Locksmiths' vs 'Luna Locksmiths key cutting and engraving'). **No name or
    place_id dedupe can EVER catch the second class**, and a pool add carries no phone at add time,
    so the phone rung cannot either. That class is the entire reason the per-phone guard exists.
    `SQL_FOR_PAUL_duplicate_leads.sql` archives the 91 never-messaged duplicates; the 42 with their
    own message history are deliberately left for per-row judgement.
  - ⛔ **THE 12th WAS A MANUAL SEND, AND `pitchEverSent` CANNOT CATCH IT — IT IS PER-TEMPLATE.**
    SJA Locksmiths had `whatsapp_ever_delivered = true`, so the DRIP's `already_sent` guard would
    have refused it; send-whatsapp-message never runs that guard, and per-template means
    `initial_contact != audit_result_hook`. It now runs the per-phone check **above every branch**,
    because writing it inside them is how the two functions drifted apart in the first place.
  - 🔴 **AND MARKING SOMEONE `not_interested` DID NOTHING AT ALL. The app has never written a
    `contact_suppressions` row** — all 28 on file came from `whatsapp-inbound` auto-detecting a
    decline in a reply, none from an operator. It only ever READ that table, and blindly: RLS with
    no policies returns **200 + `[]`**, so the enqueue filter's suppression check has never
    excluded anyone since the day it was written (§8 records the read as a "UX filter"; it was a
    no-op). Both now go through admin-gated `process-whatsapp-queue` modes — **`contact_check`**
    (which **fails closed**: no check, nothing queued) and **`suppress_lead`** (reason restricted
    to `not_interested`/`closed`, because a status is a workflow position and a suppression is a
    promise). The suppression row carries phone AND email AND lead_id — a lead-id-only row would
    not stop the duplicate row being messaged.
  - 🔴 **AND THE FIX ITSELF TOOK OUT ALL OUTREACH THE NEXT DAY — THEN NEARLY SHIPPED A WORSE
    VERSION OF THE BUG IT GUARDS (2026-09-03).** `contact_check` refused any batch over 500 phones
    with 400 `too_many_phones`, and the SPA correctly fails closed on a non-ok answer — so queueing
    909 leads gave "Could not check contact history. Nothing was queued." **The double-contact guard
    was blocking every queue instead of the duplicates.** The cap was guarding against nothing:
    measured, 909 phones in a `.in()` is an 11,924-character URL and PostgREST serves it fine.
    - ⛔ **BUT REMOVING THE CAP ALONE WOULD HAVE BEEN WORSE THAN THE OUTAGE.** The same run showed
      `.in()` over 909 phones returning **EXACTLY 1000 rows** — `db-max-rows` truncation (§6). One
      phone can carry forty messages, so the row budget is exhausted long before every phone is
      represented, **and the phones that fall off the end read as NEVER CONTACTED.** A
      double-messaging guard that silently answers "clean" for a contacted number is precisely the
      bug it exists to prevent — **and it would have looked like it was working.**
    - **So it no longer filters by phone at all:** it reads the DISTINCT set of contacted numbers
      once, **paginated to exhaustion and ordered by id** (an unstable order lets pages skip rows —
      why `fetchAllRows` exists), and intersects in memory. Measured: 2,916 non-failed messages =
      **1,047 distinct phones in 3 reads, 1.27s** including suppressions, and **the cost does not
      grow with the batch** — a 909-lead queue and a 9-lead queue now do identical work. An
      exhausted page budget still **FAILS CLOSED** past `MAX_PAGES`: a partial set is
      indistinguishable from a clean one. Only the intersection travels back, not all 1,047 phones
      the caller never asked about, so the SPA needed no change.
  - ⚠️ **The lasting rule, and it generalises past WhatsApp: a guard must test the PROPERTY that
    makes something dangerous, never the identifier of today's instance of it.** Ask, as §8 already
    says elsewhere, not only "is the guard correct?" but "can the case it guards still reach it?" —
    and re-ask it whenever the flow that feeds the guard changes.
- 🔴 **THE DUPLICATE-OPENERS INCIDENT (15–17 Aug, fixed 2026-08-18) — 25 duplicate
  `initial_contact` sends, 11 to phones that had already REPLIED. Read this before touching
  addLead's dedupe or the queue's guards.**
  - **Root cause, proven live: the add path, never the send path.** Zero same-lead resends across
    the whole window — every send guard held. `addLead`'s duplicate check was CLIENT-MEMORY ONLY
    (name / maps-URL against the hook instance's arrays), and the Coverage add-all pressed it while
    the instance's async lead fetch was still loading: an EMPTY list read as "no duplicates exist"
    (absent-value instance thirteen). The proof: the same Birkenhead wave pressed at 04:33 and
    06:48 re-added all fourteen businesses the first press had inserted, same names, same
    place_ids. 20 of the 25 dup rows shared the original's place_id; 5 shared only the PHONE
    (same operator, differently-named listings) — **no name-based check can catch those**.
  - **Layer 1 (`useOutreach.addLead`): the DATABASE is the dedupe**, in-memory scan demoted to a
    fast pre-filter. Three keyed reads, first hit wins: place_id → exact phone → exact name;
    archived rows count. ⛔ **FAILS CLOSED** — a check that errors refuses the add; the open
    direction is this incident. ⚠️ Pool adds carry NO phone (Places Text Search has no phone
    field), so add-time phone matching only covers CSV/search adds — which is why layer 2 exists.
  - **Layer 2 (`process-whatsapp-queue`): the phone-history seatbelt.** `initial_contact` is
    refused for any normalized number with ANY non-failed `whatsapp_messages` row, whatever lead
    row it arrives on. Same drop-out-of-the-queue shape as the other guards (the drip never
    stalls), delivery status `phone_already_contacted`, counted in the status payload
    (`phoneHistorySkippedCount`) — never silent. `.neq(status,'failed')` mirrors pitchEverSent so
    a retry of THIS lead's own failed opener passes. **Verified 2026-08-18 by running the deployed
    predicate (real `toWhatsAppNumber` + the exact query) read-only against live data**: NWL
    CONSTRUCTION and A-Z Chester (known duplicates) → skip; a clean queued number → pass.
  - **Cleanup:** the 25 sent-duplicate rows + their 10 unsent queued twins were archived by SQL
    (guarded `amount_paid is null`), reasons appended to notes. Three duplicates had progressed
    (NWL replied + report_sent, Taurus Locks report_sent) — the conversation history lives in
    whatsapp_messages either way; the earlier lead row is the record.
  - ⚠️ **The lasting rule: a correctness decision must never read a client-side cache that races
    its own fetch.** The in-memory arrays exist for UX speed only.
- ✅ **THE EMAIL LANE'S SEO SCAN — "CUT" 2026-08-17, EXCEPT IT WAS ALREADY CUT. Do not re-cut it.**
  Paul asked for the SEO scrape removed from the email outreach flow; recon proved `audit_and_push`
  (the ONLY mechanism that has ever pushed to Instantly — all 25 pushed leads, one job, 2026-08-08)
  has forced `skip_seo` since it was built. Verified live: its 9 audits all carry
  `skipped: seo_scan_not_requested`; the 16 graded scans on emailed leads are OLDER audits from
  other paths. **There was no code to delete.** What shipped instead (2026-08-17):
  - **`siteCheckPendingSection`** (`aiAuditReportHtml.ts`): a report for a business WITH a website
    but no scan used to render NOTHING in the website slot; it now states the sequencing ("full
    check comes when we start work"). `scripts/report-seo-absent.test.ts` pins all three branches.
    Reports render live, so a later scan replaces the line with the graded panel on the SAME link.
    Only edge importer of that file: `render-audit-report` (re-walked 2026-08-17 — the §4 list
    naming send-whatsapp-message/run-seo-scan was stale).
  - **Scan on engagement, manual, priced on its face** from the sync-guarded `SEO_SCAN_USD`
    (real billed band $0.02–0.08; the $0.12 usage rows are the fallback echo, not billing):
    AiAudit's existing button now shows "· ~4p", and `LeadSiteCheckButton` on the lead card renders
    ONLY for a replied-or-beyond lead with a real website (isAggregatorUrl) whose completed audit
    lacks a scan — so it can never re-invite up-front spend across the book.
  - ⛔ **Auto-scan-on-reply in `poll-instantly-replies` is DEFERRED, Paul's call** — build when
    replies are routine (zero replies at decision time). The poller today only flips
    status → replied/bounced; it has no audit or scan logic.
  - ⚠️ SEO still fires elsewhere ON PURPOSE: wizard singles (no skip control exists in that form),
    plain bulk `audit` jobs, the WhatsApp auto-audit chain, paid baselines. ~498 scans in the 30
    days to 2026-08-17. The plain bulk job is the same up-front shape in the WhatsApp lane —
    flagged to Paul, deliberately not changed.
- ⛔ **REVIEW REPLIES — RESEARCHED 2026-08-10, DECIDED: BUILD NOTHING. Do not re-run this recon.**
  Nothing in either repo touches the Google Business Profile API today (only Places and Geocoding),
  and nothing should.
  - ⚠️ **THE ACCESS APPLICATION IS NOT THE CONSTRAINT — SCOPE IS.** Approval is *reviewed within 14
    days* (Google's own FAQ), prerequisites are a verified GBP active **60+ days** with a website,
    applied for from an owner/manager email; 0 QPM in Cloud Console means not approved, 300 means
    approved. That is the easy part.
  - 🔴 **YOU CAN ONLY READ REVIEWS FOR PROFILES YOU MANAGE.** Not prospects, not competitors. Google
    filters applications for anything resembling third-party access.
  - ⚠️ **SO THE "NOTIFY-ONLY vs REPLY-DRAFTING" SPLIT IS A FALSE ONE** — the shape the question was
    first asked in. Push notification genuinely exists (Cloud Pub/Sub, `NEW_REVIEW` among the types,
    so no polling), but it is per-account and managed-locations-only. **Both halves need the same
    grant.** The real split is customers vs prospects.
  - Customers are viable, and the grant is **already in the product**: `gbp_status` asks them to add
    `paul@move37.fun` as a Manager. Prospects are impossible on the official API.
  - Reviews live **only on v4** (`mybusiness.googleapis.com/v4`), never migrated to the v1 APIs.
  - **The no-approval alternative and its ceiling:** Places API returns reviews for any business —
    but max **5**, sorted by relevance not date, and the review object has **no owner-reply field**.
    So "you have 3 unanswered reviews" as an outreach hook **cannot be built**: answered and
    unanswered are indistinguishable. Cost would be **+$0.005**/business (Place Details Enterprise
    $20/1,000 → Enterprise + Atmosphere $25/1,000, the tier `reviews` triggers).
  - ✅ **Google's own pricing page cross-validates two §4 constants:** Text Search Enterprise
    **$35/1,000** and Place Details Enterprise **$20/1,000**. Both correct as recorded.
  - ⛔ **AND IT CONTRADICTS §5 IF SOLD AS FINDABLE.** Reviews are *tested and negative* for being
    named by AI — three named businesses have 0–1 reviews. This is a **separate product** for
    existing customers, not an enhancement. Paul's call 2026-08-10, with zero paying customers: build
    nothing, create a verified Findable GBP so the 60-day clock runs in the background, revisit when
    there are customers to serve.
  - ✅ **REVISITED 2026-08-19 (two paying customers): the STATELESS middle path is built and live.**
    `/review-replies` + the `review-reply` edge fn — paste a review in, gpt-4o-mini returns a
    copy-paste reply OR a first-class **don't-reply verdict** (abusive / legal-safety / owner-only
    disputes / canned-would-worsen). No Google API, no storage, nothing posts anywhere — the
    operator IS the approval step by construction. OpenAI-quota errors return typed `no_credits`
    (friendly banner; springs back when credited, no redeploy — verified live in that exact state).
    The read-and-post version stays gated on the GBP API access application (v4-only, zero default
    quota, OAuth `business.manage`, manual Google review); the drafting/verdict logic carries over.
    ⚠️ RG's questionnaire says `gbp_status = no_access` (11 Aug) — the claimed Manager grant on his
    profile is NOT yet evidenced in the DB; confirm at business.google.com before relying on it.
- ✅ **`onboarding_responses.gbp_verified` — added 2026-08-10.** `gbp_exists` asks about **claim and
  access**; "Yes, and I can get into it" is equally true of a profile awaiting verification and of a
  suspended one. An unverified profile **does not show on Maps or Search**, so profile work publishes
  to nobody — and it is the plainest explanation there is for "AI has never heard of me".
  `yes | pending | no | not_sure`, asked only on the `gbp_exists = yes` branch, NULL = not answered.
  Four states because four different things happen; `pending` is a chase, `no` is a piece of work.
  Read by `notify-onboarding-submit` (a **Verified:** line, and `no` joins `needsYou` beside
  `no_access` — only `no`, because padding that list is how the entries that matter get skimmed past).
  ⚠️ It is also the exact gate on review replies ever working for a client (see above).
- 🔴 **A FOLLOW-UP ANSWER SURVIVES THE ANSWER IT HANGS OFF — fixed 2026-08-10, and it was live for
  `gbp_status`.** Answer "Yes, I have a profile" → "Done, I've added you", then change to "I don't
  think I have one", and the questionnaire submitted a **contradiction**: no profile at all, *and*
  already added us as a manager on it. **The stale value is invisible on screen because the panel
  holding it has closed**, which is exactly what let it survive. Both follow-ups now clear when
  `gbp_exists` moves off `yes`.
  ⚠️ **THE RULE: a conditionally-shown question owns its answer's LIFETIME, not just its display.**
  Hiding a field is not clearing it — **and clearing it is not the same as not sending it.**
  ✅ **SWEPT 2026-08-10, all four branch-revealed inputs. Two were ALREADY correct** and are the
  model: `website_platform_other` (guarded on `websitePlatform === "other"`) and `willing_to_migrate`
  (guarded on `migrateAsked`) **derive what is SENT from the same condition that decides what is
  SHOWN**, so the two cannot disagree. The other two now match:
  - `website_manager_email` — revealed by "a web company manages it"; typing the address then
    changing to "I do it myself" sent a contractor's email for someone with no contractor.
  - **The whole Google block** (`gbp_exists`/`gbp_status`/`gbp_verified`), revealed by consent
    `yes_all` — answering them then changing to "pages only" recorded that they had added us as a
    manager on a profile they had **just refused us**. Worst of the four because the other two
    consent options **submit on selection**: one click, straight out, stale answers attached.
  ⛔ **AND THE FIX HAD TO BE IN THE PAYLOAD, NOT THE CLICK HANDLER.** `submit()` runs in the same
  tick as `setConsent` and closes over the previous render's state — the identical race the
  `consentOverride` comment in that file already documents **for the same button**. Clearing state in
  the handler would have looked right, hand-tested right, and sent the stale value anyway. State is
  cleared too (the draft and panel stay honest), but the payload line is what decides.
  ⚠️ Both send sites — `submit` **and** the `bail` escape hatch — post the same object. A bailed
  submission is partial by design; it is not allowed to be wrong.
- 🔴 **RLS ENABLED WITH ZERO POLICIES — THIS HAS NOW COST A WORKING FEATURE, AND IT IS THE THIRD
  INSTANCE.** A denied read returns **HTTP 200 with `[]`**, which is indistinguishable from a table
  that is genuinely empty. Nothing throws, nothing logs, and the feature silently does nothing.
  | Where | What it cost |
  |---|---|
  | `apify_account_usage` | its own migration comment promised the figure would be visible in the app; the policy was never added, so nothing ever displayed it |
  | The submissions card | caught **before** shipping, 2026-08-10, by checking the policies first — this is the check that works |
  | **`useDashboardMetrics.onboardingByLead`** | **the NextActionsCard chase task ("filled the questionnaire and hasn't paid") has NEVER fired for anyone.** The code carries a comment asserting *"RLS scopes them as it scopes allLeads"* — it does not |
  - ✅ **PROVEN 2026-08-10, both directions**: the anon key reads `onboarding_responses` and gets
    `200 []` while the service role sees 2 rows, and `select policyname from pg_policies where
    tablename='onboarding_responses'` returns **no rows**. Paul ran the policy query.
  - ⚠️ **A COMMENT CLAIMING RLS SCOPES A TABLE IS NOT EVIDENCE.** Both failures were introduced by
    someone believing one. Check `pg_policies`, not the prose.
  - ⛔ **THE FIX WHEN A TABLE HAS NO POLICY: route the read through an edge function on the service
    role, behind an operator check** — as `coverage` and `submissions` do. Adding a policy is the
    other option and is Paul's call, not a default.
  - 🔴 **THE FULL SWEEP IS NOT DONE.** PostgREST cannot read `pg_catalog`, so it needs one query in
    the SQL editor — hand Paul this and act on the result:
    ```sql
    select c.relname, count(p.polname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     group by 1 having count(p.polname) = 0 order by 1;
    ```
    Then grep the SPA for a direct `.from('<table>')` on every name it returns. **Every hit is a
    feature that silently does nothing.**
  - ✅ **SWEEP DONE 2026-08-10. 11 tables had RLS with no policy; only THREE are read from the SPA:**
    | Read | Costs |
    |---|---|
    | `OutreachTable:1251` `contact_suppressions` | pre-queue UX filter → the queue count **overstates**. ✅ **THE SEND PATH IS SAFE**: `checkSuppressed` is always passed the **service-role** client (`process-whatsapp-queue:421`/`:694`, `process-sms-queue:219`, `twilio-inbound`), which bypasses RLS. Nobody who said no has been contacted |
    | `usePlaybook:240` `onboarding_responses` | the client sheet thinks **nothing is held** → prints "NOT HELD — ask the client" for every field. Costs nothing today (2 test rows); **becomes actively wrong after the questionnaire split** |
    | `useDashboardMetrics:183` + `useCampaignStats:132` | the dead chase task, and a campaign count reading low |
    | `useDashboardMetrics:191` `sms_sends` | **zero cost today** — no SMS has ever been sent, so `[]` is also the true answer. A latent trap: the day SMS starts, the figure stays 0 |
  - ✅ **`whatsapp_sends` and `whatsapp_outreach_state` are NEVER read from the SPA.** Volume and
    pacing come from **`whatsapp_messages`**, which is not on the no-policy list — so those figures
    were never zero-because-empty. Do not "fix" them.
  - ⛔ **ENDPOINT vs POLICY — THE TEST IS WHETHER THE TABLE HAS AN OWNER COLUMN.** `sms_sends` has
    `user_id`, so "my own sends" is expressible and it got a **policy** 2026-08-10 (verified by the
    sweep query dropping it — the table is EMPTY, so no data read can tell a policy from its
    absence; the RLS trap blocks its own verification). `contact_suppressions` is deliberately
    cross-channel and one-no-forever with **no owner to scope to**, so it gets an endpoint;
    `onboarding_responses` already has `submissions`.
  - **Still to fix (order agreed):** `usePlaybook` (needs a NEW `submissions` action — the existing
    one deliberately returns card columns, not the answers), `contact_suppressions`, then the two
    dashboard reads.
- 🔴 **THE ORDER, RE-AGREED 2026-08-10 — THE VERDICT FAULTS COME BEFORE THE SPLIT.** Paul's reason,
  and it overrides the "split is next" note further down: *the split changes a flow nobody has used
  yet, and the verdict faults are corrupting decisions I am making today.*
  1. ✅ **The dirty-list signal — BUILT 2026-08-10**, and the measurement replaced the plan (below).
     The refusal, the cleaner button in that state and the auto-clean are done. ⚠️ **Wakefield is NOT
     cleaned**, and the reason is NOT what was first recorded — see the corrected note below. The
     panel's cleaner button works; only a service-role script is refused.
  2. ✅ **Winnability — MEASURED AND FIXED 2026-08-10** (below). The citation half of the verdict is
     gone; 11 markets flip from skip to workable.
  3. ✅ **DEPLOYED 2026-08-11.** `market-view` v23, `extract-competitors` v8, SPA verified live by
     marker (`Names not cleaned` + `National brands hold the naming` in the marketView chunk,
     `Clean the names` in the Index chunk, and the conditional `${…?"&confirm=search":""}` in the
     Coverage chunk). 🔴 **NEXT: clean the eight refused markets from the PANEL BUTTON** — 61 runs,
     $4.27, or $1.40 for the five market-audited ones as a first pass — then re-read their verdicts.
  4. The questionnaire split.
  5. `usePlaybook`, `contact_suppressions`, the two dashboard reads.
  ⚠️ **DO 1 AND 2 IN ONE SESSION.** Both decide market verdicts Paul picks towns from, so the two
  faults are independent but compound: fixing either alone leaves the Coverage numbers wrong in the
  other way, and each one's answer can move the other's.
  ⛔ **THE DELIVERABLE IS A LIST OF TOWNS WHOSE VERDICT CHANGES** — worked ones he should not have,
  and skipped ones he should have. Not a corrected rule; the towns.
  ⚠️ **NO RE-AUDITING.** Cleaning re-reads stored answers, so the only spend is the cleaner itself
  (`CLEANER_USD_PER_RUN` = $0.070) on markets deliberately chosen.
  🔴 **RE-MEASURED 2026-08-10 (LATER SESSION) — THE RATIO IS NOT THE SIGNAL AND 10 WOULD HAVE MISSED
  TWO DIRTY MARKETS. Everything in the block below is superseded; it is kept because the mistake is
  the lesson.** The distribution was reproduced exactly (rowley regis 444/16 = 27.8, wakefield
  401/16 = 25.1, eastbourne 287/16 = 17.9) — and the "empty band" had closed:
  ```
  perQ  markers  market                     eyeballed
  27.8      39   locksmiths/rowleyregis     DIRTY  "they" "ask" "always" "check"
  25.1      39   locksmiths/wakefield       DIRTY  "here" "why" "i'd" "good"
  17.9      33   locksmiths/eastbourne      DIRTY  "give" "particularly" "another"
   9.6      24   locksmiths/chorley         DIRTY  "fully" "call" "always" "ask"   <- NEW, inside the "gap"
   5.8      18   accountant/chichester      DIRTY  "their" "you" "many"            <- BELOW two clean markets
   4.8       0   mobile mechanics/wisbech   clean
   4.4       0   electricians/portsmouth    clean
   3.9…2.1   0   the other thirteen         clean
  ```
  - ⛔ **THE GATE IS NOW A FACT, NOT A RATIO: a SINGLE-TOKEN English function word cannot be a firm's
    name, and the LLM cleaner would never return one.** `UNCLEANED_MARKER_WORDS` in `marketView.ts`.
    It separates all 20 with nothing in between — 39/39/33/24/18 on the five dirty ones and **exactly
    zero across 793 distinct names** in the other fifteen. Multi-word names pass by construction, so
    "First Pick Locksmiths" and "Always Secure Ltd" are untouched.
  - ⛔ **`marketShape` now returns `names_uncleaned` — a REFUSAL, not a shape** — with the cleaner
    button directly under it, and `shouldAutoClean` keys on the fact. That also removes the recorded
    re-clean loop: a cleaned fold has no markers, so 16.5-per-audit can no longer re-fire forever.
  - ⚠️ **THE LIST IS DELIBERATELY INCOMPLETE.** Chorley's fold also holds "vat", "matthew",
    "chorley", "pvc" — obvious junk it does not catch. It only needs ONE marker to prove a fold is
    raw, and every word added is a word some real firm might be called. **The measured zeros belong to
    the list AS IT STANDS; grow it and re-run the sweep before quoting them.**
  - ⚠️ **The markers are counted on the RAW mentions, before `groupNames`.** A junk fragment can
    merge into a group labelled with a real firm's name and vanish from `named` entirely.
  - ⚠️ **Absence is NOT dirt here, deliberately, and it is the one place that direction is right:**
    `uncleanedCount` is optional, and refusing to grade on a missing field would blank the verdict on
    every market at once — including the fifteen measured clean. **Deploy `market-view` BEFORE the
    SPA** and the exposure is a 10-minute stale sessionStorage cache.

  <details><summary>SUPERSEDED: the per-question threshold of 10 (kept for the lesson)</summary>

  ✅ **MEASURED 2026-08-10 — THE THRESHOLD IS 10 PER QUESTION, AND THE DATA PICKS IT.** Distinct
  extracted names per QUESTION across all 20 markets with completed questions:
  ```
  27.8  locksmiths / rowley regis   (444 names, 16 questions)
  25.1  locksmiths / wakefield      (401, 16)
  17.9  locksmiths / eastbourne     (287, 16)
  ──────────── nothing at all between 5.4 and 17.9 ────────────
   5.4  mobile mechanics / wisbech      4.4  electricians / portsmouth
   3.9 … 2.1   the other 15 markets
  ```
  **Three dirty, seventeen clean, a 3.3× empty band.** 10 sits mid-gap and survives new markets
  landing either side without re-tuning. Names come from `ai_audit_queue.result[engine].competitors`
  on **complete** runs only.
  - ⚠️ **ONLY THREE MARKETS CAN CHANGE FROM CLEANING.** The other 17 were graded on clean lists, so
    whatever is wrong with them is the **aggregator rule, not the extraction** — which splits the
    two faults cleanly and means most of the town list comes from winnability, not from cleaning.
  - 🔴 **EASTBOURNE CARRIES BOTH FAULTS.** It is dirty (287 fragments over 16 questions) *and* one
    of the five towns skipped on the aggregator verdict, so its 14% Checkatrade figure was computed
    on a fragmented list. Do it straight after Wakefield.
  - ✅ **Chichester (3.6) and Portsmouth (4.4) are CLEAN**, so two of the five skipped towns need no
    cleaning before their winnability can be judged.
  - The current `JUNK_RATIO_PER_AUDIT = 15` is per-AUDIT and **every one of the 20 markets scores
    above it on that basis**, so it separates nothing.
  ⛔ **AND THE THRESHOLD MUST BE MEASURED, NOT PICKED.** `shouldAutoClean` (`marketView.ts:493`)
  gates on `JUNK_RATIO_PER_AUDIT`, whose comment cites a **per-audit** spread (clean 4–9, junk
  30–970). **Those numbers do not carry to a per-question ratio** — a per-audit average cannot
  exceed 15 once a market has two audits, which is exactly why it has never fired. Re-measure the
  distribution before drawing a line, or it becomes the fifth constant in §4 that was copied from
  somewhere plausible and never checked.

  </details>

  🟢 **CLEANING FROM THE APP WAS NEVER BLOCKED. THE 401 IS A HARNESS-ONLY PROBLEM, AND THE FIRST
  DIAGNOSIS OF IT WAS WRONG — CORRECTED 2026-08-11 BY THE REDEPLOY THAT WAS SUPPOSED TO FIX IT.**
  `extract-competitors` refuses a **service-role** call with `{"ok":false,"error":"unauthorized"}`
  even with `x-internal-job` set.
  - ⛔ **RULED OUT: "the deployed copy predates the internal branch."** That was the recorded
    diagnosis and it was wrong. The function was redeployed from source carrying that branch
    (`index.ts:136-138`), **v7 → v8, entrypoint build 5 → 8**, and the 401 is byte-for-byte
    unchanged. A stale deploy was not the cause. §4's trap in reverse: the deploy-age signal was
    real (build 5 behind version 7) and had **nothing to do with the symptom**.
  - ✅ **RESOLVED 2026-08-12 ON A DIFFERENT FUNCTION, AND THE ANSWER GENERALISES: EVERY
    SERVICE-ROLE-BEARER BRANCH IN THIS PROJECT IS DEAD, AND IT CANNOT BE REACHED BY SENDING A
    DIFFERENT KEY.** Reproduced on `process-whatsapp-queue` (same `authHeader === "Bearer " +
    SUPABASE_SERVICE_ROLE_KEY` shape) while verifying the daily cap. **The response BODY is the
    discriminator**, and nobody had read it:
    | Bearer sent | HTTP | body | what it proves |
    |---|---|---|---|
    | legacy `service_role` JWT | 401 | `{"ok":false,"error":"unauthorized"}` | **the handler's own reply** — the gateway passed it, so the env var is **NOT** the legacy JWT |
    | new `sb_secret_…` | 401 | **empty** | the **gateway** rejected it; the handler never ran |
    | no header at all | 401 | `{"ok":false,"error":"unauthorized"}` | handler again (confirms `verify_jwt = false`) |
    The two requirements are **mutually exclusive**: the gateway only forwards a JWT-shaped bearer,
    and the handler compares against a value that is no longer the legacy JWT (so, the `sb_secret_…`
    one). No key you can send satisfies both. ⛔ **So do NOT "fix" this by hunting for the right
    key** — the only working callers are **CRON_SECRET via `x-cron-secret`** and **an operator's own
    admin JWT**. The service-role branch is dead code on every function that has one.
  - ⚠️ **AND THE OLD NOTE HERE WAS WRONG ON A CHECKABLE FACT: `sb_secret_…` IS NOT MASKED.**
    `npx supabase projects api-keys --output json` returns **four** entries — `anon` and
    `service_role` (legacy JWTs) plus two named `default` (`sb_publishable_…`, `sb_secret_…`), all in
    full. The claim that it was masked is what stopped the previous session testing this. Check the
    output before recording that something cannot be read.
  - ✅ **AND THE PANEL BUTTON WORKS, AND ALWAYS DID.** `MarketPanel` invokes the function with the
    OPERATOR'S OWN JWT, which takes the user branch and the ownership check — untouched by any of
    this. So the cleaner is available in the app right now. Only a script is locked out.
  - ⚠️ **The lesson: "blocked" needs to name WHICH CALLER is blocked.** Recording it as
    "cleaning is blocked" turned a harness-auth quirk into a product-level blocker in the notes, and
    the next session would have believed it.
  - ✅ **THE FULL KEY × HEADER MATRIX, MEASURED 2026-08-19 (third session to hit this wall — stop
    re-probing it).** Driven against `extract-competitors` with a nonexistent `runId`, which returns
    before any OpenAI call, so the whole matrix cost nothing. **The discriminator is WHOSE error
    shape comes back**: `{"ok":false,...}` is the handler; `{"message":...,"hint":...}` is the
    gateway.
    | Sent | Result | Whose reply |
    |---|---|---|
    | `Authorization: Bearer <legacy service_role JWT>` (+ apikey same) | 401 `{"ok":false,"error":"unauthorized"}` | **handler** — forwarded, but `token === SUPABASE_SERVICE_ROLE_KEY` fails: the env var is the `sb_secret` now |
    | `Authorization` + `apikey` both `sb_secret_…` | 401 `{"message":"Invalid API key"}` | **gateway** |
    | `apikey: sb_secret_…` alone, no Authorization | 401 `{"message":"Invalid API key"}` | **gateway** |
    | `Authorization: Bearer sb_secret_…` alone, no apikey | 401 `{"message":"Invalid API key"}` | **gateway** |
    | `apikey: <anon or sb_publishable>` + `Authorization: Bearer sb_secret_…` | 401 `{"message":"Conflicting API keys","hint":"Send the intended sb_ key only in the apikey header."}` | **gateway** |
    - ⛔ **THE GATEWAY'S OWN HINT IS WHY IT IS UNSOLVABLE: `sb_` keys are accepted ONLY in `apikey`,
      and the handlers only ever read `Authorization`.** So no combination can satisfy both. The
      service-role branch on every function is unreachable from outside — it is dead code, not a
      key-hunting problem, exactly as the 2026-08-12 note says. **Do not spend another session on
      it.**
    - ⚠️ **AND THE TWO KEYS ARE NOT INTERCHANGEABLE ACROSS SURFACES:** the **legacy `service_role`
      JWT still works for `/rest/v1`** (every DB read in this file's recon uses it), while the
      **`sb_secret` key is refused by `/rest/v1` with "Invalid API key"**. A script that picks "the
      service key" without saying WHICH will work or fail depending on which surface it hits.
  - ✅ **THE ONE ROUTE THAT DOES WORK FOR A SCRIPT: MINT AN OPERATOR SESSION.** Built and used
    2026-08-19 for the cleaner catch-up, with Paul's explicit authorisation ("however's cleanest on
    your end — I'm not pasting any keys"); the alternative was 26 manual panel presses.
    1. `GET /auth/v1/admin/users` with the legacy service_role JWT → find the operator, get the id.
    2. `POST /auth/v1/admin/generate_link` `{type:"magiclink", email}` → returns the token and does
       **not** send mail.
    3. ⛔ **`hashed_token` IS NOT FOR `POST /auth/v1/verify`** — that answers `403 otp_expired` and
       cost a debugging cycle. It belongs to the **clicked-link GET**: fetch `action_link` (or
       `/auth/v1/verify?token=<hashed_token>&type=magiclink&redirect_to=…`) with **redirect
       following disabled**, and read `access_token` out of the **`#` fragment of the `Location`
       header**.
    4. Confirm the token resolves to the intended user (`GET /auth/v1/user`) BEFORE spending
       anything — that check is what caught the ADMIN_EMAIL/owner mix-up in §6j.
    - ⚠️ **Tell Paul, revoke it, and delete the file.** `POST /auth/v1/logout` with the token
      returns 204 and kills the session; tokens last 3600s otherwise. Never leave one in a
      scratchpad, and never put a key or token in the transcript.
    - ⚠️ **It is a REAL sign-in on his account** (it stamps `last_sign_in_at`), so it needs his
      say-so each time. It is not a substitute for the panel button, which is still the intended
      path for one-off cleaning.
  - ⚠️ **THE CLEANER'S COVERAGE IS PER-ROW AND CAN BE PARTIAL — `ok:true` DOES NOT MEAN CLEAN.**
    Measured over the 2026-08-19 catch-up (51 dirty market runs, ~$3.92 all-in): the response's
    `changed` is the count of QUEUE ROWS rewritten, and the model can omit an id, so `changed=7` of
    8 rows leaves one row's junk in place. 48 of 51 came back fully clean on the first pass; two
    more needed a second pass. **Always re-derive the marker count afterwards rather than trusting
    the 200s** — `isUncleanedName` (`src/lib/knownEntities.ts`) over
    `ai_audit_queue.result[engine].competitors` is the check.
    - 🔴 **ONE RUN CANNOT BE CLEANED AND IS STILL DIRTY: `Plumbers · Wythenshawe`, run
      `1cc86b92`.** Four attempts, every one `ok:true changed=0`, deterministic. NOT missing data
      and NOT a cap: it has `answer_text` on all 14 engine slots (one of its 8 rows is `failed`) and
      the caps are 60 items / 4,000 chars on gpt-4o. The model returns output whose row ids do not
      match, so nothing is rewritten. Its market's OTHER run is clean, so that market stays under
      the "Names not cleaned" refusal. Diagnosing further needs the raw model output, i.e.
      instrumenting the function. **Cheapest real fix is re-measuring that one market (~22p, new
      runs self-clean) — not done, Paul's call.**
  - 🔴 **THE ROTATION ALSO KILLED THREE INTERNAL CALL PATHS — found and fixed 2026-08-14, and the
    REAL MECHANISM IS verify_jwt-BY-OMISSION, not the bearer per se.** A function ABSENT from
    `supabase/config.toml` deploys with the platform default **verify_jwt = TRUE**, which demands a
    JWT-shaped bearer before the handler runs. Every internal fetch in this repo sends
    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`; that passed the check while the env key WAS a JWT and
    started failing ("Invalid API key", handler never runs) when the ~2026-08-11 rotation made it
    sb_secret-shaped. Three functions were missing from config.toml, so three paths died at once:
    | Dead since ~08-11 | Caller | Observed damage |
    |---|---|---|
    | `extract-competitors` | queue finalisation | **every fold finalised 08-11→08-14 dirty** (16–51 markers; zero before) |
    | `generate-report` | queue auto-report | **business_reports: 84 rows 08-04→08-10, ZERO after 08-10** |
    | `derive-audit` | whatsapp-inbound reply chain | degraded gracefully: `servedFromMarket` false → fell back to a PAID per-business audit every time |
    ⛔ **AND THE PROOF THAT THE BEARER SHAPE ALONE IS NOT THE FAULT: the paid baselines flowed.**
    `audit-baseline.ts` and `whatsapp-inbound.ts` send the IDENTICAL bearer to `create-ai-audit` —
    which IS in config.toml (`verify_jwt = false`) — and RG (08-11) and Fortify (08-13) both got
    their full 3-run baselines minutes after paying. The five "dead bearer" call sites in those two
    shared files are ALIVE and need no change. Do not "fix" them.
    **The fix:** config.toml now lists all three (their handlers already enforce their own auth —
    user-JWT ownership or CRON_SECRET + x-internal-job), redeployed to apply it; and the two queue
    invokes now send NO bearer at all (cron-secret is the internal door and never rotates).
    ⚠️ **The auth-free deploy marker:** an unauthenticated POST returns the platform's
    `UNAUTHORIZED_NO_AUTH_HEADER` while verify_jwt is stuck true, and the handler's own JSON
    (`{"ok":false,...}`) once false is live. That is how the flip was verified without CRON_SECRET.
    ⚠️ **When adding a NEW edge function: add its config.toml entry in the same commit.** The
    default is the trap; nothing local can catch it (deno check passes, deploy succeeds, user-JWT
    callers work — only internal callers die, silently, WEEKS later when a key rotates).

  Counted, not estimated, at $0.070/run and with no re-auditing:
  | Scope | Runs | Cost |
  |---|---|---|
  | The **8 markets that carry a verdict today** — rowley regis 2, loughborough 20, stamford 9, wrexham 12, accountant/chichester 11, wakefield 2, eastbourne 2, chorley 3 | **61** | **$4.27** |
  | Of those, the five that are MARKET-audited (the 20-market set) | 20 | $1.40 |
  | Every market with markers, including 5 `unmeasured` ones (accountant/wisbech alone is 22 runs and 99 markers) | 91 | $6.37 |
  ⚠️ **A first pass of ~$1.40 answers the question that matters** — does the cleaner actually remove
  the markers? Nobody has measured that; Wisbech's earlier clean was measured on the old ratio.
- ✅ **THE MARKETPLACE-LED VERDICT WAS WRONG. MEASURED AND FIXED 2026-08-10 — the citation half is
  GONE.** Across every market with a completed run, **17 have an aggregator as the most-cited host and
  in all 17 AI names local firms anyway**: in 15 the aggregator's brand is not in the named list at
  all, and in the 2 where it is (Stamford 9 mentions against 68, Eastbourne 13 against 32) it sits far
  behind the local leader. Local firms hold all three top spots in 10 of the 17.
  - 🔴 **THE DECISIVE CASE IS plumber/WISBECH** — Checkatrade at **27% of citations, the highest share
    in the book**, and the three most-named firms are all local (Fen Property Services 52, DC Plumbing
    49, Mr Gas 37). **That is the town Paul has actually worked.** The rule would have told him to skip
    the one market he has proven.
  - The naming half survives and is **widened from the leader to the top three** (`NATIONAL_TOP_N`),
    Paul's own proposal. locksmiths/Colchester is why: LockRite, Lockforce and LockFit hold all three
    spots with no local firm near them, which the leader-only test could not distinguish from a market
    whose #2 is local. Kind renamed `marketplace_led` → **`national_led`**.
  - The citation fact is still printed, as intelligence, with the measurement attached. Same rule §6
    applies to unknown hosts: they route to who's-winning, never to a verdict.
  - ⚠️ **THE TOWN LIST IS IN THE SESSION REPORT, and 11 markets flip from skip to workable** —
    including electrician/Chichester, both Portsmouth trades, plumber/Kettering and plumber/Wisbech.
    Four more (Eastbourne, Loughborough, Stamford, Rowley Regis) were skipped AND are dirty, so they
    are refused rather than flipped until the cleaner runs.
  - ⚠️ **`otherTowns` IN THE OFFLINE ANALYSIS IS AN APPROXIMATION.** The harness matched on merged
    group keys across the pairs it read; `market-view` runs its own cross-town scan with a read cap.
    Expect small differences in which leaders are flagged national.

  <details><summary>SUPERSEDED: the open question this answered</summary>

  🔴 **THE MARKETPLACE-LED VERDICT MAY BE WRONG, AND IT HAS COST FIVE MARKETS.** Paul has skipped
  **Eastbourne, Chichester, Portsmouth, Loughborough and Kettering** on "an aggregator is the top
  cited host → a local firm is competing with a platform". His counter-evidence: Eastbourne
  locksmiths has Checkatrade top-cited at 14% while **J&J Locksmiths leads the naming with 32
  mentions**, and §5 already records **Checkatrade in 59 of 62 plumber audits with AI still naming
  local plumbers**. So AI reads the aggregator and then names local firms — being cited is not being
  named (§5 says this already, in the other direction).
  - ⚠️ **NOT YET CHECKED AGAINST THE DATA. Do not change the verdict until it is.** Three queries:
    in markets where an aggregator is top-cited, who is actually NAMED; does the aggregator's own
    brand ever appear in the NAMED list; how many markets were skipped and would they have been
    workable. Paul's hypothesis for the real signal: **the aggregator's brand in the NAMED list, or
    no local firm in the top three** — both about naming, not citation.
  - ✅ **START WITH CHICHESTER — the data may already exist and cost nothing.** It is the
    accountant trade+town the derivation test used (6 businesses, 5 agreed, the market audit found a
    firm its own 3-question audit missed).
  - ⚠️ **DO NOT TEST THE RULE ON LOUGHBOROUGH.** `loughborough.org.uk` is one of only two `townOnly`
    hosts, so its citation mix is atypical.
  - If being most-cited predicts nothing about naming, **drop that half of the verdict** — Paul's
    own words, and he is ready for that answer.

  </details>
- 🟡 **THE QUESTIONNAIRE SPLIT — HALF LANDED 2026-08-11. The REPOINT is live; the two findable-site
  screens are not.** Read this before touching either repo.
  ✅ **SUPERSEDED 2026-08-13: the split is FULLY BUILT** — findable-site's step 0 is the one
  pre-pay screen, Q2 runs post-payment, and `complete_q2` exists and is live (D Aston and Fortify
  both paid through it). The "STILL TO BUILD" list below is history, kept for the reasoning. For
  the current questionnaire shape (name field, phone confirm, q2_prefill) see §6g.
  - ✅ **DONE AND DEPLOYED: the report's offer button goes through the questionnaire** (`render-audit-report`
    v37). The raw Stripe Payment Link is gone from `founderOffer.ts`; the button is now
    `<origin>/onboarding/<slug>/?lead=<leadId>`, built with the same `onboardingUrl()` the live
    `onboarding_followup` template uses. Verified on RG Locksmiths' live report: `buy.stripe.com`
    absent, the lead-carrying onboarding URL present, `class="src"` asserted so it is not the
    home-page fallback.
    - 🔴 **THE REAL PRIZE WAS NOT THE QUESTION ORDER — IT WAS THAT THE PAYMENT WAS INVISIBLE.**
      `stripe-webhook`'s whole Findable branch is gated on `metadata.onboarding_id`, and a STATIC
      payment link cannot carry a per-payer row id. Every founder payment would have landed with no
      onboarding row marked paid, no `amount_paid`, no operator email and no baseline. It also meant
      `showFounderOffer` (which hides on `amount_paid > 0`) would have kept selling to a customer.
    - ⛔ **NO LEAD, NO LINK, NO BUTTON — and it is a PRICE guard.** `offerPriceForLead` returns the
      full **£99** for `no_lead`, so a button without one advertises the founder price and charges
      £99. Same for an unconfigured `FINDABLE_SITE_ORIGIN`. Either missing → offer copy + guarantee
      render with no button, and a `console.warn` says which reason. 2 of 216 non-market audits have
      no `lead_id` and both are already in `FOUNDER_OFFER_HIDE_AUDIT_IDS`.
    - 🔴 **THE PRICE HAS A SECOND SWITCH NOBODY WOULD FIND: `FINDABLE_SETUP_PRICE_ID`.** If that env
      var is SET, `findable-checkout` uses a fixed Stripe Price and **ignores `offer.gbp` entirely** —
      the report says one number, Stripe charges the Price object — **and the guarantee goes with
      it**, because `product_data[description] = FINDABLE_GUARANTEE` only exists on the `price_data`
      branch. Confirmed UNSET by Paul 2026-08-11 (only `FINDABLE_SITE_ORIGIN` is set), so the
      derived-price path is live. **Re-confirm before ever quoting the founder price as safe.**
      ⚠️ Deliberately no number in either bullet now — the founder price has already moved once
      (£19.99 → £49.99, 2026-08-12) and prose that names it goes stale. See §11.
  - 🔴 **STILL TO BUILD, both in `findable-site` + one edge action:**
    1. **Pre-pay = eligibility only.** ✅ Verified byte-for-byte: `ServeGateRow` reads EXACTLY
       `website_platform`, `website_platform_other`, `website_manager`, `willing_to_migrate` — the
       screen-4 set — so reducing the pre-pay form to screen 4 + `contact_email` leaves the gate
       untouched. Screen 3 currently holds `contact_email` AND `competitor_name` (:2063-2075), so
       lift the email and move the competitor.
    2. **Post-pay form replacing the dead-end `paid` screen** (`OnboardingFlow.tsx:2777-2798`, which
       today is confirmation copy and NO capture).
    3. **`findable-onboarding` has NO action for a post-pay update** — actions are `prefill`,
       `revise`, `submit`, `status`. A new `complete_q2` is needed (update by `onboarding_id`, only
       when `status = 'paid'`, Q2 fields only, migration-tolerant like `submit`'s three-list pattern).
    4. ⚠️ **THE POST-PAY SCREEN HAS NO onboarding_id IN THE URL, DELIBERATELY.** `findable-checkout`
       keeps it off `success_url` ("so a paid receipt does not carry a live retry token", :218-229).
       The id IS in browser storage at that moment — but `paid=1` currently calls `forgetOnboarding()`
       and `clearDraft()` at :1348-1354, i.e. throws it away. **Capture it BEFORE forgetting**; do not
       put it back in the URL. No storage → show the confirmation without the form and let the
       existing `q2_chased_at` / `q2_chase_count` chase cover it.
  - ⚠️ **THE INTERMEDIATE STATE IS SAFE BUT HAS MORE FRICTION THAN THE TARGET**: a report click now
    walks all 5 screens before Stripe. `confirmed_location` + `services` are therefore still captured
    pre-pay, so `startPaidBaseline` fires immediately and nothing is deferred yet. Paul's instant
    lever if the friction hurts: `FOUNDER_OFFER_LIVE = false` hides the whole offer block.
  - ⚠️ **NO SQL. All 14 columns Q2 needs already exist**, validated against the live schema 2026-08-11
    (`services`, `services_list`, `areas_list`, `confirmed_location`, `competitor_name`,
    `business_address`, `accreditations`, `must_not_say`, `photos_status`, `contact_email`,
    `q2_chased_at`, `q2_chase_count` + `id`, `status`). `needsQ2` is derived, never stored.

  <details><summary>The original agreed plan (still the target)</summary>

  🔴 **THE QUESTIONNAIRE SPLIT — AGREED WITH PAUL 2026-08-10.** Money sooner, detail later.
  - **Before payment, ONE screen** (down from 5): the website questions + contact email.
    `website_platform`, `website_platform_other`, `website_manager`, `willing_to_migrate` — which is
    **exactly** what `findable-checkout` reads, so **the serve gate survives untouched** (verified).
    Contact email stays because without it someone who does the work and balks at the price is
    unreachable, and `notify-onboarding-submit` calls that the warmest lead there is.
  - **After payment, Q2:** services, town, areas, address, accreditations, competitor, photos, the
    whole Google block, must-not-say.
  - ✅ **Q2's delivery address is FREE** — `stripe-webhook` already backfills `contact_email` from
    the Stripe payer email where it is null.
  - **THE MAP** (`findable-site/src/components/OnboardingFlow.tsx`, 2802 lines): `questions` array
    entries at **1814** "What you do", **1939** "Where you want work", **1990** "Your details",
    **2092** "Your website", **2299** "Access". `STEPS = 5` at **269**, `const q = questions[step]`
    at **2479**, validation switch at **1497**. Contact email is inside "Your details" and must be
    lifted into "Your website". ⚠️ **Both payload sites change together** — `submit()` and `bail()` —
    and the six reachability guards must stay keyed to whichever questionnaire owns each question.
  - ✅ **THE BASELINE HALF IS ALREADY BUILT AND DEPLOYED** (`audit-baseline.ts`): `startPaidBaseline`
    defers with `ok:true, skipped:"awaiting_questionnaire_2"` until `confirmed_location` **and**
    `services` exist, because the fallbacks would otherwise rescue a missing answer
    (`confirmed_location || derived_town || search_location`, specialisms `""`) and put the
    wrong-town fault on the **guarantee's evidence**. **Nothing new schedules it** —
    `process-ai-audit-queue`'s `ensureBaselinesForPaidOnboardings` already retries every tick.
  - ✅ **The paid-with-no-Q2 card state is built** (`needsQ2` in `useSubmissions.ts`, derived from the
    three fields Q2 makes required, never stored).
  - **Still to build:** the split itself; the day-2/day-5 chase emails (columns `q2_chased_at` +
    `q2_chase_count` are **live** — the count exists because a stamp cannot answer *which* chase is
    next); the **day-7 dashboard task**, which must go **through the `submissions` endpoint**, not
    the direct read, for the RLS reason above.

  </details>
- **No Baseline Test button.** Baselines are gated to internal callers (cron secret or service role +
  `x-internal-job`) and currently only start from `stripe-webhook` after payment. A button needs an
  authenticated path. Cost ≈ **30p** (measured — see above).
- **THREE audit entry points, not two, and they resolve inputs differently.** Compared 2026-07-30;
  unifying them is **deliberately deferred** until Paul has verified the enrichment fix.
  | | Outreach row pill | Inbox button | Outreach bulk "Run audits" |
  |---|---|---|---|
  | What it does | `navigate('/ai-audit?leadId=…')` — **no server call** | calls `create-ai-audit` at once | `bulk-jobs` |
  | Location sent | wizard box, prefilled `derived_town \|\| search_location \|\| address` (`AiAudit.tsx:778`) | `search_location \|\| address` — **no `derived_town`** (`Inbox.tsx:397`) | `search_location \|\| address` (`bulk-jobs:229`) |
  | Business type | `search_keyword \|\| category` | `category \|\| search_keyword` — **reversed** | — |
  | Missing inputs | blank box, **no warning** | inline prompt, never leaves the Inbox | — |
  | Auto-pitch | no | **`queue_pitch_on_complete: true`** | no |

  **Do NOT merge the flows.** Paul's reason, and it settles it: the Inbox path auto-sends a pitch, and
  he has live prospects mid-conversation. Share the *input resolution* only. The server overrides
  location anyway (`create-ai-audit:353-377`), so the client differences decide what the operator SEES
  and what is used if derivation fails.
- **The three-question-type split isn't built** (own town / what makes them unique / surrounding towns).
- **Lead type/location are NOT reliably on the lead.** No `business_type`/`city` columns; audits read
  `search_keyword||category` and `search_location||address`, populated on only **~20%** of leads.
- **The Browser pane doesn't display** — screenshots need Paul (see §2).
- **Nobody has ever *looked* at the printed playbook document.** Its structure and every value are verified from
  text; its appearance is not. Worth one `Ctrl+P` before working a client off it.
- **The sidebar highlights nothing** on `/playbook/:id` or `/baseline/:auditId` — `isActive` is exact path
  equality (`location.pathname === item.url`). Consistent between the two, so left alone deliberately.
- **Back from the lead dialog returns to the Outreach LIST, not the reopened dialog.** Accepted limit: the
  dialog's open state is component state in `OutreachTable`, not in the URL, so there is nothing to restore.

---

## 9. Where the AI-visibility code lives

| Thing | Path |
|---|---|
| Evidence fold (pure, no LLM) | `src/lib/buildPlaybook.ts` |
| Host facts, hand-maintained | `src/lib/directoryFacts.ts` (**64** entries — see the count note below) |
| Per-trade citation fold | `supabase/functions/playbook-evidence/` |
| Operator checklist page | `src/pages/Playbook.tsx` + `src/hooks/usePlaybook.ts` |
| Printable document | `src/lib/playbookDoc.ts` + `src/lib/playbookDocStyle.ts` |
| Baseline operator view | `src/pages/Baseline.tsx` + `src/lib/baselineView.ts` |
| Back link, shared by both views | `src/components/BackLink.tsx` |
| Audit UI (large) | `src/pages/AiAudit.tsx` |

- 🔴 **Entry points to `/playbook/:id` — exactly THREE, and one of them is load-bearing on its
  own (re-checked 2026-09-10):** `LeadDetailDialog.tsx`'s `Playbook` pill, the AI Audit **row
  menu**'s *Delivery checklist* item, and the results screen's **More → Playbook**. Each passes
  `state={{ from, fromLabel }}` so `BackLink` can name where it returns to.
  ⚠️ **The dialog's is LEAD-keyed, so it cannot reach a business with an audit and no
  `outreach_leads` row** — ABLM, the only delivery client. The two AI Audit routes are AUDIT-keyed
  and are the only ones that can. **Do not remove both.** (A fourth, `PaidClients.tsx`, went with
  that page on 2026-08-12 — §6d.)
  ⚠️ **It used to be a `checklist` CHIP on every list row and is now a menu item** (2026-09-10).
  The route was deliberately preserved when the chip went: it rendered on 901 rows out of 901, so
  it distinguished nothing and was most of why the list read as cluttered. `AuditPills.tsx` carries
  a comment saying to put the chip back if the row menu ever loses the link.

- ✅ **THE LLM PLAYBOOK IS NOW UNREACHABLE FROM THE APP** (`1715a294`, 2026-07-30). The audit results
  screen has **ONE** button, `Playbook`, linking to `/playbook/:auditId`. Gone: both old buttons, the
  viewer (iframe + Internal/Client toggle + Regenerate + Download), `generatePlaybook` (the app's only
  caller of the edge function), the `DeliveryChecklist` card and component, the `playbooks` snapshot
  cache, the checklist tick state, and `RunRow.has_playbook`.
  **`src/lib/playbookHtml.ts` and `supabase/functions/generate-playbook/` are KEPT** — unreachable, not
  deleted, so the prompt stays readable as the record of what went wrong. Don't "tidy" them away.
  The button is gated on `auditId` **alone** — not on a completed run — because the ranking is
  trade-level, so the document is right even when that run failed at the Apify cap.
  🔴 **ONE GAP STILL OPEN:** **nothing is tickable.** The `DeliveryChecklist` ticked per run into
  localStorage. `/playbook/:id` displays `client_listings.done_at`/`verified_at` but **cannot set
  them** (read-only there), so there is nowhere to mark delivery work done.
- ✅ **THE CLIENT REQUEST FORM — the only client-facing document** (`56134630`, 2026-07-30). Reached
  by **`Print client request`** on `/playbook/:id`, beside **`Print operator copy`**. Labelled by who
  each is FOR, with "Operator copy contains their competitors — never send it" under them.
  - **THE LEAK BOUNDARY IS STRUCTURAL, and must stay that way.** `clientRequestDoc.ts` (the renderer)
    imports **only** `playbookDocStyle` — never `buildPlaybook`, `directoryFacts` or the selector — so
    it is never handed the ranking and cannot print it. `clientRequestSelect.ts` is the only side that
    sees the `Playbook`. If the sheet ever needs more, widen `ClientRequestInput` deliberately; do
    **not** pass the Playbook through.
  - **Which asks: 4 filters.** `blocked` only → not `thin` → **has a hand-written `clientParagraph`**
    → top **`CLIENT_ASK_LIMIT` (3)** by **breadth**. For plumbers: Checkatrade 59/62, MyBuilder 32/62,
    TrustATrader 17/62. **MyJobQuote is excluded despite 11/62** because nobody wrote client wording
    for it *and* its notes record the pay-per-lead model as "INFERRED" — never ask a client to spend
    money on an inferred model, and never write generic filler to fill the gap.
  - **No completed run → the measurement line is OMITTED**, replaced by an honest substitute. It does
    not refuse to render: the address ask is valid regardless, and refusing would block the one field
    holding up all the work.
  - ⚠️ **`buildClientDoc` was DELETED** — written, never rendered, and it leaked the measurement
    METHOD verbatim plus every blocked host uncapped. Its a/an helper, `{trade}`/`{town}` fill and
    "Being straight with you" wording were lifted first.
  - ⚠️ **MyBuilder's hand-written client paragraph still opens "MyBuilder is the third most common
    source we see for plumber work."** That ordinal implies a #2 the document never names. It leaks no
    host, so it passes the rule, but it is worth a one-word edit. Paul's call, not changed.
- ⚠️ **ENRICHMENT CANNOT BE RE-TRIGGERED ON AN EXISTING LEAD FROM THE UI.** `retryPhoneFetch` exists,
  force-refreshes Google and (since 2026-07-30) writes address/rating/reviews/town — but the only
  buttons that call it (`OutreachTable.tsx:2018` and `:2165`) render **only when
  `phoneFetchStatus[lead.id] === 'failed'`**, which is in-memory session state. And bulk "recover
  phones" **skips any lead that already has a phone** (`useOutreach.ts:1250`). So a lead like
  Macca-Gas — phone present, address null, `place_id` present — is reachable by neither.
- 🔴 **A BUSINESS WITH NO WEBSITE IS A DIFFERENT PRODUCT, NOT A WEAKER PROSPECT.** Gemini cannot
  name a business it has nothing of to read (§5, MK Plumbing 0/10), so the AI-visibility pitch is the
  wrong opening — but for DELIVERY they are the best case (`serveGate` serves `no_website` outright:
  we build the site on our hosting, nothing to migrate). Measured 2026-08-05: **228 of 969 leads
  (23%)** have no website, 49 of them directory-only; total waste to date **36p** of Facebook SEO
  scans + **93p** auditing them.
  - **`isAggregatorUrl`** (`_shared/aggregators.ts` + its SPA mirror `src/lib/aggregators.ts`) is the
    one classifier. `has_website` was a bare `!!lead.website`, so a Facebook-only listing triggered a
    **$0.12 Apify SEO scan against facebook.com**. Fixed in `bulk-jobs` and **both**
    `_shared/whatsapp-inbound` call sites 2026-08-05.
  - The audit batch holds them back **by default, stated with the saving**, overridable. The market
    view lists them **separately**, never hidden.
  - ⚠️ **`outreach_leads.list_type` IS NOT A WEBSITE SIGNAL.** It defaults to `'no_website'` for every
    lead ever added — both `addLead` call sites pass that literal. It is a leftover from the
    website-generation product. The real signal is `website` (raw URL) + `isAggregatorUrl`.
  - ⚠️ **`search_cache.websiteStatus` has TWO confidence tiers and they are different claims:** a
    directory/social URL is **0.95**, a blank Places website field is **0.60** ("may have one"). The
    0.60 tier has never been validated against reality.
  - A **free subdomain is still their own website.** `PLATFORM_PATTERNS` in `search-leads` treated
    `wixsite.com` / `myshopify.com` / `squarespace.com` / `wordpress.com` as NO_WEBSITE — right for
    the old product, wrong for this one. Removed 2026-08-05. `webflow.io`, `godaddysites.com`,
    `weebly.com`, `carrd.co` are arguably the same mistake and are **still there** — Paul's call,
    because removing them changes what lead search returns.
- ⚠️ **`search-leads` has ONE pre-existing `TS2345`** (~line 1379, the supabase-js client generic on
  `performSearchWithExpansion`). Proven pre-existing by `git stash` 2026-08-05 — `deno check` exits 1
  on that file either way. Don't fix it, and don't read the exit code as your own breakage.
- ✅ **AUDIT-ONLY BUSINESSES WORK.** ABLM (`d2008327`) has `lead_id = NULL` and its address lives on
  `ai_audits.business_address`. Paul viewed and printed its playbook. `usePlaybook`'s audit-first
  resolution is what makes this work — do not reorder it.

- 🔴 **TWO DIFFERENT DOCUMENTS ARE BOTH CALLED "PLAYBOOK". This has now caused a near-miss.**
  | | What it is | Where |
  |---|---|---|
  | **`checklist` pill** → `/playbook/:id` | **Evidence-derived.** Citations decide the directories. The document a client receives | `buildPlaybook.ts`, `playbookDoc.ts` |
  | **"playbook"** (LLM) | `generate-playbook` LLM output at `results.playbook`. **This is the broken one** | `supabase/functions/generate-playbook/` |

  Paul pasted an ABLM playbook recommending **Bing Places as a High-priority quick win** with **no Yell**, and
  assumed it came from the evidence pipeline — he was one step from deleting the good one and keeping the
  broken one. **It was the LLM pipeline.** Two independent fingerprints, both checked:
  1. `quickWins` is a field in the LLM function's own output schema (`generate-playbook/index.ts:75`). The
     phrase appears **nowhere** in the evidence path.
  2. The LLM prompt *instructs* it: "Bing Places — foundational" (`:254`), "Bing Places is foundational, not
     optional… a first-tier task" (`:285`). The evidence path mentions Bing **only** in comments explaining
     its removal, and `yell.com` **is** in `directoryFacts` (`:140`, `urlVerified: true`) with the fold sorted
     by citation count — so 6 Yell citations would have surfaced it.
  ⚠️ Searching `-i bing` in the evidence path returns 3 hits that are all literally **plum·BING·**. §4's trap,
  live again. Print the surrounding characters.
- ✅ **AI Audit page decluttered 2026-07-30** (`4fa0246c`). The new-audit form (source picker + business details
  + question review) is now a **modal**; the page is the list plus a "New audit" button. The row's **`Playbook`
  button and grey `playbook` asset pill are GONE** — both were the LLM document. `checklist` KEPT (see above).
  The LLM document is still reachable from an audit's **results** view. `formOpen` is deliberately **not**
  persisted, or a modal would spring open on every page load.
  ⚠️ **`/ai-audit?leadId=…` MUST open that modal.** `setFormOpen(true)` sits in the same branch as `pickLead`
  in the deep-link effect. Break that and the Outreach audit pill lands on a page with no form.

- ✅ **THE PRINTED EVIDENCE DOC NOW MATCHES THE LLM DOC'S LAYOUT** (`a1cc31cc`, 2026-07-30). Section
  order: header → THE PLAN (grouped) → SEO Improvement (add-on) → QUICK WINS → WHERE AI READS → who
  keeps getting named → EFFORT → Timeline & Our promise. Reached by the **Print** button on
  `/playbook/:id`, which existed long before anyone pressed it.
  - **The styling was already shared** — `playbookDocStyle.ts` was extracted VERBATIM from
    `playbookHtml.ts`, and `.prio` / `.lead` / `.pillar` / `.act-steps` / `.qw` were already defined
    and merely unused. Restyling was populating existing classes, not writing CSS. Check before
    assuming a visual difference means the stylesheets differ.
  - **Priority is derived from BREADTH and prints the fact beside it**: "HIGH · 58 of 59 plumber
    audits". HIGH ≥60% of the trade's audits, MEDIUM ≥`EVIDENCE_MIN_AUDITS`, LOW = thin. Paul's rule:
    a badge must be a summary of a visible fact, never a judgement he cannot audit.
  - **`DirectoryFact.steps` — hand-written sub-steps, and NO GENERIC FALLBACK.** A host without steps
    prints an explicit "no written steps yet" line. Generic filler is what made the LLM document
    useless. 7 written (Checkatrade, Yell, MyBuilder, 192.com, Cylex, Thomson Local, Yelp); only 5 of
    them are cited for plumbers, so a trade shows fewer.
  - **The doc says out loud that the ranking is TRADE-LEVEL**, from all audits of the trade, and that
    this business's own citations do not feed it. Two businesses in one trade get the same list.
  - **The SEO section is built from the real stored scan** (`ai_audit_runs.results.seo`) and carries
    **no AI claim at all** — it states the counter-evidence instead. `usePlaybook` now fetches it via
    the report's own `isRenderableSeo` + `aggregateSeoFindings`. The real shape is **2** categories
    (`onPage`, `contentTechnical`), not 9; Macca-Gas's three "N images without alt text" findings fold
    to one "15 images" line.
  - ⚠️ **`.plan` is ~4.5 A4 pages and the shared CSS marks it `break-inside:avoid`.** A browser cannot
    honour that and may push the whole section to a fresh sheet, leaving page 1 half empty. Overridden
    in `playbookDoc.ts`'s own `EXTRA_CSS` (containers flow, atoms protected) — **not** in the shared
    file, so the LLM document is untouched. ~7 pages for 17 tasks, against the LLM doc's 4.
  - **The promise wording is `FINDABLE_GUARANTEE` in `src/lib/findableOffer.ts`** (since
    2026-08-04, WORK-based: audit + work + re-measurement or refund, never the outcome).
    `findable-checkout`'s Stripe line-item description, `playbookDoc` and `clientRequestDoc` all
    render that constant — no local copies. The LLM's
    "We guarantee that…" and "Expect initial visibility improvements within a few weeks" are both
    model output (`guaranteeNote`/`timelineNote`), so they vary per generation and cannot be fixed in
    that pipeline — only replaced by template text in this one.
- Thresholds: `EVIDENCE_MIN_AUDITS 5`, `THIN_MIN_AUDITS 2`, `TRADE_MIN_AUDITS 5`.
- **The ranking is per-TRADE, from every audit of that trade.** `playbook-evidence` folds ALL audits;
  `buildPlaybook` filters to the trade and sorts by citations. `ownCitations` (this audit's own) is a
  separate display-only signal and feeds **nothing**. So a thin trade gets thin evidence, guarded by
  the three thresholds above — not rescued by the business's own audit.
- **`usePlaybook` resolves an id as an AUDIT id first, then a lead.** ABLM has an audit and no
  `outreach_leads` row; lead-first would 404 the only delivery client.
- **`directoryFacts` holds 64 entries, not 66.** Counted 2026-07-30: `host: '` appears 64 times; a naive grep
  for `host:` returns 66 because it also hits the `DirectoryFact` interface and `factFor`. "66" was repeated
  across several sessions and briefs and was never true. Task-capable (`kind: 'directory' | 'trade-body'`, plus
  the one entry with no `kind`, which defaults to directory): **38**.
- **60 of the 64 signup URLs are unverified — only 4 are checked:** Yell, MyBuilder, 192.com (clicked by Paul)
  and Checkatrade (verified by fetch). Earlier notes said "63 of 66" and "only 3 checked"; both were wrong.
  ⚠️ The doc comment at the top of `src/pages/Playbook.tsx` still says "63 of 66" — a comment only, nothing
  depends on it, but correct it when you are next in that file.
- **2 hosts are `townOnly`:** `loughborough.org.uk` (Loughborough) and `cnxlocal.com` (Chiang Mai). In any other
  town they become a prompt to find the local equivalent, never a task.
- **`playbookDoc.ts` must never touch the `generate-playbook` LLM path.** That pipeline recommended ICAEW to an
  ACCA firm, ACCA's own zero-citation directory, and Bing Places. Styling is shared; the data path is not.
- Live operator app: **`https://leadfinderos.pages.dev`**. Supabase ref **`ruusxpkkmwtljxxulhbq`**.

---

## 10. The other docs, and how much to trust them

- **`ONBOARDING.md`** and **`HANDOFF.md`** (untracked, never stage them) describe the **older
  website-generation product line** — barber/salon/plumber site generation, WhatsApp claim flow, Stripe
  add-ons. Still accurate for that machinery, and the best map of it.
- ✅ **`HANDOFF.md` §5 has been marked superseded in the file itself** (2026-07-30). It used to recommend Bing
  Places as "foundational"; Bing Places has **zero citations across 8,913**. The original text is preserved
  there in a collapsed block so the reasoning that went wrong stays visible. §5 of this file is the truth.
- Both name `Claude Opus 4.8` in the co-author trailer. **Use Opus 5** (§3).
- There is **no `DEPLOY.md`** in this repo. Deploy rules are §3 and §4 here.

---

## 11. 🔴 THE PRICE — ONE FLAT £99 SINCE 2026-09-12, PLUS THE HOSTING SUBSCRIPTION

🔴 **THE PRICE MOVED AGAIN ON 2026-09-12: £49.99 → £99, AND THE BUILD IS NOW INSIDE IT.** This
section was written on 09-03 and its first line said "one flat £49.99 … £99 is charged to nobody" —
the exact opposite of today. Read this preamble before anything below it, and treat the rest of the
section as the reasoning rather than the current figures.

**WHAT IS TRUE TODAY (verified against the constants, not the prose):**

| | |
|---|---|
| `FINDABLE_SETUP_PRICE_GBP` | **99** — charged and displayed, one-off, everyone |
| The website build | **included in the £99.** `FINDABLE_WEBSITE_PRICE_ID` is no longer read by `findable-checkout` at all |
| Hosting | **£9.99/month**, `FINDABLE_HOSTING_PRICE_ID`, the only line the tick now adds |
| Continuing work | 🔴 **£29.99/month, AUTOMATIC, `FINDABLE_MONTHLY_GBP`** — a delayed Stripe subscription starting on the results + 14 days. ⛔ This row said "£49.99, OPTIONAL, copy-only, no code path bills it" until 2026-09-14; every clause was wrong. §1 |
| The guarantee | **outcome-conditional**: if the measured number has not gone up at four weeks, they email **within 14 days of their four-week results** and the £99 is refunded (wording of 2026-09-13, §21) |

- ⚠️ **THE SECRET IS NOT DELETED, ONLY UNREAD.** `FINDABLE_WEBSITE_PRICE_ID` still exists in the
  Supabase secret list deliberately: it is the Stripe account's record of what earlier customers
  were charged, and removing it would orphan their invoices. Nothing will add it to a session again.
- ⛔ **DEPLOY ORDER ON 09-12 WAS DISPLAY-BEFORE-CHARGE, because the price ROSE.** findable-site went
  first, so any gap read "shown £99, charged £49.99" — a pleasant surprise. The 09-03 note below
  inverted it for the same reason in the other direction. **Always ask which way the gap
  embarrasses you**; that is the rule, not the order.

<details><summary>THE 09-03 FLAT-£49.99 ERA — superseded by the table above, kept for the reasoning</summary>

**1. THE FOUNDER-VS-FULL SPLIT IS GONE. Everyone pays `FINDABLE_SETUP_PRICE_GBP` = 49.99, one-off,
whatever they arrive from** — their report, the homepage, or a cold link. £99 is charged to nobody.
- **What the split used to do, because it is worth knowing it no longer does:** the price was
  derived PER LEAD — founder when the lead had a **completed audit** and had not paid, full
  otherwise. That rule was **non-forgeable** (you cannot fake having an audit) and separated warm
  from cold arrivals for free. It also cost three queries a render, and it is why a **lead-less
  visitor could not be charged at all** (`no_lead_attribution`).
- ⛔ **`offerPrice()` SURVIVES EVEN THOUGH IT RETURNS A CONSTANT — DO NOT INLINE IT.** Its value
  was never the branching: it is that the plan card and the Stripe session call the SAME function,
  so display and charge cannot diverge. Inlining the constant at both call sites rebuilds the
  two-constants-in-two-repos drift it exists to end. It is **no longer async and takes no database
  handle** (a "just in case" async signature would have left three dead queries' plumbing behind
  and invited someone to put a lookup back without asking why it went).
- **`founderOffer.ts` IS NOW `src/lib/buyOffer.ts`**, `showFounderOffer` → **`showOffer`**, and the
  four pitch constants ("the first 10 at £49.99", "normally £99") are deleted along with the report's
  offer block, which was already unrendered. ⚠️ **Some comments still name the old file and the
  deleted constants** — `useDashboardMetrics.ts`'s sync note is one. Grep, don't trust the prose.
- **SIGN-UP NO LONGER NEEDS A `?lead=` TAG.** With no lead the pre-payment screen asks business
  name, trade and town **and only then** (a tagged visitor already has all three; re-asking implies
  we lost their details at the moment they decide to pay). `findable-onboarding`'s lead-less branch
  gained a **`signup` source** that creates the lead through the SAME `createFreeCheckLead` — same
  dedupe, same fail-closed reads, same three-guard place resolution — **skipping the free-check
  daily cap**, because refusing someone trying to PAY on a guard against strangers' free checks
  turns a spend cap into a lost sale. It fires no free audit; the paid baseline measures instead.
  The **trade is not vanity data**: `startPaidBaseline` refuses with `no_business_type` without one
  on the lead, so asking after payment would mean selling a guarantee we cannot measure.
- `paid_for` was "Findable - Setup + first 2 months" (wrong for a one-off) → **"Findable - AI
  visibility, first cycle"**.
- ⛔ **DEPLOY ORDER INVERTED ON PURPOSE, AND THE RULE IS THE PRINCIPLE, NOT THE ORDER.** §11's rule
  below says display before charge — right when a price **RISES**. This one **FELL**, so charge went
  first and the gap read "shown £99, charged £49.99", a pleasant surprise. Reversed, it would have
  shown £49.99 and charged £99. **Ask which direction the gap embarrasses you in.**

**2. RECURRING BILLING EXISTS NOW — the website add-on, £49.99 build + £9.99/month hosting.** The
"scoped but not built" note further down is superseded; what it flagged as the real blocker was
right and was fixed here.
- **THE TICK IS READ FROM THE ROW, NEVER THE REQUEST.** `onboarding_responses.website_addon`, saved
  at submit; `findable-checkout` reads it **from that row** and never from its own body. The
  standing rule on that endpoint is that **the browser never decides money** — there is no parameter
  through which a discount can be asked for, and there must be none through which a £59.98 upsell
  can be either. It is also what makes the row the record of what the customer bought, which
  delivery reads and a receipt must still agree with months later. **Strictly `=== true`**: null,
  absent, `"false"` and `0` all mean not ticked — absence is never a purchase.
- **THE SESSION.** `mode: "payment"` cannot carry a recurring price, so a ticked checkout becomes
  **`mode: "subscription"`** with three lines — AI £49.99 one-off, build £49.99 one-off, hosting
  £9.99/month — and Stripe bills the one-offs on the first invoice. One card entry, **£109.97
  today, £9.99/month after**. Unticked is unchanged.
- ⛔ **THE AI LINE STAYS INLINE `price_data`, AND THAT IS THE GUARANTEE'S ONLY CARRIER.** It is the
  only branch with a `description`, and the description is `FINDABLE_GUARANTEE` verbatim — a
  dashboard Price ID would drop the guarantee text silently (the `FINDABLE_SETUP_PRICE_ID` trap
  recorded below). The two new lines use **Price IDs precisely because they carry no guarantee to
  lose**: Paul's decision — the guarantee is AI-visibility only, the build is a delivered product,
  hosting is a cancellable service. **If it is ever claimed: refund the £49.99 AI portion and cancel
  the hosting; do not refund the build.**
- ⛔ **THE ADD-ON PRICES LIVE IN STRIPE, NOT IN THIS REPO** — `FINDABLE_WEBSITE_PRICE_ID` and
  `FINDABLE_HOSTING_PRICE_ID` are secrets holding Price ids, so **no script can check those two
  amounts**. They are a third and fourth hand-kept copy alongside the Payment Link.
- 🔴 **BOTH IDS WERE FIRST SET TO PRODUCT IDS (`prod_…`) AND THE WHOLE CHECKOUT DIED** — Stripe 400
  `resource_missing`, "No such price", a dead Buy button at the moment someone decides to pay. The
  dashboard shows a product's id far more prominently than its price's and the two look alike, so
  **this is the expected paste error, not an unlucky one.** An unusable id is now treated as an
  **unset** one: the add-on drops and the AI line still sells (a customer who wanted a website and
  got only the audit is a phone call; one who could not pay at all is gone). The refusal names the
  **SHAPE** of the bad value ("a PRODUCT id (prod_) — needs the PRICE id") and never its contents.
- **THE WEBHOOK GAINED THREE EVENTS THAT DID NOT EXIST**: `invoice.paid`,
  `invoice.payment_failed`, and Findable branches on `customer.subscription.updated/deleted`.
  Before this a Findable subscription event was **invisible** — both subscription handlers read
  `metadata.generated_site_id` (the BARBER product) and `setPaid`'s empty-id guard logged "skipped",
  so a renewal, a dead card and a cancellation were all silent. The barber path is untouched; the
  discriminator is which metadata is present.
  - ⛔ **THE LEAD IS RESOLVED BY `stripe_subscription_id`, NEVER BY METADATA. An INVOICE does not
    inherit subscription metadata**, so keying on metadata would have worked for the subscription
    events and **silently failed for the renewals — the ones that matter.**
  - ⚠️ **`past_due` IS DELIBERATELY NOT CANCELLED.** Smart Retries is still running: that customer
    has a card problem, not a decision.
  - The Stripe ids are written in a **separate non-fatal update after the payment** — the payment
    write must never be able to fail on a column newer than itself.
- ⛔ **`paid` NEEDED TWO REFINEMENTS AND THE OLD EXACT-MATCH TILE WOULD HAVE HIDDEN AN ADD-ON
  CUSTOMER** (`useDashboardMetrics.ts`, pinned by `scripts/paying-customer.test.ts`):
  1. **A FLOOR, NOT AN ENUMERATION.** The tile matched `amount_paid` against `[49.99, 19.99]`
     exactly, so £109.97 vanished — a paying customer reading as no sale. It is now **at or above
     `PAYING_FLOOR_GBP`**, which is **derived** (`Math.min` of the current and historical prices),
     never typed. Enumerating valid totals (49.99, 99.98, 109.97, …) fails invisibly the first time
     an add-on, discount or proration lands outside the list.
  2. **CHURN IS A POSITIVE MATCH ON `canceled` / `incomplete_expired`** (`DEAD_SUBSCRIPTION_STATUSES`).
     `paid = amount_paid > 0` is one scalar and cannot express "bought once, hosting since
     cancelled". ⚠️ **Absent is NOT cancelled** — a one-off customer has no subscription and no
     status at all and must keep counting, so it is never `!== 'active'`.
- ⚠️ **`decideGuarantee` NOW COMPARES AGAINST A PRICE THAT HAS FALLEN TO THE EXACT AMOUNT THAT USED
  TO MEAN "LEGACY".** `src/lib/baselineContract.ts` decides the outcome-vs-work guarantee from
  `paid < currentPriceGbp`; that was written when the current price was £99, so "below current" meant
  **the legacy £49.99 sale**. At a flat £49.99 a legacy £49.99 client whose contract is written
  **from now on** grades as `work` instead of `outcome`. Frozen contracts are unaffected (it is
  decided ONCE at baseline time, deliberately), and RG at £19.99 still grades `outcome` — so this is
  a latent fault, not a live one. **Before relying on either paying client's guarantee kind, read
  the STORED contract rather than re-deriving it.**
- ✅ **STRIPE'S OWN RESPONSE IS THE ONLY WAY TO VERIFY AN ITEMISATION.** `amount_total` is now
  recorded from the create-session response (non-fatal, written after the session exists). The
  hosted page is a JS-rendered shell — fetching it yields no amount, no line items and not even the
  product name (§6 records the same finding when the guarantee's length was checked). That is how
  the mixed one-off + subscription shape was finally confirmed: ticked `mode=subscription`
  `amount_total 10997`, unticked `mode=payment` `4999`. **From Stripe, not from our arithmetic.**
- ✅ **A REFUSED CHECKOUT IS NOW DIAGNOSABLE: refusals land in `client_error_reports`**, not only
  `console.error`. **The CLI has no `functions logs` subcommand**, so without a table there is
  nothing to read afterwards — a payment Stripe rejected left one edge-log line and a bare
  `checkout_failed` at the client. §4's "a catch-all error message is worse than no message", on
  the one path carrying all the revenue. The message is **stored, never returned**.

</details>

---

<details><summary>THE FOUNDER-PRICE ERA (£19.99 → £49.99, 2026-08-12) — superseded by the flat price above, kept for the reasoning</summary>

- ✅ **THREE CODE CONSTANTS, AND ONE COMMAND PROVES THEY AGREE.** `FOUNDER_PRICE_GBP`
  (`_shared/offer-price.ts`, **CHARGED**), `FOUNDER_OFFER_PRICE_LABEL` (`founderOffer.ts`, what the
  report SAYS), `FOUNDER_PRICE_GBP` (`useDashboardMetrics.ts`, what is COUNTED). Run
  **`node scripts/check-cross-repo-sync.mjs`** — it fails on any drift and passed 8/8 at 49.99.
  ⚠️ Two of those three have since moved: the label constants are deleted and `founderOffer.ts` is
  `buyOffer.ts`. The script now runs **9 checks** and still guards the price and the guarantee.
- ⛔ **TWO COPIES NO SCRIPT CAN REACH, AND BOTH ARE PAUL'S BY HAND:**
  1. **The Stripe Payment Link** (kept for sending manually on WhatsApp) — its amount AND its
     description. A stale amount here means a hand-sent link charges the old price.
  2. **The Meta-registered `re_engage` template.** The string in `_shared/whatsapp-send.ts` is
     DISPLAY-ONLY — Meta renders the real message from its own copy.
     ✅ **THE £19.99 DRIFT IS CLOSED — re-registration CONFIRMED by Paul in WhatsApp Manager,
     2026-08-17.** The registered body is the £49.99 version; re_engage is cleared for sends.
     ⚠️ **A smaller display drift replaced it:** Meta's registered wording says "A few quick
     questions and we're up and running" where the code's Inbox display copy says "Five quick
     questions and we're started". Affects only what the OPERATOR reads in the transcript, never
     what the prospect receives. Fix by pasting the full registered body from WhatsApp Manager
     into `reEngageBody` — do not guess the rest of the wording from the one confirmed sentence.
     The lasting rule stands: this copy changes at Meta BY HAND whenever the price moves.
- ⚠️ **THE DASHBOARD FOUNDER TILE WENT 1 → 0 AND NOTHING IS WRONG.** It counts leads whose
  `amount_paid` matches the CURRENT constant within a penny, so RG Locksmiths (£19.99, the only
  payment ever taken) stopped counting the moment the constant moved. No data changed. If that tile
  should count every founder-era sale it needs a list of historical prices, not one constant —
  Paul's call, deliberately not made here.
- ✅ **Checked before changing it: no lead has EVER been charged £49.99** (exactly one lead has a
  non-null `amount_paid` at all). So the new value sweeps nothing historical into that counter —
  which mattered, because the comment there used to justify the exact match by saying it kept out
  "the £49.99 quote that predates this offer". That reasoning inverted; the comment was rewritten
  rather than left to mislead.
- ⛔ **DEPLOY ORDER IS A PRICE GUARD, NOT A PREFERENCE: DISPLAY BEFORE CHARGE.** `render-audit-report`
  and `findable-onboarding` show the price; `findable-checkout` takes it. Deploy the display pair
  FIRST and the gap reads "shown £49.99, charged £19.99" — a pleasant surprise. Reverse it and the
  gap is "shown £19.99, charged £49.99". Same rule the `serverPriceLabel` comment in findable-site
  states for the fallback.
- ⚠️ **NINE FUNCTIONS CARRY THESE VALUES, NOT THREE** — the shared-file trap (§4) in its most
  ordinary form. Walked from each `index.ts` following relative imports:
  `create-ai-audit`, `findable-checkout`, `findable-onboarding`, `process-ai-audit-queue`,
  `process-sms-queue`, `process-whatsapp-queue`, `render-audit-report`, `send-whatsapp-message`,
  `whatsapp-status`. Two more — `instantly-push`, `run-seo-scan` — reach `founderOffer.ts` **only
  through `import type`, which is erased at build**, so they carry no values; they were redeployed
  anyway because over-deploying is free and the recorded failure is always the other direction.
- 🔴 **AND THE MONTHLY IDEA IS SCOPED BUT NOT BUILT.** ⛔ **BUILT 2026-09-03 — the block at the top
  of §11 is the current record; this bullet is history.** It called the real blocker correctly: the
  one-scalar `paid` problem is exactly what the floor + churn rules answer.
  Recon 2026-08-12: `findable-checkout` creates
  a ONE-OFF session (`mode: "payment"`). Subscription code exists but belongs to the BARBER product —
  `customer.subscription.*` reads `metadata.generated_site_id` and flips `generated_sites.is_paid`.
  For Findable there is **no `invoice.paid` handler** (so renewals would be invisible) and **no
  Stripe identifier persisted anywhere** (no customer id, subscription id or status on any table).
  ⛔ The real blocker is not Stripe: **`paid = amount_paid > 0` is a single scalar** (§6, §6d) and
  cannot express "upfront + monthly, still active" — a churned customer keeps `amount_paid > 0` and
  reads as paying forever. Decide that before any subscription work.
  ⚠️ Also unresolved: `paid_for` is written as **"Findable - Setup + first 2 months"**, so today's
  one-off already claims two months; and the guarantee's "or a full refund" is byte-locked across
  both repos and becomes ambiguous the moment billing recurs. (`paid_for` was fixed 2026-09-03; the
  refund ambiguity now has an answer — refund the AI portion, cancel hosting, keep the build.)

</details>

---

## 12. ✅ THE SITE ORIGIN — an allowlist is not an address book (2026-09-03)

🔴 **THE SAME CATEGORY ERROR IN TWO PLACES, AND ONE OF THEM WAS SENDING REAL PROSPECTS TO A PREVIEW
DOMAIN.** Both read **`FINDABLE_ALLOWED_ORIGINS[0]`** — the first entry of findable-checkout's **CORS
allowlist** — as the canonical public address. An allowlist answers *who may call us*; **the order of
its entries is nobody's deliberate decision**, and it legitimately contains preview hosts.

- **Measured across all 47 onboarding links ever sent: 27 went out on `findable-site.pages.dev`, and
  every one of those was SERVER-BUILT** (re_engage ×19, onboarding_followup ×3, 5 others). The 20
  reading `findable.live` were all hand-typed by the operator. **The most recent server-built link
  reached a real prospect on 2026-08-31.**
- **The second site was worse: `findable-checkout`'s `CANONICAL_ORIGIN`**, which becomes Stripe's
  `success_url` / `cancel_url` — **a paying customer landing back on a preview domain the instant
  they finish paying.**
- ⛔ **AND CORS DID NOT PROTECT IT.** `Access-Control-Allow-Origin` is `*`, so the browser POST
  succeeds from any origin — meaning **"payments work from findable.live" was never evidence that
  findable.live is IN the allowlist.** If it is absent, the trusted-origin test failed for every
  real payer and all of them fell through to the constant. The secret's value cannot be read (the
  CLI returns hashes), which is the reason not to depend on it at all.
- **The fix: one shared `resolveSiteOrigin`**, `FINDABLE_SITE_ORIGIN` first — proven to be exactly
  `https://findable.live` by hashing candidates against the stored digest — folded into the allowed
  origins so a findable.live payer matches at the first test whatever the CORS list holds. A
  trusted REQUEST origin still wins, so localhost and Pages testing return where they are.
- ⛔ **THE FALLBACK REFUSES RATHER THAN GUESSES.** It skips hosts that cannot be a public home
  (`pages.dev`, `workers.dev`, `supabase.co`, localhost) and **returns null** when nothing
  qualifies. A refusal is loud — the senders already decline with "the onboarding link base is not
  configured" — whereas **a plausible preview URL is silent and reaches a customer.** The PRIMARY
  variable is still trusted as set, including its host: pointing it at a preview deliberately is a
  decision, and overriding it would make the variable a lie.
- ⚠️ **THE COMMENT WAS THE BUG.** Both files carried prose asserting the first allowlist entry
  "becomes canonical". That sentence was not a description of the behaviour, it was the belief that
  produced it. `scripts/site-origin.test.ts` pins all eleven shapes (**Deno, not tsx** — it reads
  `Deno.env`); the third case is the exact fault.
- ⚠️ **Swept at the same time: five onboarding-link builders exist** (three functions + two static
  hrefs) and four were already correct. When one of these is wrong, check the other four.

---

## 13. ✅ THE REPORT'S "GET STARTED" BUTTON — the only CTA in the document (2026-09-03)

`render-audit-report` had always computed `/onboarding/<slug>/?lead=<leadId>` and **thrown it away**
since the offer block was stripped on 2026-09-02. The existing "Want us to fix this?" CTA now leads
with it.

- **This is where outreach clickers actually land: all 16 leads sent `audit_result_hook` opened
  their report, 16 of 16.** So the button catches them with **no change to the Meta-approved
  template.**
- ⛔ **NO URL → NO BUTTON, and it is a price guard as much as a link.** `showOffer === true`
  strictly, so a paying customer is never invited to start again, and an unset value shows nothing.
  (Under the old founder split the `?lead=` was what made the report quote the founder price; the
  flat price has removed that particular hazard but not the rule.)
- **No price on the button** — the pitch was deliberately removed from this document, and the
  onboarding page states the price itself.
- Verified live: Luna Locksmiths (unpaid, hook cohort) renders **Get started** →
  `findable.live/onboarding/<slug>/?lead=…`, and RG Locksmiths (paid) renders the same CTA with
  **no button at all**.
- **Deployed for it:** `render-audit-report`, `process-whatsapp-queue`, `send-whatsapp-message`,
  `process-ai-audit-queue` — the transitive closure, walked by following relative imports.
  `apply-seo-paste` and `notify-onboarding-submit` matched a grep **in comments only** (§4).

---

## 13b. ✅ THE REPORT'S QUESTION PAGES ARE OPERATOR-ONLY, AND THE CTA (2026-09-12)

- ⛔ **THE PER-QUESTION PAGES ("page 2") NO LONGER GO TO A PROSPECT — GATED ON `internal`, NOT
  DELETED.** `QUESTIONS_PER_PAGE` is 3, so a 12-question baseline added FOUR full sheets after the
  CTA and read as clutter on the document that asks for the sale.
  - 🔴 **DELETING THEM WOULD HAVE SILENTLY TAKEN THE ONLY WINNABILITY VIEW IN THE PRODUCT.**
    `winBlock` renders only inside a question card; nothing else renders it. A block that renders
    nowhere is not a compile error — the same trap that left `FINDABLE_GUARANTEE` imported and
    unrendered for ten days on this very file.
  - ⛔ **THE POINTER SENTENCE IS GATED ON THE SAME CONDITION AS THE PAGES.** It used to be gated on
    the DATA existing while the pages are gated on `internal` — two conditions for one promise, so a
    prospect report would have said "listed on the next page" with no next page.
  - ⚠️ **THE COST, STATED AND ACCEPTED (Paul):** those cards were the ONLY place the report showed
    which SOURCES each engine read. Page 1 carries no citations at all, so a prospect no longer sees
    them anywhere. If that is revisited, the fix is a sources summary on page 1, not un-gating.
  - ✅ Nothing else depends on the pages: the before/after and re-measure comparison read QUEUE ROWS
    (`compareMeasurements(QueueRowLite[])`), never `questionBreakdown`, whose only consumer is this
    renderer. No test asserts page-2 content.
- **The CTA is "Ready to get found?"** — three steps, the explainer line, and Get started / See how
  it works / WhatsApp me, over the byte-locked `FINDABLE_GUARANTEE`.
  - ⛔ **IT MUST READ CORRECTLY WITH NO "Get started" BUTTON**, which is the common case: `offerUrl`
    is set ONLY by `render-audit-report`, so the in-app preview, the PDF, the before/after iframes
    and the welcome pack all render without it. The copy names only the two buttons that always
    render, and the three steps describe what WE do rather than steps the reader takes.
  - ✅ **THE EXPLAINER LINE POINTED AT NOTHING FOR A FEW HOURS, AND THE VIDEO IS NOW ON THE SITE.**
    `/media/findable-hook.mp4` served a clean 200 `video/mp4` while **nothing embedded it** — zero
    `<video>` elements, zero iframes, no reference on the home page; it existed only as the WhatsApp
    template's header asset. findable-site now has **`Explainer.astro`, a `section#video` above
    Pricing** (native `<video>`, no autoplay, `preload="metadata"`, `playsinline`, capped at 340px
    wide because the file is 1080×1920 VERTICAL and would otherwise render ~1100px tall).
    **If that section is removed, the report's CTA line must go with it.**
  - ⛔ **THE LENGTH IS CLAIMED ON THE SITE AND NOWHERE ELSE, AND THAT SPLIT IS THE POINT.** The CTA
    said "the two minute explainer"; the file is **49 seconds**. The report now claims NO length
    ("Watch the explainer") because it deploys from a different repo to the video it describes, so a
    number there goes stale the moment the cut changes with nobody standing next to it. The site
    heading says "under a minute" — true at 49s, and directly above the player, where a re-cut
    cannot happen without seeing it. **Re-cut past 60 seconds and that heading is the line that
    becomes false.**
  - ⚠️ **The trade/town subject line was deleted with the old CTA, and its MEASUREMENTS are kept as
    a comment** where it stood: `businessType` is stored PLURAL on 649 of 778 audits (83%), so
    `${article(t)} ${t}` printed *"a Locksmiths in Ashby-de-la-Zouch"* on four reports in five. Any
    future CTA naming a trade needs that rule back.
  - **Deploy list: `render-audit-report` ONLY** — re-walked 2026-09-12 by real `from "…"` statements;
    no `_shared` module reaches `aiAuditReportHtml.ts`.

---

## 14. ✅ THE CAMPAIGN CARD — what each message actually did (2026-09-04 → 09-07)

**One funnel you can read in a second (Reached · Replied · Paid) over a table with ONE ROW PER
MESSAGE.** `src/hooks/useCampaignStats.ts` + `src/lib/templateAttribution.ts` +
`src/lib/armComparison.ts`, all pinned by `scripts/template-attribution.test.ts` and
`scripts/arm-comparison.test.ts`.

- ⛔ **"REPORT OPENED" WAS DELETED TWICE ON A TRUE PREMISE AND A WRONG CONCLUSION.** Both
  AuditFunnelCard and CampaignStatsCard recorded "our own opens are indistinguishable from a
  prospect's **and always will be**". The premise holds — the operator opens the SAME URL
  (`findable.live/report/<auditId>`) so a preview bumps the same counter, and `first_opened_at` is
  coalesced so a preview permanently owns the first open. **What nobody had done was compare that
  timestamp against the moment the link was SENT.** Measured over 427 opened audits belonging to a
  lead: **371 first-opened AFTER the link went out, 1 before, 55 never sent a link.** It separates
  cleanly, retroactively, with no new tracking. "Always will be" was the only part that did not hold.
- ⚠️ **MY OWN FIRST DERIVATION OF IT WAS WRONG IN A WAY THAT MATTERED: THREE TEMPLATES CARRY A
  REPORT LINK, NOT ONE.** `audit_reply` (`url`), `audit_result_hook` and `free_check_result`
  (`audit_url`) — and `audit_result_hook` is the template that BECAME the outreach hook. Re-derived:
  links sent **577 → 653**, opened **366 → 408**, unattributable **55 → 13**. Most "unexplained"
  opens were simply leads sent their report by the newer hook. **`REPORT_LINK_TEMPLATES` (now four
  entries, with `audit_reply_warm`) does not throw when a new template is missed — it silently
  understates the rate.**
- **The open rules, so the denominators agree with the rest of the card:** `isRealSend` on every
  send (a send Meta refused is not a link sent); the denominator is **links sent, not Reached** (you
  cannot open a report you were never sent); the **EARLIEST** link send, so re-sending cannot
  invalidate an open that already happened; **unique audits opened, never `open_count`** (no
  per-open log exists — summing would report 933 "people" against 433 audits); a **60s slack**
  because the send receipt is Meta's clock and the open is ours; opens on leads never sent a link
  are **excluded and surfaced as "(+N not attributable)"**, never dropped; a row renders only once a
  link has gone out ("0 · 0% of 0" reads as a broken tile); `ai_audits` read through `fetchAllRows`
  selecting four columns.
- ⛔ **THE PER-TEMPLATE REPLY METRIC IS LAST-TOUCH, AND THE OLD ONE WAS DELETED FOR A GOOD REASON
  THAT DOES NOT APPLY TO IT.** The old "replied" meant *has this lead ever replied* intersected with
  each template's lead set, so **every row claimed the same replies**. Last touch — a reply belongs
  to the newest real send before it, and any inbound closes the run — measured over the whole book:
  **757 credited pairs, 725 unambiguous, 32 contested.**
  - **"Contested" has an exact meaning**: two or more DIFFERENT templates went out with no reply
    between them, so nobody can know which earned it. It is **concentrated, not spread** —
    `initial_contact` 0 of 530, `contact_followup` 20 of 20, because a chase only exists when the
    opener got no answer. So the count sits **on the row that has it**, as a required field on the
    type: a 26% chase rate shown as cleanly as a 52% opener rate is the misleading half.
  - Per-template opens are the difference the campaign-level number hid: **`audit_reply` 63% vs
    `audit_result_hook` 46%.**
- ⛔ **SITE VISITS AND SIGN-UPS: `lead_page_hits`, and the hook is `prefill`.** Reaching the sign-up
  page was recorded NOWHERE — report opens are on `ai_audits`, submissions are
  `onboarding_responses` rows, and the landing between them was invisible, which is the entire gap
  for a template whose goal is clicks rather than replies. `findable-onboarding`'s `prefill` already
  fires once per page load with the lead id, and it is a read, so the insert is **fire-and-forget in
  a try/catch** — a missing table, an RLS surprise or any Postgres error costs the visitor nothing.
  Logged **BEFORE** the `already_client` gate: a paid customer returning is still a real visit, and
  gating it would make the metric mean something other than its label.
  - **`SITE_TRACKING_START = 2026-09-06T00:00:00Z` — the midnight AFTER the hook went live, not the
    deploy day.** The table does not exist until the SQL runs, so that day's earlier sends could not
    have produced a hit however fast it happened, and dividing by them prints a confident low rate on
    day one — the first number anyone looks at. Costs one day of history. (London is UTC+1 in
    September and the send window is 07:00–21:30 London, so the boundary cannot split a send day.)
  - ⛔ **THE NUMERATOR IS GATED BY THE SAME WINDOW — caught before shipping.** A lead sent last month
    who lands tomorrow is credited to that template, but its send is not in the tracked set, so the
    visit would divide by a denominator it was never part of and **the rate could exceed 100%.**
  - **Free-check submissions are excluded from per-template sign-up credit** (12 of the 22 onboarding
    rows on file are free checks — crediting one to a template credits our outreach with a visitor
    who arrived on their own). The campaign-level "started" deliberately still counts them.
  - ⛔ **THREE STATES, NOT TWO: tracking unavailable / tracking live but this template not sent since
    it began / a real measured rate.** Only a genuinely successful read sets the ready flag, so the
    RLS 200-with-`[]` trap reads as "not tracked" and never as "nobody clicked". Website clicks for
    other destinations remain untracked and the column **says so once** rather than printing 0.
- ⛔ **THE COLD-VS-WARM A/B IS INTENT-TO-TREAT, AND IT IS ITS OWN BLOCK, NOT EXTRA COLUMNS.** The
  per-template columns use **last touch** — the right answer to "which message earned this click" and
  the **wrong** answer to "does warm convert better", because any message sent in between takes the
  credit. Measured first: for the two arms it has never yet happened (0 of 124 arm leads got a later
  template, 0 got both arms), but `audit_reply` shows **30 of 577 (5%)** getting a later template —
  at A/B sample sizes a 5% leak decides it wrongly.
  - **The arm is a property of the LEAD**, so every later visit or sign-up counts for the arm it was
    sent, whatever went out afterwards. **The FIRST exposure defines the arm**, so a resend cannot
    move the clock past events it already caused.
  - **A lead sent BOTH arms is excluded from both, and the count is shown** — it is in both
    populations so it can answer neither, and assigning it to the newer arm would flatter whichever
    template was introduced second, which is always the one being tested.
  - **TWO DENOMINATORS, deliberately**: opens and sign-ups have always been recorded, visits only
    since the prefill hook. One denominator would understate visits by every earlier send.
  - It renders **only once an arm has a lead** — two rows of dashes is noise, and a 0% on an unsent
    arm reads as "warm does not work". Both views are honest and answer different questions; merging
    them into one table would leave the first person who compares them no way to know why they
    disagree.
- **Barber-era leftovers removed:** the Site/Audit/Service badge and five barber templates (moved to
  a **label-only legacy list** — 71 of those messages really were sent, 70 on archived leads).
  ⚠️ **Shrinking the sendable allowlist had one real hazard, handled:** `CampaignFormDialog`
  VALIDATES a stored `default_template` against it and two live campaigns still store
  `booking_switch_barbers`, so opening that dialog and pressing Save **would have rewritten their
  template to null**. It now preserves an unrecognised stored value and shows it as legacy.
  `AdminSiteManage` keeps the full list deliberately — it is the old barber admin screen.
- ⚠️ **The header note on `CampaignStatsCard` still says the open metric could not tell the
  operator's opens apart. Left exactly as written** — it is the record of what was wrong, and the
  comment beside the new row is the record of what changed.

---

## 15. ✅ THE FREE-CHECK LANE IS LIVE END TO END — and every fault in it was a lie the operator was told (2026-09-03 → 09-07)

⛔ **§6j's "PHASE 2 (AUTO-AUDIT) IS DELIBERATELY NOT BUILT" IS SUPERSEDED. It is built, it fires, and
the result is emailed to the visitor.** Read this section over §6j where they disagree.

- 🔴 **THE TOWN GATE REFUSED EVERY AUDIT FOR A BUSINESS GOOGLE CANNOT FIND.** The auto-audit was
  wired correctly and did fire — it was refused one call later, silently. No place_id → no
  derived_town → `townVerdict` settled-unverifiable → `create-ai-audit` returns **409
  `town_unverified` BEFORE it reads `location_text`**. Measured 4 of 4, no exceptions: the two
  businesses Google resolved got an audit, the two it could not got a lead, an email telling Paul to
  do it by hand, and nothing else.
  - ⛔ **THE GATE WAS RIGHT ABOUT PROSPECTING AND WRONG HERE.** It exists because an audit against
    an INFERRED town cost two prospects (§6b) — but **a free-check visitor TYPES their trade and
    their town, and that is better evidence than a derived one, not worse.** And a business Google
    cannot find is precisely the customer who most needs telling that AI cannot find them either.
  - **The exemption is `town_confirmed`, INTERNAL ONLY**, mirroring `isBaseline`: every other caller
    that passes `location_text` builds it from `search_location || address`, which is inferred, so a
    flag any caller could set would disable the gate everywhere. A browser cannot reach it.
- ⛔ **THE DEDUPE MERGED DIFFERENT BUSINESSES, AND TWO OF ITS THREE RUNGS COLLIDE BY NATURE.**
  Measured over 3,192 real leads: **87 exact business names are shared** (4 provably different
  businesses — "Timpson" is in Blyth AND Wisbech; "Fletcher Lock & Safe Co" is two different shops
  both in Sunderland) and **105 phone numbers are shared, 29 across different names** — worst is
  Timpson's national switchboard on **15 leads across 8 towns**. And the read was
  `.limit(1).maybeSingle()`, so **which business a prospect got attributed to was a coin toss.**
  - **The consequence compounds**: no lead of their own → the per-lead 7-day guard refuses to audit
    them **because a STRANGER was audited recently** → no report at all → and the Outreach row
    carries someone else's name.
  - **Name and phone now require the town to agree AND exactly one candidate to survive**
    (`_shared/same-business.ts`). Two in the same town **refuses** — that is Fletcher, which the town
    rule cannot solve and must not guess at. **`place_id` stays exempt**: it identifies the business
    itself and is the only thing separating Fletcher's two branches; ties resolve to the **oldest**
    lead deterministically.
  - **Ambiguity creates a NEW lead** (Paul's rule: for a free check, running fresh beats matching
    wrongly). ⚠️ **That is only safe because of the phone-history seatbelt** — the queue refuses any
    cold template for a number with prior history whatever lead row it arrives on. Without it this
    would trade a mis-attribution bug for a spam bug.
  - ⚠️ **THE FIRST DRAFT WAS TOO STRICT AND THE REPLAY CAUGHT IT.** Comparing only `derived_town`,
    "sinners and saints" failed: Google's derived town is **"Muang"** (the district) while
    `search_location` is "chiang mai". Every genuine repeat would have forked a second lead and paid
    for a second audit. It now accepts **any town evidence the lead carries** — derived_town,
    search_location, or the town appearing in the address as a **whole token run, never a bare
    substring**. Replayed over all 13 real free-check submissions: **3 change, and they are exactly
    the three wrong ones.**
- 🔴 **THE OPERATOR EMAIL ASSERTED THINGS IT HAD NEVER CHECKED, TWICE, AND BOTH COST REAL TIME.**
  1. It said *"nothing has been sent to them automatically… add them to the WhatsApp queue when you
     are ready"* **on every free check**, including ones where an audit was running and a result was
     on its way. Standing copy from before the auto-audit existed — **it convinced Paul the funnel
     was broken when it was working.** It now reads the state and says one of four true things:
     result sent (naming the address) / audit running (how long, how many runs) / **finished but
     unsent** / no audit at all **with the recorded reason**. The last two also push into the red
     "Needs you" box. "Running" and "finished but not sent" are deliberately separate — calling the
     second one running is the same lie in a new place.
  2. **It claimed a FOUR-DAY-OLD audit as this submission's** (2026-09-07, "the glue pot"): it read
     `ai_audits` by lead_id with **no time bound** and took the newest. The lead had deduped onto a
     test lead, the audit was correctly skipped as "already audited within 7 days" — **and the
     branch that would have said exactly that was never reached, because an old audit outranked the
     absence of a new one.** §8's rule again: *a guard is no use if the case it guards cannot arrive
     at it.* The lookup is now scoped to audits created **at or after this row** (ordering makes a
     timestamp sufficient — the row is saved before the lead and the audit), with a **60-second**
     backward tolerance for same-request jitter. The wording also names the matched lead now:
     without it, "already audited within 7 days" reads as though THEY were audited last week.
- 🔴 **AND THE RESULT NEVER REACHED A MATCHED LEAD AT ALL.** `maybeSendFreeCheckResult` gated on
  `lead.enrichment_source !== "free_check"`, but `createFreeCheckLead` only stamps that column on
  the **INSERT** path — so a submission that MATCHED an existing prospect kept the lead's null and
  was refused as "not a free-check lead". **Every free check from a business already in the book ran
  its audit and told them nothing.** The gate moved onto the **SUBMISSION row** (did somebody fill in
  the free-check form for this lead), which is true for matched and created alike. The lead's
  provenance column was never the right question — it says how the lead got into the book, not why
  we are emailing today. **Still fails closed: no submission, no send.**
- ✅ **THE PROGRESS CARD — `src/lib/freeCheckProgress.ts` (pure, tested) + a `submissions` action.**
  Every fact needed to answer "is it running, done or failed" was already stored across six tables
  and surfaced on no screen. The endpoint returns FACTS and computes no verdict (the coverage split).
  - ⛔ **STRANDED IS ITS OWN STAGE, and it is the one this was worth building for.** An audit whose
    runs have all settled with no result sent **will never retry** — the send fires only from the
    tick that finalises a run. It looks finished and is not. Two real submissions were sitting in
    exactly that state, 3 of 3 runs and 15 of 15 questions, invisible everywhere.
  - **Absences are named, never defaulted**: no lead ≠ "audit pending"; no audit distinguishes a
    **recorded** skip from a silent one; an audit with no runs reads "never started". A failed READ
    says so — an empty array here would otherwise claim the free check has never been used.
  - Polling is conditional: every 20s **only while something is genuinely mid-flight**.
- ⛔ **"SENT" IS NOT "DELIVERED", AND THE STAMP USED TO MEAN NEITHER.** `notify_sent_at` was written
  **BEFORE** the Resend call and never updated, so it only ever meant *we decided to send* — and the
  dashboard read it as "Result sent". **An email Resend refused rendered green.** The stamp is now
  patched after the send with `email_status` (accepted / failed / attempting), the provider message
  id and the error; the claim still goes FIRST, because claiming before sending is what makes the
  send happen at most once. Two stages came out of "complete": **EMAIL FAILED** and **SEND UNKNOWN**
  (claimed, outcome never written); an older row with no outcome says "claimed — outcome not
  recorded" rather than borrowing the good news.
  - ⚠️ **"ACCEPTED" IS THE HONEST WORD: a 2xx means Resend took the message.** Whether a mailbox
    received it lives only in Resend's delivery events and **is not in this database.** Measured:
    19 rows carry the stamp and **not one carries a provider error**, so from our side every email
    has always "worked" — which is exactly why the word must not overclaim. WhatsApp is different
    and does carry a real receipt.
- ✅ **AN OPERATOR RESEND EXISTS, AND IT DOES NOT WEAKEN THE ONCE-PER-AUDIT GUARD.** `force` is set
  only by that action, the previous stamp is left in place, and the automatic path stays refused for
  ever after — the property that stopped a stranger being emailed three times six minutes apart is
  untouched. It refuses an audit with **no completed run**: a resend must never invent a result.
  - ⚠️ **A RESEND CARRIES THE TIME IN ITS SUBJECT.** Gmail groups identical subjects from one sender
    into one conversation, so a second identical copy **collapses under the first and reads as never
    arriving** — the symptom that sent a session hunting a Message-ID dedup bug that does not exist
    (no Message-ID is set anywhere; Resend assigns them).
- ⛔ **DEPLOY LISTS FOR THIS LANE, and one of them cost four days:**
  - `_shared/free-check-result.ts` has **TWO** consumers — `process-ai-audit-queue` (automatic) and
    `submissions` (the resend). **Redeploy BOTH.** The last time one was missed, the fix sat
    committed and undeployed while every matched lead was silently refused.
  - `_shared/free-check-lead.ts` + `_shared/same-business.ts` → **`findable-onboarding` ONLY**
    (`notify-onboarding-submit` mentions free-check-audit.ts in a **comment** and does not import it).
- ✅ **REFUSALS ARE RECORDED, NOT LOGGED.** `free_check_audit_skipped` / `free_check_audit_failed`
  land in **`client_error_reports`** — this lane was dead for two days with the reason existing only
  in an edge log nobody can read (**the CLI has no `functions logs`**), so diagnosing it meant
  inferring from which leads happened to have audits.

---

## 16. ✅ THE REPLY RULE IS THREE-WAY NOW: Off / Run audit only / Audit + auto-send (2026-09-08)

**Audit-only is the DEFAULT and Paul's warm-outreach case:** a business replies to the opener, an
audit runs if they have none, **nothing goes out**, and he sends `audit_reply_warm` by hand once it
is ready. `src/lib/firstReplyMode.ts` (pure, tested) +
`whatsapp_outreach_state.first_reply_mode` (SQL applied).

- ⛔ **BUILT AS A MODE ON THE EXISTING RULE, NOT A SECOND PATH.** That chain already carries seven
  guards that took incidents to learn — the opener gate, the once-per-lead slot, decline detection,
  auto-responder detection, cross-channel suppression, never-pitch-a-paying-customer,
  archived-means-stop — and **none of them depends on whether we intend to send.** A parallel
  "audit only" path would have needed every one again: the duplicate-guard drift this file records
  four times.
- 🔴 **THE SAFETY PROPERTY IS STRUCTURAL, NOT A FLAG THE SENDER CONSULTS.** An audit-only arm claims
  the lead's once-ever slot with status **`audit_only`, which is terminal**: the completion hook only
  ever upgrades `awaiting_audit` → `pending`, and the drain only ever selects `pending`. **There is
  no state from which a send can happen.** A mode the send path merely *read* could be got past by a
  stale row or a later mode flip; **a status it cannot see cannot be sent.** The drain also refuses
  `first_reply` rows by mode — belt and braces, the way the paying-customer guard is checked at both
  arm time and send time.
- ⛔ **ABSENCE IS NEVER PERMISSION, on the field that decides whether a stranger gets a message.** A
  missing column, a failed read, NULL, an empty string and an unrecognised value **all resolve to
  `audit_only`** — so deploying before the SQL ran could not turn a silent inbox into a sending one,
  and a mode added later joins the safe side by default. (Instance fifteen of the absent-value shape,
  and the first one designed in from the start on a sending path.)
- 🔴 **18 `pending` first_reply ROWS WERE PARKED PAST THEIR `fire_after`**, held back by nothing but
  the toggle being off — four of them for leads already at `report_sent`. **Turning the rule on would
  have sent all eighteen, days late, on the next tick.** The drain now retires anything older than
  **`AUTO_REPLY_STALE_MS` (6h)** as `skipped_stale` with the reason on the row, so the pile cannot
  rebuild itself over the next long off period.
- **A failed or capped audit un-parks an `audit_only` row too** — without it, a lead whose audit died
  keeps counting as "ready to send" and the operator opens a thread to send a result that does not
  exist. **Flagging is not sending**, so widening that scope cannot put a message on the wire; the
  arming path stays scoped to `awaiting_audit` alone.
- ⛔ **`DEFAULT_FIRST_REPLY_TEMPLATE = 'audit_reply_warm'` IS ONE SHARED CONSTANT.** It was the
  literal `"audit_reply"` written out at **four** sites — the send-time resolve, two arm-time
  already-sent checks and the SPA select — so moving the warm test onto a new template meant changing
  all four in step **or having the arm check one template's history while the sender sent another.**
- **Untouched on purpose:** `create-ai-audit`'s `queue_pitch_on_complete` path (an operator
  explicitly asking for a pitch from the Inbox audit button, not the reply trigger), and the legacy
  `AUTO_REPLY_FLOW_ENABLED` chain.

### `audit_reply_warm` — the warm audit template (Meta 1509669747584736, approved 2026-09-07)

Same job as `audit_result_hook`, for a lead who has **already answered** the opener, so it drops the
"is this the right number" line. Selectable in both pickers as "Audit reply - warm (after the opener)".

- ⛔ **THREE VARIABLES AND NO BUSINESS NAME: {{1}} trade, {{2}} town, {{3}} audit link — taken from
  WhatsApp Manager, NOT inferred from its sibling.** `audit_result_hook` leads with the business
  name and this one does not, so copying its var list across would have put the trade where Meta
  expects a name and **shifted every parameter by one: a send that returns 200 and reads as
  gibberish.**
- ⛔ **IT WOULD HAVE BEEN UNSENDABLE, AND THAT WAS NOT ON THE BRIEF.** Unknown templates are **COLD
  by default** (`coldOutreach.ts`, since the 2026-09-02 incident), and this template is by
  definition sent to leads who have already answered — so leaving it unlisted meant the
  phone-history seatbelt would refuse it **for every single lead it exists for**: selectable,
  apparently sent, then dropped as `phone_already_contacted`. It is named in
  **`CONTINUATION_TEMPLATES`**, which is exactly what that file's header demands of a new follow-up.
- **Three more places, each silent when missed:** `needsAudit` (its {{3}} IS the report link, so the
  queue must not send it before the audit completes), the report-link set in `Inbox.tsx`, and
  `REPORT_LINK_TEMPLATES` in `useCampaignStats` — forgetting the last does not throw, it quietly
  moves real prospect opens into the unattributable bucket.
- **The Inbox shows real text**, via the mechanism already built: the DB trigger stores only the
  bracketed slug (`[audit_reply_warm]`) and the SPA renders the approved copy from
  `src/lib/templateBodies.ts`, mirrored character-for-character and **pinned by
  `scripts/template-bodies-parity.test.ts`**, which imports both files and asserts identical output.
- **Deploy list — the nine functions reaching `whatsapp-send.ts` or `coldOutreach.ts`**, walked from
  each `index.ts`: `create-ai-audit`, `process-ai-audit-queue`, `process-sms-queue`,
  `process-whatsapp-queue`, `send-whatsapp-message`, `stripe-webhook`, `findable-onboarding` (via
  free-check-lead), `submissions` (via free-check-result), `whatsapp-status` (via whatsapp-inbound).

---

## 17. ✅ THE BEFORE/AFTER VIEW AND THE LOCKED BASELINE (2026-09-08)

The four commits behind the AI Audit page's before/after panel. Pure folds in
`src/lib/measurementCompare.ts`, `measurementRunGroups.ts`, `measurementExport.ts`,
`measurementLock.ts`; tests in the matching `scripts/measurement-*.test.ts`.

- ⛔ **THE QUESTIONS DID NOT LINE UP BECAUSE THERE WAS NO PER-QUESTION TABLE.** That view showed a
  headline, a run picker and **two whole client reports side by side** — two independently laid-out
  documents, so their question lists could not correspond. The joined table existed at
  `/compare/:auditId`, linked from exactly one place, and had probably never been seen. The aligned
  table is now a **shared component on BOTH views**.
- ⛔ **ORDER IS A PRESENTATION CHOICE, AND "AS ASKED" IS DERIVED FROM ROW ORDER.** The fold used to
  sort by movement (wins first) and threw the asked order away, so every consumer inherited a
  client-reading sequence. Queue rows have **no `created_at`** and `buildBaselineView` re-sorts by
  band, so neither is a source of ask order — both callers fetch `.order('id')` and rows are inserted
  in question order, so **first appearance IS the asked order.** The property that matters: **the
  sequence does not change when the results change**, so two exports of one audit can be read
  against each other.
- **CSV, clipboard TSV and PDF are three renderers over ONE `exportRows()`** — not three readings of
  the comparison, because a discrepancy between the file and the screen would be invisible. **The
  qualifications travel with the numbers** (per-row verdict, a `proven` flag, both denominators; the
  header carries the overall figures, the noise band, the matched count and an explicit warning when
  the two sides sampled unevenly), because a sheet of bare deltas is exactly where a ±5-point
  sampling swing gets read as improvement. Rates AND counts, each count beside its denominator.
- ⚠️ **FOUND BY RUNNING IT ON REAL DATA, NOT BY REVIEW: every export said "unknown date" for both
  sides.** `compareMeasurements` is handed queue rows, which carry no date, and never passed
  `buildBaselineView` the optional `measuredAt` — so `comparison.before.measuredAt` was
  **structurally null**. A file that cannot say when it measured is not evidence of a change over
  time. Dates now come from the caller, the only thing holding the run rows.
- ⛔ **THE RUN PICKER GROUPS BY AUDIT × DAY. Both simpler choices are wrong on real data.** Grouping
  by AUDIT: RG's measurement audit `f0aaa9cd` holds **five** runs — three on 26 Aug, then singles
  appended 1 Sep and 8 Sep — so one block would drag two later runs in and **compare a date against
  itself.** Grouping by DAY: 11 Aug holds both a 1-run prospecting audit (3 questions) and the 3-run
  baseline (12 questions), and merging them **joins two different question sets.**
  - Each group states its run count, its audit's configured target ("3 of 3") and the **answer cells
    per question** it contributes; a group short of its config is flagged, and each side carries a
    badge saying whether it has enough cells for a per-question claim at all — the same
    **`MIN_CELLS_FOR_QUESTION_CLAIM = 4`** rule the fold applies, asked at **SELECTION** time
    instead of discovered afterwards as "unproven".
  - **That is the whole reason this was reported as a broken run-count setting. Nothing was
    misconfigured**: a 3-run day was being compared against a 1-run day and the list gave no way to
    see it.
- ⛔ **THE DEFAULT NOW PREFERS COMPLETE MEASUREMENTS, NOT OLDEST-VS-NEWEST DAY.** On RG the old
  default pre-ticked a 1-run **3-question** probe from 29 Jul against a single run appended 8 Sep —
  two sides sharing only some questions, proving nothing — while his real 12-question 3-run
  measurements sat in the middle and were never picked, so **every visit opened on "within noise"**.
  It now picks 11 Aug (3 runs, 12 questions) vs 8 Sep (3 runs, 12 questions): 6 cells per question
  both sides, all 12 individually provable. It degrades in **named steps** (largest question set,
  then oldest-vs-newest), each returning the note the picker prints, and **a single group ticks
  NOTHING** — one side against itself is a 0.0pp "unchanged" that looks like a measured result.
  - ✅ Verified against RG's live runs, which also settled a question: **the fold has always pooled
    every selected run** rather than reading one per side (3 runs → 36 queue rows, 6 cells/question,
    `before.runs === 3`). Nothing needed fixing there and nothing was changed.
- **The selection persists per audit in localStorage** (AppLayout remounts on every navigation —
  §6c), as **one record keyed by audit**, because `usePersistedState` binds its key once for the
  hook's lifetime and a key built from a changing auditId keeps writing to the first audit's slot.
  Arrays, not Sets (a Set does not survive JSON). **A restored selection is PRUNED against the runs
  that actually loaded** — a stale id is dropped, never kept, because keeping it builds a side out of
  fewer runs than the screen shows ticked; when anything is dropped the picker opens itself, and the
  screen says whether it is showing a saved selection or the default.
- ⚠️ **`is_measurement` EXISTS IN THE DATABASE BUT NOT IN THE GENERATED SUPABASE TYPES**, so
  selecting it fails typecheck. `baseline_target_runs > 1` is the same signal and the grouper infers
  a measurement from it — ask only for what the types know rather than casting through `unknown`.

### The locked baseline — `measurement_locks` (SQL applied 2026-09-08)

- ⛔ **WHAT IT IS NOT: A FIX FOR DRIFT — THERE IS NO DRIFT.** Re-measures do not regenerate
  questions: `create-ai-audit` uses a supplied list verbatim and otherwise **reuses the previous
  run's set**, the generator has no temperature and no shuffle, and baselines deliberately opt out of
  the cross-audit coverage directive. Verified on live rows: **RG's 11 Aug, 26 Aug and 8 Sep
  measurements ask the BYTE-IDENTICAL same 12 strings.** No generation code was touched.
- **What it IS: a guarantee that held by construction, made RECORDED AND CHECKABLE.** The intended
  set is written down with the audit and date it came from and the run count it was measured over,
  and **a proposed re-measure is diffed against it BEFORE the money is spent** instead of the
  mismatch appearing afterwards as unmatched rows. **The client it would actually have protected is
  ABLM: 28 runs, 10 different question sets, and a 21 Jul vs 28 Aug pair that compares ZERO
  questions.**
- **Keyed by BUSINESS NAME**, because a re-measure mints a NEW `ai_audits` row and a lock hung off one
  audit id would be invisible from the next. RLS **with its policy in the same file** — telling "no
  lock" from "could not tell" is this table's whole job.
- ⛔ **AN EMPTY OR MALFORMED STORED LOCK READS AS NO LOCK, NEVER AS AN EMPTY ONE.** A lock validating
  with zero questions would make every future diff report "identical" and **sign off the exact drift
  it exists to catch**; `isUsableLock` rejects 13 malformed shapes.
- **Order is not identity** (the comparison joins on the text) and duplicates collapse, **but a
  REWORDED question is a different question** — ABLM's real "accountant in wisbech" vs "Best
  accountants in Wisbech?" reads matched 0. Questions are stored **verbatim, misspellings kept**: a
  tidied question measures something else.
- ⛔ **THE LOCK WARNS; IT NEVER REFUSES.** A legitimate reason to change the set exists (a town the
  client stopped serving), and a tool that blocked would be worked around. **What must not happen is
  changing it by accident.**

---

## 20. 🟡 findable-site HOME PAGE — the explainer moved up, and two things left open (2026-09-12)

The video is the **third** section now (hero → stats → video → #how), on Paul's call. The reason is
not reading order: **the report's CTA button links to `https://findable.live` with NO anchor**
(`aiAuditReportHtml.ts`, `REPORT_SITE_URL`), so every prospect who presses "See how it works" on
their own report lands at the top of the page — at slot 6 that was five sections of scrolling to
reach the thing the button promised.

- ⛔ **THE VIDEO SITS IN A DARK PANEL, NOT A DARK SECTION, AND THE SECTION IS STILL `bg-panel-2`.**
  Costed before choosing: the page alternates navy/light perfectly, so **there is no adjacent pair
  of light sections anywhere on it** and a dark section cannot be inserted without colliding. The
  minimum repair was #how → light, #why-this-works → dark, the proof → light — which takes
  white-cards-on-navy off #how and puts the white report sheets on grey, where their
  `ring-1 ring-white/25` is built for a dark ground. A `bg-band` panel inside the light section buys
  the same contrast for free. **Copy left, video right** from `lg` on
  `grid-cols-[minmax(0,1fr)_auto]`, so the vertical video takes its own width instead of half the
  panel. Desktop **1,032px → 860px**; **mobile 892 → 936px** (the panel's own padding — the one
  place this change costs height, accepted).
- ⛔ **THE SEAM THE MOVE OPENED WAS CLOSED BY REORDERING, NOT BY REPAINTING (Paul, same day).**
  Moving the explainer left ProofSection → Pricing adjacent and both navy (~2,200px of continuous
  dark); the explainer had been the only light section between them. **No single flip closes that**
  — Pricing light collides with the Guarantee, the proof light collides with #why-this-works — and
  the smallest repaint that alternates again flips all four of Pricing / Guarantee / #check / #faq.
  ⛔ **That repaint was refused for one reason: it takes the white card off #check**, and the ask is
  the last thing on that page that may be weakened. **The order is now hero, stats, video, how, why,
  proof, GUARANTEE, PRICING, FAQ, CHECK** — perfect alternation with every section keeping the
  treatment it was given, verified live at 1440×900 and 390×844.
- 🔴 **AND IT REVERSES THE "FAQ BELOW THE ASK" DECISION, ON PURPOSE. Do not put it back.** The FAQ
  had been moved below #check precisely because it is the longest section and was delaying the one
  action the page exists to produce. It is above the ask again — Paul's call, knowing that. What is
  genuinely different: **#check is now the LAST section before the footer**, so the ask is where the
  page ENDS rather than something the FAQ pushes past. ⚠️ **The three moves are ONE decision**: put
  the FAQ back below #check and the navy wall returns unless ProofSection and Pricing are separated
  some other way. index.astro carries the old reasoning verbatim beside the new.
  ⚠️ I reported this seam correctly in the read-only pass and then wrote a comment claiming #how
  had absorbed it. It had not. Both comments are corrected; the claim is measured, not assumed.
- **The report's "See how it works" now points at `https://findable.live/#video`**, not the bare
  origin (`REPORT_EXPLAINER_URL`, render-audit-report **v90**). ⚠️ **It degrades QUIETLY**: a browser
  given an unknown fragment loads the page and stays at the top, which is exactly where this button
  used to land — so if #video is ever removed or renamed, nothing will tell you. `report-origin.test`
  still passes (the origin constant is untouched; the anchor is built from it).
- ⚠️ **CLAUDE.md §2's Management-API token path is WRONG on this machine.** It says the token is read
  from `~/.supabase/access-token`; that file does not exist (only `telemetry.json` and `traces/`),
  while `npx supabase projects list` authenticates fine. So the documented route for running SQL
  yourself could not be used — worth fixing before the next session relies on it.
- ⚠️ **THE SAME FACT IS STATED SEVEN TIMES ON THE HOME PAGE** (Paul: real, worth fixing, not this
  pass). "We re-ask the same questions four weeks later and show you both" appears in #how card 04,
  #how's closing line, ProofSection's closing paragraph, Pricing's tick 7, Pricing's guarantee band,
  the Guarantee's third deliverable, and four FAQ answers. Each is defensible alone; together the
  claim stops landing. The two cheapest to cut are #how's closing line (the card above already says
  it) and Pricing's tick 7 (the band is directly below it).
- **Pricing's heading lost the number**: "£99, or your money back." → **"Pay once. If the number
  doesn't move, claim it back."** ⛔ The rejected alternative, *"One price, and you can claim it
  back"*, states the refund with **no condition** in the largest type on the section, while
  `/refunds` makes it conditional on the measured number — and that section's own rule is that a
  summary may be shorter, never different. "The number", not "it": at that point the reader has met
  the eyebrow and nothing else, and the thing measured is introduced *below*, in the band.
- ⚠️ **`check-cross-repo-sync.mjs` EXISTS IN BOTH REPOS, EACH READING ACROSS TO THE OTHER — AND I
  UPDATED ONLY ONE.** Deleting market audits (§19, slice 5) removed `MARKET_COOLDOWN_ALLOWANCE` and
  `MARKET_COOLDOWN_MS`; LeadFinderOS's copy dropped those groups in the deletion commit, findable-
  site's did not, so it failed **2 of 7 against a file that was correct**. The drift the pair exists
  to catch, in the pair itself. **Change one, change the other.**
- ⚠️ **StatsBand, WhatWeDo and therefore ImageSlot render on NO page in this repo.** `index.astro`
  said StatsBand "lives at /research" and `Guarantee.astro` said ImageSlot was "still used by
  StatsBand and WhatWeDo" — true of the imports, false about the site: `research.astro` writes its
  own content. Both comments corrected. `WhyThisWorks.astro` also named a wave at the foot of #how
  that has not existed since 2026-08-20.

---

## 19. ✅ THE THREE-TYPE MEASUREMENT MODEL — built and live 2026-09-12 (Paul's spec, seven slices)

**Nothing else exists.** Every measurement is one of three, and the code refuses the fourth:

| | Shape | Purpose column | Compared? |
|---|---|---|---|
| **HOOK** | 3 q × 1 run (free check: 3 q × **3 runs**, via internal `target_runs`, because it is emailed as a frequency) | `audit` | never |
| **BASELINE** | **12 q, HOME TOWN ONLY**, × 3 runs, generated fresh, **frozen** | `baseline` | it IS the before side |
| **FULL MEASURE** | 20 q × 3 runs across home + `areas_list` (`fullMeasureAllocation`: four towns → 10/4/3/3), **DISJOINT** from the baseline | `measurement` | never |
| **DAY-28 REPLAY** | the baseline's ASKED set verbatim × 3 runs | `remeasure` | it IS the after side |

- ⛔ **ORDER IS STRUCTURAL, NOT A CONVENTION.** `advanceBaseline` finalises with a CONDITIONAL write
  (`.is("baseline", null).select()`); only the tick that won calls `onBaselineFrozen`, which (a)
  fills `remeasure_due_date` WHERE NULL and (b) starts the full measure. Nothing else starts one
  for a client. And `create-ai-audit` refuses a full measure for a **paying** lead with no frozen
  baseline (`409 baseline_not_frozen`, recorded): if the judged set were picked after seeing what
  is winnable, the before/after would be self-serving and a client could say so.
- ⛔ **DISJOINT IN TWO LAYERS** (`src/lib/fullMeasure.ts`): `coverageDirective` built from the
  baseline's asked set steers the model (the polite request); `excludeAsked` removes any paraphrase
  that comes back (the guarantee); `overAskFor` asks for enough extra under the named generator
  ceiling. The baseline's 6 cells per judged question already clear `MIN_CELLS_FOR_QUESTION_CLAIM`,
  so nothing is measured twice. A full measure that CONTAINED the judged set would be comparable.
- ⛔ **THE REPLAY READS THE STORED DATE AND COMPUTES NOTHING.** `src/lib/remeasureDue.ts` imports
  nothing and has no date arithmetic, by test; `fireDueRemeasures` (audit-baseline.ts, every
  30-second tick beside `ensureBaselinesForPaidOnboardings`) selects `remeasure_due_date <= today`
  and re-checks each row with it. **RG's stored 2026-10-06 fires him; his computed default would
  have been 2026-09-08 and cannot reach the decision.** The ONLY `+REMEASURE_OFFSET_DAYS` is
  `remeasureFill.ts`, called once at freeze, and its UPDATE carries `.is("remeasure_due_date", null)`.
- ⛔ **REFUNDED STOPS THE REPLAY, ALONE.** SC Plumbing (refunded, date NULL) is refused as
  `refunded` before the date is looked at, and with a past date filled in he is STILL refused as
  refunded — pinned. A **hosting** cancellation is NOT a stop: the £99 guarantee is calendar-based.
  Archived (`is_archived` — the real column; `archived_at` does not exist) and unpaid also refuse.
  **Work unfinished does not delay it**: the unticked milestones are STAMPED on the replay
  (`results.remeasure.work_incomplete`), fire-and-stamp, Paul's call.
- ⛔ **THE POINTER IS THE IDEMPOTENCY, AT 2,880 TICKS A DAY.** `outreach_leads.remeasure_audit_id`
  is claimed by trigger in the replay audit's own insert transaction (Slice 0 SQL, same pattern as
  `baseline_audit_id`), immutable once set, and **the partial unique index
  `uq_ai_audits_one_remeasure_per_lead` refuses a second `remeasure` insert at the database** —
  the read gate is necessary and not sufficient. `create-ai-audit` answers that 23505 with
  `409 already_remeasured`; the tick treats it as the race resolving. **One replay per lead, ever.**
  A continuing-work client's later re-measures are operator-driven, not automatic.
- ⛔ **SEEDING IS GONE.** The baseline no longer carries the hook's questions forward (`applySeed`,
  `SeedOutcome`, `rejected_seeds`, the seeded branches — deleted). `decideGuarantee`/`GuaranteeKind`
  are gone: every client is on the outcome-conditional guarantee and grading them `work` from the
  price was a semantic inversion. Contract **v2** records intent (home town, areas deferred to the
  full measure, money questions); the judged set is the pointer's asked set, never a field.
- ⛔ **`page-generator` READS THE POINTER + THE FULL MEASURE, NEVER "LATEST".** `measuredSetForLead`.
  Under this model the newest multi-run audit at day 0 is the full measure, so "latest" would have
  dropped the 12 judged questions from every page plan. No pointer → `no_baseline_recorded`.
- **Deleted with it (Slice 5):** market audits (`purpose:"market"`, `market_only`, the cooldown),
  `derive-audit` + `derivable.ts` (⚠️ **`derivable.ts` CAME BACK 2026-09-15 — restored from
  `0930ca57^` and wired into the niche fold, §27. `derive-audit` is still gone**) + the try-derive
  branches + the Outreach "Derive reports" button,
  `compareToBaseline` (no consumers), **`measurement_locks` and everything that read it** (the
  pointer + server-side refusal on the ASKED set superseded it four days after it shipped), the
  re-audit dialog's 3-run "measurement" mode and the Baseline page's "Re-run this measurement".
  A re-audit is a one-run quick diagnostic now.
- **Numbers:** `BASELINE_QUESTIONS = 12`, `FULL_MEASURE_QUESTIONS = 20`, `FREE_CHECK_QUESTIONS = 3`,
  `GENERATOR_ABSOLUTE_MAX_QUESTIONS = 40` (the generator's inner clamp used to borrow the baseline
  ceiling, so a 75-question policy generated 20 and nothing said so — now named, and
  `scripts/question-ceilings.test.ts` asserts every policy ceiling sits under it). Per client, all
  four stages: ~135 question-runs, ~$1.47 Apify + ~$0.70 cleaner ≈ **£1.70**; day 0 ≈ 50 min
  (baseline then full measure, sequential), day 28 ≈ 25 min.
- 🔴 **THE PARSE GATE, AND WHY IT EXISTS.** A stray `}` in create-ai-audit passed typecheck (does
  not cover `supabase/functions`), the build (does not bundle edge code) and every suite (they read
  the file's TEXT), and was caught only by the Supabase bundler. **`scripts/check-edge-syntax.mjs`**
  (esbuild's TS transform, parse only) now runs inside `npm run check`; proven against the broken
  file. Deno is not on this machine; this is the cheap pass in front of the deploy, and it does NOT
  catch a missing `.ts` import extension (§4).
- ⚠️ **STILL OPEN AFTER THIS:** (1) **nothing sends the four-week results** — the replay produces an
  audit and `findable.live/refunds` starts a 14-day clock on RECEIPT of results that no code
  delivers (scoped 2026-09-12: a `render-remeasure` document over `compareMeasurements`, a Resend
  send with a claim-first stamp `remeasure_results_sent_at`, a dashboard card; ~a day). (2) The
  client is not yet TOLD "we judge the refund where you trade, we measure your ambitions to decide
  what to build" — that is findable-site copy (`OnboardingFlow.tsx:3005` still says the towns are
  "both delivery and measurement"). (3) `derive-audit` v23 is still DEPLOYED with no source
  (`functions delete` awaits Paul's word), and `measurement_locks` still EXISTS in the DB (Paul's
  `DROP TABLE`, after the SPA that stopped reading it was confirmed live — it is).
- 🔴 **THE WELCOME PACK LIED TO PAYING CLIENTS FOR NINE DAYS, AND NOTHING COULD HAVE CAUGHT IT.**
  `welcomePackHtml.ts` — a PDF the operator downloads and sends by hand (`WelcomePackButton`, no
  stored copy) — carried a hand-written **8-week** guarantee ending *"no honest company can promise
  AI will always name you"*: the cycle had been four weeks since 2026-09-03 and that hedge is the
  one §1 forbids beside a conditional refund. RG Locksmiths and Ronnie both received it. The sync
  check guards CONSTANTS; nothing read PROSE that restates one. It now renders `FINDABLE_GUARANTEE`
  and **`scripts/client-copy-claims.test.ts`** scans the string literals of every client-facing
  renderer (comments and HTML comments stripped) for eight weeks / 56 days / £49.99 / founder /
  first-ten / two months / any hedge / Bing Places (§5: tested negative — the pack named it as a
  profile we tidy, now removed). **Add any new client-facing renderer to that list.**
- ⚠️ **THE `re_engage` £49.99 BODY IN `templateBodies.ts` / `whatsapp-send.ts` IS HISTORY, NOT A
  LIVE TEMPLATE — AND I MISREAD IT AS ONE (2026-09-12, evening).** `re_engage_49` at Meta is a
  one-variable body with no price ("Where did we get to with this?…"), mirrored exactly. The OLD
  `re_engage` body is kept ONLY so the Inbox renders what 21 August rows actually contained; it is
  not in `WA_TEMPLATES` (not sendable) and `re-engage-vars.test.ts` asserts the old name is not
  in `WA_TEMPLATES` either. ⛔ Do not "update" or delete the historical body — that falsifies 21
  transcripts (done once by mistake that day and restored). `client-copy-claims.test.ts` pins the
  property that matters: **no SENDABLE template body quotes a retired price or a hedge**, and
  `re_engage` is not sendable. Paul caught the misreading; the earlier version of this bullet said
  the opposite and was wrong.
- ⚠️ **Things no script can check, still hand-kept:** the Stripe **Payment Link**'s amount and
  description (dashboard), and every Meta-registered template body. A client-facing claim that
  lives outside this repo is a claim nobody is verifying.
- **Deployed 2026-09-12:** `create-ai-audit` v106, `process-ai-audit-queue` v153, `stripe-webhook`
  v82, `bulk-jobs` v55, `whatsapp-status` v74, `findable-onboarding` v82, `page-generator` v46,
  `submissions` v31. `derive-audit` **deleted** from the project; `measurement_locks` **dropped**.
  findable-site: the areas helper, `/refunds` and the (unmounted) `WhatWeDo` copy now say the refund
  is judged in the home town only — Paul's wording, verified live on `/refunds` and in the
  onboarding island's chunk.

---

## 18. 🔴 ONE PAYMENT, ONE BASELINE — the loop, the pointer, the replay and the refusal (2026-09-12)

**Paul paid once on lead `50826b1a` and got TEN paid baselines**, 343 queue rows, ~$3.70 of Apify,
one more every queue tick until the onboarding row was reset by hand. Nothing threw and nothing
logged a duplicate.

- ⛔ **NEITHER GUARD WAS WRONG. TOGETHER THEY WERE A LOOP.** `create-ai-audit` marked every
  MULTI-RUN audit `is_measurement` (so an unmarked 3-run free check could not pass as a baseline);
  `startPaidBaseline` recognised a baseline as multi-run **AND NOT** `is_measurement`. So the writer
  marked the audit it had just made and the reader then excluded it, every tick, for ever.
  - **The fix is one shared module, `src/lib/auditKind.ts`, read by both**, and the baseline test is
    now **POSITIVE** (`baseline_contract` present) rather than an absence. ⛔ **SUPERSEDED 2026-09-13
    (§21): the positive marker is `audit_purpose = 'baseline'`; the contract only decides whether a
    RECOGNISED baseline is whole.** `measurementFlagFor`
    keys on the PURPOSE alone — `is_measurement` is what the audit is FOR, never how many runs it
    does.
  - ⛔ **AND THE TEST IS A ROUND TRIP, NOT TWO UNIT TESTS** (`scripts/audit-kind.test.ts`). Each
    file already asserted its own rule — in comments, one of which had been false for weeks. The
    only assertion that could have caught this is *take what the writer sets, hand it to the reader,
    require the reader to recognise it.* It drives ten backstop ticks and asserts exactly one audit.
  - **Ambiguity now REFUSES and writes `client_error_reports`** instead of quietly buying another
    baseline. Visible and wrong beats invisible and expensive.
- 🔴 **`baseline_contract` IDENTIFIES NOTHING — it is written to EVERY audit `startPaidBaseline`
  creates**, so ten runaway baselines produced ten contracts and none was authoritative. (It is on
  **`ai_audits`**, not `onboarding_responses`; an earlier note in this file had the table wrong.)
  ABLM is the same gap on a real client: 28 runs, 10 question sets, a 21 Jul vs 28 Aug pair
  comparing **ZERO** questions.
- **`outreach_leads.baseline_audit_id` is the answer, and its ABSENCE is an answer too.**
  `SQL_FOR_PAUL_baseline_pointer.sql` — the column, an AFTER INSERT **claim trigger** and a BEFORE
  UPDATE **immutability trigger**.
  - ⛔ **IT HAD TO BE A TRIGGER, NOT APPLICATION CODE.** Two tables cannot be written by one
    PostgREST statement, so an edge function can only ever insert-then-update — the best-effort hole
    `baseline_contract` already has. A trigger runs inside the INSERT's own transaction: the pointer
    cannot exist without the audit and cannot fail separately from it.
  - ⛔ **AND IMMUTABILITY CANNOT BE A CONSTRAINT.** A CHECK sees only the row being written, never
    the value it replaces; UNIQUE forbids two leads sharing a pointer, which is a different rule.
    The claim uses `WHERE baseline_audit_id IS NULL` (first baseline wins, later ones are no-ops)
    and the guard REJECTS any statement that MOVES a non-null pointer. Clearing to NULL is allowed —
    that is how a wrong pointer is corrected, and how `ON DELETE SET NULL` works.
- ⛔ **THE REPLAY READS THE QUEUE, NOT THE CONTRACT — because the contract stores the INTENDED set
  and the queue is the ASKED one.** `baseline_contract` holds `seededQuestions` (intent) and, for
  outcome clients only, `scoredQuestions`; **no field holds the full asked set.** The baseline's
  FIRST run's queue rows are ground truth. ⚠️ That also makes a town dropped by the allocation
  ceiling and a question the intent guards rejected **non-mismatches BY CONSTRUCTION** — they were
  never queued, so they are not in the asked set. ⚠️ When asked < intended the summary says
  **"replaying N of M"**; a short set is a valid yardstick for those N and must not be described as
  the whole measurement.
- ⛔ **THE LOCK CHECK MOVED SERVER-SIDE.** §17's lock warns from `AiAudit.tsx`, which is a UI
  preference: the queue backstop, the Stripe webhook and every other caller of `create-ai-audit`
  bypassed it. `judgeRemeasure` (`src/lib/baselineReplay.ts`) now runs **in create-ai-audit**, gated
  on `isMeasurement && baselineTargetRuns > 1 && leadId`, returning **409** and recording the reason
  in `client_error_reports`. Four things legitimately get through:
  a dropped town and a guard-rejected question (not mismatches at all, see above); a **Quick 1-run
  re-audit**, which is ALLOWED but carries `countsAsMeasurement: false` — refused a place in the
  before/after, not refused execution; and a **named operator override** of ≥10 characters, recorded
  on the audit. ⛔ **An override is WORDS, never a flag** — a boolean lets any caller wave a change
  through with no record.
- ⛔ **IT NEVER FALLS BACK TO GENERATION.** A replay that generated a fresh set when it could not
  find the baseline would reproduce the drift it exists to stop, while looking like it worked.
- 🔴 **THE BACKFILL DOES NOT GUESS, AND THAT IS THE POINT.**
  `SQL_FOR_PAUL_baseline_backfill_audit.sql` (read-only) grades every paid lead
  `ONE_CLEAN_BASELINE` / `ONE_SET_MANY_AUDITS` / `AMBIGUOUS` / `NO_MULTI_RUN` from an
  order-independent `md5` set_key over run-1 questions, and suggests a pointer **only** where the
  data is unambiguous. A wrong pointer silently changes what a refund is measured against; a NULL
  one makes the re-measure refuse out loud.
- ⚠️ **`create-ai-audit` also writes `audit_purpose` now** (baseline | measurement | market | audit)
  — the column the claim trigger reads. It is in the shed list, so the function is migration-
  tolerant: without the SQL the key is dropped and the refusal simply never fires.
- ⚠️ **AND §17'S "the generator has no temperature" IS FALSE — it is `temperature: 0.7`.** That is
  why ten identical inputs produced 8, 8, 10, 10, 9, 9, 8, 10, 9, 9 questions. §17's conclusion
  still holds for a re-measure (it reuses the previous run's set verbatim rather than regenerating),
  but the stated reason was wrong.

---

## 21. ✅ THE FREE CHECK MEETS THE BASELINE — two faults that would have hit the first real customer (2026-09-13)

Found by tracing the chain read-only before Paul's end-to-end test; fixed the same day on his brief.
**Both were in code as deployed, neither had fired yet** (no audit had been created since v106).

- 🔴 **A FREE CHECK THEN A PAYMENT PRODUCED NO BASELINE.** §18's positive test recognised a baseline
  by its CONTRACT, and graded every other multi-run audit ambiguous — which is exactly what a 3-run
  free check is on those three columns. So the funnel's own happy path (free check → report → Get
  started → pay) refused the baseline, and wrote `baseline_ambiguous_multi_run` **every 30-second
  tick with no throttle**.
  - ⛔ **THE KIND IS READ FROM `audit_purpose` NOW** (`src/lib/auditKind.ts`, the writer and both
    readers). `'baseline'` + contract = paid baseline; `'baseline'` with NO contract = ambiguous
    (a failed contract write — the case the refusal was built for, kept); `'measurement'` /
    `'remeasure'` = measurement; **`'free_check'` = free check, ignored by the baseline guard**;
    any other recorded purpose = ordinary. **Legacy rows (purpose NULL — every audit before
    2026-09-12) keep the old three-column rule, refusal included**: a pre-09-12 free check still
    holds a later payment until somebody looks. Stated, not hidden.
  - ⛔ **`audit_purpose = 'free_check'` is a NEW value**, written by `create-ai-audit` when the
    internal caller sends `purpose: "free_check"` (free-check-audit.ts does). The column is plain
    `text`, no CHECK constraint; the pointer trigger reads only 'baseline' / 'remeasure'. The
    repeat runs posted by `advanceBaseline` carry the audit's own purpose back.
  - ⛔ **THE AMBIGUITY REPORT IS ONCE PER LEAD PER HOUR** (`reportOnceAnHour`), not per tick.
  - ⚠️ **On 2026-09-13 every one of the 968 audits had `audit_purpose` NULL** — the column existed
    (Slice 0 ran) but nothing had been created since the writer deployed. The first audit after
    this deploy is the first row that carries a purpose. 3 leads carried a baseline pointer.
- 🔴 **THE FREE-CHECK SENDER FIRED FOR EVERY AUDIT ON A FREE-CHECK LEAD.** It was gated on the LEAD
  having a free-check submission row, and the queue pushes it for every completed run of every
  audit with a lead — so a paid baseline, the full measure, the day-28 replay and any manual
  re-audit on such a lead would each have emailed AND texted the form-filler "Your AI visibility
  check" with a fresh report link.
  - ⛔ **GATED ON THIS AUDIT'S PURPOSE** — `freeCheckSendGate` in auditKind.ts, pure, tested against
    all five purposes plus null. Only `'free_check'` sends automatically. The operator RESEND
    (`force`) is allowed through for a legacy (NULL) or `'audit'` purpose — that is how the two
    pre-change stranded free checks can still be sent by hand — and **refused for baseline /
    measurement / remeasure even when forced.** The submission-row gate still stands as the second
    gate (it is the only source of the address and number).
  - The Free checks card (`submissions` → `free_check_progress`) now prefers the audit whose purpose
    is `'free_check'` over the newest one, so a later payment cannot relabel the baseline as the
    free check's audit (the gate would have refused the resend anyway; the card must not mislabel).
- ⛔ **RUNS 2 AND 3 OF A FREE CHECK NO LONGER BUY AN SEO SCAN.** `advanceBaseline` posted repeats
  without `skip_seo`, so on a business with a website run 2 bought the ~4p scan run 1 declined and
  the report (rendered off the LAST run) grew a website section. Two fixes, both structural:
  `create-ai-audit` forces the skip for purpose `'free_check'`, and the repeat sends `skip_seo: true`
  whenever run 1's `results.seo` is a skipped marker — read off the row, not typed per purpose.
- ⚠️ **`respellTrade` (was `normaliseTrade`) in `src/lib/freeCheckTrade.ts`** — renamed because
  `src/lib/templateVars.ts` exports a DIFFERENT `normaliseTrade` (lowercases, singularises, BLOCKS
  for a WhatsApp variable). Consumers: free-check-audit.ts, notify-onboarding-submit.
- **`[functions.notify-onboarding-submit] verify_jwt = false`** is in config.toml now (it ran live
  with false while absent from the file — a redeploy could have flipped it).
- ⛔ **THE GUARANTEE IS ONE CONSTANT AGAIN, 236 CHARACTERS.** Paul cut "we will show you both sets
  of numbers and refund you" and folded the window in: *"…If that number has not gone up, email us
  within 14 days of your four week results and we'll refund your £99."* `FINDABLE_GUARANTEE_FULL`
  is DELETED, the prefix assertion is gone from BOTH sync scripts (TOTAL is +1 not +2), the site's
  `GUARANTEE` is locked to `FINDABLE_GUARANTEE` directly. Also changed in the same pass: `/refunds`
  (paragraph 2, meta description, and How to claim — "We will send you the before and after
  numbers side by side" cut too), FAQ "What if it doesn't work?". **Every instance was listed
  before editing; the two repos moved together.**
  - ⚠️ **236 > 222.** 222 is the longest string PROVEN to render untruncated on Stripe's hosted page
    (2026-08-06, a real session). Stripe documents no limit. **The first real Checkout Session after
    this deploy is the proof** — read the hosted page's text, not the HTML shell. Not verified here.
- **Verification that a baseline / full measure / replay / manual re-audit send NOTHING is the pure
  gate test** (`scripts/audit-kind.test.ts`), not a live run — nothing was spent to prove it.
- ⛔ **UNCOUNTABLE TRADE WORDS BLOCK THE WHATSAPP VARIABLE; THE FORMS PEOPLE TYPE ARE MAPPED
  (Paul, 2026-09-13, same day).** "plumbing" passed every guard in `templateVars.ts` and would
  have rendered "for a plumbing in Andover" — a real word naming the WORK, not the person. Now:
  `TRADE_SINGULAR` maps plumbing→plumber, locksmithing→locksmith, bookkeeping→bookkeeper,
  driving lessons→driving instructor, car valeting→mobile valeter, and electrics→electrician /
  accountancy→accountant (**both still HELD by the vowel rule** — map to a consonant-initial
  phrase to send them). Anything unmapped whose LAST word ends in `-ing`, or sits in
  `UNCOUNTABLE_TRADE_WORDS` (joinery, upholstery, dentistry, removals, dental, electrical, …),
  blocks as `trade_uncountable`. The 24 stored `business_type` values (re-pulled that day, 968
  audits) contained no further uncountable word beyond the two already mapped. Only edge code
  reaches this file (via `whatsapp-send.ts`); the SPA does not.
- ✅ **`free_check_result` IS APPROVED AND ACTIVE AT META (Paul, 2026-09-13)**, one message sent,
  delivered and read. Its registered body carries "for a {{2}}", so the vowel-sound block is
  correct for it too. Variables confirmed against WhatsApp Manager: name, trade, town, report
  link, onboarding link — matching both registries.

---

## 22. ✅ THE REPORT STOPPED RENDERING PARTIAL RESULTS AS FINAL, AND STOPPED GUESSING ABOUT WEBSITES (2026-09-13)

Six bugs Paul parked while testing; four fixed here, two reported (§22b). Read before touching the
report renderer, the free-check result, the AI Audit pills or the town badge.

- 🔴 **THE REPORT RENDERED A PARTIAL COUNT AS FINAL.** AD Locksmithing's free check opened at 11:40
  read "4 out of 12 answers"; at 11:44, "5 out of 18". Run 3 was in flight. `buildReportData`
  counts whatever queue rows have answers, so the denominator grows run by run, and nothing said so.
  - ⛔ **ONE PREDICATE, THREE READERS: `src/lib/measuringState.ts`.** `measuringState(runs, target)`
    = a run is pending/running (unknown statuses count as in flight) and not stalled past
    `MEASURING_STALL_MS` (45 min). Read by **render-audit-report** (withholds every figure — hero,
    "who AI named", website slot, the fix section — behind a "Still measuring, N of M rounds done"
    banner, and serves `cache-control: no-store` while it does), by **free-check-result** (its wait
    rule; `FREE_CHECK_RESULT_MAX_WAIT_MS` is now an alias of the same constant, so the email and the
    page agree about the stall release), and by **AiAudit.tsx** (`attachMeasuring` on all three
    snapshot paths → the preview shows the banner and the PDF button disables;
    `downloadReportHtml` refuses as the last line). A number that will change must not appear.
  - ⚠️ An operator appending a run to a finished audit puts it back into "measuring" until that run
    settles — deliberately: the number is about to change.
- 🔴 **THE REPORT TOLD A BUSINESS WITH A WEBSITE THAT IT HAD NONE.** `hasWebsite` was `!!website`
  on the audit's snapshot column, so a BLANK read as "no website" and rendered "we'll build you
  one". The blank was because Google never resolved the business (place resolution refused on a
  town mismatch), so Place Details never ran. The SEO skip was NOT the cause — the "not scanned yet"
  branch already existed and renders whenever a site is known.
  - ⛔ **THREE STATES NOW.** render-audit-report reads the lead's `website` and `place_id` (one read,
    shared with the paid check): a site on the audit or the lead → true ("full check comes with the
    work"); no site but a `place_id` → Google was consulted → false ("we'll build you one"); no
    `place_id` → nobody looked → **null, and the report says nothing about their website.** A wizard
    audit (no lead) keeps its operator-entered boolean. `buildReportData` accepts `ctx.hasWebsite`;
    absent, it derives true from `ownWebsite` and NULL otherwise — false is never inferred from a
    blank. **No migration**: `has_website` is `NOT NULL DEFAULT false` and stays that way; the lead
    row is the tri-state.
  - **Counted before fixing:** two free-check results ever sent; one false (AD Locksmithing). Across
    all lanes, 98 audits carried no website; 8 of those leads have one, all Facebook/YouTube/Yell
    pages the product deliberately treats as not an own website — so those were right by the rule.
- ⛔ **THE ROW PILL KEYS ON `audit_purpose`, NOT RUN COUNT.** "client · baseline 0/3" rendered on
  an unpaid free check because `AuditPills` keyed on `baseline_target_runs > 1` with "client"
  hard-coded. Now: `'free_check'` → "free check · n/3 runs"; `'measurement'`/`'remeasure'` →
  "measurement · n/3"; `'baseline'` → the client pill; legacy NULL purpose keeps the old reading
  (multi-run + !is_measurement → client, which is RG and Ronnie). `audit_purpose` joined
  `AUDIT_SELECT` and `AuditRow`.
- **"town unverified" → "Google couldn't confirm the town."** Same predicate (`townVerdict`),
  honest wording: it means Google was asked and could not confirm, not that the operator typed
  it wrong. `TOWN_GATE_REASON` reworded to match; the test pins the new phrase and the absence of
  "unverified".
- **The footer carries findable.live** (`renderSiteFooter`, shared by the report, welcome pack and
  page-plan document), and **the three abstract fix steps are replaced by the explainer video beside
  three concrete steps** (what we measure / build / re-measure). Video on screen (`<video>` with the
  site's poster, no autoplay); **in print the player is hidden and the poster renders as a link with
  a caption** — a PDF cannot play video. No length is claimed (§13b). The steps overlap "What's
  included" on purpose: that is the inventory, this is the method.

### 22b. Reported, not built
- **The row click spends nothing.** It is bound to `reopenAudit`, two reads. Zero unrequested
  audits since 10 Sep. What looks like "starting an audit" is the list reloading its entire dataset
  every 5 s while any run is in flight (`LIST_POLL_MS`), and opening a mid-test audit landing on its
  running run's spinners.
- **The AI Audit page loads 969 audits under a hard `AUDIT_FETCH_LIMIT = 1000`, plus every run and
  every report, then repeats all of it every 5 s while draining.** At 1,001 audits the oldest fall
  off the list silently (not deleted; still reachable by search and by URL). Recent rate: 60 audits
  in the last 7 days, 295 in 14 — the cliff is days away, not weeks.
- **A running audit IS openable** (latest run → per-question spinners, run picker with statuses);
  what is missing is a header line: run N of M, X of Y questions returned, per engine.
- 🔴 **THE DISTANCE GAZETTEER HAS NO MAJOR CITIES.** `uk_towns` (733 rows) lacks London, Birmingham,
  Manchester, Leeds, Bristol, Liverpool, Sheffield, Nottingham and Newcastle upon Tyne (only
  Newcastle-under-Lyme). For those the >25 km verdict is "unknown" and never blocks — so the gate
  has never applied to the biggest markets, and 25 km was never Newcastle's problem. Free-check-lane
  refusals recorded: zero, ever. Coverage-page population sort reads the same table, so adding
  cities changes Coverage too.

### 22c. Same day, later: the audit book is paginated, the documents are charcoal and gold, the gazetteer has its cities (2026-09-13)

- ⛔ **THE AUDIT BOOK IS PAGINATED, NOT CAPPED.** `AiAudit.tsx` fetched the newest 1,000 audits and
  stopped; the book stood at 969 with one bulk job of 25 leaving it six away. At 1,001 the oldest
  audit silently left the list. It now reads through `fetchAllRows` like the runs and the reports
  (stable sort, `id` tiebreaker). **Not slower today**: 969 rows is still one request (~0.8–1.0 s
  measured); past 1,000 it is two (+~0.3 s), and the 5-second reload while a run drains repeats
  that. `AUDIT_FETCH_LIMIT` is 50,000 now and only feeds the "capped" label. The real fix (page the
  LIST, poll only in-flight audits) is still owed.
- ⛔ **EVERY CUSTOMER DOCUMENT IS DARK-WITH-GOLD ON A LIGHT BODY. BLUE IS GONE.** Paul's spec:
  NOT a dark report — the body stays light; everything that was Findable blue (#1a3d7c, the pale
  blue tints, the navy footer #102a58) is the site's charcoal (#101114 band, #0A0B0D footer) and
  gold (#FFD13F). Two steps, deliberately: **(1) every raw hex became a token with its old value**
  (26 in the report renderer, plus the welcome pack, page plan, client request sheet stylesheet
  and the before/after export), **(2) the token VALUES moved.** `--blue` KEEPS ITS NAME and carries
  charcoal — 20 rules and three documents read it. The before/after export (`measurementExport.ts`)
  gained the shared band and footer; it had none and looked like a different company.
  - ✅ **RENDER-CHECKED BY PIXEL, NOT CSS**, in headless Chromium over all eight paths (client
    report, its print variant, in-app preview, welcome pack + print, page plan, client request
    sheet, before/after export + print) with real AD Locksmithing data: band #101114, footer
    #0A0B0D, body #ffffff, Get-started button #FFD13F, wordmark gold, **zero pixels of any retired
    blue** in any screenshot, video hidden and poster shown in print. The scratch tool is
    `scripts/_render-check.ts` (untracked; Playwright lives in findable-site's node_modules).
  - **Contrast on charcoal**, re-checked for every pairing that used to sit on blue: white 18:1,
    `--on-band-muted` #c9cbd1 11:1, gold 13:1, charcoal text on the gold button 12:1. Nothing stops
    passing. **Amber never sits on a dark surface in any document**, so the amber→gold-on-dark rule
    had nowhere to apply; it is written at the token block for the day one moves.
  - **Print needs nothing new.** The band and footer were already dark and already forced with
    print-color-adjust; charcoal prints exactly as navy did. Confirmed by pixel in print emulation.
  - 🔴 **THE BACKTICK TRAP BIT AGAIN WRITING THIS**: a CSS comment inside the token block said
    `--color-band` in backticks and terminated the stylesheet — tsc read "9 baseline errors no
    longer occur" (the same count-looks-fine failure §3 records) and esbuild said "Expected ;".
    No backticks in any comment inside a template literal. Ever.
- ⛔ **THE GAZETTEER: 21 CITIES HANDED TO PAUL AS ONE INSERT.** ONS "Major Towns and Cities (Dec
  2015) V2" has 112 entries with centroids and NO populations; 81 already resolve (the lookup strips
  ONS's "(District)" suffix, so "Cambridge (Cambridge)" IS Cambridge — the earlier note in §6i was
  wrong and is corrected). **18 genuinely missing** (Birmingham, Bradford, Brighton and Hove,
  Bristol, Cardiff, Coventry, Derby, Kingston upon Hull, Leeds, Leicester, Liverpool, London,
  Manchester, Newcastle upon Tyne, Nottingham, Plymouth, Sheffield, Stoke-on-Trent) plus
  Edinburgh, Glasgow, Belfast from Wikipedia coordinates. **Deliberately NOT inserted**: Newport
  (three Newports already make the name ambiguous — a fourth changes nothing) and Sutton Coldfield
  ("Royal Sutton Coldfield" exists; an alias belongs in the lookup, not a duplicate row).
  **Population is NULL on all 21**: Coverage's size filter EXCLUDES null-population rows and its
  sort puts them last, so Coverage is unchanged until Census 2021 built-up-area populations are
  added — a follow-up, not a regression.
  - **Distance re-run over 665 measurable audits** (863 leads carry coordinates now, not 44):
    before → ok 485 / warn 10 / block 31 / unknown 139; after → ok 561 / warn 17 / **block 32** /
    unknown 55. **84 verdicts change; ONE becomes a block**: Russell Dane Gas Heating & Plumbing,
    audited against Liverpool, 27 km out. 55 stay unknown, mostly typed forms the gazetteer will
    never carry ("Hull", "Brighton", "Stoke", "Sutton Coldfield") — an alias table in
    `normaliseTownName` is the fix for those.
  - ⛔ **PARKED BY PAUL 2026-09-13, NOT RUN — and the INSERT above is WRONG as drafted.** `uk_towns`
    is the **ONS Built-Up Areas 2022** list (`ons_code text NOT NULL UNIQUE`, E63… codes; the table
    comment says so). The Major Towns and Cities layer uses **J01… TCITY15 codes** — a different
    geography — so its codes must not be mixed in, and an INSERT without a genuine `ons_code` fails
    on NOT NULL; a duplicate code fails the whole statement on UNIQUE. **The right source is
    `BUA_2022_GB`** (same ArcGIS host, fields BUA22CD/BUA22NM/LAT/LONG, 8,545 rows, GB-wide so
    Edinburgh and Glasgow are in it; Belfast is NOT — Northern Ireland needs its own source or is
    dropped). Nothing in code reads `ons_code`; the lookup keys on `name`. Reason for the park:
    the gate has never refused a free check, and adding the cities switches it ON for the biggest
    markets mid-test (84 verdicts change). Pick up with: BUA22 codes + centroids for the 21 names,
    de-dupe against existing codes, one idempotent INSERT, then re-run `scripts/_distance-rerun.ts`.

---

## 23. ✅ THE FIVE FIXES AFTER THE FIRST END-TO-END TEST — internal measurements, the fill, the labels, the client card, the stored task (2026-09-13, afternoon)

Paul's brief after the free-check → pay → baseline → full-measure chain passed live. All five built,
deployed and confirmed the same afternoon. Deployed: `render-audit-report` v94, `create-ai-audit`
v111, `process-ai-audit-queue` v158, `process-whatsapp-queue` v125, `whatsapp-status` v76,
`submissions` v36, `stripe-webhook` v85, `findable-onboarding` v87. Honest green is **84/89** now
(the same five known-stale suites fail; two suites were added — `question-fill`, `lead-status-patch`).

- 🔴 **THE PUBLIC RENDERER SERVED THE CLIENT DOCUMENT FOR ANY AUDIT ID, INCLUDING A FULL MEASURE.**
  `findable.live/report/d3453511…` rendered AD Locksmithing's 18-question winnable-questions audit
  as a client report; the only protection was that nothing sent the link. **`isInternalMeasurement`
  (`src/lib/auditKind.ts`) is the one predicate**: purpose `measurement` / `remeasure`, or the
  legacy shape multi-run + `is_measurement` (RG's 26 Aug and 8 Sep re-measures). Read by the
  renderer (**403 + operator-only notice, `no-store`, before any run row is read**, verified live:
  d3453511 → 403, c0343d99 and c39bc81c → 200 with `class="src"`), the Baseline screen (no "View
  client report"; heading says what it is) and the cockpit.
  - 🔴 **THE COCKPIT'S "BASELINE REPORT" LINK POINTED AT THE FULL MEASURE.** It resolved "the newest
    audit with a run target" — which under §19 is the full measure at day 0. RG's cockpit opened his
    26 Aug measurement, not his 11 Aug baseline. **It reads `outreach_leads.baseline_audit_id`
    first now**, and never falls back to an internal measurement. That is why d3453511 appeared
    under a `/baseline/` URL: the route serves any audit id; the LINK was wrong.
  - **The operator label is `INTERNAL_MEASUREMENT_LABEL` = "Winnable questions audit (internal)"**
    (pill + Baseline heading). ⛔ The stored value stays `measurement` — the pointer trigger and the
    partial unique index read it.
- 🔴 **WHY THE BASELINE QUEUED 11 OF 12 AND THE MEASURE 18 OF 20.** Two model calls (money +
  standard) → concatenate → **slice to target → THEN dedupe**, with nothing to top up. Not a guard
  (guards top up from templates), not a miscount. **`src/lib/questionFill.ts` owns the order now:
  exclude → dedupe → slice → top up** from the deterministic templates (town always present), at
  every slice site in `create-ai-audit` (`fillGenerated`), with counts logged. Identity at
  GENERATION is by **intent** (`questionIntentKey`: trailing plurals folded per word) so "safe
  installation" / "safes installation" and "service" / "services" no longer queue twice.
  ⛔ **`questionKey` (the replay's identity, `excludeAsked`) is UNTOUCHED** — a stored question and
  its day-28 replay are byte-identical and must stay matched by the old rule. Cost of the plural
  fold: zero spend, ~40 lines, one accepted merge ("locks" = "lock"); a stemmer was rejected.
  - 🔴 **THE FINALISER WIPED THE RUN NOTES.** `process-ai-audit-queue` built `results` from scratch
    at finalisation, so `full_measure: { comparable: false }` and `money_questions`, written by
    create-ai-audit at creation, were gone from every finalised run — neither live measurement run
    carried its "not comparable" flag. It spreads the row's existing `results` first now. ⚠️ The
    two September runs already finalised are NOT backfilled; the flag exists on runs from v158 on.
  - ⚠️ **Dropped strings live only in `console.warn`** and the CLI cannot read logs, so which two
    questions the measure lost is unknowable; the mechanism is proven by the test, not by a row.
- **AI OVERVIEW: switched off in the actor INPUT, present in the OUTPUT.** The actor returns the
  block whenever Google showed one and the probe keys pick it up (4 of 11 baseline questions, 8 of
  18 measure). Display-only, never scored — `SCORED_ENGINES` is chatgpt + gemini, and the bands,
  the named rate and the report figure read only those. Recorded already at `auditReport.ts:1109`.
- **THE WEEK-8 STRING THE SWEEP MISSED WAS AN OPERATOR SCREEN.** `baselineView.ts`'s HELD band said
  "week-8 comparison"; `client-copy-claims.test.ts` scanned only the eight client-facing renderers,
  by design. It now has **`OPERATOR_SCREENS`** too (whole comment-stripped source — JSX text is not a
  string literal) with one allowed true sentence (RG's eight weeks by contract). **Add any new
  operator screen to that list.** The two "· free" suffixes (a SPEND label, house convention from
  Coverage — it read as a price on a paid client's screen) are gone from the Baseline buttons.
- ✅ **THE DASHBOARD HAS A PER-CLIENT VIEW: `ClientDeliveryCard`.** Paying = `amount_paid > 0`, not
  archived, not `refunded` (refunded counted, not shown). Per client: the week-four light, **the door
  to `/baseline/<baseline_audit_id>`** (pointer only — a lead with no pointer says "no baseline
  yet"), the lead card, the page plan, and the checklist.
  - ⛔ **ONE LIST, ONE COMPONENT, TWO HOMES.** `DELIVERY_CHECKLIST_ITEMS` (`src/lib/deliveryCockpit.ts`)
    is rendered by `DeliveryChecklistList` in BOTH the lead card's cockpit and the card, stored where
    it always was (`outreach_leads.delivery_checklist`). Paul's order: baseline checked → baseline
    sent → directories → GBP → **pages (derived, one line per `client_pages` row, ticked live
    directly on the row via `useClientPages`)** → website → week-four re-measure → results sent.
    Three new keys landed on RG's existing map without touching it; an old stored `pages: true` is
    ignored (`checklistDone` counts `TICKABLE_ITEMS` only).
  - ⚠️ **"Results sent" is a manual tick until the four-week sender exists** (§19 open item 1);
    when it does, it should STAMP this rather than a person ticking it. "Baseline checked" is a
    deliberate human gate — the baseline must never auto-send.
  - ⚠️ A page's "built" tick writes `client_pages.status` live ↔ planned **directly** (owner RLS
    `for all`); the page-generator's `plan_update` whitelists only planned/held/removed on purpose.
- 🔴 **625 LEADS CARRIED AN OVERDUE `send_draft` NEXT ACTION THAT NOBODY SET.** `whatsapp-inbound`
  wrote it on every reply, `statusUpdatePatch` on a hand-set "replied", and nothing cleared it when
  the operator answered. The card had hidden them since 2026-07-28 (`isRedundantAutoReply`) but
  every Outreach row still showed "Respond", sorted by it and counted it overdue. **Both writers are
  gone; a stored next_action is only ever something a person set.** Paul cleared the 625 by SQL.
  `statusUpdatePatch` moved to the pure `src/lib/statusPatch.ts` (re-exported) so it is testable.
  - **The card gains "Clear all stored tasks"** (owner-scoped update where `next_action` is set,
    count reported) and **a dismiss on derived rows** (reply / chase / quoted — never Deliver) that
    marks the lead `closed` after a confirm: derived rows are evidence, and the only honest way to
    make one go is to change the lead's status.
  - **Why the two "messes" accumulated:** stored tasks were written on every reply and cleared by
    nothing; derived reply rows never expire because a conversation ending on the prospect's
    message stays "unanswered" until the lead is closed; chase rows were Paul's own test
    submissions; the questionnaire card's 50 rows were 43 test submissions (move37.fun addresses).
    Bulk delete for submissions **already existed** (Delete selected / Delete all, paid rows kept).

---

## 24. ✅ THE PAYMENT EMAIL SAID "NOT PAID", AND THE FOUR-WEEK RESULTS NOW HAVE A SENDER (2026-09-13, late afternoon)

Deployed: `notify-onboarding-submit` v35, `stripe-webhook` v87, `process-ai-audit-queue` v159,
**`render-remeasure-results` v1 (new)**, plus every function in `findableOffer.ts`'s import closure
(`findable-checkout` v49, `findable-onboarding` v88, `submissions` v37, `render-audit-report` v95,
`process-whatsapp-queue` v126, `send-whatsapp-message` v87, `instantly-push` v51, `market-view` v63,
`page-generator` v50, `run-seo-scan` v48). findable-site deployed (master `a0a4788`). Honest green is
**85/90** (the same five stale suites; `remeasure-results` added).

- 🔴 **PAUL PAID £108.99 ON 12 SEP AND WAS EMAILED "QUESTIONNAIRE SUBMITTED, NOT PAID".** Not a
  webhook race. `notify-onboarding-submit` judged each submission ROW alone, and he had restarted the
  form: a 12:35 row with no lead (checkout refused twice, `checkout_refused_no_lead`) turned twenty
  minutes old at 12:55, **one minute before its 12:54 sibling paid at 12:56**. Judged alone the first
  row was "true" and read as a lie. The second candidate: the lead was reset to unpaid by hand at
  13:02 (the ten-baseline clean-up), so the 12:54 row's own 13:14 re-check also saw an unpaid lead.
  The rows that would say which are gone (this morning's narrow delete removed both, and the
  ten-baseline clean-up deleted the audits and reset the lead) — the timeline above is from
  `client_error_reports`, which survived.
  - ⛔ **ONE PERSON IS ONE FAMILY** (`familyOf`): every non-free-check row sharing a contact email
    or a lead. A family with a paid member is retired, never emailed; a row is **not judged while a
    newer sibling is still inside its 20-minute window** (deferred, unclaimed); when one email does
    go out, the unpaid siblings are retired as covered by it. `stripe-webhook` retires the siblings at
    payment time too (belt and braces). Free checks are outside the family on purpose.
  - ⚠️ **`neq` DROPS NULLS** — the sibling-retirement filter uses `.or("source.is.null,source.neq.free_check")`
    because a sign-up row's `source` is NULL and `.not("source","eq","free_check")` would have skipped
    exactly the rows the fix exists for. SQL three-valued logic, in PostgREST clothing.
  - ✅ **THE PAID EMAIL LEAVES A TRACE NOW**: `client_error_reports` `payment_email_sent` (with the
    Resend id) / `payment_email_failed`. Until today its outcome existed only in an edge log nobody
    can read, which is why "was it ever sent?" for 12 Sep is unanswerable — the code path ran
    (`!alreadyPaid`), Paul's inbox is the only evidence.
  - **There is no customer payment EMAIL** — the customer's confirmation is the `payment_recieved`
    WhatsApp alone. The two payment emails both go to Paul.
- ✅ **THE FOUR-WEEK RESULTS ARE SENT — CLAIM FIRST, SEND, STAMP ONCE** (`_shared/remeasure-results.ts`,
  hooked into `process-ai-audit-queue`'s finalisation loop; same pattern as the free-check result).
  Lane: the audit is `purpose = remeasure` AND the lead's own `remeasure_audit_id` names it AND every
  run is settled. Comparison: `compareMeasurements(baseline rows, replay rows)` — **both engines
  pooled, Paul's call, stated knowing RG's pair reads +0.3 pooled**.
  - ⛔ **THE STAMP IS `outreach_leads.remeasure_results_sent_at`**, written by `.is(null).select()`
    — the once-only guarantee at 2,880 ticks a day. It is the START of the client's 14-day window;
    the close is `claimWindowCloseIso` (derived, never stored). A Resend refusal CLEARS the stamp
    and flags Paul: a failed email must not start a clock the client cannot see.
  - 🔴 **SQL NOT YET RUN (handed to Paul in chat):**
    `alter table public.outreach_leads add column if not exists remeasure_results_sent_at timestamptz;`
    Until it runs the claim update errors and the sender HOLDS (task + operator email) — never a
    silent send with no stamp.
  - ⛔ **"GONE UP" = `movement === 'improved'`, i.e. BEYOND `NOISE_BAND_PP`.** Inside the band is
    NOT gone up — the client qualifies for the refund, and is told so in the /refunds words. That is
    the reading Paul chose ("On RG that produced +0.3 and he would qualify. I know."). Do not soften
    it into "unchanged".
  - ⛔ **IT HOLDS TO A TASK, NEVER SENDS, WHEN THE NUMBER CANNOT BE PROVEN** (`remeasureResultsDecision`):
    replay gave up (complete runs < target, or a failed/capped run), no shared question, ANY matched
    question with fewer than `MIN_CELLS_FOR_QUESTION_CLAIM` cells on either side, no address, claim
    failed, Resend refused. A hold = `client_error_reports` `remeasure_results_held` (once per lead
    per hour) + an operator email; the Deliver card reads a finalised replay with no stamp as
    **"results held — needs you"**.
  - 🔴 **THE WORDS ARE GATED: `REMEASURE_RESULTS_COPY_APPROVED = false`** (`src/lib/remeasureResults.ts`).
    Every finished replay holds as a task until Paul approves the draft (email paragraphs +
    document "what this means" live in that file, one source for both). Flipping it is a commit and
    a deploy of `process-ai-audit-queue`, never a runtime switch. **RG is due 2026-10-06** — approve
    before then or his results will hold.
  - ⛔ **THE CLAIM SENTENCE IS ONE CONSTANT IN EACH REPO, BYTE-LOCKED**: `REMEASURE_CLAIM_SENTENCE`
    (`findableOffer.ts`) ↔ `REFUND_CLAIM_SENTENCE` (site `site.ts`), a `check-cross-repo-sync.mjs`
    PAIR in both repos; `/refunds` renders the constant instead of retyped text; the guarantee is
    asserted to END with it (`client-copy-claims.test.ts`). The email and document say it verbatim
    when the number has not gone up.
  - **The document**: `render-remeasure-results` (public, `verify_jwt = false`, in config.toml)
    serves `src/lib/remeasureResultsHtml.ts` — report chrome, both counts with denominators, the
    per-question table, the meaning paragraphs, no competitor names — at
    **findable.live/results/<remeasureAuditId>** via findable-site `functions/results/[id].ts`
    (a clone of the report proxy; the raw function URL is text/plain at the gateway). ⛔ **The stamp
    is the publish switch**: an unsent replay, a non-replay or a junk id all answer "Results
    unavailable" with no number. Verified live: preview and production both 404 for a baseline id.
    ⚠️ Production served the Astro 404 for ~3 minutes after the deploy while the preview URL served
    the function — propagation, not a routing fault. Probe again before diagnosing.
  - 🔴 **`measurementCompare.ts` AND `baselineView.ts` WERE UNREACHABLE FROM AN EDGE FUNCTION** —
    extensionless `./baselineView` / `./auditReport` imports and an `@/lib/auditReport` alias, the
    §4 trap in files nobody had deployed before. Fixed to `.ts` relative imports; a closure walk
    (`@/` or extensionless) over the new function found none afterwards. Walk it for any new
    edge entrypoint.
  - **Deliver checklist**: `results_sent` is kind **`stamp`** (system-written), never a tick;
    `TICKABLE_ITEMS` is six; the card shows sent date + window close, or held, or not yet.
  - **WhatsApp is a second step**, not built — it needs a new Meta template.

---

## 25. 🔴 THE FOUR-MINUTE GAP BETWEEN REPEAT RUNS WAS NEVER A SAMPLING SAFEGUARD (2026-09-13, evening)

**Read this before anyone "restores" sequential runs as a measurement protection. It never was one.**
Measured across **49 multi-run audits, 242 consecutive-run gaps**: median **4.0 minutes**, with 186 of
242 gaps between 1 and 5 minutes. Three runs are not three moments in any meaningful sense — they
are three samples inside about a quarter of an hour.

- ⛔ **AND `NOISE_BAND_PP = 5` WAS MEASURED ON RUNS IN THAT SAME RANGE.** The band's own
  justification in `measurementCompare.ts` cites SW2 (0.15 → 0.10 → 0.15) and MK Plumbing
  (0.35 → 0.35 → 0.30). Their real gaps: **SW2 6.2 and 5.1 minutes; MK 28.8 and 8.1 minutes.** So the
  five points describe sampling MINUTES apart. It has never been a day-to-day figure and must not be
  quoted as one.
- ⛔ **THE ONLY RECORDED REASON FOR SEQUENCING IS POLITENESS TO APIFY.** `audit-baseline.ts`'s header
  says: *"Sequential by design — each run takes minutes and there is no reason to hammer Apify in
  parallel."* Nothing anywhere claims the gap protects the measurement. The mechanism is one line —
  `if (usable.length < target && inFlight.length > 0) return;` — and it is a concurrency guard.
- ⚠️ **THE EVIDENCE DOES NOT SETTLE WHETHER ZERO GAP WOULD BE WORSE, AND THAT IS WHY THE STAGGER IS
  3 MINUTES RATHER THAN 0.** Flip rate between consecutive runs of one audit: **10.9% at ≤5 min
  (7 pairs, 156 cells)** vs **8.7% at >60 min (9 pairs, 92 cells)**. Close-together runs disagree
  slightly MORE, which is the opposite of the worry — and on that sample the difference is noise.
  There is no usable sample of simultaneous runs: the only two sub-minute pairs are Ronnie's
  replaced wrong-category runs and share too few questions to count. **Do not cite these numbers as
  proof either way; cite them as the reason not to go to zero.**
- **Real end-to-end wall clock, AD Locksmithing 2026-09-13:** baseline (11 q × 3) **13.3 min**, full
  measure (18 q × 3) **18.0 min**, free check (3 q × 3) **15.7 min**. A client waits ~40 minutes from
  payment to measured, and almost all of it is runs waiting for each other.

### ⛔ THE STAGGER IS UNSAFE UNTIL ONE INDEX EXISTS — `run_number` IS A READ-THEN-WRITE
`create-ai-audit` computes `runNumber = (lastRun?.run_number ?? 0) + 1` from a SELECT, and **nothing
in the database stops two inserts producing the same number.** The only thing preventing it today is
the in-flight guard the stagger would remove: `advanceBaseline` runs from TWO places every 30-second
tick (the finalisation hook and the sweep), so with a time-based predicate both can see "3 minutes
elapsed, one run exists" and both post run 2. Measured: **0 duplicate (audit_id, run_number) pairs in
1,000 rows** — because the guard works, not because the schema forbids it.
- **The fix is the same shape as `uq_ai_audits_one_remeasure_per_lead` (§19): let the INSERT be the
  claim.** With a unique index the loser gets 23505 and backs off. ⚠️ `create-ai-audit` handles 23505
  today only for the `ai_audits` insert (line ~1000); the **runs** insert has no such branch, so the
  index and the handling ship together or a race surfaces as a 500.
- ⛔ **SQL FIRST, CONFIRMED, THEN DEPLOY** (§3). The predicate stays sequential until the index is
  live.

### What was checked and is SAFE
- ✅ **Questions are readable the instant a run exists.** A repeat reads the previous run's
  `ai_audit_queue` rows, and those are written in the same instant as the run row — measured on AD's
  baseline: **first and last queue row +0.0s after the run row, all three runs.** So the stagger can
  key off "run started"; it does not need "run finished". The verbatim guarantee survives.
  - 🔴 **THE ONE LANDMINE, PRE-EXISTING AND UNCHANGED BY THIS:** if that read returns fewer than
    `MIN_QUESTION_COUNT`, create-ai-audit **silently GENERATES a fresh set** instead of repeating.
    That is the only path by which runs 2 and 3 could ask different questions from run 1, and it
    fails quietly. It is not made likelier by a stagger, but it is the thing to check first if a
    re-measure ever reports `incomparable`.
- ✅ **Finalisation does not care about overlap.** It fires on `usable.length >= target` — a COUNT of
  complete/capped runs — never on "the previous run finished", and the freeze is a conditional
  `.is("baseline", null)` write so exactly one tick wins. Overlapping runs change nothing.
  ⚠️ `usable.slice(0, target)` averages the FIRST `target` runs, so a race that produced a 4th run
  would pay for it and discard it.
- ✅ **The in-flight ceiling is untouched and still does its job.** `AUDIT_IN_FLIGHT_CEILING = 24` of
  Apify's 32, reserving 8 for directory scrapes and SEO — the reserve that existed because those
  starved on 2026-07-26. A row that meets the ceiling is **deferred back to `pending`, never failed**
  ("NOT A CAP AT ALL. The queue is busy"), so three overlapping 20-question runs queue in waves
  rather than breaking. **Parallel therefore does NOT mean 60 at once**, and the saving is bounded by
  the ceiling, not by the number of runs.
- ✅ **Apify cost is per question** ($0.0125 budgeted, $0.01155 measured), so firing together costs
  exactly what firing apart costs. There is no spend argument in either direction.

---

## 26. ✅ THE PRICE IS ONE SHAPE WITH TWO HALVES — swept both repos (2026-09-14)

**£99 to start, then £29.99 a month.** The machinery had been right since 09-13; the WORDS had not,
and every one of them was defensible alone. Together the site and the documents sold a one-off.
§1's first section carries the rule; this is what moved and what it cost.

- **findable-site:** the pricing heading ("Pay once." → the price, with the refund condition moved
  down into the guarantee band that already carries it word for word); the card (both figures, and
  `OFFER_COPY[1]` inside it saying what each half buys); a fourth timeline row; hosting back on the
  page; the FAB on every page ("Sign up · £99" → both figures); two FAQ answers; HowItWorks' "One
  project, start to finish."; /terms' "For the one-off fee we:"; /refunds' opening sentence; the pay
  screen's "What you pay" block.
- **LeadFinderOS:** `CARD_SAVED_NOTICE` (one string, shown by BOTH Stripe as its submit message and
  findable.live on its own pre-pay screen); the Stripe **product name** on the receipt; the report's
  only price sentence; the welcome pack, which had said nothing about the monthly at all.
- ⛔ **THE PAY SCREEN'S TICK LIST IS TWO LISTS NOW**, under "In your £99" and "In your £29.99 a
  month". Eight ticks under one figure meant three of them — the monthly's work — read as things
  the setup fee had already bought. "Help getting more Google reviews" LEFT the setup list rather
  than being copied down: keeping a weaker version above the real promise would sell the reviews
  work twice, once in each column.
- 🔴 **`FINDABLE_MONTHLY_GBP` MOVED TO THE TOP OF `findableOffer.ts`, AND THAT IS STRUCTURAL.**
  `CARD_SAVED_NOTICE` interpolates it, and a `const` referenced before its declaration throws
  **ReferenceError at module load** — in this file that is the checkout, not a screen. Third TDZ
  bite recorded in this repo.
- 🔴 **THREE FUNCTIONS FAILED TO DEPLOY ON A PRE-EXISTING FAULT, AND NOTHING LOCAL COULD SEE IT.**
  `src/lib/deliveryCockpit.ts` imported `'./findableOffer'` with no extension; tsc, `npm run build`
  and all 103 suites resolve that happily, so the gate read green and only the bundler said
  *Module not found … Maybe add a '.ts' extension*. **stripe-webhook, process-ai-audit-queue and
  render-remeasure-results sat on their previous version while `main` looked correct.** Fixed, and
  the closure re-swept: it was the ONLY extensionless relative import reachable from any edge
  entrypoint. The others in `src/lib` are SPA-only.
  ⚠️ **The sweep is worth re-running after any change that adds a file to an edge closure** — walk
  `from "./…"` from each `index.ts` and flag anything without `.ts`.
- ⚠️ **A NEGATIVE STRING CHECK WAS MY OWN CHECK'S FAULT, AGAIN.** The report's new line asserted
  false on five live documents because the source wraps mid-sentence and the served HTML carries a
  newline where my needle had a space. §4's rule, still earning its place: **normalise whitespace
  before believing a missing marker.** Proven live afterwards on all five.
- **Deployed:** the 13 functions in the changed closure — findable-checkout v54, render-audit-report
  v101, stripe-webhook v103, process-ai-audit-queue v172, render-remeasure-results v13,
  findable-onboarding v97, submissions v42, process-whatsapp-queue v132, send-whatsapp-message v91,
  instantly-push v55, market-view v68, page-generator v54, run-seo-scan v52. findable-site deployed
  with `npm run deploy` (no CI) and verified live by string on /, /terms, /refunds and the
  onboarding island.
- ⚠️ **NOT VERIFIED, AND IT NEEDS A REAL PAYMENT:** `CARD_SAVED_NOTICE` and the new Stripe product
  name are proven by source and deploy only. Both render on Stripe's own hosted page, which is a
  JS shell that tells a fetch nothing (§6, §11) — the first real Checkout Session is the proof.
  The guarantee description is 236 chars against a 222-char proof, so that is the same session.

---

## 27. 🔴 THE NAME THAT SCORES ITSELF — §6b's gate restored and wired (2026-09-15)

**`named` is `nameMatches(answer_text, businessName)` at scan time (`ai-search.ts:278`), so a
business CALLED "Blackpool Plumber" scores on an answer about plumbers in Blackpool without the
engine having any idea who they are.** Every naming rate in the product was inflated by those
audits, and the excluded set scores **roughly double** the rest — which is the proof it is the
matcher and not the market.

- ⛔ **THE PREDICATE IS `nameIsJudgeable` (`_shared/derivable.ts`), AND IT IS THE NAME CLAUSE ALONE.**
  `canDeriveReport` asks two things — is the name findable, and did we look hard enough —
  and a stored `named` flag has already looked. **Bypassing `MIN_ANSWERED_DATAPOINTS` is
  deliberate**: a 3-question hook carries 6 answered cells and would otherwise delete most of the
  book from every trade-level figure. One rule, two questions; do not write a second copy.
- ⛔ **DERIVED ON READ, NEVER STORED — Paul's explicit instruction ("Do not rewrite stored scores.
  Apply it going forward").** Same shape as `serveGate` and `townVerdict`: no column, no migration,
  and historical rows are covered by the same predicate as new ones. Nothing was backfilled.
- **The caller is `market-view`'s niche fold.** An unjudgeable audit is excluded from the per-engine
  named rates **and from winnability** — `classifyWinnability`'s first branch is "were they named",
  so it carried the identical inflation into the column towns are picked from. **Its citations still
  count**: which sources an engine reads for a trade is independent of what the business is called.
  The exclusion is **itemised on the panel**, and a trade where EVERY audit is unjudgeable is a
  **refusal with the server's own reason**, never "0 named of 0" (the absent-value inversion, on the
  number that decides whether a trade is worth working).
- ✅ **THE CLIENT REPORT IS GATED TOO — Paul approved the wording and it is LIVE (2026-09-15).**
  `buildReportData` derives `nameNotJudgeable` from the same three fields the audit ran against, so
  it cannot disagree with what the questions asked. **Derived on read; nothing stored, no migration,
  every historical report covered by the same predicate.**
  - ⛔ **IT REPLACES THE HERO. NOT A CAVEAT UNDER IT.** Paul's rule: *a true sentence under a false
    headline is still a false headline.* The hero block, the number, the band and the verdict punch
    do not render at all — the same shape as the `measuring` branch. **Paul's words, verbatim:**
    *"Your business name is made of the same words as your trade and your town, so an automated
    check can't tell a mention of you apart from a mention of the search itself. We check this one
    by hand before we send it."*
  - ⚠️ **BOTH HALVES OF THAT WORDING ARE DELIBERATE AND HE CORRECTED MY DRAFT ON BOTH.** It LEADS
    WITH THE NAME — my version led with what we cannot do, which reads as blaming their name for our
    problem — and it says **"an automated check can't", never "we cannot"**: a person CAN tell, it
    just takes a person.
  - ⛔ **THREE OTHER PLACES ASSERTED THE SAME THING AND ALL THREE MOVED WITH IT**, because leaving
    any one of them means the reader meets the claim four inches lower: the gutbox's *"AI never
    named X"* line, its **"Who AI named INSTEAD"** heading plus *"named most often instead"*
    ("instead of you" IS the refused claim), and the fix section's *"Being absent is not bad luck"*.
  - ⚠️ **WHAT STILL RENDERS, BECAUSE IT IS STILL TRUE:** which firms AI named (that does not depend
    on what the client is called) and the website scan (it measures their SITE). Withholding those
    would be a second refusal for a problem they do not have. **The MEASURING branch still withholds
    the SEO slot** — there the numbers are genuinely mid-flight.
  - **`scripts/report-name-refusal.test.ts` pins the property as ABSENCE, not presence**: the claims
    must be gone from the whole document, and `nameNotJudgeable: false` must render BYTE-IDENTICALLY
    to an absent field.
  - ✅ **Verified live on the real rows:** CJ Plumbing Services (was 0/6 + "AI never named") and
    Burnley Locksmiths (was 6/6) both serve the refusal with no number; **Power pulse** (judgeable)
    still serves its hero and "Who AI named instead". ⚠️ RG's `876579bd` answers **403** — that is
    §23's internal-measurement gate working, not a fault.
  - ⛔ **THE 64 ALREADY OPENED WERE NOT REGENERATED OR RESENT — Paul's call, 2026-09-15.** Reports
    render live, so the link they hold now serves the corrected document by itself. Nothing was
    re-sent and no audit was re-run.
  - ⚠️ **`src/lib/auditReport.ts` NOW IMPORTS `supabase/functions/_shared/derivable.ts`**, the same
    shape as its existing `market-match.ts` import and Deno-global-free. **That put derivable.ts in
    ten functions' closure** — findable-onboarding, instantly-push, market-view, page-generator,
    process-ai-audit-queue, process-whatsapp-queue, render-audit-report, run-seo-scan,
    send-whatsapp-message, submissions. All ten redeployed, which is also what proves the bundler
    resolves that direction.
  - ✅ **IT CANNOT CONTRADICT THE SITE, AND THAT WAS CHECKED RATHER THAN ASSUMED (2026-09-15).** The
    report carries **no book-wide statistic at all** — grepped: no 628 / 761 / 11.8 / 43.7 / 43,035
    in `aiAuditReportHtml.ts`, `welcomePackHtml.ts`, `remeasureResultsHtml.ts`, `auditReport.ts`,
    `clientRequestDoc.ts` or `playbookDoc.ts`. Every figure in a report is that ONE business's own
    count: *"AI named <b>X</b> N times out of M answers"*.
  - 🔴 **BUT IT HAS THE SAME FAULT IN ITS OWN NUMBERS, MEASURED: 64 of the 495 opened reports (13%)
    carry an unjudgeable name, AND IT BREAKS BOTH WAYS.** Flattering: Burnley Locksmiths, Norwich
    Plumber, Locksmiths Canterbury, MJS Locksmiths and DS Locksmiths were each told **6 of 6** —
    "AI already names you everywhere", which kills the sale on a claim we cannot support.
    Damning: "CJ Plumbing Services" (strips to `cj`) and "A Plumbing Company" were told **0 of 6**,
    and the hero renders that as **"AI never named you"** — §6b's Wilson failure, live, on a
    document we send.
  - ✅ **NO PAYING CLIENT IS AFFECTED.** RG Locksmiths, Ronnie's Shoe Repairs and SC Plumbing & Gas
    all pass the gate, so no refund evidence and no frozen baseline is touched.
  - **The draft awaiting one word from Paul**, for the hero when the name is not judgeable:
    *"Your name is the same words as your trade and your town, so we cannot tell a mention of you
    from a mention of the search itself. We measure this one by hand before we send it."*

### The corrected historical figures (measured read-only 2026-09-15, nothing written)
| | as the site says | corrected |
|---|---|---|
| Businesses / audits | 628 / 761 | **941 / 1,013** (the book has grown; 628 is not reproducible) |
| **Gemini** names them | 11.8% | **9.7%** (466 / 4,811) |
| **ChatGPT** | 43.7% | **33.2%** (1,599 / 4,810) |
| ChatGPT ÷ Gemini | 3.7x | **3.43x** (was 3.22x uncorrected — **the gate makes the ratio stronger**) |
| Trades / towns | 14 / 187 | **17 / 223** |

- **132 of 1,145 business audits refuse** (127 businesses). **129 of those 132 are genuinely all
  trade and town**; only 3 were refused for an initialism remainder. Real examples: "Accountant"
  (Portsmouth), "plumbers in southport", "Blackpool Plumber", "Locksmiths Canterbury", "The Leeds
  Locksmith".
- ⚠️ **11.8% AND 43.7% WERE NEVER REPRODUCIBLE FROM TODAY'S ROWS ANYWAY** — they are a July/August
  snapshot of a smaller book. **Re-derive before quoting; do not inherit any number in this table.**
- ✅ **findable-site IS UPDATED AND LIVE (2026-09-15, master `14558b4`, `npm run deploy` — no CI).**
  Three files: `WhyThisWorks.astro` (the headline sentence, the expander's engine split, the sources
  line), `Faq.astro`, `research.astro` (title, meta, JSON-LD headline, h1, lead, method, Finding 1).
  Verified live on **/** and **/research/** by RENDERED TEXT, not markup: every new figure present,
  every retired one absent.
  - **Paul's wording, and the em dash is banned in it:** *"We audited 941 local businesses. Gemini
    named them in just 9.7% of answers. ChatGPT named them three and a half times more often."*
  - ⛔ **CHATGPT IS A RATIO ON THE HOME PAGE, NEVER A SECOND PERCENTAGE.** That file's standing rule
    is that a skimmer meeting two percentages takes the bigger one and concludes directories win —
    the opposite of what the section argues. "Three and a half times more often" carries the
    comparison with nothing to anchor on. **33.2% stays in the expander**, where it has a paragraph.
  - **Two figures moved that are NOT naming rates**, both re-derived over the same judgeable set:
    **61,848 citations** (was 43,035) and **9,621 scored answers** (was 7,283). The old pair was the
    smaller book, not the gate.
  - ⛔ **Finding 1 said Checkatrade appeared in NO accountant audit. It is 1 of 80 now, so "none"
    was false and is corrected.** Plumbers went 167/174 → **394 of 411**. Neither is a naming rate;
    both are breadth over a book that grew.
  - ⚠️ **The retired figures survive VERBATIM inside the design-history comments**, flagged as
    retired at the top of the block. They are the record of what the page actually said — the same
    rule as the historical `re_engage` body (§19). Do not "correct" them.
  - ✅ `/research`'s standing note that per-engine rates were too stale to publish is **answered**:
    they exist now (9.7% / 33.2% over 9,621 answers). Finding 4 is writable whenever Paul wants it.

**Deployed:** `market-view` **v71** (its only new import is `derivable.ts`; no other function reaches
it — the two other greps are comments, §4). SPA pushed. `npm run check`: **105/110**, the five
known-stale suites only.

---

## 28. ✅ findable-site CREDIBILITY PASS — the control claims are gone (2026-09-15)

**Three sentences on the site claimed we control an engine's output. All three are gone, and they
were the same shape: a correlation stated as a cause.** Deployed (master `e8b1a15`, `npm run deploy`
— no CI), verified live on **/** and **/research/** by rendered text.

| Was | Now |
|---|---|
| Hero: *"Findable makes sure the name it gives is yours"* | *"helps make your business one of the names AI can confidently recommend"* |
| *"Write the page and the fallback stops being necessary: you go from absent to named"* | what AI needs, what is patchy, what we strengthen — then the re-measurement carries the claim |
| *"nothing to fail"* (IcpHosting **and** Faq) | *"no traditional servers or databases to hack and nothing to update"* |

- 🔴 **"nothing to fail" WAS PAUL'S DELIBERATE EXCEPTION AND HE REMOVED IT HIMSELF.** §26-era notes
  in two files said "do not soften without asking him" — the 2026-09-15 brief names the phrase, so
  the carve-out is closed. **There is no absolute left standing on the site.** ⚠️ It survived the
  first edit by ten minutes because `Faq.astro` is a SECOND COPY of the same claims, and that
  answer is emitted as **FAQPage JSON-LD** — the absolute was structured data Google reads. Change
  one, change the other.
- ⛔ **"Why AI names someone else" IS NOW "There is no universal AI visibility checklist".** The old
  heading sat over a chain ending "we build the pages that get you named" — a mechanism stated as a
  cause, which the data does not support (a correlation plus one before/after, ABLM 0 → 3 of 18).
  The new framing leads on the finding **nobody else in this category publishes**, over the workflow
  it forces: measure your market, find the gaps, improve what you control, re-measure at four weeks.
  ⚠️ **Those four beats deliberately echo #how's four cards. Do not resolve that by deleting one** —
  #how says what we do in order; these say what the finding forces. The file's header explains it.
- ⛔ **THE EXAMPLE REPORT NO LONGER CREDITS SCHEMA.** Day 0 led with "no structured data" and Week 4
  with "structured data added and validating", beside a visibility rise — while **/research says in
  print that schema made NO measurable difference (35% vs 32%)**. Two of our own pages, one
  contradicting the other. Both lists now lead with pages and consistent business information and
  name technical hygiene **last, as hygiene**. The "Example report · invented business" label also
  moved onto the sheet as a chip rather than living only in the 10px footer.
- **Added:** a four-label strip under the guarantee (**same business / same questions / same engines
  / four weeks later**) so the comparison the refund turns on is legible at a glance — it states the
  existing §19 mechanism and must never grow into a ranking promise; **"Why £99?"** above the pricing
  card (no margins, no internal economics, Paul's rule); the free check's *"Not everyone needs us"*
  lifted out of the dimmest text on the page.
- 🔴 **THE RESEARCH PAGE DESCRIBED A SCAN THAT DOES NOT EXIST.** It read *"a mid-point scan at week
  four, and at week four the same questions re-run"* — two events on one day, one of them not in the
  product. Checked against the code, not guessed: `REMEASURE_OFFSET_DAYS = 28`, baseline day 0,
  replay day 28, **no midpoint**. Phrase removed rather than given an invented date. Also
  "an four-week" → "a four-week" (the same typo survives in `ReportWeek4.astro`'s header COMMENT,
  which renders nowhere — left alone deliberately).
- ⛔ **ONE BRIEF INSTRUCTION DELIBERATELY NOT FOLLOWED, AND IT WAS FACTUAL.** It asked to keep
  628 / 14 trades / 187 towns / 43,035 / "167 of 174" / accountants **"none"**. Those were corrected
  hours earlier (§27) and **"none" is now measurably false — it is 1 of 80**. The brief's own rules
  (source of truth; no accidental number changes) point the other way, so its section-4 STRUCTURE is
  implemented verbatim with the corrected figures. **Flagged to Paul before starting, not after.**
- **QA, all run rather than asserted:** build clean, `check-cross-repo-sync` 10/10, **no horizontal
  scroll at 1440 or 390**, no page JS errors, no broken in-page anchors, free-check form intact,
  every research figure still rendered, and an absolute-claims regex sweep over all seven built
  pages comes back **empty**. Home grew **2.9% desktop / 4.9% mobile** (measured against a stashed
  pre-change build, not estimated).

---

## 29. ✅ THE GREETING NAME — two styles, because there are two grammars (2026-09-15)

**`src/lib/displayName.ts` shortens the Google Maps listing before it reaches Meta.** It was one
rule; it is two, and the split is the SENTENCE the name lands in, never the template's tone.

| style | frame | rule |
|---|---|---|
| **`greet`** (default) | `"Hi ${b},"` / `"Hi ${b} 👋"` | the full peel — trade tail + legal suffix |
| **`identify`** | `"Hi, is this ${b}?"` | **the LEGAL suffix only** |

- 🔴 **WHY, IN PAUL'S WORDS:** *"Hi, is this Zest?" and "Hi, is this Park?" read like a wrong
  number.* He asked for one rule, saw the comparison and changed his mind on the spot: **"Hi, is
  this Beeson?" and "Hi Beeson Plumbing & Heating Ltd," are opposite failures.** One is a stranger
  with no context; the other is a mail merge. `initial_contact` is the ONLY live body that asks an
  identification question — every other one addresses them.
- ⛔ **`IDENTIFY_NAME_TEMPLATES` IS THE ONE PLACE THE SPLIT IS DECIDED**, read by THREE renderers:
  the Meta parameter (`whatsapp-send.ts`'s variable resolver), the stored body
  (`renderTemplateBody`) and the Inbox mirror (`templateBodies.ts`). Written out at any of them it
  is the one-rule-in-N-places failure recorded five times in this file, and the **transcript would
  drift from the message** on the next template added. Membership is decided by reading the body's
  opening line, not by how formal it feels.
- ⛔ **TRAILING LEGAL WORDS ONLY, AND THAT IS MEASURED, NOT CAUTIOUS.** Of 3,641 distinct business
  names, **980 carry a legal token: 897 end in one, 8 sit immediately before a parenthetical, 75
  are MID-NAME.** Stripping those in place gives *"Asmat & Accountants"* and *"JM Price &
  Accountants"* — a fragment, the one output this module exists to refuse. Paul's call: *"trailing
  only is the correct call."* The parenthetical carve-out exists because he specified its output:
  `RJW Electrical Ltd (Sutton Coldfield)` → `RJW Electrical (Sutton Coldfield)`.
- **What it moves:** greet shortens 1,817 of 3,641 names (49.9%); identify shortens 904 (24.8%).
  **1,166 names keep their trade words on the opener** that used to lose them.
- ⚠️ **greet IS BYTE-IDENTICAL TO BEFORE and the suite pins it** — an absent `style` renders the
  same as an explicit `greet`, so `video_template`, `competitor_hook`, `free_check_result`,
  `re_engage_49` and `payment_recieved` are untouched. **`audit_followup` and `explain_offer` carry
  no name variable at all** and could not have been affected either way.
- **Deployed:** the ten functions in the closure, walked from each `index.ts` rather than inherited
  — create-ai-audit, findable-onboarding, mockup, process-ai-audit-queue, process-sms-queue,
  process-whatsapp-queue, send-whatsapp-message, stripe-webhook, submissions, whatsapp-status.
  `npm run check`: 107/112, the five known-stale suites only.

---

## 30. 🔴 THE INBOX READ A SECOND TEMPLATE LIST, AND THE IDENTIFY NAME KEPT ITS TOWN (2026-09-15)

### The sixth copy — four approved templates were sendable and invisible
`src/hooks/useInbox.ts` exported **`WA_REPLY_TEMPLATES`**, seven entries, and BOTH Inbox pickers
(the thread composer and the bulk-send dialog) read it instead of `WHATSAPP_TEMPLATES`. So a
template could be registered at Meta, wired into the server registry, added to the real list — and
never appear on the one screen an operator sends from.
- ⛔ **MEASURED COST: `competitor_hook` was approved 2026-09-14 and UNSENDABLE FROM THE INBOX from
  that day.** `audit_followup`, `explain_offer` and `contact_followup` were invisible too. Paul
  reported two missing; it was four.
- ⚠️ **AND THE FIRST DIAGNOSIS ALMOST WENT THE OTHER WAY.** The deployed chunk was checked first
  (§4) and my grep said the two templates were ABSENT from the live bundle — **my own check's
  fault**: `audit_followup`'s label contains `"` so Vite emits it in SINGLE quotes, and the pattern
  matched `label:"…"` only. They were live the whole time. Match the shape, not the quoting.
- ⛔ **THE LIST IS DELETED, NOT TOPPED UP** — Paul's instruction, and the right one: a copy is
  correct the day it is written and wrong the day a template is added.
- 🔴 **`template-picker-parity.test.ts` ALREADY EXISTED AND PASSED THROUGHOUT.** It compares the
  server registry against `WHATSAPP_TEMPLATES` and both were correct. **Nobody had asserted that
  the SCREENS read that list.** The property is not "is the list right", it is **"is there only one
  of it"** — the same answer `questionnaire-complete` and `audit-kind` reached. Its new section
  sweeps all 279 SPA files for an option-list literal (`{ name|value: '<a real template>' }`)
  outside `src/types/outreach.ts`, matching on **SHAPE so a renamed copy is caught too**, and names
  the four templates individually. **Proven to FAIL on a reintroduced three-entry list** before it
  was accepted.
  ⚠️ Bare-string sets (Inbox's `REPORT_TEMPLATES`) and label MAPS (`TEMPLATE_DISPLAY`) are
  deliberately NOT matched — naming a PAST message is a different question with its own list.
- ⚠️ **`contact_followup` HAD NO `WA_TEMPLATE_REQS` RECORD**, and it did not matter while the Inbox
  could not see it. `getTemplateSendability` answers `if (!req) return { ok: true }` — **an absent
  record is offered UNGATED**, the absent-value shape pointing the wrong way on a picker. It has a
  record now. The permissive default is left alone (flipping it would silently disable anything
  else unlisted) but **every `WHATSAPP_TEMPLATES` entry should have one**.

### The identify name loses a trailing town, then "Services"
"Hi, is this **RJ Burns Electrical Services Harlow**?" — the trade words are right to keep (§29),
the TOWN is not. Two steps added to `identifyName`, in this order, after the legal strip:
- **A TRAILING TOWN, proven only by the town the LEAD ROW carries** (`opts.town`). ⛔ **No
  gazetteer in this leaf**: `uk_towns` is a 733-row table and copying it is the same failure as
  above, so **no town on the caller means the strip does not run** and the output is exactly
  today's. ⛔ **TRAILING ONLY** — "Bristol Electricians" survives untouched even with Bristol
  supplied, because **position is the test, not membership**.
- **Then "Services"/"Solutions", ONLY where a TRADE word survives AND two words remain.** So
  "Shaw Plumbing Services" → "Shaw Plumbing", while "Pyramid Services" is kept whole and a bare
  "Shaw" is impossible by construction. Paul's guard, his wording.
- ⛔ **ORDER IS LOAD-BEARING.** "…Electrical Services Harlow" only reveals its "Services" tail once
  the town is gone; generic-first cuts nothing and strands the town.
- 🔴 **THE CONNECTOR REFUSAL — Paul's call on the ONE case in 364 this got wrong.** *"Ollie's Lock
  & Safe Locksmiths Cheltenham & Gloucester"* is a two-town **LIST**, and stripping the matched half
  presented half a list as the whole thing. ⛔ **Only `&` / `and` / `+` refuse.** A DASH or COMMA is
  an appended qualifier — "PME Heating & Plumbing - Bolton", "AquaPlumb - Emergency Plumber -
  Harlow" — and is precisely what this removes. Treating all of `CONNECTORS` as a list marker
  refused both of those real rows; the test caught it, not review.
- ⚠️ **AND WHAT REMAINS MUST NAME SOMEBODY.** "Plumbing Harlow" minus the town is "Plumbing", a
  bare trade word — the wrong-number failure the identify style exists to prevent. One word is
  enough only when it is not vocabulary ("Toolstation March" → "Toolstation").
- 🔴 **IT WOULD HAVE BEEN DEAD CODE WITHOUT THE LAST LAYER, AND THAT IS §4's RULE AGAIN.**
  `initial_contact` is the ONLY identify template and it is sent from the **plain branch** of both
  senders — which passed **no town at all**. Both lead selects now carry `derived_town` /
  `search_location` and both branches pass it. ⚠️ It is the name rule's EVIDENCE, never a Meta
  parameter: `claimTemplatePayload` reads `extra.town` for a town VARIABLE only when the registry
  declares one, so no parameter can be added or shifted.
- **Measured live through the shipped function: 1,441 of 3,624 unarchived names shorten (39.8%).**
  `greet` is byte-identical and the suite pins it.
- **Deployed:** the ten functions in the closure, re-walked from each `index.ts` rather than
  inherited — create-ai-audit, findable-onboarding, mockup, process-ai-audit-queue,
  process-sms-queue, process-whatsapp-queue, send-whatsapp-message, stripe-webhook, submissions,
  whatsapp-status. `npm run check`: **107/112**, the five known-stale suites only.

### 30b. 🔴 audit_followup 500'd ON ITS FIRST REAL SEND — the branch predicate named yesterday's variables (2026-09-15)

**BS4 Electrical Services Ltd. "Edge Function returned a non-2xx status code."** Nothing was wrong
with the lead: replied, window open, audit complete, trade `Electricians`, town `Bristol`, **24
distinct competitor names**.
- ⛔ **THE NON-2XX IS ITSELF THE DIAGNOSIS, AND IT IS THE FASTEST TRIAGE ON THIS ENDPOINT.** EVERY
  designed refusal in `send-whatsapp-message` returns **200 with `ok:false`** — `pitch_already_sent`,
  `audit_reply_unavailable`, `unsafe_template_var`, `followup_unavailable`, `no_business_name`. A
  **non-2xx is therefore never a refusal working as designed**; it is `unknown_template` (400) or
  `internal` (500), and 500 logs to an edge log **the CLI cannot read**. Check the status before
  hunting the rival guard or the town gate.
- 🔴 **THE CAUSE.** Both senders decided "does this need the lead's audit?" as
  `vars.includes("trade") || vars.includes("competitors")`. **`audit_followup` declares
  `trade_plural`, `town`, `rival_1..3`, `audit_url` — and neither of those two.** It answered NO,
  fell to the **PLAIN opener branch**, and `claimTemplatePayload` ran with no trade, no rivals and
  no report link. The first resolver threw, **the plain branch has no catch**, and the outer handler
  returned 500. `competitor_hook` has the identical shape and was **one Inbox press behind it** — it
  only became reachable there the same morning (§30).
- ⛔ **THE GUARD-KEYED-TO-TODAY'S-INSTANCE FAULT AGAIN (§8), and the two copies were byte-identical
  AND both wrong** — a reviewer diffing them would have found them in perfect agreement.
- 🔴 **THE CORRECT RULE ALREADY EXISTED AND ITS COMMENT CLAIMED THE SENDERS USED IT.**
  `_shared/outreach-audit.ts`'s own `templateNeedsAudit` includes `audit_url`, so it would have
  routed both correctly, and it said of itself *"the same rule the two send paths use to fill the
  payload"*. **False — a stale comment as a load-bearing bug (§4).** Corrected, not merged.
- ⛔ **AND MERGING THEM WOULD BE WRONG: THEY ARE TWO QUESTIONS.** `outreach-audit`'s asks *does this
  message need a completed audit to EXIST* (used for waiting, deliberately broader); the senders'
  asks *which branch BUILDS this payload*. **`free_check_result` proves the difference** — it
  declares an onboarding link AND a report link, so it builds on the ONBOARDING branch while still
  needing an audit to exist.
- **THE FIX: `src/lib/templateRouting.ts`** — `AUDIT_DERIVED_VARS`, `branchForVars`,
  `buildsFromAudit`, `BRANCH_SUPPLIES`, read by both senders. ⛔ **Nothing in it names a template**,
  so one registered tomorrow with a new audit-derived variable joins the right side by construction.
  ⚠️ **Order is part of the rule**: `contact_first_name` → `onboarding_url` → audit vars → plain.
  `onboarding_followup` declares `trade_plural` and is matched FIRST by `onboarding_url`; reordering
  routes it to the audit branch and refuses every lead without an audit for a message that needs none.
- **`scripts/template-routing.test.ts` asks COVERAGE, not routing**: for the branch each SENDABLE
  template lands on, is every variable it declares one that branch can supply? A test asserting only
  "audit_followup routes to audit" passes the day someone adds a variable no branch resolves. **It
  keeps the old predicate as a live assertion** — the reproduction, so a diff reinstating it fails.
- 🔴 **IT FOUND A SECOND LATENT ONE: `free_check_result` would 500 identically if it were ever put in
  the picker.** It works only because it has its own sender and is server-only. The test pins that it
  stays out of `WHATSAPP_TEMPLATES` and says why.
- ⚠️ **NOT PROVEN BY A LIVE SEND** — that costs a real message to a real prospect. Proven by the
  routing test and the deploy; BS4's 24 rivals mean it will genuinely send rather than fall back to
  `video_template`.
- **Deployed:** `send-whatsapp-message`, `process-whatsapp-queue` (the whole closure of the new leaf,
  walked). `npm run check`: **108/113**, the five known-stale suites only.

### 30c. ✅ A SEND CAN BE PREVIEWED NOW — `mode: "dry_run"` and the Inbox Preview button (2026-09-15)

**`audit_followup` failed a SECOND time, on JP Electrical & Compliance, after the §30b fix was
deployed — and the reason nobody could say which of the two causes it was is that there is no
way to ask this function what it WOULD do.** Every refusal and every throw needed a real attempt
on a real lead to provoke, so the first evidence of a fault was always a burned prospect. Two were.

- ⛔ **`mode: "dry_run"` IS THE SAME CODE PATH, NOT A SECOND ONE.** Every guard, every resolver and
  the real `claimTemplatePayload` run exactly as they do for a send; it returns the built Meta
  payload and the stored transcript body **immediately before the Graph POST**, writing nothing.
  A separate "preview" that rebuilt the payload its own way would be the one-rule-in-two-places
  failure this file has recorded seven times — and it would agree with the sender right up to the
  day it mattered.
- ⛔ **A REFUSAL IS REPORTED, NEVER WAVED THROUGH.** `pitch_already_sent`, `phone_already_contacted`,
  `audit_reply_unavailable`, `unsafe_template_var` all answer exactly as they would — that IS the
  answer to "would this send". A dry run that skipped the guards to show a payload would be lying
  about the send it is previewing.
- ⛔ **IT IS ALSO THE DEPLOY MARKER, WHICH IS WHY IT EXISTS IN THIS SHAPE.** §4 says assert on
  something ONLY the target can produce, and this endpoint offered nothing: the §30b fix changed
  behaviour only, its deploy timestamp (10:59:29Z) and the source's own mtime (10:59:40Z) were
  eleven seconds apart, and no reading of either could prove which bytes were live. A response
  carrying `mode:"dry_run"` proves it. **`useInbox.preview` treats a response WITHOUT that field as
  `preview_unsupported`** — an older deploy handed the same call would have SENT.
- ⛔ **AND A PAYLOAD THAT CANNOT BE BUILT IS NOW A 200 HOLD WITH ITS REASON, NEVER A 500.** Every
  designed refusal here already answered 200 with ok:false; a resolver THROWING was the single path
  that reached the operator as an opaque non-2xx with the reason in an edge log the CLI cannot read.
  A `phase` flag makes the outer catch answer `template_not_buildable` before the send and
  `internal` after it, so a half-completed send can never read as a refusal.
- **`scripts/dry-run-preview.test.ts` pins the one property no unit test could see**: the preview
  returns BEFORE the Graph POST, before both inserts and before the status move. **Proven to fail by
  relocating that block below them** (5 failures, all ordering). If it ever drifts down, a preview
  becomes a send.
- ✅ **THE JP ELECTRICAL PAYLOAD WAS REBUILT OFFLINE WITH THE REAL RESOLVERS AND IS CLEAN** — trade
  `electricians`, town `Bath`, three rivals, report link. **So the second failure was the OLD bytes,
  not a second cause**: replaying the pre-fix plain branch for that lead throws
  `unsafe_template_var:trade_missing:` uncaught → 500, which is the §30b fault exactly and matches
  the 19 `trade_missing` rows on the queue lane.
- ⚠️ **IT PROVES OUR HALF, NOT META'S.** `test_send` still costs a real message on purpose, because
  only Meta can prove Meta accepts a template. The dry run covers the half that has failed twice.
- **Deployed:** `send-whatsapp-message` (and `process-whatsapp-queue` re-deployed off current main,
  so the routing fix is certainly live on both). `npm run check`: **109/114**, the five known-stale
  suites only.
