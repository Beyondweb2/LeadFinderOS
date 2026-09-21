# Measurement — before/after, the pointer, the three-type model, the results sender, the run gap, named-by-model

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §17 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §19 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §18 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §24 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §25 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

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


---

> Moved from CLAUDE.md §31 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: "`cleanup/pixel-and-full-reset` IS STILL UNMERGED" — merged into `main` (commit `06a4f815` is in `9b10e3a1`) before this split.

## 31. ✅ "NAMED" IS THE MODEL'S VERDICT NOW, AND THE SEO SCAN IS DECIDED BY PURPOSE (2026-09-15)

### The SEO scan: an opt-OUT meant ABSENCE MEANT SPEND
Found on BS4 Electrical Services Ltd (audit `c8a78581`, purpose `audit`) — a cold outreach report
carrying "Website issues we can fix". The rule was
`skipSeo = body.skip_seo === true || isMeasurement || isRemeasure || isFreeCheck`, so any caller
that did not mention the flag bought a ~4p Apify scan — and the caller that does not mention it is
the BUSIEST lane in the product: `whatsapp-inbound`'s first-reply auto-audit chain.
- **Measured: 620 outreach-lane runs scanned, 95% of every SEO pound ever spent** (~$30 lifetime,
  re-derived from `enrichment_usage`: 717 real rows summing $16.74 plus 322 $0.12 fallback echoes
  whose true cost is unknown).
- ⛔ **`seoScanAllowed()` (`src/lib/auditKind.ts`) IS A POSITIVE ALLOWLIST OF ONE PURPOSE:
  `baseline`.** Null/unknown does NOT scan — on a paid API the absent value grades "do not spend".
- ⛔ **ENFORCED TWICE, AND THAT IS THE POINT.** create-ai-audit seeds the skip marker;
  `process-ai-audit-queue` re-asks the same predicate before it spends. The marker alone IS "a flag
  that can drift" — a run inserted by any path that misses it was scanned with nothing to stop it.
- ⚠️ Stated cost: a wizard single no longer scans by itself. `LeadSiteCheckButton` is the
  on-demand scan and it prices itself on its face.

### "named" was a substring test, and it broke both ways
`named` was `nameMatches(answer_text, businessName)` at scan time, so a business whose name is its
own trade and town scored on answers that had never heard of it. **147 of 1,099 lead-linked audits
(13%)**: "Burnley Locksmiths" was told AI names it 6 of 6; "CJ Plumbing Services" that AI never
names it.
- ⛔ **`extract-competitors` MARKS the audited business instead of excluding it** — `self_named`, a
  required boolean per answer. `cleanNames` RETURNS the self match rather than dropping it; the
  displayed rival list is byte-identical and self still never prints as a competitor.
- ⛔ **`src/lib/namedSignal.ts` IS THE ONE PREDICATE**, read by all 19 raw-flag sites.
  `cellNamed()` prefers the model verdict; **absence FALLS BACK to the string match, never to
  zero** — reading a missing verdict as "not named" would zero the book in one deploy, two paying
  clients' frozen baselines included.
- ⛔ **A COMPARISON USES ONE RULER ON BOTH SIDES** (`namedMode`): the model is used only when the
  before AND the after have both been read by it. A model-read replay against a string-matched
  baseline is not a before-and-after, and that number decides a refund.
- ⛔ **The hand-check refusal now needs a MAJORITY of model-read cells to lift**
  (`runIsModelRead`). Not one (a lone verdict cannot carry a headline), not all (gpt-4o omits an
  id on ~8% of runs).
- **Why the model is trusted, measured not assumed: across the 5,957 distinct names gpt-4o has
  written into that field, ZERO are bare postcodes. Across the 19,046 the old regex scraper
  wrote, 203 are.**

### 🔴 THE CAP WAS DECIDING WHAT THE MODEL WAS ALLOWED TO SEE
The first backfill produced ~12 false negatives — businesses shown in ChatGPT Maps-style listing
cards scored "not named". **A prompt paragraph was written for it and recovered 0 of 13, which is
what proved the fault was one layer down.**
- A ChatGPT answer carrying listing cards is **9,000–22,000 characters and about half of it is
  markdown image embeds with ~800-character opaque URLs**, so the business's own listing sat past
  `MAX_ANSWER_CHARS` (4,000). The model was asked "did this answer name them?" about text that did
  not contain them.
- **Measured: stripping the embeds removes 45.4% of all text; cells over the cap 232 → 27; cells
  whose BUSINESS NAME is beyond the cut 14 → ZERO.** `stripCaptureNoise()` runs BEFORE the
  truncation — slicing first would leave the cut where it is and merely tidy what survived it.
