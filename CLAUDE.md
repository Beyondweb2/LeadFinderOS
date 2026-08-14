# CLAUDE.md â€” read this fully before you touch anything

**You are starting blind. This file is the memory you don't have.** Read it end to end first. Then, when you
discover something that cost you time â€” a wrong assumption, a trap, a number â€” **add it here** instead of
letting the next session rediscover it. Correcting a line that has gone stale is also your job.

Facts and warnings, not prose. Keep it that way. If it grows too long to read, it stops working.

---

## 1. What the business is

- Paul sells **AI visibility** to local UK businesses. **Â£99, one-off** (was Â£49.99 until
  2026-08-04). Price + guarantee wording live in **`src/lib/findableOffer.ts`** â€” one constant,
  shared by the SPA docs and the checkout/webhook edge functions. findable-site (separate repo)
  carries its own copy; changing either means a matching pass in the other.
- Audit whether **ChatGPT and Gemini name them** when a customer asks for their trade in their town.
- Fix what AI reads: pages on **their own site**, a page per service per town, plus consistency in
  the sources the evidence says matter for that trade.
- **Re-measure at 8 weeks.** The guarantee is **WORK-based** (audit + work + re-measurement with
  evidence, or a full refund) â€” it does NOT promise being named. Never write copy that promises
  the outcome.
- **Zero paying customers so far.** Nothing here has been proven on a paying client yet. Do not write copy or
  code that implies it has.
- ðŸ”´ **DELIVERY WORKS EXACTLY TWO WAYS, AND SOME CUSTOMERS CANNOT BE SERVED.** Either their site is
  **WordPress and we can have access** (pages publish automatically), or **they let us move the site
  to our hosting**, copied as-is. Hand-editing Wix/Squarespace is ~15 min a page forever and does not
  work at Â£99. Since 2026-08-05 the questionnaire asks both (`website_platform`,
  `willing_to_migrate`) and **`src/lib/serveGate.ts` decides**: serve / flag / block.
  - **`findable-checkout` refuses a blocked row before creating a Stripe session** â€” that is the real
    block; the site's `CannotServePanel` is only presentation. `notify-onboarding-submit` derives the
    same verdict and labels the email, keyed off the **submitted row** (a blocked visitor never
    clicks pay, so keying off the checkout would miss them).
  - **A BLOCK ONLY FIRES WHEN WE ARE CERTAIN.** A skipped or `not_sure` platform, WordPress with
    unconfirmed access, and unrecognised column values all **flag, never block**. `no_website`
    **serves outright** â€” it is the best case (we build it on our hosting). 20 of 144 states block,
    all requiring an explicit `migrate = 'no'` **and** a known hand-edit platform.
  - âš ï¸ **The verdict is DERIVED, never stored.** No `serve_decision` column â€” a stored verdict
    freezes old rows at a stale rule and lets the three callers drift.
  - âš ï¸ **findable-site carries a hand-kept MIRROR at its own `src/lib/serveGate.ts`.** Change both.
    Diff the two `serveDecision` bodies; they were byte-identical (3635 chars) on 2026-08-05.

---

## 2. How Paul works

- **He is non-technical.** He does ideation, scoping, plan review, product judgement. You write and run all code.
- **He never runs terminal commands.** Need SQL? **Hand it to him** â€” he runs it in the Supabase SQL editor.
  Never run SQL yourself, and never assume a migration file is live (see Â§6).
- **Shell is PowerShell**: `;` not `&&`. The Bash tool is Git Bash, separate syntax. Both are available.
- **Plain English, no jargon.** Lead with the answer. Questions at the very end.
- **Plan first, then stop** for a new piece of work. Once he approves, build the whole thing without stopping.
- **Hard stop and ask** before anything irreversible he hasn't already authorised: merges, pushes, SQL,
  deletions, payments, deploys, access changes. If the brief already authorises it, proceed.
- **Screenshots need him.** The in-app Browser pane does not display in this environment (`the Browser pane is
  not displayed, so the page is not compositing frames`). `read_page`, `get_page_text` and `javascript_tool`
  work fine without it â€” use text proof and say plainly that nobody has *seen* the thing.
- **There is no browser session at `localhost:8080`**, and RLS blocks the anon key, so an authed page cannot be
  loaded the normal way. What works: pull the service-role key from the linked Supabase CLI
  (`npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json`), run a **throwaway Vite
  harness** that patches `window.fetch` to attach it for Supabase URLs only, and mount the real page in a
  `MemoryRouter`. Real hook, real component, real rows; only auth and the router shell are substituted.
  Read-only, delete the harness before committing, and **tell Paul you used the service key**.
  If the harness fakes router history, make the fake previous entry match the case under test â€” a hardcoded one
  gives a real-looking but wrong destination.

---

## 3. The discipline checklist

Recon:
- [ ] Read the actual files before editing. Do not re-recon what a brief tells you is already verified.
- [ ] Grep to verify a list you were handed. Previous sessions got the reader list wrong three times.
- [ ] ðŸ”´ **ANY PLAN APPROVED FOR BUILD MUST HAVE ITS NUMBERS RE-DERIVED FROM THE LIVE DATABASE BY
      THE SESSION THAT BUILDS IT.** Paul's rule, 2026-08-14, after the SECOND crossed-session
      approval: one referenced functions this repo does not contain (`deriveMarketState`), the
      other quoted populations that do not exist in production ("the 302", "Locksmith In"). An
      approval names intent; the building session re-establishes every fact. Both incidents were
      caught by grepping for the named symbols and counting the named rows FIRST â€” do that before
      accepting any scoped plan, including your own from an earlier session.

Git:
- [ ] `git fetch origin`, then prove `origin/main == HEAD` **before** branching. Print both.
- [ ] Branch per task off `main`. Branches are kept, never deleted.
- [ ] Prove every git step with **real command output**, using **variables** (`$o = (git rev-parse origin/main)`)
      â€” never a hand-typed hash.
- [ ] Prove `origin` is still unmoved immediately **before** pushing.
- [ ] **NEVER edit a source file with a PowerShell `Get-Content` / `Set-Content` round-trip.** Proven
      2026-07-30: removing a block from `AiAudit.tsx` that way double-encoded **194 lines** of
      non-ASCII (em dashes, curly quotes) â€” `Get-Content` decoded UTF-8 as cp1252 and `Set-Content`
      re-encoded the mojibake, also adding a BOM. Caught by the diff jumping to 296/465 and a
      `Select-String 'Ã¢â‚¬|Ã¢â€â‚¬'` grep. Reversible (`GetEncoding(1252).GetBytes` â†’ `UTF8.GetString`,
      write with `UTF8Encoding($false)`) but do not create the problem: use the Edit tool.
- [ ] Commit with `-F <file>` (PowerShell mis-parses multi-line `-m`). End with:
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- [ ] Merge `--no-ff`.
- [ ] **Never stage `HANDOFF.md` or `ONBOARDING.md`.** Untracked on purpose. Stage files explicitly; never
      `git add -A` blind.

Checks:
- [ ] `npm run typecheck` â€” **baseline is 14 errors** (was 15 until 2026-07-30; one `TS2352` cast in
      `useOutreach.ts` went away when three hand-rolled lead updates became one function). Flag any
      change from 14. Do not "fix" the 14.
      **Compare the error LISTS, not the counts.** A count that matches can still hide one new error
      masking one removed one. `... | Select-String "error TS" | ForEach-Object {...} | Sort-Object`
      into a file for each side, then `Compare-Object`.
- [ ] **`npm run typecheck` PASSING AT BASELINE DOES NOT MEAN IT COMPILES.** Proven 2026-07-30: a
      stray backtick inside `playbookDoc.ts`'s CSS template literal terminated the string early and
      broke the Vite build outright â€” and `tsc` still reported exactly 14, the clean baseline. Vite
      (SWC) said "Expected a semicolon"; tsc recovered and reported the same 14 semantic errors.
      **Always run `npm run build` as well** â€” it is the only check that catches this class of fault.
      Related: never put a backtick inside a template literal, even in a comment inside one.
- [ ] **`deno check --sloppy-imports` on EVERY changed edge function file.** Capture the exit code
      **directly**, not through a pipe â€” a pipe reports the pipe's status, not Deno's.
      **`npm run typecheck` does NOT cover `supabase/functions`.** That gap put checkout down for 15 hours.
- [ ] `generate-barber-site` has 3 **pre-existing** supabase-js generics errors (~lines 59/693/895). Prove
      pre-existing with `git stash` + re-check. Don't fix them.
- [ ] `google-place-details` has **4 pre-existing** errors (1 Ã— `TS2353` on `logUsage`'s insert, 3 Ã—
      `TS2345` passing the client to `logUsage`). Proven by `git stash` 2026-07-30. Line numbers move
      as the file changes â€” **match on the message, not the line.**

Deploy:
- [ ] **SQL FIRST, CONFIRMED, THEN DEPLOY.** When a task involves both SQL and code that depends on
      it, hand Paul the SQL and **WAIT for his confirmation that it has run** before deploying
      anything that reads or writes the new schema. Proven 2026-08-04: `findable-onboarding` v18
      deployed before its five new columns existed and **every submission â€” including ones carrying
      no new fields â€” died `save_failed` for ~20 minutes**, because the insert always carried the new
      keys and the single-pass column-shedding fallback couldn't recover. The fix (v19) also made the
      code defensive both ways: null-valued new keys are omitted from inserts, and the fallback is
      multi-pass. "Assume the columns exist" is not confirmation.
- [ ] Edge functions **do not auto-deploy**: `npx supabase functions deploy <name>` by hand.
- [ ] **Redeploy every function that imports a shared module you changed**, and prove each one. They keep
      running old code until you do.
- [ ] SPA auto-deploys on push to `main` (Cloudflare Pages).

---

## 4. Things that have misled you â€” read before claiming anything is verified

**The deploy check.** Only this sequence is trustworthy:
1. Fetch the **live HTML** and read the chunk name out of it.
2. Fetch **that exact chunk** by name.
3. Assert a **marker string from your own change** is present in it.
4. Retry **once** â€” production can lag ~90 seconds.

And the traps around it:
- **Comparing a local build hash to a live hash is invalid** across build environments. Same source can hash
  differently. Use it as a hint, never as pass/fail. Step 3 above is the real assertion.
- **A cache-buster query string can return a STALER file than a plain fetch.** Don't add one.
- **The entry chunk name does not reliably change when a route chunk does**, and vice versa. A lazy route lives
  in its own chunk â€” check the one your code is actually in.
- Chunk *byte size* changing is decent evidence; identical size with a new hash usually means only the
  referenced child-chunk hashes moved.
- **A shared component gets its OWN chunk**, so its strings are **absent from the chunks that use it**. Looking
  for `Back to ` in `Playbook-*.js` returns False even though the feature shipped. Check the shared chunk for
  the string, then check the consumer chunk for `importâ€¦from"./Shared-<hash>.js"`. Absence in the consumer is
  the *expected* result and is itself evidence the component is shared rather than duplicated.

ðŸ”´ **A 200 WITH ALL THE RIGHT STRINGS IN IT CAN STILL BE THE WRONG DOCUMENT.** The worst version of
the trap, because every signal reads green. Verifying the report's new BrightLocal caveat 2026-08-05
I fetched `https://findable.live/a/<slug>`, got **HTTP 200**, and **all three** caveat strings
matched â€” so I nearly reported it verified. It was the **home page**: `/a/*` is not a route on
findable.live, it fell back to `index.html`, and the home page contained those exact strings
*because I had just added them there in the same session.*
- **The tell was the byte count**: 82,046 bytes, identical to the home page I had fetched minutes
  earlier. The second tell was that a marker unique to the document type (`class="src"`) was absent.
- **The rule: assert on something ONLY the target document has**, not on the strings you were
  looking for. A content-type check is not enough either â€” Cloudflare served this as `text/html`
  with a 200.
- Reports are served by the **`render-audit-report` edge function**, and the reliable URL is the
  **audit UUID** (`â€¦/functions/v1/render-audit-report/<auditId>`), which resolves directly with no
  `business_reports` lookup. The slug form needs the stored slug to end in the 8-hex code and only
  **69 of 123** report rows do.

**A negative result can also be your own check's fault, not the code's.** The mirror of the false positives
below, and it bit twice tonight:
- `SECTION 1 OF 2` was False because the source says `Section 1 of 2` â€” **CSS `text-transform` uppercased it**,
  the string never existed.
- `thin &middot;` was False because the markup uses a literal `Â·`, not the HTML entity.
- Before reporting a missing marker, grep the **source** for your own search string.

ðŸ”´ **A RATE COPIED FROM A PRICE LIST IS A GUESS UNTIL A BILLED ROW AGREES WITH IT. FOUR CONSTANTS
HAVE NOW BEEN WRONG THIS WAY, ALL FOUND WHILE LOOKING AT SOMETHING ELSE.** Swept 2026-08-06.
| Constant | Was | Real | The mistake |
|---|---|---|---|
| Text search, per page | $0.032 | **$0.035** | Priced at Text Search **Pro**; the mask asks for `websiteUri`, so it bills **Enterprise** |
| Place Details â€” **three copies** | $0.017 | **$0.020** | Matched **no published Google rate at all**. Each copy cited the others |
| Per-question audit | $0.0125 | **$0.0104** | Re-measured; `sources.ts` was left behind when `marketView` was corrected |
| SEO scan | $0.12 | **~$0.04** | Derived from "$40/1,000 pages Ã— 3 pages" and never checked against spend. **3Ã— high** |

- âš ï¸ **THE RULE: a cost constant must name the PRODUCT and the TIER it was priced at, and cite a real
  billed row.** "$0.017" with no tier is unfalsifiable and propagated to three files. Google bills a
  request **once, at the highest tier any requested field touches**, so a rate is meaningless without
  the field mask it belongs to. Before trusting one, read the mask and find the dearest field in it.
- âš ï¸ **A CONSTANT MUST NEVER BE VALIDATED AGAINST DATA IT WROTE.** The SEO figure looked confirmed
  because 57 usage rows read exactly $0.12 â€” that is the fallback in `process-ai-audit-queue` echoing
  the constant back when Apify reports no usage. Excluding those, the real values are $0.02 (Ã—65),
  $0.04 (Ã—41), $0.08 (Ã—4), $0.20 (Ã—1). **$0.04 is the top of a measured BAND, not a precise figure**;
  do not round it up "to be safe" â€” inventing a margin on top of a measurement is the same error in
  the other direction.
- âš ï¸ **A CONSTANT THE SYNC CHECK CANNOT READ IS UNGUARDABLE.** It parses `const NAME =`, so the two
  values living as object properties inside `SOURCES` had silently drifted from their `marketView`
  twins. They are now `AI_SEARCH_USD_PER_QUESTION` and `SEO_SCAN_USD_PER_SCAN`, named exports for
  that reason alone. **If you add a value that must match another, make it a named const.**
- âœ… **Correct and verified, leave them:** Geocoding **$0.005**; OpenAI `gpt-4o-mini` at **$0.15 /
  $0.60** per 1M tokens; `SOURCES.place_details` at **$0.005** (that one really is the address-only
  **Essentials** call in `place-town.ts`).
- âš ï¸ **STILL UNVERIFIED, AND MARKED AS SUCH â€” do not quote them as fact:** `maps` $0.003,
  `social_images` $0.01, `contact_scraper` $0.0011 (disabled), `whatsapp` $0.005. None are on the
  Findable path; Paul's call 2026-08-06 was that spending on Apify to check a disabled scraper is not
  worth it.
- **The resulting real costs:** a market measure **22p**, a 25-lead outreach batch **$2.28** (was
  quoted $4.36 â€” the SEO constant was nearly all of the gap), **full delivery â‰ˆ 30p a customer.**
  Paul's read, and it settles the pricing question: *the offer works at Â£19.99 and the constraint has
  never been cost.*

ðŸ”´ **THE SHARED-FILE DEPLOY TRAP: `main` IS CORRECT AND THE FUNCTION IS STALE.** An edge function
keeps running the code it was deployed with. Changing a file under `supabase/functions/_shared/` or
`src/lib/` fixes nothing until **every consumer is redeployed** â€” and the consumers are invisible
from the file you edited, which is why this keeps happening.
- âš ï¸ **THE RULE: after changing anything shared, walk the transitive import closure and redeploy
  every function that reaches it â€” then NAME THEM IN THE REPORT.** "Deployed" without a list is how
  a consumer gets missed. Walk it by following relative `from "..."` imports from each
  `index.ts`, not by memory and not by `grep -l <module-name>` (that matches comments â€” Â§4).
- Worked example, 2026-08-07 audit: 17 functions were behind. `render-audit-report`,
  `send-whatsapp-message` and `run-seo-scan` were all stale on the SAME file
  (`src/lib/aiAuditReportHtml.ts`); `findable-onboarding` was stale on `_shared/offer-price.ts`,
  i.e. **on what a customer is charged**.
- âš ï¸ **Two functions are deployed with NO SOURCE IN THE REPO** â€” `claim-share` and
  `create-claim-link`, both 2026-06-12, old product line. Left alone deliberately, but recorded:
  a deployed function nobody can read is worse than one that is merely stale.

ðŸ”´ **THE LIMIT OF THE TIMESTAMP METHOD â€” do not read "36 up to date" as proven.** Comparing a
function's deploy time against the newest git commit in its import closure is the only cheap audit
available (`supabase functions download` fails on any function with shared imports:
*"invalid path in server response"*). It has two failure modes, and BOTH bit on 2026-08-07:
- **False positives.** A commit landing seconds after a deploy reads as stale. Nine functions showed
  sub-10-minute "gaps" that were pure commit-after-deploy ordering.
- **False negatives.** The walker only follows relative `from "..."` imports. Any other import form
  â€” dynamic, aliased, re-exported â€” is invisible, and the function reads as clean.
- â›” **AND THE VERIFICATION ITSELF CAN BE WRONG IN BOTH DIRECTIONS AT ONCE.** I reported
  `render-audit-report` as "verified stale, proven against a live document". It was not. I asserted
  two strings that exist **only inside a code COMMENT** describing what had been REMOVED (Â§4's rule:
  grep the SOURCE for your own search string first), and I rendered **ABLM**, which never shows the
  offer block at all â€” `showFounderOffer` hides it once `amount_paid > 0`. Two independent errors,
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
`deno.json` and no import map in this repo, so `@/` resolves to nothing for Deno â€” and the local
check said nothing. **The deploy itself is the only real gate for an edge function.** Same shape as:
typecheck at baseline does not mean the build passes.
âš ï¸ Practical rule: any `src/lib` file reachable from an edge function must use **relative imports with
an explicit `.ts` extension** (`'./directoryFacts.ts'`), never `@/`. Vite resolves that form too, so
it costs the SPA nothing â€” `auditReport.ts` has always done it this way, which is why it deploys.
Before deploying, walk the transitive import closure from the entrypoint and grep it for `@/`.

