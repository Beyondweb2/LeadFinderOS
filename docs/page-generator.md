# The page generator and the page-plan queue

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §6i on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


## The `plan` action crash (fixed 2026-09-25)

From 474b7625 (2026-09-18) the `plan` action read the stored action plan with `.eq("user_id", user.id)`;
the handler names the operator `userId` and no `user` is in scope, so every plan request threw
"user is not defined" → 500. The Page Generator showed an error; the Page Plan Queue's "Build this"
fell through to "Couldn't match this row to a page". Fix: `user.id` → `userId` (two lines).
Guarded by `scripts/page-generator-plan-owner.test.ts` and `check-edge-undefined.mjs` (now green).