- ⚠️ **THE LESSON, AND IT IS §4's: THE PROMPT WAS REWRITTEN WITHOUT CHECKING WHAT THE PROMPT
  CONTAINED.** One query against `MAX_ANSWER_CHARS` before spending would have shown it. Cost
  $1.47 and a round trip. **When a model "gets it wrong", check what it was SHOWN before you
  rewrite what it was TOLD.**
- ⚠️ **"IDENTICAL EVERYWHERE" IS A TELL, NOT A RESULT.** Both times a pass produced numbers
  identical to the previous one the cause was mechanical (the fix never reached the data; the
  affected cells were not in that set) — never a model that happened to agree. Prove which.

### What was run, and what it cost
- **Today's 13 unjudgeable audits re-extracted: $0.2279** (13 runs, 0 failures). Nothing changed,
  and that was VERIFIED not accepted: zero of their 78 cells had the name beyond the old cut, and
  all 13 runs carry fresh receipts.
- **The other 135 were CLEARED** — `self_named` removed from 1,187 cells across 494 rows, plus the
  stale counters on 139 receipts. Read back: 0 remaining. They keep the string match and the
  refusal. ⛔ **Leaving them would NOT have been neutral** — `cellNamed` prefers a model verdict
  wherever one exists, so it would have made ~12 known-wrong verdicts authoritative.
- ⛔ **`extract-competitors` NOW RETURNS ITS REAL COST** from OpenAI's own token counts (gpt-4o
  $2.50/$10 per 1M). It had never logged a penny; every figure for it in this file was an estimate
  from a comment, and the estimate made this session was **3.5x too low**.

### ⛔ TaskStop REPORTED SUCCESS AND THE PROCESS KEPT RUNNING
A background re-run was stopped, reported as stopped, and **spent another ~$0.52** before a
progress event for a job already called dead gave it away. **Verify a kill by process count, not
by the tool's return value.**

### ⚠️ The parity test sampled at a fixed anchor
`template-bodies-parity` compared at `DISPLAY_NAME_LIVE_FROM + 60s`, so the moment a body was
superseded it began comparing the OLD body against current copy and reporting drift that did not
exist. It samples at **now**, which is after every `changedAt` by construction.

### explain_offer gained the website URL
Paul added `https://findable.live/` at the foot at Meta after a prospect replied "I don't click on
links from people I don't know". Variables UNCHANGED — {{1}} trade_plural, {{2}} town, {{3}}
onboarding link, the URL plain text. **FLOWPOINT, Techfix, JAMES ELECTRICAL and C.K Electrical
were sent the OLD wording and render it** via `SUPERSEDED_BODIES` (changedAt 14:00Z).
⚠️ `process-whatsapp-queue`'s mirror of explain_offer has **no `headerVideoUrl`** where
whatsapp-send.ts has one. Harmless today (the queue cannot send it — §30b) but the registries are
meant to match.

**Deployed:** all 17 functions in the closure; SPA pushed.
⚠️ **`cleanup/pixel-and-full-reset` (`06a4f815`) IS STILL UNMERGED** — the Meta Pixel and the
dashboard's Full Reset button are still live.

---


## 32. ✅ DISCOVERY IS THE FLEXIBLE AUDIT NOW — 1..80 QUESTIONS × 1..3 RUNS (2026-09-21)

**LIVE AND VERIFIED IN PRODUCTION 2026-09-21** (deploy record at the end of this section). Paul
asked for a configurable opportunity/research audit: pick how many
questions, pick how many runs, pick which of the generated questions actually run, see the total
before pressing the button. **It went on DISCOVERY, not on the full measure** — his decision, and
the same reasoning as 2026-09-20: raising the full measure's count raises the Apify bill on every
paying client's measurement, and a measurement is not what was wanted.

⛔ **THE PAID METHODOLOGY DID NOT MOVE, AND THAT IS THE POINT.** The full measure is still 20 × 3
with `MEASUREMENT_MIN/MAX/DEFAULT_QUESTION_COUNT` all deriving from `FULL_MEASURE_QUESTIONS`; the
paid baseline is still `BASELINE_QUESTIONS` × `BASELINE_RUNS` with its operator-approved set frozen;
the day-28 replay still carries that set verbatim and in order at `MEASUREMENT_RUNS`; the outreach
hook is untouched. `scripts/discovery-dials.test.ts` asserts each of those as a property, so the
next person to reach for the dial finds a test explaining why it is not there.

### What the dials are

- `DISCOVERY_QUESTIONS` 40 is now the DEFAULT, not the only value. `DISCOVERY_MIN_QUESTIONS` 1 ·
  `DISCOVERY_MAX_QUESTIONS` 80.
