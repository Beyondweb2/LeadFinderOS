# Things that have misled you — the incident narratives behind the rules (original §4)

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §4 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: "Two functions are deployed with NO SOURCE" was 2026-08-07. The count was **17** on 2026-09-15 — see `INVENTORY_DEEP_CLEAN.md` §1a.

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

## The held-run retry storm (2026-09-20 → fixed 2026-09-21)

**What was seen:** six audit runs showing "running 40/40", "running 3/3", "running 1/1" for a day — the
Findable and "Quit your life and travel" discoveries, the Switched On Electrical, Spare car keys and Swift
Learner hooks, Drive Rugby. Every provider row was `done` (exactly one Apify attempt each). Two first-reply
pitches sat `awaiting_audit` behind them.

**The mechanism:** `process-ai-audit-queue` finalises a settled run in two halves — flip to `processing`,
fire the crawl and `extract-competitors`, then a readiness check that RELEASES the run only when cleaning is
`complete:true`, else puts it back to `pending`. OpenAI had started answering **429** to `extract-competitors`,
so cleaning never completed; the next 30-second tick found the run `pending` with all rows settled,
re-finalised it — `prevStatus === "pending"` passes the invoke condition — and invoked the cleaner again.
`RETRY_CLEAN_CAP = 4` existed but bounded only `retryStuckCleanings`, the separate sweep over `complete`
runs; this path never reached `complete`. Attempts climbed to 3,280 on one run (two stamps per tick:
extract-competitors' own and `stampCleaningFailure`).

**Why it mattered beyond the badge:** nothing downstream reads a run that is not `complete`/`capped` —
`readAuditStates`, `resolveAuditReplyVars`, the report's measuring gate, the first-reply reconciler. The
measurement was finished and unusable.

**The fix:** `_shared/run-finalise.ts` — `shouldInvokeCleaning` (never all-failed, never complete, never past
the cap), `finaliseReadiness` (an exhausted cleaning is READY), `markCleaningExhausted` (`gave_up_at`,
written once). The finaliser imports the ONE `RETRY_CLEAN_CAP`. The report and the resolver already read
`complete:false` as "rival names unavailable", so an exhausted run is honest, not fabricated.
`scripts/audit-finalise-lifecycle.test.ts` drives it. Recovery was the deploy alone: the next tick released
all six with zero provider calls (runs 1885 → 1885, queue rows 7616 → 7616), and the Findable discovery
froze over its three existing runs.

**The rules it taught:** a secondary enrichment step must never hold a finished measurement; a cap that
only bounds one of two call sites is not a cap; a 160-char error receipt can cut off the one word that
classifies the fault ("You have …" — quota, rate limit or key? — now 400 chars).

---


## "Edge Function returned a non-2xx status code" hid a designed refusal (2026-09-21)

Paul pressed **Confirm & run** on a Full Measurement for **MCLocksmiths centre** (lead
`6d0585ac-b4a3-463b-8150-c59c3dd0f0e5`, `amount_paid = 99`). The screen said *"Couldn't start the
audit — Edge Function returned a non-2xx status code"*.

Nothing was broken. `create-ai-audit` refused exactly as §19 says it must: the lead is PAID and its
`baseline_audit_id` is NULL, so the order gate fired —

```
409  { ok:false, error:"baseline_not_frozen",
       detail:"This client has no recorded baseline. The full measure runs after the
               baseline freezes, never before it." }
```

— and recorded itself in `client_error_reports` at **17:00:35Z**. No audit, run or queue row was
created; the refusal is before every insert. The reason there is no baseline: the client's
`onboarding_responses` row (`f1406d3d…`, paid, 2026-09-17) has `baseline_status = NULL`, i.e.
`needs_questions`, so `startPaidBaseline` has been returning `skipped: needs_baseline_questions`
every 30-second tick. **The paid baseline is drafted and approved on the Baseline screen; the AI
Audit wizard's Full Measurement is a different, later thing and cannot substitute for it.**

⛔ **THE BUG WAS THE SCREEN, NOT THE GATE — AND IT IS A SHAPE, NOT AN INSTANCE.**
`supabase.functions.invoke` answers **every** non-2xx with `data === null` and one wrapper string.
So `if (!error && data?.error === 'business_not_in_town')` in `confirmAndRun` was branching on a
field that is never populated on a refusal: **the distance-override dialog could never open either**,
and had not since the day it was written. The refusal's real body — machine token in `error`, human
sentence in `detail` — is only reachable through `error.context`.

Fixed by reading the body ONCE (`readFunctionErrorBody`) and choosing the sentence with
`functionErrorSentence` (**`detail` → `message` → `error` → wrapper**; showing the token is the
catch-all-error fault in a different hat). `scripts/function-error-body.test.ts` drives both rules,
including that the body is a stream and a second reader must degrade rather than throw.

⚠️ Still unfixed on the same screen: `runPreview` throws `error?.message` the same way. Left alone
deliberately — the brief was the Confirm & run path.

## A discovery scan was shown as the paid client baseline (2026-09-21, MCLocksmiths centre)

The Baseline screen said **"Client baseline · 80 questions · 3 runs · measured 21/09/2026"** and the
lead cockpit offered the same audit as **"Baseline report"**. The audit was `50986aa3-…`, the
client's 80-question **discovery** scan.

⛔ **NOTHING HAD BEEN WRITTEN.** `outreach_leads.baseline_audit_id` was NULL throughout, and
`claim_baseline_pointer` fires only on `audit_purpose = 'baseline'` — so a discovery audit is
structurally incapable of being adopted, and `guard_baseline_pointer_immutable` would stop a
real one being overwritten afterwards. `onBaselineFrozen` is gated on the same purpose, so nothing
spent and no `remeasure_due_date` was filled. **Display only.**

**What made it look frozen:** `advanceBaseline` freezes on `baseline_target_runs > 1` and nothing
else — its own comment says "not a paid baseline audit", which is not what the line tests. A
3-run discovery audit therefore gets `baseline_completed_at` and the `baseline` fold stamped on it.
That is how discovery gets its multi-run summary and is correct; what is **not** correct is any
reader treating `baseline_completed_at` as a baseline marker.

⛔ **THE FAULT WAS THE NEGATIVE QUESTION, IN TWO PLACES.** Both screens computed
`isInternalMeasurement(audit) ? 'internal' : 'Client baseline'` — so the `else` carried discovery,
the free check and every ordinary outreach audit. `LeadDeliveryCockpit` compounded it with a
`?? rows[0]` last rung that nominates *the newest audit* as the baseline, and an `isBaseline` flag
computed from `baseline_target_runs != null`, which answers "is this multi-run", never "is this the
baseline". The file's own header records fixing exactly this rung for full measures in 2026-09-13
and leaving it open for everything else.

**The rule is positive now and lives once** — `isClientBaseline` / `auditRoleLabel` in
`src/lib/auditKind.ts`, asserted on `'baseline'`, with legacy multi-run rows (RG, Ronnie) included.
`AuditPills` had a third hand-rolled copy of the same expression; it imports the shared one now.
`auditKind` also grades `'discovery'` as its own kind so no screen infers it from a question count.

⛔ **AND THE COUNT IS ENFORCED WHERE IT FREEZES.** `paid-baseline`'s `approve` action now demands
exactly `BASELINE_QUESTIONS`; `save` still allows a 1–40 draft while the operator works. Approval
is what the day-28 replay repeats verbatim, so approving 19 or 80 silently redefines the refund's
measuring stick. `scripts/discovery-not-baseline.test.ts` drives all of it.