**CLOUDFLARE PAGES CAN SIT ON A PUSH FOR 15+ MINUTES â€” that is not the ~90-second lag Â§4 describes.**
Commit `56134630` was verified on `origin/main`, built clean locally, and the live site still served the
PREVIOUS `AiAudit-C55Dvb4S.js` after 15 minutes of polling. Before concluding a deploy failed, prove
where live actually IS: read the entry chunk, then check a marker from the **previous** confirmed
deploy. If the old markers are present and the new ones absent, it is the pipeline, not the code â€” say
so rather than claiming success or hunting a phantom bug. Also confirm which chunk your marker lands in
locally (`grep -l <marker> dist/assets/*.js`) before trusting a False.

**THE MEASUREMENT CAN BE RIGHT WHILE THE DOCUMENT LIES.** A bulk audit of five tattoo studios found
from one "Wisbech" search stored the correct derived town on every audit (`location_source =
derived`) and the questions genuinely asked about Cambridge â€” but the playbook and client form both
printed **Wisbech**, because `usePlaybook` resolved the town as `search_location || location_text`,
the searched town FIRST. Wrong on **102 of the 121** leads that have a derived town. Fixed
2026-07-30 to `audit.location_text || derived_town || search_location`: the audit row already IS the
resolved answer, so preferring it keeps the documents agreeing with the measurement by construction.
Before concluding an audit is invalid, check whether it is the DATA or only the RENDERING.

**QUESTIONS CAN MEASURE THE WRONG INTENT AND STILL LOOK FINE.** "tattoo design for beginners
cambridge uk" was answered accurately by the engines â€” with ucas.com, barnsley.ac.uk and camre.ac.uk.
A third of that niche's citations measured people wanting to LEARN the trade, not hire one. The
prompt banned "near me", head-terms and two-intents-per-question; it never required BUYING intent.
Guarded 2026-07-30 in `seedGuard.ts` (`researchIntentReason`, `dropResearchIntent`).
âš ï¸ **Two tiers, and the second is the whole difficulty:** for a driving school "learn to drive" is
the BEST buying question, "dog training" is what a dog trainer sells. Tier A (salary, career,
apprenticeship, qualification, "how to", "become a") rejects for everyone; Tier B (course, training,
learn, lessons, "for beginners", class) is skipped when `isTeachingTrade()` says teaching IS the
product. A flat keyword list would have broken every driving school in the lead book.

**A CATCH-ALL ERROR MESSAGE IS WORSE THAN NO MESSAGE.** The AI Audit page printed one hardcoded line
for every failed question â€” *"Couldn't check â€” term too broad to complete. Retry or narrow it."* â€” while
the real error sat unread in `ai_audit_queue.result.error` AND `ai_audit_runs.results.error`. On
2026-07-30 it displayed that for `Apify start apify~google-search-scraper HTTP 402` (account out of
money) and sent Paul off to rewrite questions that had worked two hours earlier. **There was never any
breadth detection in the codebase** â€” the phrase existed only in that JSX string. Fixed in
`src/lib/auditErrors.ts` (`explainAuditFailure`), which always prints the raw string too. When a UI
explains a failure, check the explanation is derived from the failure.

**An end-of-day-UTC timestamp formats as the NEXT DAY in British Summer Time.** Apify's cycle end is
`2026-08-03T23:59:59.999+00:00`; `toLocaleDateString('en-GB')` without a `timeZone` rendered
"4 Aug" â€” a day late, on the one date the operator was waiting for. Always pass `timeZone: 'UTC'`
when formatting a stored UTC instant that represents a *day*.

**RLS-enabled-with-NO-policies reads as "no data", not as "denied".** `apify_account_usage` is
service-role-only by design, so a SPA read returns **HTTP 200 with `[]`** â€” indistinguishable from a
healthy empty table. Its own migration comment says "so the figure is visible in the app" and the
policy was never added, so nothing ever displayed it. Route such reads through an edge function.

**Not being able to see something is not evidence it isn't there.**
- The **anon key cannot read most tables** â€” RLS returns **HTTP 200 with `[]`**, not an error. An empty result
  proves nothing about the data.
- Grep output in this environment sometimes **path-mangles matched lines** â€” `path="/playbook/:id"` displayed as
  `path="\playbook:id"`, and `{/*` as `{\*`. **Never conclude code is broken from grep output alone.** `Read`
  the file.

**`grep -l <module-name>` finds COMMENTS, not just imports.** Building the redeploy list 2026-07-30,
`grep -rln "place-details"` returned `generate-barber-site` and `grep -rln "audit-baseline"` returned
`findable-checkout`. **Neither imports either module** â€” both merely mention the name in a comment
("Mirrors google-place-details", "MIRRORS audit-baseline.ts's own bizType line"). Two unnecessary
deploys, avoided only by re-grepping for a real `import ... from "â€¦"` line. Match the import
statement, then read it.

**A stale COMMENT is a load-bearing bug.** `google-place-details` fetched phone + website only,
justified by a comment saying the address "is already returned by Text Search at lead-creation time".
`search-leads`' field mask had since been slimmed to
`places.id,places.displayName,places.googleMapsUri,places.websiteUri` â€” no address. So `address` was
null on **every** search-added lead, and with no address there were no `addressComponents`, so no
`derived_town`. Nobody re-checked the layer the comment was asserting about. When a comment explains
why something is safe to skip, **verify the claim, don't inherit it.**

**`findable-onboarding` SILENTLY DROPS ANY ANSWER KEY IT DOES NOT LIST.** It builds its insert from an
explicit key list, so a field the flow sends and the column accepts still vanishes if nobody added it
there. Proven 2026-08-05: `willing_to_migrate` â€” the column existed, the site sent it, the row saved
with **HTTP 200**, and the value was null. The checkout then read "not answered", which never blocks,
so a Squarespace customer who had said no to moving **reached Stripe**. Three places to add a field:
the `answers` object, `NEWER_COLS`, and the `optional` shedding list. Caught only by a live end-to-end
test; no local check can see it.

ðŸ”´ **THE TEST EXERCISED ONE PATH AND THE BUG LIVED ON THE OTHER. TWICE, ON THE SAME FEATURE.**
Paul's framing, and it is the sharper version of the layer rule below: **ask not whether the guard
is correct, but whether the case it guards can reach it.**
| Guard | It was correct | The path it never ran on |
|---|---|---|
| The market **cooldown** | refused a 3rd audit per window, as designed | the measure flow's OWN second audit â€” verified against historical rows, while the two-audit sequence was only ever checked in logic-only tests. Norwich got one audit |
| The **search gate** | blocked when a search returned 0 | it sat inside `if (!poolFresh)`, so a pool that was **fresh AND empty** â€” precisely what it exists for â€” could never reach it. Soham ran two paid audits against zero businesses, **reported twice** before it was found |
- âš ï¸ Both passed review because the reviewer checked the predicate, not its reachability. When you
  add a guard, **enumerate the ways control can arrive at the decision** and assert one case on each
  â€” `scripts/soham.test.ts` does this by restating the predicate and driving it with every
  (skipGate Ã— poolFresh Ã— searched Ã— poolCount) combination, including the null one.