- `DISCOVERY_DEFAULT_RUNS` **3** (was `DISCOVERY_RUNS` = 1; renamed so every call site had to be
  looked at) · `DISCOVERY_MIN_RUNS` 1 · `DISCOVERY_MAX_RUNS` 3, unchanged.
- ⛔ **80 IS HONEST ONLY BECAUSE THE GENERATION IS BATCHED.** `planGenerationBatches`
  (`src/lib/auditPlan.ts`) splits a target above `GENERATOR_ABSOLUTE_MAX_QUESTIONS` into calls that
  each sit under it — 80 plans to 40+40 — and `generateDiscoverySet` feeds each batch the questions
  produced so far as a `coverageDirective`, pools with `dedupeByIntent` and fills to target. 40 is
  still ONE call, argument for argument, so every existing discovery audit is unchanged. Without
  this the dial is the 2026-09-12 fault again: a size the screen offers and the queue never runs.
- ⛔ **OUT OF RANGE IS REFUSED, NOT CLAMPED** — `question_count_out_of_range`, `runs_out_of_range`,
  `too_many_questions`, all 400 with nothing started, all keyed on `isDiscovery` so no automation's
  replay is refused for a cap it cannot control. The clamps are for a garbled persisted value only.
- **The run count controls execution**: `discoveryRuns` → `baselineTargetRuns` → `advanceBaseline`
  replays the stored set. It was already true for 1..3; the dial did not weaken it.
- **Selection, not deletion** (`src/lib/questionSelection.ts`): indexes, never text, reconciled
  across every edit, add, remove and paste; an unrecognised change selects all, the safe failure
  being "more than you meant" — visible in the count and refused at 81.
- **One total, one function**: `expectedResponses(questions × runs × engines)` is quoted by the
  wizard and recorded as `results.discovery_config.expected_responses` on the run.

### Ported from the abandoned `full-measure-dials` branch (`2646b390`)

That branch put the same dials on the FULL MEASURE, against Paul's 2026-09-20 decision, and was
built on a base 18 commits stale. **Do not merge it.** What was reused, rewritten for discovery:
`planGenerationBatches`, `expectedResponses`, the clamp/validator pair, `questionSelection.ts`, the
editor's optional checkbox column, and the review-step summary. What was deliberately left behind:
every change to `FULL_MEASURE_*`, `MEASUREMENT_*_QUESTION_COUNT`, `fireDueRemeasures`'s run-count
passthrough, the `BaselineContract` fields and the `sweepStalledBaselines` query filter — all of
them on the paid path, none of them asked for here.

**Run-level results** needed no work on either branch: one `ai_audit_queue` row per question per
run, `poolRuns` folds them into named/answered counts per question per engine.

### 🔴 THE BUG THE DIALS INTRODUCED, FOUND AT INTEGRATION: "1 RUN" WOULD HAVE RUN THREE TIMES

`buildAuditRunRequest` (`src/lib/auditQuestionContext.ts`) sent `run_count` **only when it was
greater than 1**. That was exactly right while `create-ai-audit` defaulted an ABSENT run count to a
single run: omitting the field and asking for one were the same request. Renaming `DISCOVERY_RUNS`
(1) to `DISCOVERY_DEFAULT_RUNS` (3) made them different requests, and nothing on the sending side
was revisited — so an operator who picked **1 run** sent nothing, and the server ran **3**. Three
times the Apify bill, with the screen reading "1 run · 80 expected responses" over an audit of 240.

⛔ **This is the absent-value-as-a-real-one fault (CLAUDE.md §4) on a spending path**, where absent
is supposed to mean "do not". The dial reached the wire for two of its three positions and silently
dropped the cheapest one. The rule it re-teaches: **when you change what an ABSENT value means, grep
every site that decides whether to SEND it.** A default is half a contract; the omission is the
other half.

⛔ **AND A TEST WAS ASSERTING THE BUG.** `discovery-audit.test.ts` pinned *"1 run sends no run_count
— the server default IS one"*, a sentence that was true when written and stopped being true one
commit before the integration. A test that states its own justification is how this was caught in
seconds instead of on a bill; a test that had only asserted the value would have been "fixed" to
match. Both suites now assert on the WIRE (`run_count === n` for every position) rather than on the
screen's source text.

### Deploy record — 2026-09-21

| | |
|---|---|
| Merged | `42dfbcd2`, `--no-ff` onto `d920d0d7`. The branch was cut from that exact commit, so no rebase; nothing on main was displaced. |
| Edge function | **`create-ai-audit` v141 → v143** — the ONLY function deployed, and the only one reading any `DISCOVERY_*` constant. |
| Not deployed, deliberately | 14 other functions import `auditQuestionCounts.ts` but none of the changed exports; `paid-baseline` reaches the changed `auditQuestionContext.ts` but passes no `runCount`, so the change is a provable no-op there. |
| Frontend | Live on **`leadfinderos-next.pages.dev`** (see the URL warning below). Verified by fetching the served `AiAudit` chunk and finding it byte-identical to the local build — the only differences are sibling chunk hashes inside its `import` statements. |

