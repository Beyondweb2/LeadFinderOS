# The client report — the wrong-town incident, partial results, the name that scores itself

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6b on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §22 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §27 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


## Short report URLs — `findable.live/r/<code>` (2026-09-17)

Every audit carries `ai_audits.short_code`: a random 6-char code from `23456789abcdefghjkmnpqrstuvwxyz`
(31 chars, no `0/O/1/l/i`), UNIQUE, assigned by the `trg_set_audit_short_code` BEFORE INSERT trigger
and backfilled onto all 1,247 existing audits (migration `20260917120000_ai_audits_short_code.sql`,
run by hand). Unguessable — these reports are public and carry a business's competitor data, so a
sequential or name-derived code would leak one prospect's report to another.

**Three resolving forms, none ever retired:** the short `/r/<code>`, the UUID `/report/<auditId>`,
and the legacy name+8-hex slug. `render-audit-report` tries UUID → short-code (`isShortCode`, a bare
6 alphabet chars, no hyphen, so it can never be confused with a UUID or a `name-<8hex>` slug) →
legacy `business_reports` slug. `reportSlug.ts` is the single home of the alphabet, length,
`isShortCode`, and `shortReportUrl`; `scripts/report-short-code.test.ts` pins the TS constants to the
SQL generator character-for-character.

**Who sends the short link:** the WhatsApp `audit_reply` template ({{3}}/{{4}} — BODY vars, so no
Meta resubmission; `audit-reply.ts`), the free-check email/WhatsApp (`free-check-result.ts`), the
Inbox copy-link button (`useInbox.ts` + `Inbox.tsx`), the cockpit "Client report" button, and the
report's own "view online" footer. Each falls back to `/report/<auditId>` only if a code is ever
absent (backfill + trigger mean it never is). findable-site fronts it with `functions/r/[code].ts`
(+ bare-`/r` 404 guard), a sibling of `functions/report/[id].ts`, forwarding the code as `?slug=`.

**Verified live 2026-09-17:** `findable.live/r/ajape3` and `findable.live/report/143e5efb-…`
(Redline Remaps and Keys) return byte-identical 200 text/html reports; `/r/zzzzzz` and bare `/r/`
return the noindex 404 shell. Deployed by hand: `render-audit-report`, `send-whatsapp-message`,
`process-whatsapp-queue`, `process-ai-audit-queue`, `submissions`, `findable-checkout` (the six that
reach `reportSlug.ts`), plus findable-site.

## §33. Two rulers for "named" in the internal baseline view (MCLocksmiths, 2026-09-22)

The internal baseline view (`/baseline/:auditId`) printed per-engine summaries such as "Gemini 1/3"
over a detail line "Named in the answer — 0 of 3" for the same three cells. The summary
(`buildBaselineView`, `c.named/c.runs`) and the hero read `cellNamed()` — the model's `self_named`
verdict where extract-competitors recorded one, the stored string `named` otherwise. The detail line
(`auditReport.ts` `perEngine.recommended`, rendered by `aiAuditReportHtml.ts`) read a raw
`nameMatches(answer_text)`, a third ruler. Fixed by reading `cellNamed()` for `recommended` too;
`cited` stays its own measure. `scripts/named-one-ruler.test.ts` drives both derivations from the
same three-run cells.

**MCLocksmiths audit `50880751`, all 120 cells recomputed.** Canonical (what both halves now show):
ChatGPT 32, Gemini 2, **34 of 120 = 28%** — the existing headline was already the canonical figure.
Four questions disagreed between summary and detail before the fix: auto locksmith Canterbury
(Gemini 1 vs 0), Ramsgate (ChatGPT 1 vs 0), emergency locksmith Herne Bay (ChatGPT 2 vs 1), house
lockout Canterbury (ChatGPT 2 vs 3). The other 16 agreed.

**A separate finding, NOT changed here — the ruler's own accuracy on this audit.** Reading the 120
answer texts by eye (any "MC Locksmiths" / "MCLocksmiths centre" / "Morgan C." mention) gives
ChatGPT 38, Gemini 1, **39 of 120 = 33%**. The gap is the evidence, not the rendering: the model
verdict is wrong in 7 cells (false NO on Herne Bay r2, house-lockout r3, Faversham r1, Broadstairs
r3, Dover r3 — each names "MC Locksmiths" in prose; false YES on break-in r3 and auto-locksmith
Gemini r2 — no mention at all), and the string fallback misses the "MC Locksmiths" spelling (the
stored name is "MCLocksmiths centre") on Faversham r2 and Ramsgate r2. Run 2 has no model verdict
on 12 of 40 cells (the extractor did not read it). Correcting either ruler is a classification
change on frozen evidence and was deliberately not made; Paul's call.

### §33b. The ruler itself: the answer text is the evidence (2026-09-22, later the same day)

Paul's rule, now the code: a business is NAMED only when the answer text names it; a citation alone
is not; a verdict about the text may not contradict it. `cellNamed(cell, ctx)` (namedSignal.ts)
reads, in order: (1) the ANSWER TEXT when the caller supplies the business + trade/town and the name
is text-judgeable (`nameIsTextJudgeable` — something survives once trade, town and legal forms are
removed; "Locksmiths Canterbury" does not qualify), via `nameMatches` over `answerProse` (URLs and
cited domains stripped) with a joined-or-split spelling tolerance (`tokensContainJoined`: whole hay
tokens concatenated must equal the concatenated needle — "MC Locksmiths" == "MCLocksmiths", "MCA
Locksmiths" != , never inside a longer word; a lone first token counts only if ≥ 8 alphabetic
characters and not trade/town/service); (2) the model's `self_named`; (3) the stored `named`. No
context → the old behaviour exactly. Context is passed by the internal baseline view (Baseline.tsx →
buildBaselineView), the report builder (buildReportData, so hero, per-question and per-engine agree)
and the day-28 comparison (compareMeasurements ← remeasure-results, both sides). Not yet passed by
the AiAudit pooled view, the playbook, hookAudit, market-view, page-generator, action-plan or the
stored `ai_audits.baseline` snapshot (aggregateRuns) — those still read the verdicts.

**MCLocksmiths `50880751`, corrected: ChatGPT 38/60, Gemini 1/60, 39/120 = 33%** (was 32 / 2 /
34 = 28%). Nine cells changed, all by the text: seven to NAMED (break-in Canterbury r3 was a false
"named" → see below; the seven: house-lockout Canterbury ChatGPT — "**MCLocksmiths centre** 5.0" places
card; Broadstairs ChatGPT — "* **MC Locksmiths** — advertises 24/7 Broadstairs coverage"; Faversham
ChatGPT ×2 — "* **MC Locksmiths** — covers Faversham" and "* **MC Locksmiths / Morgan C.**"; Herne
Bay ChatGPT — "* **MC Locksmiths** — covers all of Herne Bay (CT6) 24/7"; Dover ChatGPT — "* **MC
Locksmiths** — independent Dover-area locksmith"; Ramsgate ChatGPT — "… and MC Locksmiths** as
serving Ramsgate"), two to NOT NAMED (break-in Canterbury ChatGPT and auto-locksmith Canterbury
Gemini: the model said named, the answer never mentions the business). Stored evidence unchanged
(results checksum 6ac1520c… before and after); the `ai_audits.baseline` snapshot still carries the
verdict-based 34 and was left alone.
