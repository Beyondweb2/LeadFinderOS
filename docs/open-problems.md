# Known open problems — the long record (original §8)

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §8 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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

## ✅ RESOLVED 2026-09-21 — OpenAI 429 on every call (was open from ~07:00 2026-09-20)

**It was a billing/spend-limit condition, exactly as diagnosed, and Paul topping the key up cleared
it.** Verified the same day on discovery audit `dff25511`: `extract-competitors` returned rival
names on 8/8 cells, and question generation stopped falling back — the boundary was visible in one
wizard, the generation before the top-up returning the template pair ("best Locksmiths in Canterbury
UK") and the regeneration after it returning service-specific questions. ⚠️ **8/8 extractions is the
proof, not the question wording**: template and model can both produce a plausible-looking question,
but only a working OpenAI call produces competitor names. Record: `docs/measurement.md` §32.

The hardening this prompted is kept and is not conditional on the outage: audits finalise regardless
(`_shared/run-finalise.ts`), the receipt keeps 400 chars of the error, and the all-named-hook guard
stands. The original record follows.

### The original record

`extract-competitors` gets `openai_http_429` on every batch (2-item and 120-item alike); `create-ai-audit`'s
question generation has fallen back to template questions since the same hour (visible as capitalised
plural trades — "best Driving instructors in Coventry UK"). The stored error begins `"You have `, cut at 160
chars by the finaliser's receipt; the Management API's function-log store keeps under a minute, so the full
sentence was not recoverable after the fact. A refusal that persists 20+ hours on two-item requests is a
quota or spend-limit condition on the account/project behind `OPENAI_API_KEY` (set 2026-06-30), not a
per-minute rate limit — **external to this repo; Paul checks OpenAI billing and usage limits.** Since
2026-09-21 audits finalise regardless (rival names withheld with an honest receipt), the receipt keeps 400
chars, and the drip/Inbox/first-reply hold on "competitor names haven't been extracted yet" — existing
semantics — until cleaning works again. The all-named-hook guard (`hook_no_visibility_gap`,
`_shared/audit-reply.ts`) landed in the same commit.

---