⚠️ **THE OPERATOR APP IS `leadfinderos-next.pages.dev`, AND THIS WAS ALREADY WRITTEN DOWN.** The
deploy check was run against the retired `leadfinderos.pages.dev`, which still answers 200 with a
months-old bundle; twenty minutes went into "the Cloudflare pipeline is stalled, several commits
behind" before Paul supplied the right host. **CLAUDE.md §7 already carried the correct host AND a
warning naming this exact trap, added 2026-09-20.** It was missed because the URL was taken from a
stale copy of CLAUDE.md in the session's own context rather than by reading the file — the §3 recon
rule ("read the actual files before editing", and before asserting) applies to the map as much as to
the code. `docs/code-map.md` genuinely was stale and is corrected in this commit.

**The rule:** a deploy check against the wrong host proves nothing, and a retired Pages project
serving an old build is indistinguishable from a broken pipeline. Before concluding a deploy has
failed, confirm the HOST from the file on disk, then prove where live is by checking a marker from
the PREVIOUS deploy.

### Production verification, on the live UI

Quick check `3–5 questions × 1` and Full measurement `20 questions × 3` both unchanged on screen.
Discovery offers `up to 80 questions × up to 3`; the count input is `min=1 max=80`; a fresh wizard
stores `discoveryRuns: 3`. The review step shows the live selected count (`2 / 80 questions
selected`) beside `Expected AI responses 8 (2 × 2 × 2)`, and deselecting one question moved it to
`4 (1 × 2 × 2)` — `expectedResponses(questions × runs × enabled engines)`, derived and never stored.

⚠️ **A PRE-DIAL `discoveryRuns` CAN PERSIST AND BEAT THE DEFAULT.** `usePersistedState` had a
stored `1` from when discovery was a fixed 40 × 1, so the screen opened on "1 run" while the product
default was 3. It was not a preference — it was the only value that had ever existed. Cleared when
the wizard reset after a run, and a fresh wizard is 3. Worth knowing before believing a default.

### Smoke test — audit `dff25511`, MCLocksmiths centre (Canterbury), 2 × 2

**8 AI responses, exactly `2 questions × 2 runs × 2 engines`.** Both runs completed
(`mention_rate` 0.5 each, `actor_cost_usd` $0.0145 each), both questions executed in both runs,
`baseline_target_runs = 2` on the row — the dial reached the server and `advanceBaseline` replayed
the stored set. All 8 cells carry a `self_named` verdict and extracted rival names.

**The OpenAI 429 is resolved.** The persistent quota error was a billing problem, cleared by Paul's
top-up mid-session; the boundary was visible in the output. The generation before the top-up
returned the deterministic template pair ("best Locksmiths in Canterbury UK", "top rated …") — the
fallback, not the model. The regeneration after it returned service-specific questions
("emergency locksmith services …", "lock installation …"), and **competitor extraction succeeded on
all 8 cells** (AW Locks, LockFit Canterbury, Castle Locksmiths, Keytek). `extract-competitors` is an
OpenAI call, so 8/8 extractions IS the proof the quota is clear — a stronger signal than the
question wording, which template and model can both plausibly produce.

### ⛔ DO NOT RUN THE 80 × 3 YET — APIFY, NOT THE CODE, IS THE BLOCKER

At the time of this record Apify sat at **$17.02 of $19.00 (89.6%), resetting 16 Oct**. This audit
measured **~$0.00725 per question-run**, so an 80 × 3 is roughly **$1.74** against about **$1.95**
left — it fits on paper and leaves ~20p to cover every other audit and SEO scan for the following
25 days. ⛔ **At 100% every audit question and every SEO scan in the product stops** (CLAUDE.md §4),
including paying clients' work, so the ceiling is not a private budget. Raise the cap before running
MCLocksmiths at 80 × 3. Recompute the percentage from used/cap at the time — never trust a stored
`usage_pct`.

**Tests:** `scripts/discovery-dials.test.ts` (new, plus the wire assertions above); `discovery-audit`
and `audit-lifecycle` updated for the renamed default and the new bounds. `npm test` 134/143 — the
nine failures byte-identical to clean `origin/main`. ⚠️ `check-edge-undefined` and the typecheck
baseline both fail on `origin/main` for unrelated pre-existing reasons (`monthlyStartIso` in
`_shared/remeasure-results.ts:207`, `user` in `page-generator`, a lucide `title` prop in `Inbox.tsx`
and `OutreachTable.tsx`) — reproduce them on a clean checkout before blaming a change.

---
