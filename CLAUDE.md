# CLAUDE.md — read this fully before you touch anything

**You are starting blind. This file is the memory you don't have.** Read it end to end first. Then, when you
discover something that cost you time — a wrong assumption, a trap, a number — **add it here** instead of
letting the next session rediscover it. Correcting a line that has gone stale is also your job.

Facts and warnings, not prose. Keep it that way. If it grows too long to read, it stops working.

---

## 1. What the business is

- Paul sells **AI visibility** to local UK businesses. **£99, one-off** (was £49.99 until
  2026-08-04). Price + guarantee wording live in **`src/lib/findableOffer.ts`** — one constant,
  shared by the SPA docs and the checkout/webhook edge functions. findable-site (separate repo)
  carries its own copy; changing either means a matching pass in the other.
- Audit whether **ChatGPT and Gemini name them** when a customer asks for their trade in their town.
- Fix what AI reads: pages on **their own site**, a page per service per town, plus consistency in
  the sources the evidence says matter for that trade.
- **Re-measure at 8 weeks.** The guarantee is **WORK-based** (audit + work + re-measurement with
  evidence, or a full refund) — it does NOT promise being named. Never write copy that promises
  the outcome.
- **Zero paying customers so far.** Nothing here has been proven on a paying client yet. Do not write copy or
  code that implies it has.
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
- **He never runs terminal commands.** Need SQL? **Hand it to him** — he runs it in the Supabase SQL editor.
  Never run SQL yourself, and never assume a migration file is live (see §6).
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
- [ ] Commit with `-F <file>` (PowerShell mis-parses multi-line `-m`). End with:
      `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- [ ] Merge `--no-ff`.
- [ ] **Never stage `HANDOFF.md` or `ONBOARDING.md`.** Untracked on purpose. Stage files explicitly; never
      `git add -A` blind.

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
      it, hand Paul the SQL and **WAIT for his confirmation that it has run** before deploying
      anything that reads or writes the new schema. Proven 2026-08-04: `findable-onboarding` v18
      deployed before its five new columns existed and **every submission — including ones carrying
      no new fields — died `save_failed` for ~20 minutes**, because the insert always carried the new
      keys and the single-pass column-shedding fallback couldn't recover. The fix (v19) also made the
      code defensive both ways: null-valued new keys are omitted from inserts, and the fallback is
      multi-pass. "Assume the columns exist" is not confirmation.
- [ ] Edge functions **do not auto-deploy**: `npx supabase functions deploy <name>` by hand.
- [ ] **Redeploy every function that imports a shared module you changed**, and prove each one. They keep
      running old code until you do.
- [ ] SPA auto-deploys on push to `main` (Cloudflare Pages).

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
- **No before-and-after has ever been measured.** ABLM and Paul's pool bar are the first two. Any claim about
  outcomes is unevidenced.

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
- **Migrations are applied BY HAND** in the Supabase SQL editor — `supabase db push` is broken (history
  desynced). A migration file existing does **not** mean it is live. For DB functions, check the live
  definition: `select pg_get_functiondef('public.<fn>'::regproc);`
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`.** `isSentStatus` and
  `isRepliedStatus` in `src/types/outreach.ts` are traps for aggregates. **`paid` means `amount_paid > 0`,
  everywhere.**
- **Paginate PostgREST reads** — it truncates at `db-max-rows` silently. Use `src/lib/fetchAllRows.ts` with
  `.order('id')` as a unique tiebreaker.
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
- 🔴 **AN ABSENT VALUE FALLING THROUGH AS THOUGH IT WERE A REAL ONE. THIS HAS NOW HAPPENED THREE
  TIMES, in three unrelated files, and it will happen again.** The shape is always the same: code
  branches on the *known* values and lets everything else drop into the `else`, where the default
  means something the data never said.
  | Where | The absent value | What it was silently treated as |
  |---|---|---|
  | `findable-onboarding` | a null questionnaire column | "they said no" |
  | `clientHeld.ts` (pre-fix) | `''` / whitespace / placeholder | "we hold this" |
  | `market-view` (pre-fix) | tier `unknown` (below the evidence bar) | "AI names them" → subtracted |
  The market one is the clearest: the branch kept `tier === "thin"` and dropped the rest, so
  `unknown` — which is what *every* entry is below the bar — was subtracted as established. **The
  guard inverted in exactly the case it was written for.**
  ⚠️ **The test: never branch on the states you expect and let `else` carry the rest.** Enumerate
  the absent case explicitly, and when a value is graded, assert on the grade you *want*
  (`=== 'established'`), never on the one you want to exclude (`=== 'thin'`). A new grade added
  later joins the wrong side of a negative test and nothing throws.
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

---

## 7. Parked and unmerged — do not merge these

| Branch | Hash |
|---|---|
| `edge-check-gate` | `d3fd6713` |
| `findable-product-rename` | `a8365707` |
| `short-signup-url` | `c8896003` |

---

## 8. Known open problems — don't rediscover these

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
- **37 reports already went out with the wrong-town problem.**
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

- **Entry points to `/playbook/:id` — exactly three, re-verified by grep 2026-07-30:**
  `LeadDetailDialog.tsx:636` (`Playbook` pill), `PaidClients.tsx:230` (`Playbook` pill), and the AI Audit row's
  **`checklist`** pill. Each passes `state={{ from, fromLabel }}` so `BackLink` can name where it returns to.
  **The first two are keyed on a LEAD id.** So for a business with an audit and no `outreach_leads` row — ABLM,
  the only delivery client — the AI Audit row's `checklist` pill is the **ONLY** route. Don't remove it.

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