- âš ï¸ The same shape hides in "optimisations": `poolFresh` was reviewed as a *pricing* shortcut ("the
  search was free") and nobody asked what else was being skipped along with the search.

**The mistake you keep making: reasoning from one layer without checking the next.** Real examples:
- "No address is stored" â€” the insert writes one.
- "`place_id` isn't available" â€” it's populated on **758 of 758** leads.
- "This choke point covers all paths" â€” **two callers pass the town in as an argument**, so a fallback there
  fixes nothing.
- Fix: before asserting what a function receives, read its **callers**. Before asserting a column is empty,
  read the **writer**.

---

## 5. Established findings â€” what actually works

Facts with numbers. These are measured, and several contradict the older docs.

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two different levers.
- Across **76 audits**: ChatGPT names the client **~17%** of the time, Gemini **~2.5%**.
- **Being cited is not being named.** ABLM is on Yell's Wisbech page and was named **0 times in 80
  measurements**.
- **Directories are trade-specific, and only citations can tell you which:**
  - Checkatrade â€” **662 citations across 58 of 59 plumber audits**, and **ZERO** for accountants.
    (Was "657 across 57 of 58"; re-measured live 2026-07-30 â€” the data grows, so re-read it rather
    than quoting this line. The whole fold: **109 audits, 10,615 citations, 1,275 hosts**; trade
    totals plumber **59**, locksmiths 25, accountant **12**, electrician 12.)
  - Yell works for **both**.
  - Hospitality is **Tripadvisor and Wanderlog**.
- **A business with no website cannot be named by Gemini at all** â€” it has nothing of theirs to read.
  MK Plumbing: 0/10 on Gemini, 3/3 on ChatGPT via directories.

**TESTED AND NEGATIVE â€” never present these as levers:**
| Lever | Result |
|---|---|
| Website quality | Firms Gemini names have **WORSE** sites than our clients |
| Schema markup | **35% vs 32%** â€” no difference |
| Reviews | Three named businesses have **0â€“1 reviews** |
| Bing Places | **Zero citations across all 10,615** (re-measured 2026-07-30; `bingplaces.com` and `bing.com` appear in NONE of the 1,275 hosts) |

- **The only supported lever:** presence in the sources AI reads **for that trade**, plus **a website where
  there isn't one**.
- **No before-and-after has ever been measured.** ABLM and Paul's pool bar are the first two. Any claim about
  outcomes is unevidenced.

---

## 6. Architecture rules that must not be broken

- **Never add a `trade` (or `trades`) field to `DirectoryFact`** (`src/lib/directoryFacts.ts`).
  *Why:* the moment a fact says "Checkatrade is for plumbers", the file becomes the hardcoded list the evidence
  layer exists to replace â€” and it would be wrong by construction, because Checkatrade has 657 citations for
  plumbers and zero for accountants. That is a fact about the **evidence**, not about Checkatrade.
- **Facts are per-host. Evidence is per-trade. The join can only SUBTRACT.**
  Citations decide *which* hosts matter. `directoryFacts` only says *what a host is* and *who may action it* â€”
  things you can only learn by visiting the site. A fact may remove or downgrade a host the evidence surfaced.
  It may never add one. `townOnly` is legitimate on that test (geographic scope of the site); `trade` is not.
- **Unknown hosts route to WHO'S WINNING, never to tasks.** An unclassified host is almost always a
  competitor's own site. Surfacing it as intelligence means a new competitor appears automatically with no
  entry to write; making it a task would invent work.
- **No winnability scoring anywhere.** It reads a single run, and competitor lists differ between runs, so its
  output flips between identical inputs. Counts only.
- **No outcome promises in anything customer-facing.** Say what was measured, what was done, and what changed.
- **Migrations are applied BY HAND** in the Supabase SQL editor â€” `supabase db push` is broken (history
  desynced). A migration file existing does **not** mean it is live. For DB functions, check the live
  definition: `select pg_get_functiondef('public.<fn>'::regproc);`
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`.** `isSentStatus` and
  `isRepliedStatus` in `src/types/outreach.ts` are traps for aggregates. **`paid` means `amount_paid > 0`,
  everywhere.**
- **Paginate PostgREST reads** â€” it truncates at `db-max-rows` silently. Use `src/lib/fetchAllRows.ts` with
  `.order('id')` as a unique tiebreaker.
- ðŸ”´ **`instantly-push`'s INTERNAL GATE IS NARROWER THAN EVERY OTHER ONE, ON PURPOSE. Do not
  "make it consistent".** It accepts **CRON_SECRET + `x-internal-job` ONLY** â€” not the service key,
  which every other internal branch (bulk-jobs included) also accepts. The reason is blast radius:
  this is the function that **sends email**, and a key whose job is database access should not also
  be a licence to email 1,000 prospects. Built 2026-08-08 for `audit_and_push`.
  - `acting_user_id` is read **only inside** the internal branch, so a stolen JWT cannot name a
    different actor. UUID-checked, then confirmed to be a real user.
  - **No admin escalation on the internal path** â€” owner-scoped only. bulk-jobs' create already
    filters a job to leads the creator owns, so narrowing costs the flow nothing.
  - Suppression, the completed-audit gate and the already-pushed stamp run **after** auth and are
    identical on both paths. Auth decides *whose leads may be read*, never *who is safe to contact*.
  - âš ï¸ **`mode: 'auth_probe'` exists because there was no other honest way to test this.** Every
    other mode either sends email or calls a paid API, so exercising the gate would have meant
    emailing someone to find out whether the auth was right. It reaches no Instantly endpoint, reads
    no lead, writes nothing, and reports only which branch admitted the caller.
  - âš ï¸ **PROVING A 401 PROVES NOTHING BY ITSELF.** Nine non-internal shapes were refused
    2026-08-08 â€” and the OLD code would have refused all nine identically, so the negatives were
    worthless until the new bytes were shown to be live. The marker that did it: **`x-cron-secret` in
    the OPTIONS preflight's `Access-Control-Allow-Headers`**, which exists only in the new version and
    needs no credential to read. Same rule as Â§4's report trap â€” assert on something only the target
    can produce.
  - âš ï¸ **The positive path cannot be tested from here** â€” CRON_SECRET is not readable without
    asking Paul to hand over a secret. It is proven by the first real job. **The failure mode is
    safe**: a broken gate means `push failed (HTTP 401)` on every item and **zero emails sent**,
    never a wrong send.

- ðŸ”´ **`audit_and_push` â€” THE TWO-PHASE JOB, AND THE THREE RULES THAT COST MONEY.**
  `bulk-jobs` job type added 2026-08-08. Triage â†’ phase A (audit, `skip_seo`) â†’ phase B (one Instantly
  call for the whole set). Cap **25 on ACTIONABLE items**, so a selection full of already-pushed
  leads is not refused.
  - **ALREADY IN INSTANTLY = no audit and no push.** Re-auditing is money spent preparing a pitch
    that has already gone out.
  - â›” **A FINISHED AUDIT HANDS OVER, IT DOES NOT COMPLETE.** `resolveAwaiting` returns the item to
    `pending` + `phase: 'push'` and does **not** touch `done_count`. **`done` on this job type means
    PUSHED.** Marking it done would be the 2026-08-08 bug in a new place: paid for the audit, never
    sent the email, counter reads complete.
  - â›” **AN ITEM INSTANTLY DID NOT TAKE IS NEVER RECORDED AS PUSHED.** Outcomes map from
    instantly-push's own **id lists**; a lead in none of them fails with "gave no reason". A
    **missing `pushedIds`** â€” the real state if instantly-push is deployed older than bulk-jobs â€”
    fails loudly rather than guessing either way.
  - âš ï¸ **DEPLOY ORDER: SQL â†’ `instantly-push` â†’ `bulk-jobs` â†’ SPA.** `bulk_jobs.job_type` carries a
    CHECK constraint (Â§8: it lives only in the DB, not in migrations) that rejects the new value, and
    the SPA's `action: 'triage'` 400s against an older bulk-jobs.
  - âš ï¸ `purpose: 'market'` stays keyed on the **param** `skip_seo`, not on the derived value â€”
    audit_and_push forces `skip_seo` but is **not** a market batch, and deriving both from one flag
    would have hitched cross-audit intent coverage onto a cost decision.
  - âœ… **Seventh instance of the absent-value shape, caught by writing the test first.** The triage
    ladder ends in `cannot` and `push_now` requires a positive; `scripts/audit-push.test.ts` drives
    every rung with null / empty / whitespace and asserts none reaches the bucket that emails.

- âš ï¸ **THE BULK-JOB PROGRESS LINE CALLED EVERY BULK AUDIT "site generation" FOR MONTHS.** It was
  `job_type === 'enrich' ? 'enrich' : 'site generation'` â€” a two-branch expression over a set that
  has had four members since `audit` was added. Nothing broke, which is why it survived: the label
  was wrong and the numbers beside it were right. Now `src/lib/bulkJobProgress.ts`, which labels from
  a map and renders an **unknown job type raw** rather than borrowing the last branch's name. It also
  derives the phase from `items` (never stored) and reports **no phase** when there are no items.

- â›” **THE GUARANTEE IS BYTE-IDENTICAL ACROSS BOTH REPOS, AND A SCRIPT NOW ENFORCES IT.**
  `FINDABLE_GUARANTEE` (`src/lib/findableOffer.ts`) and findable-site's `GUARANTEE`
  (`src/lib/site.ts`) **had drifted** â€” this repo's ended at "â€¦you will be named." while the site's
  carried "The engines decide that, and anyone who promises it is guessing." So the sentence a
  customer **agreed to at Stripe checkout** was not the sentence on the page that sold it to them.
  Both files already carried a comment asking for them to be kept in sync; a comment cannot fail a
  build. Run **`node scripts/check-cross-repo-sync.mjs`** â€” it exists in **both** repos, each reading
  across to the other, and exits non-zero on any difference. It covers the **guarantee AND the price**
  (`FINDABLE_SETUP_PRICE_GBP` vs `SETUP_PRICE_GBP`), and exits **2** if the sibling repo is absent.
  Proven by injecting a drift in each value on each side â€” four cases, all caught by both scripts.
  ðŸ”´ **A THIRD COPY EXISTS THAT NO SCRIPT CAN REACH: the Stripe PAYMENT LINK's own description**,
  typed into Stripe's dashboard. The founder link's copy is **out of date** â€” it drops "at week eight
  with before-and-after evidence" and the entire "The engines decide thatâ€¦" clause. Edit it in Stripe
  by hand whenever the constant changes.
  âœ… **Stripe renders the full 222-character string untruncated** â€” verified 2026-08-06 by creating a
  real Checkout Session and reading `document.body.innerText`. Stripe documents no length limit for
  `line_items[].price_data.product_data.description`, so this could only be answered empirically; the
  page HTML is a JS-rendered shell and contains nothing, so fetching it proves nothing.
  âš ï¸ **STRIPE ADAPTIVE PRICING CANNOT BE TURNED OFF FOR PAYMENT LINKS.** Stripe's docs:
  *"Adaptive Pricing is always enabled for Payment Links. Manage Adaptive Pricing for Checkout in your
  payment settings in the Dashboard."* So the Dashboard toggle governs **Checkout Sessions only** â€”
  the `findable-checkout` path. The founder link is a Payment Link and is not covered by it.
  Observed 2026-08-06 from a Thai IP: the Checkout Session presented **THB 4,582.95** with a stated
  4% conversion fee; the founder Payment Link showed **Â£19.99 only**, minutes apart in the same
  browser. One observation does not disprove the docs â€” treat the link as capable of converting.
- ðŸ”´ **AN ABSENT VALUE FALLING THROUGH AS THOUGH IT WERE A REAL ONE. THIS HAS NOW HAPPENED SIX
  TIMES, in six unrelated files, and it will happen again.** The shape is always the same: code
  branches on the *known* values and lets everything else drop into the `else`, where the default
  means something the data never said.
  | Where | The absent value | What it was silently treated as |
  |---|---|---|
  | `findable-onboarding` | a null questionnaire column | "they said no" |
  | `clientHeld.ts` (pre-fix) | `''` / whitespace / placeholder | "we hold this" |
  | `market-view` (pre-fix) | tier `unknown` (below the evidence bar) | "AI names them" â†’ subtracted |
  | `offTradeMark` (**caught before shipping**, 2026-08-06) | a pool row with no `primaryType` | "Google does not call this a locksmith" |
  | `marketPlainRead` (Soham, 2026-08-07) | a pool Places returned **0** businesses for | "every one is already named by AI" |
  | `MeasureMarket` gate (Soham, 2026-08-07) | the gate skipped when no search ran | a fresh EMPTY pool = "fine, proceed" â†’ 2 paid audits |
  The market one is the clearest: the branch kept `tier === "thin"` and dropped the rest, so
  `unknown` â€” which is what *every* entry is below the bar â€” was subtracted as established. **The
  guard inverted in exactly the case it was written for.**
  âš ï¸ **The test: never branch on the states you expect and let `else` carry the rest.** Enumerate
  the absent case explicitly, and when a value is graded, assert on the grade you *want*
  (`=== 'established'`), never on the one you want to exclude (`=== 'thin'`). A new grade added
  later joins the wrong side of a negative test and nothing throws.
  âœ… **THE FOURTH ONE WAS CAUGHT BY APPLYING THIS RULE RATHER THAN BY AN INCIDENT** â€” the first time
  that has happened. `primaryType` arrived in `search-leads`' field mask on 2026-08-06, so **every
  pool row cached before that has none**. Marking a row "not the trade" on a missing type would have
  flagged an entire market as non-locksmiths â€” the Norwich subtraction again, in a new file.
  `offTradeMark` asserts on the grade it WANTS (a known type differing from a known modal type) and
  returns nothing for an untyped row whatever the consensus. `scripts/off-trade.test.ts` asserts a
  20-row pre-field-mask pool produces **zero** marks. Write the absent case into the test, not the
  comment.
  ðŸ”´ **SOHAM ADDED TWO MORE, AND ONE OF THEM IS A NEW SHAPE: A GUARD THAT IS SKIPPED RATHER THAN
  WRONG.** The search gate was correct â€” it just sat inside `if (!poolFresh)`, so it only ran on the
  path where a search ran, and a pool that was FRESH AND EMPTY (exactly what the gate is for) could
  never reach it. **Ask not only "is the guard right?" but "can the case it guards reach it?"**
  Reported twice before it was found, because both the review and the test exercised only the search
  path. A separate lesson from the same market: **every ratio in `marketView.ts` was correctly
  guarded against a zero denominator and it still printed "lockrite.org (47 of 0)"** â€” the total was
  only ever *interpolated into a sentence*, never divided by. A guard on the arithmetic is not a
  guard on the copy; grep for printed denominators separately.
- â›” **ABSENCE IS NEVER AN ANSWER â€” the second place this rule lives.** `serveGate` was the first (a
  skipped question flags, never blocks). `src/lib/clientHeld.ts` is the second: `heldValue()` is the
  ONLY way the client sheet decides it holds a value, and null / undefined / `''` / whitespace / an
  empty array / an array of blanks / buildPlaybook's placeholders (`NOT HELD â€” ask the client`,
  `none`) all mean "we do not have it". A null column inside a **submitted** row means what no
  questionnaire means, for that field â€” `findable-onboarding` writes `incomplete` rows by design and
  deletes null-valued new keys from the insert, so partial rows are normal.
  `ASKING_PHRASES` in that file is the enforcement table; the suite asserts the asks vanish when a
  column is held **and come back when it is not**, which catches a "fix" that deletes an ask instead
  of suppressing it. Don't re-derive this rule per-caller.
  âš ï¸ **`onboarding_responses` had ZERO rows on 2026-08-06** (`client_listings` too). So the
  no-questionnaire path is not an edge case â€” it is the only path that has ever rendered, and any
  questionnaire-driven branching is untested until Paul submits one for real.
  âœ… **NO LONGER ZERO â€” 2 rows as of 2026-08-10** (`gbp_exists` = `not_sure` and `yes`). Small, but it
  means the questionnaire path has now rendered for real and the line above has stopped being true.
  **Re-count before quoting it; do not inherit either number.**

---

## 6b. ðŸ”´ THE REPORT THAT COST TWO PROSPECTS â€” QUEUED BEHIND Â§6c

âš ï¸ **Â§6c IS FIRST.** Paul reordered on 2026-08-09: the "it loses my place" state work comes
before this. Everything below is still current and measured â€” it is next, not now.

Paul's order, agreed 2026-08-09. Build 1, then 2, then 3, then the derivation. All four measured, none
built. **Wilson's Mobile Valeting rejected his report and was right to.**

âš ï¸ **FIRST, A PREMISE THAT WAS WRONG AND WILL BE REPEATED IF NOT WRITTEN DOWN.** Wilson's report did
NOT say "0 of 6". Rendered live it says **"1 time â€¦ out of 6 answers"**. Paul was about to apologise
for something that never happened. Render the document before diagnosing what it says (Â§4's rule).

### 1. RANK REPORT COMPETITORS BY FREQUENCY, AFTER NAME-GROUPING
- The report leads with **`gutPunch.rivals`** â€” the competitors from the ONE curated best answer â€”
  not the cross-question frequency ranking. `auditReport.ts:719` already computes the frequency list
  and the report does not lead with it.
- Wilson's report printed **Get A Splash, Fresh Car, Clean Me**. His OWN audit ranked by frequency:
  **Ultimate Valet Cambridge (5)**, Washdoctors (3), Get a Splash! (2), Chapman's (2). The top firm in
  his own data never appeared on his document. That is what lost the prospect.
- â›” **GROUPING MUST COME FIRST OR THE FIX MAKES IT WORSE.** The counter does not normalise
  apostrophes: `Chapmanâ€™s â€¦ (13)` and `Chapman's â€¦ (8)` are counted separately, so the market's real
  leader has **21** and ranks below a split of itself. Ranking by a split count names the wrong firms
  with MORE confidence. `_shared/market-match.ts`'s `groupNames` exists for exactly this.

### 2. THE FRAMING AT LOW QUESTION COUNTS â€” DECIDED: 5 QUESTIONS, BUILD IT
"1 of 6" from three questions is a weak measurement stated strongly.
âœ… **DECIDED 2026-08-09, not a proposal: raise the audit_and_push question default from 3 to 5.**
The dialog already offers 3/4/5, so it is the default that changes. +2 questions = **+2p a lead**
(8p â†’ 10p) and "1 of 6" becomes "1 of 10".
âš ï¸ **AND THE REASON MATTERS MORE THAN THE NUMBER**, because it is the rule to reach for next time:
it fixes the MEASUREMENT rather than hedging the sentence. The alternative on the table was softening
the verdict wording, which would have made a thin sample read as less thin without making it less
thin. Paul rejected that and was right to.
The market audit's 16 questions is still the real fix; this is the interim, not a substitute for it.

### 3. THE DISTANCE CHECK â€” AND WHY THE OBVIOUS ANSWER IS WRONG
Measured 2026-08-09: **0 of 202** audits provably ask about a town their lead is not in â€” but that
number must not be reported as "none".
- **124 of 326 (38%) have no `derived_town` AND no `address`**, so the question cannot be answered for
  them. Mostly the 168 rows from the sessionStorage bug.
- â›” **STRING EQUALITY CANNOT ANSWER THIS.** Wilson is a village-near-Cambridge case whose
  `postal_town` is very likely *Cambridge*, so he PASSES an equality test while sitting outside the
  built-up area â€” the Southsea/Portsmouth caveat in Â§8, live again. A real answer needs distance from
  the town centroid: `uk_towns` already holds lat/lng.

### ðŸ”´ 0. THE WRONG-TOWN RATE, MEASURED 2026-08-09 â€” THIS IS NOW FIRST
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

âš ï¸ **THE 70% IS A WORST-CASE SUBSET, NOT A RATE â€” do not quote it as one.** Those 44 are exactly the
leads that had NO location evidence, i.e. the ones whose audit had to fall back to `search_location`.
The true rate across all audits is unknown until more leads carry coordinates.

âœ… **How it became measurable:** `outreach_leads.lat/lng` (migration 20260809120000) storing the
`location` field that ESSENTIALS_FIELDS had always fetched and place-town.ts discarded, plus
`uk_towns` lat/lng on all 733 rows. 262 lookups run 2026-08-09, 49 of them audited leads
(25 locksmiths + 24 accountants), **100% got a town** â€” not one "no town in address".

**THE ORDER, agreed with Paul:**
1. **Backfill the remaining 63 audited leads without coordinates (~32p)** and report the TRUE rate
   across all audited leads, not the worst-case subset.
2. **The >10 km guard**, which is what stops this recurring. âš ï¸ **PROPOSE BLOCK-vs-WARN BEFORE
   BUILDING IT.** Blocking means Paul cannot audit a business whose coordinates we do not have, which
   is most of them today â€” so a naive block would stop the product working. Warn-with-the-distance,
   block only when we KNOW it is far, is the shape to argue for.
3. Then the derivation (Â§4 below).

**TWO QUESTIONS PAUL WANTS ANSWERED WHEN THIS IS PICKED UP:**
- **How many of the 31 had a REPORT SENT to them?** Those prospects were told something wrong about a
  town they do not work in. He would rather have the number than meet it one complaint at a time.
  (Â§8 already records 37 reports sent with the wrong-town problem â€” reconcile the two figures.)
- **Why did the audit use `search_location` at all when the business had no location evidence?** A
  71 km gap means a radius search pulled in a business from another county and nothing questioned it.
  Say whether the fix belongs at audit time, at lead-add time, or both.

âš ï¸ **AND QUOTE THE REAL NUMBER OF LEADS, NOT THE INTERESTING ONE.** I told Paul the backfill would
cost ~56p, from the 112 AUDITED leads with no location evidence. The button's rule is not restricted
to audited leads, so it ran 262 lookups and cost **$1.31** â€” 2.3x the quote, on a spend he had
approved on the strength of it. Fine in itself; the quote was still wrong. Count what the code will
actually do, not the subset the analysis was about.

### 4. THEN THE MARKET-AUDIT DERIVATION â€” RECON DONE 2026-08-09, IT HOLDS UP
Generate a prospect's report from the town's market audit instead of a per-business audit.
- âœ… **Business audits ask NOTHING business-specific.** 925 questions: **0** carry a business-identity
  token. Naive passes read 47% then 20% then 3.46% â€” every apparent hit at every level is a generic
  trade noun ("plumbing", "gasman", "recovery"). The substring trap in a new coat, three times.
- âœ… **Specialisms: 4 of 223 audits (2%)**, one of them Paul's own bar. Nothing lost.
- âœ… **The decisive test** (accountant/Chichester, the only trade+town with both): 6 businesses,
  **5 agree, 0 FALSE NEGATIVES**, 1 case where the market audit found a firm its own 3-question audit
  MISSED. Structural reason: 8 questions give strictly more chances to appear than 3.
- âœ… **No new matcher risk.** `named` is already set by `nameMatches(answer_text, businessName)` at
  scan time (`ai-search.ts:430`) â€” same function, same answer text.
- âš ï¸ **But `named` is STORED, not derived**, and a market audit's stored flags are against its own
  (non-)business name. A derived report must **recompute per prospect**. Free, no API call, and it is
  the one real code change: `buildReportData` reads `r.result[e].named`.
- âœ… **THE GATE IS ALREADY BUILT AND TESTED: `_shared/derivable.ts` + `scripts/derivable.test.ts`.**
  Nothing calls it yet â€” wire it, do not rebuild it. Two bugs in it were caught by writing the test
  first: it leaned on `candidateCores` to strip the trade and town (it does not â€” that truncates for
  MERGE purposes, a different job), and a trade word in another grammatical form still passed
  ("Chichester Accountancy" vs trade "accountants"), now a shared 5-character stem.
- âš ï¸ **THE FAIL-SAFE PAUL ASKED FOR:** strip trade and town tokens from the business name; if nothing
  distinctive remains ("Chichester Accountants Ltd"), **refuse to derive** and fall back to a paid
  per-business audit. A zero there means "we could not tell", not "you are invisible", and those must
  never print the same sentence.
- **Cost:** per prospect `3 Ã— $0.0104 + $0.070` (cleaner) â‰ˆ **8p** â€” 138 accountants = **Â£11**. One
  market audit `8 Ã— $0.0104 + $0.070` â‰ˆ **12p for the whole town**.
- âš ï¸ Sample is 6 businesses in one town. Suggestive, not settled.

---

## 6c. ðŸ”´ NEXT SESSION STARTS HERE â€” "it loses my place", the state audit (2026-08-09)

Paul's words: *"I use this all day and losing my place is the single most annoying thing about it."*
Audited across every page. **It is ONE root cause with two halves, not a per-page bug** â€” so do not
patch pages, fix the two.

### THE ROOT CAUSE

**Half 1: the operator app has no data cache.** React Query is installed and correctly configured in
`App.tsx` (`staleTime: 5 min`, `refetchOnWindowFocus: false`) and is used by **6 files, every one a
PUBLIC customer-facing page** â€” BookingPage, PublicSite, SiteByToken, SubdomainSite, the barber and
salon shells. **Not one operator page or hook uses it.** Twelve data hooks own rows in `useState` and
refetch in a mount effect:
```
useApifyUsage  useAvatar  useBulkJobs  useCampaignStats  useCampaigns  useCheckedBusinesses
useContactTracking  useInbox  useLeadNotes  usePersonalActions  usePlaybook  useTeamFeedback
```
`useInbox:124` is `useEffect(() => { fetchAll(); }, [fetchAll])` with `isLoading` starting `true` â€”
leave the Inbox, come back, full refetch and a spinner.

**Half 2: the layout remounts on every navigation.** `App.tsx` has **12 `<AppLayout>` wrappers inside
Route elements and 0 `<Outlet/>`**. Each route renders its own copy of the shell, so React unmounts
and remounts sidebar and scroll container on every navigation. Nothing inside can survive by staying
mounted; it can only be restored from storage afterwards.

âœ… **Checked and ruled out:** no `key=` anywhere forcing a remount. Normal navigation unmount is the
whole story â€” there is no third cause to hunt.

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
| Data (all 12 hooks) | âœ— refetch + spinner | âœ— | âœ— |
| Scroll (`usePersistedScroll`, in AppLayout) | âœ“ | âœ“ | âœ“ |
| A few filters (`usePersistedState`) | âœ“ | âœ“ | âœ— |
| Selections, expanded rows, dialogs | âœ— | âœ— | âœ— |

### â›” THE RULES AGREED WITH PAUL â€” APPLY THESE, DO NOT RE-DECIDE THEM
- **The URL is for WHAT I AM LOOKING AT. `usePersistedState` is for HOW THE PAGE IS CONFIGURED.**
  A conversation, a selected market, an open record â†’ URL (back button, linkable, survives
  everything). A filter, a sort, a toggle â†’ persisted state. `Index.tsx` already says this for the
  market view; it is now the app-wide line. **Report every move to the URL.**
- âœ… **AND A MODAL MUST NOT ARRIVE OVER THE THING THAT WAS CLICKED, EITHER â€” fixed 2026-08-10.**
  Coverage's market link carried `confirm=search` on every row, so clicking through to a town already
  measured opened "Run the lead search? ~$0.14" on top of the market numbers that were the reason for
  the click. Two guards, and the second decides: `wantsSearchConfirm(state)` (`coverageState.ts`) keeps
  the param off the measured/worked rungs, and `openArrivalSearchConfirm` + `auditsInView`
  (`marketView.ts`) refuse it in the panel off the market's own audit count â€” which is what covers a
  bookmarked URL and a stale Coverage cache. The panel decision now happens **in the same effect as the
  load, on the view `load` RETURNED**; it used to fire before any market data existed, so it could not
  consult the fact that decides it. A refusal states itself with the override beside it â€” the button
  must not become a link that visibly does nothing.
- â›” **COVERAGE HAS TWO ACTIONS PER ROW, AND IT USED TO HAVE ONE DOING THE WRONG JOB â€” split
  2026-08-11.** The button labelled **Find leads** carried `mode=market`, so it never ran a lead
  search: it opened the market read (and, on an untouched town, a spend confirm over that). Now
  **Find leads** â†’ `mode=leads&keyword=&location=&run=search`, the normal search, prefilled and run
  once; **Market view** â†’ `mode=market&trade=&town=[&confirm=search]`, unchanged. `wantsSearchConfirm`
  therefore belongs to **Market view** now, not to Find leads â€” the rule did not change, the control
  it hangs off did.
  - Both hrefs are built by **`findLeadsHref` / `marketViewHref` in `coverageState.ts`**, not inline in
    the JSX, so `scripts/coverage-actions.test.ts` can assert the one property that matters: the
    Find-leads href carries **no `mode=market` and no `confirm=search` on any rung**, including an
    unknown one. An inline template string is how the two drift back together.
  - ðŸ”´ **THE SEVENTH INSTANCE OF THE ABSENT/STALE-VALUE SHAPE, CAUGHT BEFORE SHIPPING.** `keyword`,
    `location` **and `mode` are all `usePersistedState`**, and the URL seeds are applied in an effect â€”
    so on the first commit the form still holds the PREVIOUS search. A plain boolean `autoSubmit` would
    have run **"plumber / Bourne" from a button that said locksmiths in Wisbech**, spent the money, and
    then painted the right town above the wrong results. Worse, because the MODE is persisted too, an
    operator whose last visit was a market view would have fired **a market view from the Find leads
    button** â€” the exact fault being fixed.
    **So `autoSubmit` is a MODE, not a boolean**, and the effect fires only when the form HOLDS WHAT
    THE URL ASKED FOR (same mode, same keyword, same town). A seed that has not landed spends nothing.
  - âš ï¸ **`run=search` is a one-shot intent** â€” ref'd on first render, stripped from the URL whether or
    not the search fires. Left there it re-runs a **paid** search on every refresh and back button.
  - âš ï¸ **Find leads SPENDS ON ARRIVAL, and that is Paul's call 2026-08-11**: ~$0.11 of Places quota,
    and **nothing** within 72h of the last search of the same trade and town (search-leads
    short-circuits on its own cache). The confirm was guarding the wrong flow.
  - âš ï¸ One place builds the filters (`runSearch` in `SearchForm`), so the arrival run and the Search
    button cannot send different searches â€” the radius, country and town-only that run are the ones on
    screen.
- â›” **NEVER PERSIST AN OPEN DIALOG.** A modal springing open on return is worse than losing it â€”
  you did not ask for it and it blocks the page you came back for. `AiAudit.tsx` already refuses to
  persist `formOpen` for this reason. Persist what you were LOOKING AT, never what was INTERRUPTING.
- â›” **THE MUTATION RISK IS THE WORK, NOT THE MIGRATION.** Paul: *"losing my place annoys me, a stale
  list makes me act on wrong data."* Take **one hook at a time and prove the invalidation** â€” never
  migrate several and test at the end. Every mutation needs its `invalidateQueries` demonstrated.

### THE ORDER
1. âœ… **DONE 2026-08-09 (stage 1a, `9a0ba920`)** â€” Inbox conversation â†’ URL (`?c=`), half-typed reply
   â†’ `src/lib/inboxDrafts.ts`, keyed BY CONVERSATION and in **localStorage** (the one place that tier
   is right: a closed tab must not take a message you were partway through).
   âš ï¸ A bug caught before shipping: `startFromLead` called `setText('')` AFTER switching thread,
   which with per-conversation drafts clears the thread you just LEFT. The line was removed, not
   patched â€” a new thread opens empty by construction.
2. **`useInbox` â†’ React Query**, with invalidation proven on **`send`** and **`patchLeadStatus`**
   specifically. This is the headline fix and the first real mutation test.
3. **The layout route** â€” one `<Route element={<AppLayout/>}>` with `<Outlet/>` replacing the 12
   wrappers. The shell stops remounting and scroll stops needing restoration at all.
4. **The remaining 11 hooks, one at a time.** âš ï¸ **`useOutreach` LAST** â€” its optimistic updates
   (`leadsWithOptimistic`) are the hardest thing to keep correct under a cache.

---

## 6d. âœ… THE PAID CLIENTS PAGE IS GONE â€” paying customers live in Outreach + Inbox (2026-08-12)

`/paid-clients` deleted. Paul's reason: a customer is a lead who paid, not a different kind of
record, and a separate page meant leaving the two screens he actually works in to see them.
**No SQL â€” every column already existed.** Nothing was migrated; only the editors moved.

- â›” **`paid` MEANS `amount_paid > 0`. THE FILTER IS A SENTINEL, NOT A STATUS, AND THAT IS THE WHOLE
  DESIGN.** `OUTREACH_STATUS_FILTER_OPTIONS` leads with `PAID_FILTER_VALUE` (`'__paid__'`), labelled
  **"Paid (money in)"**, which the row filter special-cases against `amount_paid` â€” the same shape the
  Inbox already uses for `__opened__` / `__claimed__` / `__upsell__`. Filtering on the STATUS
  `payment_received` is wrong in **both** directions and each costs something real: a customer moved on
  to `in_delivery` is **still paid** (a status filter hides exactly the people mid-delivery), and a Â£0
  lead dragged to `payment_received` by hand is **not** paid (a status filter counts it as revenue).
  The deleted page had made precisely this mistake once already.
  - âš ï¸ **`statusesForFilter(PAID_FILTER_VALUE)` returns `[]` ON PURPOSE**, and the row filter tests
    `isPaidFilterValue` **first**. Falling through would render an **empty table**, which reads as
    "no paying customers" rather than as an error â€” the `'contacted'` failure in a new place.
  - âš ï¸ **Its label is deliberately NOT the bare word "Paid".** `payment_received` already carries that,
    and two options reading the same word with different row counts is the 53-vs-509 "No WhatsApp"
    failure. `scripts/status-constants.test.ts` asserts no two FILTER options share a label.
- â›” **A CLEARED AMOUNT WRITES `null`, NEVER `0`** â€” eighth instance of the absent-value shape, and
  aimed at the one column that decides whether someone is a customer at all. `0` would silently drop
  them from the filter, from the Inbox exemption and from every revenue figure, with nothing thrown.
  `src/lib/leadPayment.ts` (`parseAmountPaid` / `isPaidLead`) owns it; `scripts/lead-payment.test.ts`
  drives empty / whitespace / null / undefined / unreadable **and the clear-after-save round trip**,
  which is the case a build writing 0 would fail alone. A **deliberately typed 0 is kept as 0**.
- â›” **THE INBOX EXEMPTS A PAID CONVERSATION FROM THE STATUS FILTER** â€” `useInbox` builds
  `paidLeadIds` off the same paginated leads read (it already selected `amount_paid`), `WaConversation`
  carries `isPaid`, and the filter reads `leadStatus === statusFilter || unassigned || isPaid`. Same
  convention as `unassigned`: a bucket that must always be visible is **exempted**, never relied on to
  happen to match.
  - âš ï¸ **SCOPE, STATED: the status filter ONLY.** The campaign filter and the default hide of
    `not_interested`/`closed` are unchanged â€” the latter deliberately, because *Remove from inbox*
    works by setting `status = 'closed'`, and exempting paid leads there would make a paid thread
    **unremovable**. If a paid customer ever vanishes from the Inbox, check those two before the code.
- âš ï¸ **THREE COLUMNS LOST THEIR ONLY EDITOR AND NOBODY HAS NOTICED YET:** `project_duration`,
  `next_checkin_date`, `checkin_notes` were editable **only** on that page. **The data is untouched**
  and still on `outreach_leads`; there is simply nowhere to set them now. The whole check-in feature
  (overdue counts, "due today") went with the page. Not an oversight â€” the brief named the four fields
  to move and these were not among them. `useOutreach.updateClientDetails` is now **dead code**, left
  in place rather than removed mid-task.
- â›” **THE `wa.me` ROW BUTTONS WERE NEVER CALL BUTTONS.** `OutreachTable` and `OutreachMobileCard` each
  had a **"WhatsApp Call"** item in the phone dropdown whose href was `https://wa.me/<number>` â€” which
  **opens a CHAT, not a call**. So they were a second way to message someone *outside* the app: no
  `whatsapp_messages` row, no thread, no reply window, invisible to every count (Â§6: counts come from
  `whatsapp_messages`). Both now open the **in-app thread** via the same handler as the green WhatsApp
  button, relabelled **"WhatsApp thread"**.
  - âš ï¸ **Routed through `handleWhatsAppClick` / `onWhatsAppClick`, NOT a hand-built `/inbox?c=<key>`.**
    The key is `${user.id}::${normalizeWaNumber(phone, country)}`; building it at the call site would
    be a second copy of that rule and would open an **empty** Inbox for a lead with no thread yet.
    `startFromLead` resolves it, creates a synthetic conversation when there are no messages, and
    **then writes `?c=` into the URL itself** â€” so the destination the brief asked for is reached by
    the path that cannot miss.
  - âš ï¸ **AND IT DOES COST SOMETHING: there is no longer any route from the app to a WhatsApp VOICE
    call.** Flagged to Paul; a one-line revert if he wants it back.
  - âœ… **`generateWhatsAppUrl` (`leadUtils.ts:87`) HAS NO REACHABLE CALLERS.** Its two callers are
    `SingleWhatsAppDialog` â€” mounted in `OutreachTable`, but `setWhatsappDialogLead` is **never called
    with a lead**, only with `null`, so the dialog can never open â€” and `openBulkWhatsApp`, which has
    no callers at all. Left alone; changing it would achieve nothing. Don't re-derive this.
- **Untouched on purpose:** the Inbox thread header's `wa.me` fallback (`Inbox.tsx`), `Landing.tsx`,
  `Start.tsx`, and the report's WhatsApp CTA (`aiAuditReportHtml.ts`).
- âš ï¸ **VERIFIED AGAINST REAL DATA, AND THE HARNESS REPRODUCED THE 1,000-ROW TRAP WHILE DOING IT.** A
  read-only service-key script drove the real exported predicates over the real lead table: **exactly
  one lead has `amount_paid > 0`** (RG Locksmiths, Â£19.99, `payment_received`, not archived, thread
  `user_id` matching the lead's) and `isPaidLead` returns true for him. The first draft asked for
  `limit=2000`, **got exactly 1000 rows back, and RG was one of the ones that fell off the end** â€” the
  same truncation that hid him from the Inbox for real. Paginate, always.
  âš ï¸ **The divergence the sentinel exists for is currently ZERO** â€” with one customer whose status is
  `payment_received`, a status filter would coincidentally agree today. The design is right for the
  second customer, not provable on the first. **Nobody has SEEN any of this** (Â§2: screenshots need Paul).

---

## 6e. âœ… DETERMINISTIC MARKET TARGETING â€” built 2026-08-14, Paul's spec. Read before touching the market view.

**A pool business is scored by `nameMatches` over the stored chatgpt/gemini `answer_text`, exactly
as the report and the week-8 guarantee score an audited business.** `TARGET_MAX_NAMED_SHARE = 0.4`
(`src/lib/marketView.ts`, INCLUSIVE â€” â‰¤40% of answers = target, Paul will tune it): targets sort
worst-first, >40% is excluded as already winning, and both exclusions are itemised expandables in
`MarketPanel` â€” never silent, Paul's explicit rule.

- â›” **EXTRACTED COMPETITOR NAMES ARE NO LONGER AN INPUT TO TARGETING, AND MUST NOT BECOME ONE
  AGAIN.** The old path joined the pool to the extracted fold via one shared `groupNames` pass and
  subtracted `established` (leader-relative) entries. Three measured faults, each sufficient alone:
  junk polluted the counts ("Here" in 17/37 Aylesbury answers); the LEADER-RELATIVE threshold
  subtracted Chester's Saltney Locksmiths while AI named it in **16%** of answers; and â€” the worst â€”
  **junk BRIDGED real firms in the union-find**: the single raw mention "Lock" welded Lockforce,
  LockFit, Lock Around The Clock and Aylesbury Lock and Key Centre into one 23-name group scored as
  one firm. The named-intel fold still groups mentions for display and the shape verdict; the pool
  now has its own `groupNames` pass over Places names alone (chain folding), which junk cannot
  enter.
- â›” **`search_cache` IS NO LONGER DELETED** (`cron-run`, 2026-08-14). The nightly 72h delete
  physically destroyed the scraped list â€” measured that day: **113 of 123 measured markets had no
  pool to show**, which was the "never-named businesses don't appear" bug in practice. `market-view`
  now serves an old pool as poolState **`stale`** (same fields as `ready`): businesses visible with
  the search date on them, and **every freshness/spend gate still keys on `ready` alone**
  (MeasureMarket's `poolCount`, the measure flow's search skip). `expired` survives only for pools
  the old cleanup already destroyed â€” a re-search rebuilds them (~11Â¢). Do not "tidy" a TTL delete
  back in.
- â›” **WRONG-TRADE IS A DISPLAY FILTER WITH AN ITEMISED ESCAPE HATCH, NEVER A SILENT CUT.**
  `offTradeMarkForGroup` (group-level: untyped branches never vote; ONE on-trade branch clears a
  chain â€” Timpson has branches typed both "Services" and "Locksmith"). Off-trade rows sit in an
  expandable "Excluded: N (wrong trade)" with their scores, Google's own label, and an **Add
  anyway** button, because Google's categories are imperfect and Paul wants to catch a real
  locksmith filed under "Services" by reading the list.
- â›” **ZERO SCORED ANSWERS = `unmeasured`, NEVER `target`** â€” `poolTargetVerdict` owns this (ninth
  instance of the absent-value shape, caught at design time). `scripts/market-targets.test.ts`
  drives it, the boundary inclusivity, the group off-trade absence rules, and the
  junk-cannot-score integration cases.
- â›” **OPENING A MARKET NEVER SPENDS â€” the auto-clean-ON-OPEN was built 2026-08-14 and REMOVED THE
  NEXT DAY. Do not rebuild it.** It fired a "Cleaning up the namesâ€¦ ~14p" toast plus a minute of
  spinner on every arrival at a dirty market (its once-per-session ref lived in MarketPanel, which
  remounts on every navigation â€” Â§6c), and with every recent market dirty from the cleaner outage
  it read as "Market view starts a new scan" â€” reported by Paul as exactly that. His rule, stated
  twice now: **Market view shows what exists, free; only Find leads and the measure/audit buttons
  may spend, and each says its price on its face.** New measurements still self-clean at
  finalisation (the process-ai-audit-queue hook â€” automatic, part of the run already paid for);
  the backlog keeps the manual "Clean the names" button under the refusal.
  - ðŸ”´ **CONSEQUENCE, STATED, NOT HIDDEN: a market with a dirty fold shows its targets and named
    counts but keeps the "Names not cleaned Â· no verdict" refusal until SOMETHING cleans it** â€”
    the manual button (~7p/run) or a re-measure. The deterministic scoring grades TARGETS only;
    the verdict grades who's-WINNING, which needs the extracted names (firms with no Places
    listing, the cross-town national test), so it cannot be derived from the pool â€” that trade-off
    was examined and kept 2026-08-14.
  - ðŸ”´ **AND THE CLEANER ITSELF WAS STILL FAILING SILENTLY AS OF 2026-08-14** â€” folds stayed dirty
    after auto-clean attempts, queue rows unrewritten, cause unknown from the harness (the panel
    invoke swallows per-run failures; supabase.functions.invoke resolves with `error`, it does not
    throw). Diagnose via one press of the manual button (its toast counts failures) or the
    extract-competitors dashboard log. Nothing has provably cleaned since ~2026-08-10, so suspect
    OPENAI_API_KEY before suspecting the auth plumbing fixed in Â§8.
  - âœ… Coverage's row buttons carry their prices: "Find leads Â· ~{asPence(MARKET_SEARCH_USD)}"
    (derived â€” never hand-type a pence figure, Â§4's constants rule) and "Market view Â· free". The
    measure button already priced itself ("Refresh this market Â· free" included).
- âš ï¸ **THE TARGET LIST'S FLOOR IS STILL GOOGLE PLACES.** A firm AI names that has no Places listing
  in the town stays in the named-intel list only â€” there is nothing to contact. Aylesbury is the
  honest example: in-town Places holds 3 real entities (2 already winning at 50%/84%, Timpson a
  chain), so the winnable businesses are the **11 nearby** locksmiths, all real, all typed
  `locksmith`, listed under "Nearby, outside the town boundary".
- âš ï¸ Old-SPA/new-payload overlap is a 10-minute sessionStorage cache (`useMarketView`), same as
  every market-view deploy. Deploy `market-view` BEFORE pushing the SPA.

---

## 6f. âœ… THE TOWN GATE â€” verify-on-import + five server gates, built 2026-08-14, Paul's spec

**The Wilson's Valeting rule: money and messages never move on an unverified town.** One predicate,
`src/lib/townVerdict.ts`, read by every gate and the Outreach badge: `verified` (derived_town
present), `unverifiable` (no town AND a settled note), `unchecked` (everything else).

- â›” **DERIVED, NEVER STORED â€” there is NO town_status column and there must not be one** (Â§6's
  serveGate rule). The state already lives on the lead: `derived_town` + `town_fetched_at` +
  `town_fetch_note`, written only by `resolveDerivedTown`. `SETTLED_TOWN_NOTES`
  (`_shared/place-details.ts`) holds the ONLY two notes that gate: `no_town_in_address` (Google
  answered; no town) and `no_place_id` (nothing to ask about). Every transient failure â€” 429,
  outage, cost cap, missing key â€” stamps a retryable note or nothing, and `scripts/town-verdict.test.ts`
  pins that a transient or unknown note NEVER gates. **Gates fire only on `unverifiable`;
  `unchecked` always passes** (absence is never an answer â€” instance ten).
- **The five server gates, each reporting its skip, never a silent shrink:**
  | Where | Behaviour |
  |---|---|
  | `process-whatsapp-queue` | excluded in the claim query (like archived); `unverifiedQueuedCount` in the status payload; own empty-queue skip code. â›” **BLANKET by Paul's call** â€” holds the plain opener too |
  | `instantly-push` | own id list `townUnverifiedIds` + count (bulk-jobs maps outcomes from id lists â€” a lead in none reads "gave no reason") |
  | `bulk-jobs` | triage rung â†’ `cannot` with the shared reason; item branch â†’ `skipped_town_unverified` (own status member, like `skipped_suppressed`) |
  | `create-ai-audit` | 409 `town_unverified` on BOTH auth paths (covers wizard, Inbox, whatsapp-inbound chain). âš ï¸ **Baselines exempt, deliberately** â€” the paid path runs on the customer's own confirmed_location, and a prospect-era flag must not break the guarantee chain. Market audits have no lead_id and never reach it |
  | `derive-audit` | 409 before deriving â€” its town line falls back to search_location, the exact wrong-town fault |
- â›” **CSV IMPORT VERIFIES AS IT LANDS** (`bulkImportLeads` â†’ `backfill-lead-towns` with the new
  ids, chunked at MAX_PER_CALL so a big file is verified in full). Id-less rows get the
  **three-guard place resolution** in `backfill-lead-towns`: Text Search **Pro** ($0.032, mask
  places.id/displayName/formattedAddress â€” the IDs-only mask is free but returns no name, and a
  resolver that cannot check the name is a blind top-result), then (1) `nameMatches` both ways,
  (2) exactly ONE distinct survivor, (3) whole-token town-hint agreement; **no location text on the
  row refuses outright**. A refusal runs `resolveDerivedTown` with no place_id â†’ settled
  `no_place_id` â†’ gated, with the specific reason itemised in the response. Transient search
  failures stamp NOTHING (stamping a settled note on our own outage would permanently gate a good
  lead) and are never cached.
- âš ï¸ The residual false match that survives all three guards is a same-name business in the same
  hinted town â€” whose derived_town is still the right town, the quantity being verified.
- **Backlog** (measured 2026-08-14): 498 leads lack derived_town, **384 unarchived** â€” all with
  place_ids, â‰ˆ $1.92 via the existing backfill button, 3 presses at MAX_PER_CALL 150. The archived
  114 are skipped by design.

---

## 7. Parked and unmerged â€” do not merge these

| Branch | Hash |
|---|---|
| `edge-check-gate` | `d3fd6713` |
| `findable-product-rename` | `a8365707` |
| `short-signup-url` | `c8896003` |

---

## 8. Known open problems â€” don't rediscover these

- ðŸ”´ **THE WHATSAPP DAILY CAP IS ALMOST OUT OF ROAD, AND REPLIES SPEND IT WITHOUT BEING LIMITED BY
  IT.** `DAILY_CAP` in `process-whatsapp-queue` â€” **120** since 2026-08-12 (40 â†’ 60 â†’ 100 â†’ 120, each
  raise on a Green quality rating). Two facts neither file reveals on its own:
  - â›” **RAISING IT PAST ~140 DOES NOTHING.** Simulated 5,000 days on the measured cron grid (ticks
    every 10 min, one send per tick â€” 441 of 619 real sends land on a +0 minute-of-10 mark):
    **100 â†’ 77.4/day, 120 â†’ 84.4, 140 â†’ 87.0, 200 â†’ 87.0.** Above cap 60 the target gap
    (`minutesUntilWindowEnd()/(DAILY_CAP - sentToday)`, 870/119 â‰ˆ 7.3 min at 120) is already **below
    `SEND_GAP_FLOOR_MIN` (10)**, so the FLOOR sets the rate and the cap only decides how far into the
    evening the floor keeps being hit. **~87/day is the ceiling.** Next levers in order:
    `SEND_GAP_FLOOR_MIN`, then the cron schedule (DB-only, above). The model reproduces both figures
    previously recorded in the file (60 â†’ 54.4, 100 â†’ 77.4), which is what makes it trustworthy.
  - â›” **`send-whatsapp-message` IS EXEMPT FROM THE CAP BUT STILL COUNTS AGAINST IT.** It deliberately
    does not enforce `DAILY_CAP` (in-window replies must always go), yet it writes `whatsapp_sends`
    rows and `sentToday` counts **every** row. So Inbox replies and auto `audit_reply` sends **spend
    the outreach queue's budget while being immune to it** â€” a busy reply day throttles the *queue*.
    Busiest real day, **2026-08-11: 85 of 100** = 48 `initial_contact` (queue) + **37 unpaced
    reply-path sends**. Queue-at-pace plus that reply volume is 77 + 37 = **114**, which at 100 would
    have stopped the queue mid-afternoon. **At 120 that day is still 114 of 120.**
  - âš ï¸ **The queue's 07:00â€“21:30 London window binds the QUEUE ONLY.** The reply path answers Meta's
    24-hour window instead, so `whatsapp_sends` legitimately contains out-of-hours rows (24 of 619,
    all `audit_reply`/free-text). **Do not read those as the queue sending overnight** â€” the queue's
    own simulated sends are 0 outside the window at every cap.
  - âš ï¸ **Never write the cap as a number in prose.** Two comments have already gone stale this way:
    the queue header once said 40 while the constant was 100 (Paul believed his cap was 40), and
    `send-whatsapp-message` said "the 10/day outreach cap" until 2026-08-12. Name the constant.
  - â›” **YOU CANNOT READ THE LIVE CAP FROM HERE, AND THAT IS NOT A DEPLOY FAILURE.**
    `mode:"status"` returns the whole payload (`cap`, `sentToday`, `windowOpen`, â€¦) and sends
    nothing â€” but every credential available to a script is refused (see the service-role-bearer
    finding in Â§8 above). It needs CRON_SECRET or Paul's admin JWT. **The queue panel reads `cap`
    straight from that payload**, so the one-glance check is Paul opening it: "x / 120". Do not
    re-derive this, and do not read the 401 as the deploy having failed.
- **TWO LIVE CRON JOBS EXIST ONLY IN THE DATABASE, NOT IN MIGRATIONS.** Confirmed from `cron.job`
  2026-08-04: **`notify-onboarding-submit-run`** (every minute â€” the "submitted but not paid" email
  to Paul WORKS) has no migration file, and the `bulk_jobs` `job_type` constraint has the same gap.
  A rebuild from migrations would silently lose both. Do not "discover" the notifier as unscheduled
  (a repo-only recon reads it that way), and don't fix the gap without Paul asking.
- âœ… **GOOGLE PLACE DETAILS COST â€” SETTLED 2026-07-30 against Google's docs.** A Place Details request is
  billed **ONCE, at the highest SKU tier any requested field touches** ("if you select fields in both the
  Essentials and the Pro SKUs, you are billed based on the Pro SKU").
  | Field | Tier |
  |---|---|
  | `formattedAddress`, `addressComponents`, `location` | **Essentials** |
  | `internationalPhoneNumber`, `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount` | **Enterprise** |

  So **rating and review count are FREE on any call that already asks for a phone number** â€” same tier.
  And adding one Enterprise field to an Essentials-only call re-prices the whole thing, which is why
  `place-town.ts`'s audit-time call deliberately stays address-only.
  âš ï¸ An earlier comment in `sources.ts` said rating moves a call to "the **Pro** SKU at ~4x" â€” **wrong
  tier**, now corrected in the file. The `$0.017` in `google-place-details`' `logUsage` is an inherited
  constant, **never verified against a bill.** Don't quote it as fact.
- âœ… **LEAD-CREATION ENRICHMENT â€” FIXED + DEPLOYED 2026-07-30** (`80efe108`). The phone lookup that
  already runs on add now also returns **address, rating, review count and the derived town**, at no
  extra cost, and `useOutreach.ts` writes all of them. Consequences worth knowing:
  - `resolveDerivedTown` at audit time now normally hits a fresh 30-day stamp and calls Google **zero**
    times. It is the backstop, not the main path.
  - **`phone_cache.details_version`** gates pre-v2 rows as a MISS. Without it every already-cached lead
    would have stayed unenriched for 30 days.
  - **âš ï¸ `postal_town` can be COARSER than the name a customer would use.** "Dogs of Southsea" derives
    **Portsmouth**, because Southsea's `postal_town` *is* Portsmouth (it's `locality` that says
    Southsea). The precedence `postal_town > locality > admin_2` is unchanged and still correct for the
    Huntingdon-from-a-Wisbech-search bug it was built for, but for a district of a larger city it will
    ask AI about the city. **Not yet decided whether that's right.** Verified by unit test, not guessed.
  - Still outstanding: **`search_keyword`/`search_location` can be written as null.** `addLead` writes
    them, and `Index.tsx` passes them, but they live in page state (`Index.tsx:41-42`) set only by
    pressing Search â€” while the RESULTS are restored from `sessionStorage`
    (`LeadSearchContext.tsx:150-168`, filters persisted only on the demo path). So search â†’ leave the
    page or reload â†’ come back â†’ Add writes nulls, with results still on screen. **Paul is testing the
    exact trigger before this is fixed.**
- **Audits use the SEARCHED town, not the real town.** Lead search has a radius, so a Huntingdon locksmith came
  back from a Wisbech search and was told AI doesn't know he exists â€” he ranks first in his own town. He caught
  it. Spec is ready; **not built**.
  - `outreach_leads.place_id` is populated on **758/758**; `address` was on **0** â€” fixed for NEW leads
    2026-07-30 (above). **Existing 758 are not backfilled**; Paul said backfill isn't needed.
  - `getPlaceDetails()` is restorable from **`a8fd7003^:supabase/functions/search-leads/index.ts`** â€” verified
    2026-07-30: `a8fd7003` is the commit that deleted it. Not in `_shared/`; don't go looking there.
  - Town extraction is reusable as-is at `generate-barber-site:307-310` (UK `postal_town` â†’ `locality` â†’
    `administrative_area_level_2`).
  - **THREE callers BUILD `location_text` themselves and pass it in**, so `create-ai-audit` must treat an
    incoming value as **overridable**, not merely fall back when absent. Verified by grep 2026-07-30:
    | Caller | Line | Expression |
    |---|---|---|
    | `bulk-jobs` | 229 | `lead.search_location \|\| lead.address` |
    | `_shared/whatsapp-inbound` | 226 | `lead.search_location ?? lead.address` |
    | `_shared/whatsapp-inbound` | 333 â†’ 376 | `locText`, same expression, **the live auto-audit chain** |
    âš ï¸ **Earlier briefs listed only the first two.** The third is a separate call site in the same file and is
    on the `AUTO_AUDIT_REPLY_ENABLED` path that is ON in production â€” miss it and the highest-volume path keeps
    using the searched town. A textbook case of Â§4's "check the next layer".
    Also a setter: `_shared/audit-baseline.ts:412` â€” `confirmed_location || search_location`, **the paid
    baseline, i.e. the guarantee path.** And `src/pages/AiAudit.tsx:753` for the wizard.
    Intended precedence everywhere: `confirmed_location || derived_town || search_location`.
- ðŸ”´ **HOW MANY REPORTS WENT OUT WITH THE WRONG TOWN â€” TWO NUMBERS, AND THEY MEASURE DIFFERENT
  THINGS.** Leaving both without this note reads as a contradiction.
  - **37** was the earlier estimate: every report sent before the `derived_town` fix, regardless of
    whether the distance was ever checked.
  - **28** is *proven*, measured 2026-08-09 once `outreach_leads.lat/lng` existed: of the 31 audits
    now known to be >10 km from their town, 28 had a report reach the prospect on some channel
    (26 WhatsApp carrying a report link or `audit_reply`, 6 pushed to Instantly, 10 with status
    `report_sent`) and **20 were opened**. RG Locksmiths cambs is in that list at 42 km â€” the
    prospect who complained.
  - âš ï¸ **28 IS A FLOOR, NOT A TOTAL.** It counts only the 44 audits whose business coordinates are
    known, out of **195** audited leads. The real figure is very likely above 37. It rises as
    coordinates are backfilled â€” do not quote 28 as "the number affected".
- âœ… **AUDIT COST â€” SETTLED 2026-07-30 from measured spend.** Paul ran the query against
  `ai_audit_runs.actor_cost_usd`: **81 runs, mean $0.04207 per run, $3.41 total, 26â€“30 July.** Those runs are
  the 3â€“5 question outreach size that dominates the table, which puts a question at roughly **$0.0125**.
  | Thing | Real cost |
  |---|---|
  | One run (measured mean) | **$0.042** â‰ˆ 3.4p |
  | 3-question re-audit | â‰ˆ **3p** |
  | 10-question Ã— 3-run baseline | â‰ˆ **30p** |

  **Both previous figures were wrong, in opposite directions.** `$0.0025`/question was ~5Ã— too LOW; the
  `$0.0498`/question and Â£1.50 baseline quoted in earlier briefs were ~4Ã— too HIGH. Neither had a cited source.
  Never quote a cost from a constant again â€” `actor_cost_usd` is the only measured number.
  âœ… Server constant corrected to **$0.0125** 2026-07-30 (`_shared/enrichment/sources.ts`) and all 7 importers
  redeployed. It is **per QUESTION**, not per run â€” `startRow()` charges it once per queue row and
  `create-ai-audit` multiplies by question count. Setting it to the per-run $0.042 would over-count ~3.6Ã—.
- ðŸŸ¢ **THE SPEND CAP WAS NEVER ACTUALLY UNDER-COUNTING â€” don't "fix" it again.** This was assumed twice (once
  in this file) and it is wrong. `recordCostCorrection` in `_shared/enrichment/runner.ts:139` writes a SECOND
  `enrichment_usage` row holding `delta = actual âˆ’ estimated` once an async actor finishes, so
  **`sum(cost_usd)` over the window already equals real billed spend whatever the estimate was.** Deltas may be
  negative. Measured 2026-07-30: in one 24h window, `ai_search` logged $0.22 across 88 questions and
  `ai_search_correction` added $0.743 â€” $0.963 total, i.e. $0.0109/question, the real figure.
  So `estCostUsd` only governs the *reservation* in the pre-check and how many rows a tick starts; it never
  distorted the accounting. Correcting it is still right (a realistic reservation, a realistic UI estimate, a
  smaller correction delta) but it was not the emergency it looked like.
  âš ï¸ Consequence for any cost query you write: **you must include the `*_correction` rows.** Filtering
  `enrichment_type = 'ai_search'` alone reads ~5Ã— too low, and filtering lifetime rows reads too HIGH for the
  older ones that were estimated at $0.05. Sum everything, or use `ai_audit_runs.actor_cost_usd`.
- ðŸ”´ **APIFY IS A SINGLE POINT OF FAILURE FOR THE WHOLE PRODUCT, AND IT HAS A MONTHLY CAP.** Every
  AI-visibility question check *and* every SEO scan runs through it, so at 100% **both stop at the
  same moment**. Incident 2026-07-30: the account hit **$90.02 of a $90.00 cap** and audits failed
  with `HTTP 402` (then `403`). Cycle runs **4 July â†’ 3 August**; Paul raised the cap to **$100** the
  same day (90.0% used, ~$10 headroom).
  - **It was not caused by that day's audits.** The account was already at **$89.78 (99.8%) by
    12:38**; the day's own audit spend was **$0.67**. It crossed 90% on **28 July**.
  - `apify-usage.ts` had logged `CRITICAL` **170 times over two days** â€” into edge-function logs
    nobody reads. Now surfaced on `/ai-audit` via the **`apify-usage-status`** function +
    `useApifyUsage` + `ApifyUsageLine`. Amber â‰¥75%, red â‰¥90%, thresholds shared with that module.
  - âš ï¸ **Recompute the percentage from used/cap; never trust `usage_pct`.** The cap can be RAISED
    mid-cycle, and the stored figure is only true for the cap in force when the row was written â€”
    after the rise it still read 100% while the truth was 90.0%.
  - Distinguishing OUR cap from THEIRS: the queue writes the exact tokens `capped` and `daily_cap`.
    Anything else â€” including a raw `Apify start â€¦ HTTP nnn` â€” is the vendor, not us.
  - âš ï¸ **Still outstanding:** the queue spends **`MAX_ATTEMPTS = 3`** attempts per question against a
    402/403 hard stop. Failing fast on those is deliberately **not built** â€” Paul deferred it as a
    live-queue behaviour change while he was testing.
- **A MARKET AUDIT SITTING AT "1 completed run" IS PROBABLY STILL WORKING, NOT DEAD.** Investigated
  2026-08-04: Ipswich showed "2 audits, 1 completed run" and looked like a silent failure. Audit
  `c39d755f` was **3.9 minutes old** with one question in flight on Apify against
  `MAX_RUN_AGE_MS = 12 min` â€” an Apify question legitimately runs up to ~9 minutes â€” and it finished
  unaided, 8/8, $0.083. **Before diagnosing a market audit as failed, read
  `ai_audit_queue.result._apify.startedAtTick` and compare it to 12 minutes.**
  - The real bug was that **nothing on the panel said which state it was in**. `market-view` now
    returns `marketProgress` per unfinished market audit (questions done/total, run age, and the
    **raw** error off the queue row), and `MarketPanel` grades it running / stalled
    (`MARKET_AUDIT_STALE_MS`, 20 min) / failed, polling every 45s while anything is unfinished.
  - âš ï¸ **The evidence gate counts COMPLETED audits, never audits.** It used to count audits, so 2
    market audits with 1 completed run cleared `MARKET_AUDIT_MIN_AUDITS = 2` and the view called a
    shape on ONE audit's data â€” the degenerate-`auditShare` case the bar exists to prevent. The
    `MarketShapeInput` fields are named `marketAuditsComplete` / `businessAuditsComplete` so the
    audit counts cannot be passed in again by accident.
- â›” **THE AREA/MARKET AUDIT ALREADY SKIPS SEO AND ALREADY RUNS ITS QUESTIONS IN PARALLEL. MEASURED
  2026-08-13 â€” do not "optimise" either again.** Paul asked for the SEO scan to be stripped out of
  the targeting audit to make it faster. There was nothing to strip: **44 of 44 market runs carry
  `results.seo = { skipped: "seo_scan_not_requested" }`, and 0 carry a real grade.** The skip is
  STRUCTURAL, not a flag â€” `create-ai-audit:815` seeds the marker on `skipSeo || marketOnly`, and
  `MeasureMarket` always sends `market_only: true`. Removing SEO from this flow saves **zero
  seconds and zero pence**.
  - âš ï¸ **AND THE AI CALLS ARE NOT SEQUENTIAL.** `START_BATCH = 12` rows claimed per 30-second tick,
    `AUDIT_IN_FLIGHT_CEILING = 24`. Proof from the data, not the code: in **19 of 24** clean measure
    runs all 16 questions finished **within ~2 seconds of each other**. Parallelising saves nothing.
  - â›” **THE COROLLARY THAT MATTERS FOR EVERY FUTURE "make it faster" ASK: cutting the question
    count saves MONEY, NOT TIME.** 8 questions and 16 questions take the same wall clock, because
    they run concurrently. The wall clock is **one Apify scrape**, ~2.5â€“6 min, and that is the floor.
  - **The measured shape** (25 measure runs, Soham incident excluded): wall clock min 3.3, **median
    6.5**, worst 17.8 min. Per-question median has FALLEN to ~2.8 min since 10 Aug â€” but a **tail
    appeared at the same time**: 12/13 Aug ran **17.7 and 13.9 min**, both with a retried row, while
    11 of 16 questions were done inside 2.4 min.
  - âš ï¸ **The tail is NOT queue congestion** â€” Royal Sutton Coldfield took 13.9 min with **zero**
    other queue rows moving in the window. It is one Apify run hanging, and `MAX_RUN_AGE_MS = 12 min`
    means a hung run burns 12 minutes before the retry even starts (17.63 min = 12 + a normal 5.6).
    â›” Lowering that constant is the trap already recorded above: at 5 min it culled healthy-but-slow
    runs into a retry storm. It also governs the paid baseline, not just targeting.
  - âœ… **BUILT 2026-08-13: A TARGETING AUDIT NOW FINALISES ON 7 OF ITS 8 QUESTIONS.**
    `_shared/targeting-straggler.ts` (`mayFinishWithoutStragglers`) + the drop branch in
    `finaliseSettledRuns`. Only `process-ai-audit-queue` imports it, so that is the whole deploy
    list. **No SQL** â€” `is_market` and `baseline_target_runs` already existed.
    - â›” **THE UNIT IS THE AUDIT (8 questions), NOT THE 16-QUESTION PAIR.** A measure run is two
      audits and each folds independently, so "15 of 16" is really "7 of 8, twice". Quoting the
      pair figure would overstate what the code does.
    - â›” **IT IS NOT A TIME CAP AND MUST NOT BECOME ONE.** Nothing reads how long a question has
      run; the test is only whether it is the LAST ONE LEFT in its own batch. That is why the
      uniformly-slow runs are untouched â€” **Leyland 12.13â†’12.13 and Ipswich 17.77â†’17.77, saving
      nothing, correctly**. `MAX_RUN_AGE_MS` above is the record of what happens when you do cap it.
    - **A 60s grace (`TARGETING_STRAGGLER_GRACE_MS`) is measured from the SETTLED rows**, so a
      question thirty seconds from returning is not thrown away for thirty seconds of saving, and a
      batch that is slow all over can never qualify. It costs ~1 min on the runs that benefit.
    - **Expected**: Royal Sutton Coldfield **13.9 â†’ ~6.9 min**, Accountants/Wakefield
      **17.7 â†’ ~12.2 min**. Median barely moves (6.45 â†’ ~6.0) because most runs have no straggler â€”
      **this fixes the bad days, not the typical one.**
    - âš ï¸ **The dropped row is stored `status: 'failed'` with error `straggler_dropped`**, because
      that is the only settled status `MeasureMarket`'s poll and `QUESTION_STATE_SCORE` already
      understand â€” a bespoke status would leave the progress bar running forever.
      `explainAuditFailure` renders it as a deliberate choice, not a failure, and
      `summary.dropped_questions` records the count separately from real failures.
    - âš ï¸ **STATED LIMIT: a row still `pending` counts as the straggler too.** If the queue is
      congested enough to defer a row for a full minute while its seven siblings finish, it is
      dropped without ever running. Cheapest possible drop (nothing spent) and it still saves the
      time, but it is a breadth loss caused by congestion rather than by a hung question.
    - âš ï¸ **THE BASELINE IS EXCLUDED TWICE** (`is_market !== true` â†’ refuse, `baseline_target_runs > 1`
      â†’ refuse) and `scripts/targeting-straggler.test.ts` drives **720 baseline shapes, including
      `is_market: true`, and asserts none reaches the drop.** Proven separate in live data: 333
      audits, 44 market, 5 baseline, **zero overlap either way**, no market audit with a `lead_id`.
- â›” **REVIEW REPLIES â€” RESEARCHED 2026-08-10, DECIDED: BUILD NOTHING. Do not re-run this recon.**
  Nothing in either repo touches the Google Business Profile API today (only Places and Geocoding),
  and nothing should.
  - âš ï¸ **THE ACCESS APPLICATION IS NOT THE CONSTRAINT â€” SCOPE IS.** Approval is *reviewed within 14
    days* (Google's own FAQ), prerequisites are a verified GBP active **60+ days** with a website,
    applied for from an owner/manager email; 0 QPM in Cloud Console means not approved, 300 means
    approved. That is the easy part.
  - ðŸ”´ **YOU CAN ONLY READ REVIEWS FOR PROFILES YOU MANAGE.** Not prospects, not competitors. Google
    filters applications for anything resembling third-party access.
  - âš ï¸ **SO THE "NOTIFY-ONLY vs REPLY-DRAFTING" SPLIT IS A FALSE ONE** â€” the shape the question was
    first asked in. Push notification genuinely exists (Cloud Pub/Sub, `NEW_REVIEW` among the types,
    so no polling), but it is per-account and managed-locations-only. **Both halves need the same
    grant.** The real split is customers vs prospects.
  - Customers are viable, and the grant is **already in the product**: `gbp_status` asks them to add
    `paul@move37.fun` as a Manager. Prospects are impossible on the official API.
  - Reviews live **only on v4** (`mybusiness.googleapis.com/v4`), never migrated to the v1 APIs.
  - **The no-approval alternative and its ceiling:** Places API returns reviews for any business â€”
    but max **5**, sorted by relevance not date, and the review object has **no owner-reply field**.
    So "you have 3 unanswered reviews" as an outreach hook **cannot be built**: answered and
    unanswered are indistinguishable. Cost would be **+$0.005**/business (Place Details Enterprise
    $20/1,000 â†’ Enterprise + Atmosphere $25/1,000, the tier `reviews` triggers).
  - âœ… **Google's own pricing page cross-validates two Â§4 constants:** Text Search Enterprise
    **$35/1,000** and Place Details Enterprise **$20/1,000**. Both correct as recorded.
  - â›” **AND IT CONTRADICTS Â§5 IF SOLD AS FINDABLE.** Reviews are *tested and negative* for being
    named by AI â€” three named businesses have 0â€“1 reviews. This is a **separate product** for
    existing customers, not an enhancement. Paul's call 2026-08-10, with zero paying customers: build
    nothing, create a verified Findable GBP so the 60-day clock runs in the background, revisit when
    there are customers to serve.
- âœ… **`onboarding_responses.gbp_verified` â€” added 2026-08-10.** `gbp_exists` asks about **claim and
  access**; "Yes, and I can get into it" is equally true of a profile awaiting verification and of a
  suspended one. An unverified profile **does not show on Maps or Search**, so profile work publishes
  to nobody â€” and it is the plainest explanation there is for "AI has never heard of me".
  `yes | pending | no | not_sure`, asked only on the `gbp_exists = yes` branch, NULL = not answered.
  Four states because four different things happen; `pending` is a chase, `no` is a piece of work.
  Read by `notify-onboarding-submit` (a **Verified:** line, and `no` joins `needsYou` beside
  `no_access` â€” only `no`, because padding that list is how the entries that matter get skimmed past).
  âš ï¸ It is also the exact gate on review replies ever working for a client (see above).
- ðŸ”´ **A FOLLOW-UP ANSWER SURVIVES THE ANSWER IT HANGS OFF â€” fixed 2026-08-10, and it was live for
  `gbp_status`.** Answer "Yes, I have a profile" â†’ "Done, I've added you", then change to "I don't
  think I have one", and the questionnaire submitted a **contradiction**: no profile at all, *and*
  already added us as a manager on it. **The stale value is invisible on screen because the panel
  holding it has closed**, which is exactly what let it survive. Both follow-ups now clear when
  `gbp_exists` moves off `yes`.
  âš ï¸ **THE RULE: a conditionally-shown question owns its answer's LIFETIME, not just its display.**
  Hiding a field is not clearing it â€” **and clearing it is not the same as not sending it.**
  âœ… **SWEPT 2026-08-10, all four branch-revealed inputs. Two were ALREADY correct** and are the
  model: `website_platform_other` (guarded on `websitePlatform === "other"`) and `willing_to_migrate`
  (guarded on `migrateAsked`) **derive what is SENT from the same condition that decides what is
  SHOWN**, so the two cannot disagree. The other two now match:
  - `website_manager_email` â€” revealed by "a web company manages it"; typing the address then
    changing to "I do it myself" sent a contractor's email for someone with no contractor.
  - **The whole Google block** (`gbp_exists`/`gbp_status`/`gbp_verified`), revealed by consent
    `yes_all` â€” answering them then changing to "pages only" recorded that they had added us as a
    manager on a profile they had **just refused us**. Worst of the four because the other two
    consent options **submit on selection**: one click, straight out, stale answers attached.
  â›” **AND THE FIX HAD TO BE IN THE PAYLOAD, NOT THE CLICK HANDLER.** `submit()` runs in the same
  tick as `setConsent` and closes over the previous render's state â€” the identical race the
  `consentOverride` comment in that file already documents **for the same button**. Clearing state in
  the handler would have looked right, hand-tested right, and sent the stale value anyway. State is
  cleared too (the draft and panel stay honest), but the payload line is what decides.
  âš ï¸ Both send sites â€” `submit` **and** the `bail` escape hatch â€” post the same object. A bailed
  submission is partial by design; it is not allowed to be wrong.
- ðŸ”´ **RLS ENABLED WITH ZERO POLICIES â€” THIS HAS NOW COST A WORKING FEATURE, AND IT IS THE THIRD
  INSTANCE.** A denied read returns **HTTP 200 with `[]`**, which is indistinguishable from a table
  that is genuinely empty. Nothing throws, nothing logs, and the feature silently does nothing.
  | Where | What it cost |
  |---|---|
  | `apify_account_usage` | its own migration comment promised the figure would be visible in the app; the policy was never added, so nothing ever displayed it |
  | The submissions card | caught **before** shipping, 2026-08-10, by checking the policies first â€” this is the check that works |
  | **`useDashboardMetrics.onboardingByLead`** | **the NextActionsCard chase task ("filled the questionnaire and hasn't paid") has NEVER fired for anyone.** The code carries a comment asserting *"RLS scopes them as it scopes allLeads"* â€” it does not |
  - âœ… **PROVEN 2026-08-10, both directions**: the anon key reads `onboarding_responses` and gets
    `200 []` while the service role sees 2 rows, and `select policyname from pg_policies where
    tablename='onboarding_responses'` returns **no rows**. Paul ran the policy query.
  - âš ï¸ **A COMMENT CLAIMING RLS SCOPES A TABLE IS NOT EVIDENCE.** Both failures were introduced by
    someone believing one. Check `pg_policies`, not the prose.
  - â›” **THE FIX WHEN A TABLE HAS NO POLICY: route the read through an edge function on the service
    role, behind an operator check** â€” as `coverage` and `submissions` do. Adding a policy is the
    other option and is Paul's call, not a default.
  - ðŸ”´ **THE FULL SWEEP IS NOT DONE.** PostgREST cannot read `pg_catalog`, so it needs one query in
    the SQL editor â€” hand Paul this and act on the result:
    ```sql
    select c.relname, count(p.polname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     group by 1 having count(p.polname) = 0 order by 1;
    ```
    Then grep the SPA for a direct `.from('<table>')` on every name it returns. **Every hit is a
    feature that silently does nothing.**
  - âœ… **SWEEP DONE 2026-08-10. 11 tables had RLS with no policy; only THREE are read from the SPA:**
    | Read | Costs |
    |---|---|
    | `OutreachTable:1251` `contact_suppressions` | pre-queue UX filter â†’ the queue count **overstates**. âœ… **THE SEND PATH IS SAFE**: `checkSuppressed` is always passed the **service-role** client (`process-whatsapp-queue:421`/`:694`, `process-sms-queue:219`, `twilio-inbound`), which bypasses RLS. Nobody who said no has been contacted |
    | `usePlaybook:240` `onboarding_responses` | the client sheet thinks **nothing is held** â†’ prints "NOT HELD â€” ask the client" for every field. Costs nothing today (2 test rows); **becomes actively wrong after the questionnaire split** |
    | `useDashboardMetrics:183` + `useCampaignStats:132` | the dead chase task, and a campaign count reading low |
    | `useDashboardMetrics:191` `sms_sends` | **zero cost today** â€” no SMS has ever been sent, so `[]` is also the true answer. A latent trap: the day SMS starts, the figure stays 0 |
  - âœ… **`whatsapp_sends` and `whatsapp_outreach_state` are NEVER read from the SPA.** Volume and
    pacing come from **`whatsapp_messages`**, which is not on the no-policy list â€” so those figures
    were never zero-because-empty. Do not "fix" them.
  - â›” **ENDPOINT vs POLICY â€” THE TEST IS WHETHER THE TABLE HAS AN OWNER COLUMN.** `sms_sends` has
    `user_id`, so "my own sends" is expressible and it got a **policy** 2026-08-10 (verified by the
    sweep query dropping it â€” the table is EMPTY, so no data read can tell a policy from its
    absence; the RLS trap blocks its own verification). `contact_suppressions` is deliberately
    cross-channel and one-no-forever with **no owner to scope to**, so it gets an endpoint;
    `onboarding_responses` already has `submissions`.
  - **Still to fix (order agreed):** `usePlaybook` (needs a NEW `submissions` action â€” the existing
    one deliberately returns card columns, not the answers), `contact_suppressions`, then the two
    dashboard reads.
- ðŸ”´ **THE ORDER, RE-AGREED 2026-08-10 â€” THE VERDICT FAULTS COME BEFORE THE SPLIT.** Paul's reason,
  and it overrides the "split is next" note further down: *the split changes a flow nobody has used
  yet, and the verdict faults are corrupting decisions I am making today.*
  1. âœ… **The dirty-list signal â€” BUILT 2026-08-10**, and the measurement replaced the plan (below).
     The refusal, the cleaner button in that state and the auto-clean are done. âš ï¸ **Wakefield is NOT
     cleaned**, and the reason is NOT what was first recorded â€” see the corrected note below. The
     panel's cleaner button works; only a service-role script is refused.
  2. âœ… **Winnability â€” MEASURED AND FIXED 2026-08-10** (below). The citation half of the verdict is
     gone; 11 markets flip from skip to workable.
  3. âœ… **DEPLOYED 2026-08-11.** `market-view` v23, `extract-competitors` v8, SPA verified live by
     marker (`Names not cleaned` + `National brands hold the naming` in the marketView chunk,
     `Clean the names` in the Index chunk, and the conditional `${â€¦?"&confirm=search":""}` in the
     Coverage chunk). ðŸ”´ **NEXT: clean the eight refused markets from the PANEL BUTTON** â€” 61 runs,
     $4.27, or $1.40 for the five market-audited ones as a first pass â€” then re-read their verdicts.
  4. The questionnaire split.
  5. `usePlaybook`, `contact_suppressions`, the two dashboard reads.
  âš ï¸ **DO 1 AND 2 IN ONE SESSION.** Both decide market verdicts Paul picks towns from, so the two
  faults are independent but compound: fixing either alone leaves the Coverage numbers wrong in the
  other way, and each one's answer can move the other's.
  â›” **THE DELIVERABLE IS A LIST OF TOWNS WHOSE VERDICT CHANGES** â€” worked ones he should not have,
  and skipped ones he should have. Not a corrected rule; the towns.
  âš ï¸ **NO RE-AUDITING.** Cleaning re-reads stored answers, so the only spend is the cleaner itself
  (`CLEANER_USD_PER_RUN` = $0.070) on markets deliberately chosen.
  ðŸ”´ **RE-MEASURED 2026-08-10 (LATER SESSION) â€” THE RATIO IS NOT THE SIGNAL AND 10 WOULD HAVE MISSED
  TWO DIRTY MARKETS. Everything in the block below is superseded; it is kept because the mistake is
  the lesson.** The distribution was reproduced exactly (rowley regis 444/16 = 27.8, wakefield
  401/16 = 25.1, eastbourne 287/16 = 17.9) â€” and the "empty band" had closed:
  ```
  perQ  markers  market                     eyeballed
  27.8      39   locksmiths/rowleyregis     DIRTY  "they" "ask" "always" "check"
  25.1      39   locksmiths/wakefield       DIRTY  "here" "why" "i'd" "good"
  17.9      33   locksmiths/eastbourne      DIRTY  "give" "particularly" "another"
   9.6      24   locksmiths/chorley         DIRTY  "fully" "call" "always" "ask"   <- NEW, inside the "gap"
   5.8      18   accountant/chichester      DIRTY  "their" "you" "many"            <- BELOW two clean markets
   4.8       0   mobile mechanics/wisbech   clean
   4.4       0   electricians/portsmouth    clean
   3.9â€¦2.1   0   the other thirteen         clean
  ```
  - â›” **THE GATE IS NOW A FACT, NOT A RATIO: a SINGLE-TOKEN English function word cannot be a firm's
    name, and the LLM cleaner would never return one.** `UNCLEANED_MARKER_WORDS` in `marketView.ts`.
    It separates all 20 with nothing in between â€” 39/39/33/24/18 on the five dirty ones and **exactly
    zero across 793 distinct names** in the other fifteen. Multi-word names pass by construction, so
    "First Pick Locksmiths" and "Always Secure Ltd" are untouched.
  - â›” **`marketShape` now returns `names_uncleaned` â€” a REFUSAL, not a shape** â€” with the cleaner
    button directly under it, and `shouldAutoClean` keys on the fact. That also removes the recorded
    re-clean loop: a cleaned fold has no markers, so 16.5-per-audit can no longer re-fire forever.
  - âš ï¸ **THE LIST IS DELIBERATELY INCOMPLETE.** Chorley's fold also holds "vat", "matthew",
    "chorley", "pvc" â€” obvious junk it does not catch. It only needs ONE marker to prove a fold is
    raw, and every word added is a word some real firm might be called. **The measured zeros belong to
    the list AS IT STANDS; grow it and re-run the sweep before quoting them.**
  - âš ï¸ **The markers are counted on the RAW mentions, before `groupNames`.** A junk fragment can
    merge into a group labelled with a real firm's name and vanish from `named` entirely.
  - âš ï¸ **Absence is NOT dirt here, deliberately, and it is the one place that direction is right:**
    `uncleanedCount` is optional, and refusing to grade on a missing field would blank the verdict on
    every market at once â€” including the fifteen measured clean. **Deploy `market-view` BEFORE the
    SPA** and the exposure is a 10-minute stale sessionStorage cache.

  <details><summary>SUPERSEDED: the per-question threshold of 10 (kept for the lesson)</summary>

  âœ… **MEASURED 2026-08-10 â€” THE THRESHOLD IS 10 PER QUESTION, AND THE DATA PICKS IT.** Distinct
  extracted names per QUESTION across all 20 markets with completed questions:
  ```
  27.8  locksmiths / rowley regis   (444 names, 16 questions)
  25.1  locksmiths / wakefield      (401, 16)
  17.9  locksmiths / eastbourne     (287, 16)
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ nothing at all between 5.4 and 17.9 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   5.4  mobile mechanics / wisbech      4.4  electricians / portsmouth
   3.9 â€¦ 2.1   the other 15 markets
  ```
  **Three dirty, seventeen clean, a 3.3Ã— empty band.** 10 sits mid-gap and survives new markets
  landing either side without re-tuning. Names come from `ai_audit_queue.result[engine].competitors`
  on **complete** runs only.
  - âš ï¸ **ONLY THREE MARKETS CAN CHANGE FROM CLEANING.** The other 17 were graded on clean lists, so
    whatever is wrong with them is the **aggregator rule, not the extraction** â€” which splits the
    two faults cleanly and means most of the town list comes from winnability, not from cleaning.
  - ðŸ”´ **EASTBOURNE CARRIES BOTH FAULTS.** It is dirty (287 fragments over 16 questions) *and* one
    of the five towns skipped on the aggregator verdict, so its 14% Checkatrade figure was computed
    on a fragmented list. Do it straight after Wakefield.
  - âœ… **Chichester (3.6) and Portsmouth (4.4) are CLEAN**, so two of the five skipped towns need no
    cleaning before their winnability can be judged.
  - The current `JUNK_RATIO_PER_AUDIT = 15` is per-AUDIT and **every one of the 20 markets scores
    above it on that basis**, so it separates nothing.
  â›” **AND THE THRESHOLD MUST BE MEASURED, NOT PICKED.** `shouldAutoClean` (`marketView.ts:493`)
  gates on `JUNK_RATIO_PER_AUDIT`, whose comment cites a **per-audit** spread (clean 4â€“9, junk
  30â€“970). **Those numbers do not carry to a per-question ratio** â€” a per-audit average cannot
  exceed 15 once a market has two audits, which is exactly why it has never fired. Re-measure the
  distribution before drawing a line, or it becomes the fifth constant in Â§4 that was copied from
  somewhere plausible and never checked.

  </details>

  ðŸŸ¢ **CLEANING FROM THE APP WAS NEVER BLOCKED. THE 401 IS A HARNESS-ONLY PROBLEM, AND THE FIRST
  DIAGNOSIS OF IT WAS WRONG â€” CORRECTED 2026-08-11 BY THE REDEPLOY THAT WAS SUPPOSED TO FIX IT.**
  `extract-competitors` refuses a **service-role** call with `{"ok":false,"error":"unauthorized"}`
  even with `x-internal-job` set.
  - â›” **RULED OUT: "the deployed copy predates the internal branch."** That was the recorded
    diagnosis and it was wrong. The function was redeployed from source carrying that branch
    (`index.ts:136-138`), **v7 â†’ v8, entrypoint build 5 â†’ 8**, and the 401 is byte-for-byte
    unchanged. A stale deploy was not the cause. Â§4's trap in reverse: the deploy-age signal was
    real (build 5 behind version 7) and had **nothing to do with the symptom**.
  - âœ… **RESOLVED 2026-08-12 ON A DIFFERENT FUNCTION, AND THE ANSWER GENERALISES: EVERY
    SERVICE-ROLE-BEARER BRANCH IN THIS PROJECT IS DEAD, AND IT CANNOT BE REACHED BY SENDING A
    DIFFERENT KEY.** Reproduced on `process-whatsapp-queue` (same `authHeader === "Bearer " +
    SUPABASE_SERVICE_ROLE_KEY` shape) while verifying the daily cap. **The response BODY is the
    discriminator**, and nobody had read it:
    | Bearer sent | HTTP | body | what it proves |
    |---|---|---|---|
    | legacy `service_role` JWT | 401 | `{"ok":false,"error":"unauthorized"}` | **the handler's own reply** â€” the gateway passed it, so the env var is **NOT** the legacy JWT |
    | new `sb_secret_â€¦` | 401 | **empty** | the **gateway** rejected it; the handler never ran |
    | no header at all | 401 | `{"ok":false,"error":"unauthorized"}` | handler again (confirms `verify_jwt = false`) |
    The two requirements are **mutually exclusive**: the gateway only forwards a JWT-shaped bearer,
    and the handler compares against a value that is no longer the legacy JWT (so, the `sb_secret_â€¦`
    one). No key you can send satisfies both. â›” **So do NOT "fix" this by hunting for the right
    key** â€” the only working callers are **CRON_SECRET via `x-cron-secret`** and **an operator's own
    admin JWT**. The service-role branch is dead code on every function that has one.
  - âš ï¸ **AND THE OLD NOTE HERE WAS WRONG ON A CHECKABLE FACT: `sb_secret_â€¦` IS NOT MASKED.**
    `npx supabase projects api-keys --output json` returns **four** entries â€” `anon` and
    `service_role` (legacy JWTs) plus two named `default` (`sb_publishable_â€¦`, `sb_secret_â€¦`), all in
    full. The claim that it was masked is what stopped the previous session testing this. Check the
    output before recording that something cannot be read.
  - âœ… **AND THE PANEL BUTTON WORKS, AND ALWAYS DID.** `MarketPanel` invokes the function with the
    OPERATOR'S OWN JWT, which takes the user branch and the ownership check â€” untouched by any of
    this. So the cleaner is available in the app right now. Only a script is locked out.
  - âš ï¸ **The lesson: "blocked" needs to name WHICH CALLER is blocked.** Recording it as
    "cleaning is blocked" turned a harness-auth quirk into a product-level blocker in the notes, and
    the next session would have believed it.
  - ðŸ”´ **THE ROTATION ALSO KILLED THREE INTERNAL CALL PATHS â€” found and fixed 2026-08-14, and the
    REAL MECHANISM IS verify_jwt-BY-OMISSION, not the bearer per se.** A function ABSENT from
    `supabase/config.toml` deploys with the platform default **verify_jwt = TRUE**, which demands a
    JWT-shaped bearer before the handler runs. Every internal fetch in this repo sends
    `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`; that passed the check while the env key WAS a JWT and
    started failing ("Invalid API key", handler never runs) when the ~2026-08-11 rotation made it
    sb_secret-shaped. Three functions were missing from config.toml, so three paths died at once:
    | Dead since ~08-11 | Caller | Observed damage |
    |---|---|---|
    | `extract-competitors` | queue finalisation | **every fold finalised 08-11â†’08-14 dirty** (16â€“51 markers; zero before) |
    | `generate-report` | queue auto-report | **business_reports: 84 rows 08-04â†’08-10, ZERO after 08-10** |
    | `derive-audit` | whatsapp-inbound reply chain | degraded gracefully: `servedFromMarket` false â†’ fell back to a PAID per-business audit every time |
    â›” **AND THE PROOF THAT THE BEARER SHAPE ALONE IS NOT THE FAULT: the paid baselines flowed.**
    `audit-baseline.ts` and `whatsapp-inbound.ts` send the IDENTICAL bearer to `create-ai-audit` â€”
    which IS in config.toml (`verify_jwt = false`) â€” and RG (08-11) and Fortify (08-13) both got
    their full 3-run baselines minutes after paying. The five "dead bearer" call sites in those two
    shared files are ALIVE and need no change. Do not "fix" them.
    **The fix:** config.toml now lists all three (their handlers already enforce their own auth â€”
    user-JWT ownership or CRON_SECRET + x-internal-job), redeployed to apply it; and the two queue
    invokes now send NO bearer at all (cron-secret is the internal door and never rotates).
    âš ï¸ **The auth-free deploy marker:** an unauthenticated POST returns the platform's
    `UNAUTHORIZED_NO_AUTH_HEADER` while verify_jwt is stuck true, and the handler's own JSON
    (`{"ok":false,...}`) once false is live. That is how the flip was verified without CRON_SECRET.
    âš ï¸ **When adding a NEW edge function: add its config.toml entry in the same commit.** The
    default is the trap; nothing local can catch it (deno check passes, deploy succeeds, user-JWT
    callers work â€” only internal callers die, silently, WEEKS later when a key rotates).

  Counted, not estimated, at $0.070/run and with no re-auditing:
  | Scope | Runs | Cost |
  |---|---|---|
  | The **8 markets that carry a verdict today** â€” rowley regis 2, loughborough 20, stamford 9, wrexham 12, accountant/chichester 11, wakefield 2, eastbourne 2, chorley 3 | **61** | **$4.27** |
  | Of those, the five that are MARKET-audited (the 20-market set) | 20 | $1.40 |
  | Every market with markers, including 5 `unmeasured` ones (accountant/wisbech alone is 22 runs and 99 markers) | 91 | $6.37 |
  âš ï¸ **A first pass of ~$1.40 answers the question that matters** â€” does the cleaner actually remove
  the markers? Nobody has measured that; Wisbech's earlier clean was measured on the old ratio.
- âœ… **THE MARKETPLACE-LED VERDICT WAS WRONG. MEASURED AND FIXED 2026-08-10 â€” the citation half is
  GONE.** Across every market with a completed run, **17 have an aggregator as the most-cited host and
  in all 17 AI names local firms anyway**: in 15 the aggregator's brand is not in the named list at
  all, and in the 2 where it is (Stamford 9 mentions against 68, Eastbourne 13 against 32) it sits far
  behind the local leader. Local firms hold all three top spots in 10 of the 17.
  - ðŸ”´ **THE DECISIVE CASE IS plumber/WISBECH** â€” Checkatrade at **27% of citations, the highest share
    in the book**, and the three most-named firms are all local (Fen Property Services 52, DC Plumbing
    49, Mr Gas 37). **That is the town Paul has actually worked.** The rule would have told him to skip
    the one market he has proven.
  - The naming half survives and is **widened from the leader to the top three** (`NATIONAL_TOP_N`),
    Paul's own proposal. locksmiths/Colchester is why: LockRite, Lockforce and LockFit hold all three
    spots with no local firm near them, which the leader-only test could not distinguish from a market
    whose #2 is local. Kind renamed `marketplace_led` â†’ **`national_led`**.
  - The citation fact is still printed, as intelligence, with the measurement attached. Same rule Â§6
    applies to unknown hosts: they route to who's-winning, never to a verdict.
  - âš ï¸ **THE TOWN LIST IS IN THE SESSION REPORT, and 11 markets flip from skip to workable** â€”
    including electrician/Chichester, both Portsmouth trades, plumber/Kettering and plumber/Wisbech.
    Four more (Eastbourne, Loughborough, Stamford, Rowley Regis) were skipped AND are dirty, so they
    are refused rather than flipped until the cleaner runs.
  - âš ï¸ **`otherTowns` IN THE OFFLINE ANALYSIS IS AN APPROXIMATION.** The harness matched on merged
    group keys across the pairs it read; `market-view` runs its own cross-town scan with a read cap.
    Expect small differences in which leaders are flagged national.

  <details><summary>SUPERSEDED: the open question this answered</summary>

  ðŸ”´ **THE MARKETPLACE-LED VERDICT MAY BE WRONG, AND IT HAS COST FIVE MARKETS.** Paul has skipped
  **Eastbourne, Chichester, Portsmouth, Loughborough and Kettering** on "an aggregator is the top
  cited host â†’ a local firm is competing with a platform". His counter-evidence: Eastbourne
  locksmiths has Checkatrade top-cited at 14% while **J&J Locksmiths leads the naming with 32
  mentions**, and Â§5 already records **Checkatrade in 59 of 62 plumber audits with AI still naming
  local plumbers**. So AI reads the aggregator and then names local firms â€” being cited is not being
  named (Â§5 says this already, in the other direction).
  - âš ï¸ **NOT YET CHECKED AGAINST THE DATA. Do not change the verdict until it is.** Three queries:
    in markets where an aggregator is top-cited, who is actually NAMED; does the aggregator's own
    brand ever appear in the NAMED list; how many markets were skipped and would they have been
    workable. Paul's hypothesis for the real signal: **the aggregator's brand in the NAMED list, or
    no local firm in the top three** â€” both about naming, not citation.
  - âœ… **START WITH CHICHESTER â€” the data may already exist and cost nothing.** It is the
    accountant trade+town the derivation test used (6 businesses, 5 agreed, the market audit found a
    firm its own 3-question audit missed).
  - âš ï¸ **DO NOT TEST THE RULE ON LOUGHBOROUGH.** `loughborough.org.uk` is one of only two `townOnly`
    hosts, so its citation mix is atypical.
  - If being most-cited predicts nothing about naming, **drop that half of the verdict** â€” Paul's
    own words, and he is ready for that answer.

  </details>
- ðŸŸ¡ **THE QUESTIONNAIRE SPLIT â€” HALF LANDED 2026-08-11. The REPOINT is live; the two findable-site
  screens are not.** Read this before touching either repo.
  - âœ… **DONE AND DEPLOYED: the report's offer button goes through the questionnaire** (`render-audit-report`
    v37). The raw Stripe Payment Link is gone from `founderOffer.ts`; the button is now
    `<origin>/onboarding/<slug>/?lead=<leadId>`, built with the same `onboardingUrl()` the live
    `onboarding_followup` template uses. Verified on RG Locksmiths' live report: `buy.stripe.com`
    absent, the lead-carrying onboarding URL present, `class="src"` asserted so it is not the
    home-page fallback.
    - ðŸ”´ **THE REAL PRIZE WAS NOT THE QUESTION ORDER â€” IT WAS THAT THE PAYMENT WAS INVISIBLE.**
      `stripe-webhook`'s whole Findable branch is gated on `metadata.onboarding_id`, and a STATIC
      payment link cannot carry a per-payer row id. Every founder payment would have landed with no
      onboarding row marked paid, no `amount_paid`, no operator email and no baseline. It also meant
      `showFounderOffer` (which hides on `amount_paid > 0`) would have kept selling to a customer.
    - â›” **NO LEAD, NO LINK, NO BUTTON â€” and it is a PRICE guard.** `offerPriceForLead` returns the
      full **Â£99** for `no_lead`, so a button without one advertises the founder price and charges
      Â£99. Same for an unconfigured `FINDABLE_SITE_ORIGIN`. Either missing â†’ offer copy + guarantee
      render with no button, and a `console.warn` says which reason. 2 of 216 non-market audits have
      no `lead_id` and both are already in `FOUNDER_OFFER_HIDE_AUDIT_IDS`.
    - ðŸ”´ **THE PRICE HAS A SECOND SWITCH NOBODY WOULD FIND: `FINDABLE_SETUP_PRICE_ID`.** If that env
      var is SET, `findable-checkout` uses a fixed Stripe Price and **ignores `offer.gbp` entirely** â€”
      the report says one number, Stripe charges the Price object â€” **and the guarantee goes with
      it**, because `product_data[description] = FINDABLE_GUARANTEE` only exists on the `price_data`
      branch. Confirmed UNSET by Paul 2026-08-11 (only `FINDABLE_SITE_ORIGIN` is set), so the
      derived-price path is live. **Re-confirm before ever quoting the founder price as safe.**
      âš ï¸ Deliberately no number in either bullet now â€” the founder price has already moved once
      (Â£19.99 â†’ Â£49.99, 2026-08-12) and prose that names it goes stale. See Â§11.
  - ðŸ”´ **STILL TO BUILD, both in `findable-site` + one edge action:**
    1. **Pre-pay = eligibility only.** âœ… Verified byte-for-byte: `ServeGateRow` reads EXACTLY
       `website_platform`, `website_platform_other`, `website_manager`, `willing_to_migrate` â€” the
       screen-4 set â€” so reducing the pre-pay form to screen 4 + `contact_email` leaves the gate
       untouched. Screen 3 currently holds `contact_email` AND `competitor_name` (:2063-2075), so
       lift the email and move the competitor.
    2. **Post-pay form replacing the dead-end `paid` screen** (`OnboardingFlow.tsx:2777-2798`, which
       today is confirmation copy and NO capture).
    3. **`findable-onboarding` has NO action for a post-pay update** â€” actions are `prefill`,
       `revise`, `submit`, `status`. A new `complete_q2` is needed (update by `onboarding_id`, only
       when `status = 'paid'`, Q2 fields only, migration-tolerant like `submit`'s three-list pattern).
    4. âš ï¸ **THE POST-PAY SCREEN HAS NO onboarding_id IN THE URL, DELIBERATELY.** `findable-checkout`
       keeps it off `success_url` ("so a paid receipt does not carry a live retry token", :218-229).
       The id IS in browser storage at that moment â€” but `paid=1` currently calls `forgetOnboarding()`
       and `clearDraft()` at :1348-1354, i.e. throws it away. **Capture it BEFORE forgetting**; do not
       put it back in the URL. No storage â†’ show the confirmation without the form and let the
       existing `q2_chased_at` / `q2_chase_count` chase cover it.
  - âš ï¸ **THE INTERMEDIATE STATE IS SAFE BUT HAS MORE FRICTION THAN THE TARGET**: a report click now
    walks all 5 screens before Stripe. `confirmed_location` + `services` are therefore still captured
    pre-pay, so `startPaidBaseline` fires immediately and nothing is deferred yet. Paul's instant
    lever if the friction hurts: `FOUNDER_OFFER_LIVE = false` hides the whole offer block.
  - âš ï¸ **NO SQL. All 14 columns Q2 needs already exist**, validated against the live schema 2026-08-11
    (`services`, `services_list`, `areas_list`, `confirmed_location`, `competitor_name`,
    `business_address`, `accreditations`, `must_not_say`, `photos_status`, `contact_email`,
    `q2_chased_at`, `q2_chase_count` + `id`, `status`). `needsQ2` is derived, never stored.

  <details><summary>The original agreed plan (still the target)</summary>

  ðŸ”´ **THE QUESTIONNAIRE SPLIT â€” AGREED WITH PAUL 2026-08-10.** Money sooner, detail later.
  - **Before payment, ONE screen** (down from 5): the website questions + contact email.
    `website_platform`, `website_platform_other`, `website_manager`, `willing_to_migrate` â€” which is
    **exactly** what `findable-checkout` reads, so **the serve gate survives untouched** (verified).
    Contact email stays because without it someone who does the work and balks at the price is
    unreachable, and `notify-onboarding-submit` calls that the warmest lead there is.
  - **After payment, Q2:** services, town, areas, address, accreditations, competitor, photos, the
    whole Google block, must-not-say.
  - âœ… **Q2's delivery address is FREE** â€” `stripe-webhook` already backfills `contact_email` from
    the Stripe payer email where it is null.
  - **THE MAP** (`findable-site/src/components/OnboardingFlow.tsx`, 2802 lines): `questions` array
    entries at **1814** "What you do", **1939** "Where you want work", **1990** "Your details",
    **2092** "Your website", **2299** "Access". `STEPS = 5` at **269**, `const q = questions[step]`
    at **2479**, validation switch at **1497**. Contact email is inside "Your details" and must be
    lifted into "Your website". âš ï¸ **Both payload sites change together** â€” `submit()` and `bail()` â€”
    and the six reachability guards must stay keyed to whichever questionnaire owns each question.
  - âœ… **THE BASELINE HALF IS ALREADY BUILT AND DEPLOYED** (`audit-baseline.ts`): `startPaidBaseline`
    defers with `ok:true, skipped:"awaiting_questionnaire_2"` until `confirmed_location` **and**
    `services` exist, because the fallbacks would otherwise rescue a missing answer
    (`confirmed_location || derived_town || search_location`, specialisms `""`) and put the
    wrong-town fault on the **guarantee's evidence**. **Nothing new schedules it** â€”
    `process-ai-audit-queue`'s `ensureBaselinesForPaidOnboardings` already retries every tick.
  - âœ… **The paid-with-no-Q2 card state is built** (`needsQ2` in `useSubmissions.ts`, derived from the
    three fields Q2 makes required, never stored).
  - **Still to build:** the split itself; the day-2/day-5 chase emails (columns `q2_chased_at` +
    `q2_chase_count` are **live** â€” the count exists because a stamp cannot answer *which* chase is
    next); the **day-7 dashboard task**, which must go **through the `submissions` endpoint**, not
    the direct read, for the RLS reason above.

  </details>
- **No Baseline Test button.** Baselines are gated to internal callers (cron secret or service role +
  `x-internal-job`) and currently only start from `stripe-webhook` after payment. A button needs an
  authenticated path. Cost â‰ˆ **30p** (measured â€” see above).
- **THREE audit entry points, not two, and they resolve inputs differently.** Compared 2026-07-30;
  unifying them is **deliberately deferred** until Paul has verified the enrichment fix.
  | | Outreach row pill | Inbox button | Outreach bulk "Run audits" |
  |---|---|---|---|
  | What it does | `navigate('/ai-audit?leadId=â€¦')` â€” **no server call** | calls `create-ai-audit` at once | `bulk-jobs` |
  | Location sent | wizard box, prefilled `derived_town \|\| search_location \|\| address` (`AiAudit.tsx:778`) | `search_location \|\| address` â€” **no `derived_town`** (`Inbox.tsx:397`) | `search_location \|\| address` (`bulk-jobs:229`) |
  | Business type | `search_keyword \|\| category` | `category \|\| search_keyword` â€” **reversed** | â€” |
  | Missing inputs | blank box, **no warning** | inline prompt, never leaves the Inbox | â€” |
  | Auto-pitch | no | **`queue_pitch_on_complete: true`** | no |

  **Do NOT merge the flows.** Paul's reason, and it settles it: the Inbox path auto-sends a pitch, and
  he has live prospects mid-conversation. Share the *input resolution* only. The server overrides
  location anyway (`create-ai-audit:353-377`), so the client differences decide what the operator SEES
  and what is used if derivation fails.
- **The three-question-type split isn't built** (own town / what makes them unique / surrounding towns).
- **Lead type/location are NOT reliably on the lead.** No `business_type`/`city` columns; audits read
  `search_keyword||category` and `search_location||address`, populated on only **~20%** of leads.
- **The Browser pane doesn't display** â€” screenshots need Paul (see Â§2).
- **Nobody has ever *looked* at the printed playbook document.** Its structure and every value are verified from
  text; its appearance is not. Worth one `Ctrl+P` before working a client off it.
- **The sidebar highlights nothing** on `/playbook/:id` or `/baseline/:auditId` â€” `isActive` is exact path
  equality (`location.pathname === item.url`). Consistent between the two, so left alone deliberately.
- **Back from the lead dialog returns to the Outreach LIST, not the reopened dialog.** Accepted limit: the
  dialog's open state is component state in `OutreachTable`, not in the URL, so there is nothing to restore.

---

## 9. Where the AI-visibility code lives

| Thing | Path |
|---|---|
| Evidence fold (pure, no LLM) | `src/lib/buildPlaybook.ts` |
| Host facts, hand-maintained | `src/lib/directoryFacts.ts` (**64** entries â€” see the count note below) |
| Per-trade citation fold | `supabase/functions/playbook-evidence/` |
| Operator checklist page | `src/pages/Playbook.tsx` + `src/hooks/usePlaybook.ts` |
| Printable document | `src/lib/playbookDoc.ts` + `src/lib/playbookDocStyle.ts` |
| Baseline operator view | `src/pages/Baseline.tsx` + `src/lib/baselineView.ts` |
| Back link, shared by both views | `src/components/BackLink.tsx` |
| Audit UI (large) | `src/pages/AiAudit.tsx` |

- ðŸ”´ **Entry points to `/playbook/:id` â€” now exactly TWO, not three (re-grepped 2026-08-12):**
  `LeadDetailDialog.tsx`'s `Playbook` pill, and the AI Audit row's **`checklist`** pill. Each passes
  `state={{ from, fromLabel }}` so `BackLink` can name where it returns to.
  âš ï¸ **The third â€” `PaidClients.tsx:230` â€” WENT WITH THE PAGE** when `/paid-clients` was deleted
  2026-08-12 (Â§6d). It was a LEAD-keyed route and so is the dialog's, which means the AI Audit row's
  `checklist` pill is still the **ONLY** route for a business with an audit and no `outreach_leads`
  row â€” ABLM, the only delivery client. **Losing one of three made that pill MORE load-bearing, not
  less. Don't remove it.**

- âœ… **THE LLM PLAYBOOK IS NOW UNREACHABLE FROM THE APP** (`1715a294`, 2026-07-30). The audit results
  screen has **ONE** button, `Playbook`, linking to `/playbook/:auditId`. Gone: both old buttons, the
  viewer (iframe + Internal/Client toggle + Regenerate + Download), `generatePlaybook` (the app's only
  caller of the edge function), the `DeliveryChecklist` card and component, the `playbooks` snapshot
  cache, the checklist tick state, and `RunRow.has_playbook`.
  **`src/lib/playbookHtml.ts` and `supabase/functions/generate-playbook/` are KEPT** â€” unreachable, not
  deleted, so the prompt stays readable as the record of what went wrong. Don't "tidy" them away.
  The button is gated on `auditId` **alone** â€” not on a completed run â€” because the ranking is
  trade-level, so the document is right even when that run failed at the Apify cap.
  ðŸ”´ **ONE GAP STILL OPEN:** **nothing is tickable.** The `DeliveryChecklist` ticked per run into
  localStorage. `/playbook/:id` displays `client_listings.done_at`/`verified_at` but **cannot set
  them** (read-only there), so there is nowhere to mark delivery work done.
- âœ… **THE CLIENT REQUEST FORM â€” the only client-facing document** (`56134630`, 2026-07-30). Reached
  by **`Print client request`** on `/playbook/:id`, beside **`Print operator copy`**. Labelled by who
  each is FOR, with "Operator copy contains their competitors â€” never send it" under them.
  - **THE LEAK BOUNDARY IS STRUCTURAL, and must stay that way.** `clientRequestDoc.ts` (the renderer)
    imports **only** `playbookDocStyle` â€” never `buildPlaybook`, `directoryFacts` or the selector â€” so
    it is never handed the ranking and cannot print it. `clientRequestSelect.ts` is the only side that
    sees the `Playbook`. If the sheet ever needs more, widen `ClientRequestInput` deliberately; do
    **not** pass the Playbook through.
  - **Which asks: 4 filters.** `blocked` only â†’ not `thin` â†’ **has a hand-written `clientParagraph`**
    â†’ top **`CLIENT_ASK_LIMIT` (3)** by **breadth**. For plumbers: Checkatrade 59/62, MyBuilder 32/62,
    TrustATrader 17/62. **MyJobQuote is excluded despite 11/62** because nobody wrote client wording
    for it *and* its notes record the pay-per-lead model as "INFERRED" â€” never ask a client to spend
    money on an inferred model, and never write generic filler to fill the gap.
  - **No completed run â†’ the measurement line is OMITTED**, replaced by an honest substitute. It does
    not refuse to render: the address ask is valid regardless, and refusing would block the one field
    holding up all the work.
  - âš ï¸ **`buildClientDoc` was DELETED** â€” written, never rendered, and it leaked the measurement
    METHOD verbatim plus every blocked host uncapped. Its a/an helper, `{trade}`/`{town}` fill and
    "Being straight with you" wording were lifted first.
  - âš ï¸ **MyBuilder's hand-written client paragraph still opens "MyBuilder is the third most common
    source we see for plumber work."** That ordinal implies a #2 the document never names. It leaks no
    host, so it passes the rule, but it is worth a one-word edit. Paul's call, not changed.
- âš ï¸ **ENRICHMENT CANNOT BE RE-TRIGGERED ON AN EXISTING LEAD FROM THE UI.** `retryPhoneFetch` exists,
  force-refreshes Google and (since 2026-07-30) writes address/rating/reviews/town â€” but the only
  buttons that call it (`OutreachTable.tsx:2018` and `:2165`) render **only when
  `phoneFetchStatus[lead.id] === 'failed'`**, which is in-memory session state. And bulk "recover
  phones" **skips any lead that already has a phone** (`useOutreach.ts:1250`). So a lead like
  Macca-Gas â€” phone present, address null, `place_id` present â€” is reachable by neither.
- ðŸ”´ **A BUSINESS WITH NO WEBSITE IS A DIFFERENT PRODUCT, NOT A WEAKER PROSPECT.** Gemini cannot
  name a business it has nothing of to read (Â§5, MK Plumbing 0/10), so the AI-visibility pitch is the
  wrong opening â€” but for DELIVERY they are the best case (`serveGate` serves `no_website` outright:
  we build the site on our hosting, nothing to migrate). Measured 2026-08-05: **228 of 969 leads
  (23%)** have no website, 49 of them directory-only; total waste to date **36p** of Facebook SEO
  scans + **93p** auditing them.
  - **`isAggregatorUrl`** (`_shared/aggregators.ts` + its SPA mirror `src/lib/aggregators.ts`) is the
    one classifier. `has_website` was a bare `!!lead.website`, so a Facebook-only listing triggered a
    **$0.12 Apify SEO scan against facebook.com**. Fixed in `bulk-jobs` and **both**
    `_shared/whatsapp-inbound` call sites 2026-08-05.
  - The audit batch holds them back **by default, stated with the saving**, overridable. The market
    view lists them **separately**, never hidden.
  - âš ï¸ **`outreach_leads.list_type` IS NOT A WEBSITE SIGNAL.** It defaults to `'no_website'` for every
    lead ever added â€” both `addLead` call sites pass that literal. It is a leftover from the
    website-generation product. The real signal is `website` (raw URL) + `isAggregatorUrl`.
  - âš ï¸ **`search_cache.websiteStatus` has TWO confidence tiers and they are different claims:** a
    directory/social URL is **0.95**, a blank Places website field is **0.60** ("may have one"). The
    0.60 tier has never been validated against reality.
  - A **free subdomain is still their own website.** `PLATFORM_PATTERNS` in `search-leads` treated
    `wixsite.com` / `myshopify.com` / `squarespace.com` / `wordpress.com` as NO_WEBSITE â€” right for
    the old product, wrong for this one. Removed 2026-08-05. `webflow.io`, `godaddysites.com`,
    `weebly.com`, `carrd.co` are arguably the same mistake and are **still there** â€” Paul's call,
    because removing them changes what lead search returns.
- âš ï¸ **`search-leads` has ONE pre-existing `TS2345`** (~line 1379, the supabase-js client generic on
  `performSearchWithExpansion`). Proven pre-existing by `git stash` 2026-08-05 â€” `deno check` exits 1
  on that file either way. Don't fix it, and don't read the exit code as your own breakage.
- âœ… **AUDIT-ONLY BUSINESSES WORK.** ABLM (`d2008327`) has `lead_id = NULL` and its address lives on
  `ai_audits.business_address`. Paul viewed and printed its playbook. `usePlaybook`'s audit-first
  resolution is what makes this work â€” do not reorder it.

- ðŸ”´ **TWO DIFFERENT DOCUMENTS ARE BOTH CALLED "PLAYBOOK". This has now caused a near-miss.**
  | | What it is | Where |
  |---|---|---|
  | **`checklist` pill** â†’ `/playbook/:id` | **Evidence-derived.** Citations decide the directories. The document a client receives | `buildPlaybook.ts`, `playbookDoc.ts` |
  | **"playbook"** (LLM) | `generate-playbook` LLM output at `results.playbook`. **This is the broken one** | `supabase/functions/generate-playbook/` |

  Paul pasted an ABLM playbook recommending **Bing Places as a High-priority quick win** with **no Yell**, and
  assumed it came from the evidence pipeline â€” he was one step from deleting the good one and keeping the
  broken one. **It was the LLM pipeline.** Two independent fingerprints, both checked:
  1. `quickWins` is a field in the LLM function's own output schema (`generate-playbook/index.ts:75`). The
     phrase appears **nowhere** in the evidence path.
  2. The LLM prompt *instructs* it: "Bing Places â€” foundational" (`:254`), "Bing Places is foundational, not
     optionalâ€¦ a first-tier task" (`:285`). The evidence path mentions Bing **only** in comments explaining
     its removal, and `yell.com` **is** in `directoryFacts` (`:140`, `urlVerified: true`) with the fold sorted
     by citation count â€” so 6 Yell citations would have surfaced it.
  âš ï¸ Searching `-i bing` in the evidence path returns 3 hits that are all literally **plumÂ·BINGÂ·**. Â§4's trap,
  live again. Print the surrounding characters.
- âœ… **AI Audit page decluttered 2026-07-30** (`4fa0246c`). The new-audit form (source picker + business details
  + question review) is now a **modal**; the page is the list plus a "New audit" button. The row's **`Playbook`
  button and grey `playbook` asset pill are GONE** â€” both were the LLM document. `checklist` KEPT (see above).
  The LLM document is still reachable from an audit's **results** view. `formOpen` is deliberately **not**
  persisted, or a modal would spring open on every page load.
  âš ï¸ **`/ai-audit?leadId=â€¦` MUST open that modal.** `setFormOpen(true)` sits in the same branch as `pickLead`
  in the deep-link effect. Break that and the Outreach audit pill lands on a page with no form.

- âœ… **THE PRINTED EVIDENCE DOC NOW MATCHES THE LLM DOC'S LAYOUT** (`a1cc31cc`, 2026-07-30). Section
  order: header â†’ THE PLAN (grouped) â†’ SEO Improvement (add-on) â†’ QUICK WINS â†’ WHERE AI READS â†’ who
  keeps getting named â†’ EFFORT â†’ Timeline & Our promise. Reached by the **Print** button on
  `/playbook/:id`, which existed long before anyone pressed it.
  - **The styling was already shared** â€” `playbookDocStyle.ts` was extracted VERBATIM from
    `playbookHtml.ts`, and `.prio` / `.lead` / `.pillar` / `.act-steps` / `.qw` were already defined
    and merely unused. Restyling was populating existing classes, not writing CSS. Check before
    assuming a visual difference means the stylesheets differ.
  - **Priority is derived from BREADTH and prints the fact beside it**: "HIGH Â· 58 of 59 plumber
    audits". HIGH â‰¥60% of the trade's audits, MEDIUM â‰¥`EVIDENCE_MIN_AUDITS`, LOW = thin. Paul's rule:
    a badge must be a summary of a visible fact, never a judgement he cannot audit.
  - **`DirectoryFact.steps` â€” hand-written sub-steps, and NO GENERIC FALLBACK.** A host without steps
    prints an explicit "no written steps yet" line. Generic filler is what made the LLM document
    useless. 7 written (Checkatrade, Yell, MyBuilder, 192.com, Cylex, Thomson Local, Yelp); only 5 of
    them are cited for plumbers, so a trade shows fewer.
  - **The doc says out loud that the ranking is TRADE-LEVEL**, from all audits of the trade, and that
    this business's own citations do not feed it. Two businesses in one trade get the same list.
  - **The SEO section is built from the real stored scan** (`ai_audit_runs.results.seo`) and carries
    **no AI claim at all** â€” it states the counter-evidence instead. `usePlaybook` now fetches it via
    the report's own `isRenderableSeo` + `aggregateSeoFindings`. The real shape is **2** categories
    (`onPage`, `contentTechnical`), not 9; Macca-Gas's three "N images without alt text" findings fold
    to one "15 images" line.
  - âš ï¸ **`.plan` is ~4.5 A4 pages and the shared CSS marks it `break-inside:avoid`.** A browser cannot
    honour that and may push the whole section to a fresh sheet, leaving page 1 half empty. Overridden
    in `playbookDoc.ts`'s own `EXTRA_CSS` (containers flow, atoms protected) â€” **not** in the shared
    file, so the LLM document is untouched. ~7 pages for 17 tasks, against the LLM doc's 4.
  - **The promise wording is `FINDABLE_GUARANTEE` in `src/lib/findableOffer.ts`** (since
    2026-08-04, WORK-based: audit + work + re-measurement or refund, never the outcome).
    `findable-checkout`'s Stripe line-item description, `playbookDoc` and `clientRequestDoc` all
    render that constant â€” no local copies. The LLM's
    "We guarantee thatâ€¦" and "Expect initial visibility improvements within a few weeks" are both
    model output (`guaranteeNote`/`timelineNote`), so they vary per generation and cannot be fixed in
    that pipeline â€” only replaced by template text in this one.
- Thresholds: `EVIDENCE_MIN_AUDITS 5`, `THIN_MIN_AUDITS 2`, `TRADE_MIN_AUDITS 5`.
- **The ranking is per-TRADE, from every audit of that trade.** `playbook-evidence` folds ALL audits;
  `buildPlaybook` filters to the trade and sorts by citations. `ownCitations` (this audit's own) is a
  separate display-only signal and feeds **nothing**. So a thin trade gets thin evidence, guarded by
  the three thresholds above â€” not rescued by the business's own audit.
- **`usePlaybook` resolves an id as an AUDIT id first, then a lead.** ABLM has an audit and no
  `outreach_leads` row; lead-first would 404 the only delivery client.
- **`directoryFacts` holds 64 entries, not 66.** Counted 2026-07-30: `host: '` appears 64 times; a naive grep
  for `host:` returns 66 because it also hits the `DirectoryFact` interface and `factFor`. "66" was repeated
  across several sessions and briefs and was never true. Task-capable (`kind: 'directory' | 'trade-body'`, plus
  the one entry with no `kind`, which defaults to directory): **38**.
- **60 of the 64 signup URLs are unverified â€” only 4 are checked:** Yell, MyBuilder, 192.com (clicked by Paul)
  and Checkatrade (verified by fetch). Earlier notes said "63 of 66" and "only 3 checked"; both were wrong.
  âš ï¸ The doc comment at the top of `src/pages/Playbook.tsx` still says "63 of 66" â€” a comment only, nothing
  depends on it, but correct it when you are next in that file.
- **2 hosts are `townOnly`:** `loughborough.org.uk` (Loughborough) and `cnxlocal.com` (Chiang Mai). In any other
  town they become a prompt to find the local equivalent, never a task.
- **`playbookDoc.ts` must never touch the `generate-playbook` LLM path.** That pipeline recommended ICAEW to an
  ACCA firm, ACCA's own zero-citation directory, and Bing Places. Styling is shared; the data path is not.
- Live operator app: **`https://leadfinderos.pages.dev`**. Supabase ref **`ruusxpkkmwtljxxulhbq`**.

---

## 10. The other docs, and how much to trust them

- **`ONBOARDING.md`** and **`HANDOFF.md`** (untracked, never stage them) describe the **older
  website-generation product line** â€” barber/salon/plumber site generation, WhatsApp claim flow, Stripe
  add-ons. Still accurate for that machinery, and the best map of it.
- âœ… **`HANDOFF.md` Â§5 has been marked superseded in the file itself** (2026-07-30). It used to recommend Bing
  Places as "foundational"; Bing Places has **zero citations across 8,913**. The original text is preserved
  there in a collapsed block so the reasoning that went wrong stays visible. Â§5 of this file is the truth.
- Both name `Claude Opus 4.8` in the co-author trailer. **Use Opus 5** (Â§3).
- There is **no `DEPLOY.md`** in this repo. Deploy rules are Â§3 and Â§4 here.

---

## 11. ðŸ”´ THE FOUNDER PRICE â€” Â£49.99 since 2026-08-12, and the two halves that lag

**Â£19.99 â†’ Â£49.99. UPFRONT ONE-OFF ONLY.** No subscription was added: `findable-checkout` is still
`mode: "payment"`, and that line is load-bearing â€” see the recon below before anyone "adds monthly".
The Â£99 anchor (`FINDABLE_SETUP_PRICE_GBP`), the guarantee and `FINDABLE_SETUP_PRICE_ID` (unset) were
all deliberately untouched.

- âœ… **THREE CODE CONSTANTS, AND ONE COMMAND PROVES THEY AGREE.** `FOUNDER_PRICE_GBP`
  (`_shared/offer-price.ts`, **CHARGED**), `FOUNDER_OFFER_PRICE_LABEL` (`founderOffer.ts`, what the
  report SAYS), `FOUNDER_PRICE_GBP` (`useDashboardMetrics.ts`, what is COUNTED). Run
  **`node scripts/check-cross-repo-sync.mjs`** â€” it fails on any drift and passed 8/8 at 49.99.
- â›” **TWO COPIES NO SCRIPT CAN REACH, AND BOTH ARE PAUL'S BY HAND:**
  1. **The Stripe Payment Link** (kept for sending manually on WhatsApp) â€” its amount AND its
     description. A stale amount here means a hand-sent link charges the old price.
  2. **The Meta-registered `re_engage` template.** The string in `_shared/whatsapp-send.ts` is
     DISPLAY-ONLY â€” Meta renders the real message from its own copy. Until re-registration lands,
     a send says Â£19.99 to the prospect while the Inbox transcript and the checkout say Â£49.99:
     **advertised low, charged high, the one direction that produces a complaint.**
- âš ï¸ **THE DASHBOARD FOUNDER TILE WENT 1 â†’ 0 AND NOTHING IS WRONG.** It counts leads whose
  `amount_paid` matches the CURRENT constant within a penny, so RG Locksmiths (Â£19.99, the only
  payment ever taken) stopped counting the moment the constant moved. No data changed. If that tile
  should count every founder-era sale it needs a list of historical prices, not one constant â€”
  Paul's call, deliberately not made here.
- âœ… **Checked before changing it: no lead has EVER been charged Â£49.99** (exactly one lead has a
  non-null `amount_paid` at all). So the new value sweeps nothing historical into that counter â€”
  which mattered, because the comment there used to justify the exact match by saying it kept out
  "the Â£49.99 quote that predates this offer". That reasoning inverted; the comment was rewritten
  rather than left to mislead.
- â›” **DEPLOY ORDER IS A PRICE GUARD, NOT A PREFERENCE: DISPLAY BEFORE CHARGE.** `render-audit-report`
  and `findable-onboarding` show the price; `findable-checkout` takes it. Deploy the display pair
  FIRST and the gap reads "shown Â£49.99, charged Â£19.99" â€” a pleasant surprise. Reverse it and the
  gap is "shown Â£19.99, charged Â£49.99". Same rule the `serverPriceLabel` comment in findable-site
  states for the fallback.
- âš ï¸ **NINE FUNCTIONS CARRY THESE VALUES, NOT THREE** â€” the shared-file trap (Â§4) in its most
  ordinary form. Walked from each `index.ts` following relative imports:
  `create-ai-audit`, `findable-checkout`, `findable-onboarding`, `process-ai-audit-queue`,
  `process-sms-queue`, `process-whatsapp-queue`, `render-audit-report`, `send-whatsapp-message`,
  `whatsapp-status`. Two more â€” `instantly-push`, `run-seo-scan` â€” reach `founderOffer.ts` **only
  through `import type`, which is erased at build**, so they carry no values; they were redeployed
  anyway because over-deploying is free and the recorded failure is always the other direction.
- ðŸ”´ **AND THE MONTHLY IDEA IS SCOPED BUT NOT BUILT.** Recon 2026-08-12: `findable-checkout` creates
  a ONE-OFF session (`mode: "payment"`). Subscription code exists but belongs to the BARBER product â€”
  `customer.subscription.*` reads `metadata.generated_site_id` and flips `generated_sites.is_paid`.
  For Findable there is **no `invoice.paid` handler** (so renewals would be invisible) and **no
  Stripe identifier persisted anywhere** (no customer id, subscription id or status on any table).
  â›” The real blocker is not Stripe: **`paid = amount_paid > 0` is a single scalar** (Â§6, Â§6d) and
  cannot express "upfront + monthly, still active" â€” a churned customer keeps `amount_paid > 0` and
  reads as paying forever. Decide that before any subscription work.
  âš ï¸ Also unresolved: `paid_for` is written as **"Findable - Setup + first 2 months"**, so today's
  one-off already claims two months; and the guarantee's "or a full refund" is byte-locked across
  both repos and becomes ambiguous the moment billing recurs.
