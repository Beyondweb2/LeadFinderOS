# 02 — AI visibility methodology (as the code actually does it)

*Confirmed from code at `main` `4ed16813` on 2026-10-05, not from older docs. Where CLAUDE.md or older records disagree,
that is listed at the bottom. Longer history: `docs/measurement.md`, `docs/baseline-workflow.md`,
`docs/discovery-balanced-baseline.md`, `docs/pre-sales-certification/fixes-04-ai-measurement.md`.*

## The idea in one paragraph

We ask AI engines the questions a local customer would ask ("Can you recommend a good plumber in Halifax?") and count how
often the business is **named** in the answers. That count — named answers ÷ answered answers — is "the number". We
measure it before the work (the **baseline**), do the work, then ask the **same questions the same way** four weeks later
(the **replay**) and compare like for like. The guarantee is judged on that comparison.

**Engines:** ChatGPT and Gemini only (`AUDIT_ENGINES`, `SCORED_ENGINES = ['chatgpt','gemini']`). Answers are collected via
Apify actors. ⚠️ **Google AI Overview is no longer collected at all** (removed from the scraper input to cut latency —
`_shared/enrichment/ai-search.ts:92-95`); older stored data still displays. Never claim it is measured.

## The kinds of measurement (`audit_purpose` is the marker, never the count)

| Kind | Shape | `audit_purpose` | Used for | Compared? |
|---|---|---|---|---|
| Hook audit / prospect check | 3 questions × ChatGPT + Gemini × 1 run = 6 answers | `audit` | sales evidence before a call | never |
| Free check (public, findable.live) | 3 × 3 runs | `free_check` | funnel top | never |
| **Discovery** (paid clients) | a wide pool (≈40–80 q) × 3 runs | `discovery` | choosing the 20 — **research, not truth** | never |
| **Formal baseline** | 20 q × 3 runs × 2 engines = **120 answers**, frozen | `baseline` | the BEFORE side | yes |
| **Day-28 replay** | the baseline's asked set verbatim × 3 runs | `remeasure` | the AFTER side | yes |
| Weekly check | small monitoring set | `weekly_check` | monitoring only, never the guarantee | never |
| Full measure | 20 × 3 across areas | `measurement` | ⚠️ exists in code but is **not part of normal paid fulfilment** (`startFullMeasure` is never called) | never |

## 1. Discovery — research, never business truth

**How many questions** (`perTownCounts`, `_shared/baseline-discovery.ts:85-89`) — the generator is asked once per approved
town:

- Home town only: **40** questions.
- 1–3 extra areas: home town 24 + 8 per area (≈32–48).
- 4–6 areas: 24 + 6 per area. 7+ areas: 24 + 4 per area (home town falls to a floor of 12 at 15+ areas).
- Plus 2 mandatory home-town "core" questions and 1 core question per area.
- De-duplicated by meaning, capped at **80** (`DISCOVERY_MAX_QUESTIONS`).
- Each asked **3 times** (`DISCOVERY_RUNS = 3`) on ChatGPT and Gemini. So "around 40 customer-style questions, more if you
  cover several towns, each asked three times on ChatGPT and Gemini" is the true sales line.
- Running Discovery is optional, manual, priced on its button; it never freezes anything and never writes the baseline.

**How questions are filtered** (in pool order):

1. Rewritten into customer wording (`toCustomerQuestion`).
2. **Service scope** (`questionScope`, `src/lib/serviceScope.ts`): each question is `core`, `service`, `unsupported` or
   `not_offered`. Only `core` and `service` pass. A question naming a service the client doesn't offer, or one not traceable
   to a confirmed service, is rejected with a reason. A "no new boilers" entry binds only NEW work (repairs stay in scope).
3. **Near-duplicates** removed by `sameIntent` (`baselineMix.ts`): same town + same meaning words (or ≥0.8 overlap).
4. Inside the generator, `seedGuard.ts` drops research-intent questions ("how to become a…"), off-trade questions,
   too many generic head terms, and questions missing the town.

**What "winnable" / "fragmented" means** (`classifyWinnability`, `src/lib/auditReport.ts:636-736`), per question:

- **named** — the business is already named.
- **no-local-race** — no local firm is named at all (nothing to win).
- **locked** — both engines name the same small set (≤3 firms, ≥2 on both engines, heavy overlap) — hard to break into.
- **open / winnable** — **fragmented**: 6+ different firms across the answers, or mostly directories/aggregators, or the two
  engines name entirely different firms. Different businesses across repeated answers = the race is more open.
- **contested** — in between.

⛔ **Discovery is NOT business truth.** A Discovery question, a generated service idea or a website URL that only a
Discovery scan found is never a confirmed service, never a page, never "the client's current site".

## 2. Choosing the formal 20 — balance first, opportunity only breaks ties

Every Discovery question gets one verdict (`recommendBaseline`, `src/lib/baselineRecommendation.ts`):

- **NOT RECOMMENDED** — out of service scope, names no approved town, already named in every answer on both engines, or
  `no-local-race`.
- **RECOMMENDED** — chosen by `buildBalancedBaseline` (`baselineMix.ts`): the **Hook questions go in first, verbatim**
  (up to 3, from the lead's first ordinary audit), then the core questions, then Paul's manual additions; the rest fill an
  intent mix (with areas: broad 4, service 8, location 6, emergency 2; without areas: 5 / 12 / 0 / 3), rotating services
  and towns. Max **2 questions per service** (hard cap — the set comes back short rather than repeat). Home town ≤ 9 of 20;
  other towns ≤ 3 each.
- **KEEP AS FUTURE OPPORTUNITY** — eligible but not chosen. Seeds the **Opportunity Backlog** (`client_opportunities`,
  service-role only), which the guarantee never reads.

**Opportunity is only a tie-break:** the sort is balance score → opportunity rank → original order. The winnable/fragmented
label is never the selector. (So never tell a client "we only pick questions we can win".)

**Approval gates** (`paid-baseline`): exactly 20; a removed Hook question needs a written reason (≥10 chars); near-
duplicates refused unless accepted; quality blockers (names the business, a not-offered or unconfirmed service, no approved
town, no core home-town question) refused unless overridden with a written reason. On approval the set **freezes**.
`reopen_approved` works only before the measurement starts, with a reason. Once started, the set is permanently locked; a
lead with a `baseline_audit_id` can never be re-drafted.

## 3. The formal baseline

**20 approved customer-style questions × 3 runs × ChatGPT + Gemini = 120 answer opportunities**
(`BASELINE_QUESTIONS = 20`, `BASELINE_RUNS = 3`).

**Completeness** (`src/lib/measurementHealth.ts`, `guaranteeFreezeGate` in `_shared/audit-baseline.ts`):

- Expected cells = questions × runs × engines (120). States: running / complete / partial / capped / failed_retryable /
  failed_permanent.
- It **freezes only at 120 / 120**, or as a **partial explicitly accepted by Paul** (`accept_partial`, a written reason ≥10
  chars, stored in `onboarding_responses.baseline_meta.partial_accepted`; refused while any cell is still retryable; whole
  missing runs block even an accepted partial).
- **Retries:** missing cells are retried once automatically, in place (`retryMissingCells` — failed rows only, inside the
  existing runs, never a new run, never after freezing). An engine that answered nothing on an answered row is
  `engine_no_answer` and not retryable.
- **Missing answers are never invented.** The rate's denominator is answered cells only.
- Order is structural: a paying lead with no frozen baseline is refused a replay (`409 baseline_not_frozen`).
  `outreach_leads.baseline_audit_id` / `remeasure_audit_id` are claimed by database triggers and immutable once set.

## 4. Remeasurement (the replay)

- **Same 20 questions, same scored engines, same method, four weeks later.** `remeasureWeeksFor` always returns 4
  (the old eight-week new-domain exception was dropped 2026-10-02). `REMEASURE_OFFSET_DAYS = 28`. The due date is filled
  once, only where `remeasure_due_date` is NULL, when the baseline freezes; a trigger stops it being cleared.
- `fireDueRemeasures` (every audit-queue tick, up to 3 leads at a time) needs: a baseline pointer, no replay yet,
  **`service_terminated_at` is null (ended clients excluded)**, due date ≤ today, not archived, **not refunded**, money paid.
- The replay asks the baseline's run-1 asked set verbatim × 3 runs.
- **One replay per lead, ever** (`already_remeasured`; a partial unique index on `ai_audits(lead_id)` where purpose =
  remeasure).

## 5. Comparison and the guarantee decision

- **Matched comparison** (`compareMeasurements`, `src/lib/measurementCompare.ts`): totals are built only from questions
  asked on both sides, each side from its own frozen snapshot, with one naming rule on both sides (`cellNamed` — the answer
  text first, then the model's verdict, then the stored flag).
- **The number** = named answers ÷ answered answers, pooled over every matched question.
- **Noise band:** `NOISE_BAND_PP = 5` percentage points. A change of 5 points or less either way is "no movement".
- **"Gone up"** = `movement === 'improved'` = a pooled rise **strictly greater than 5 points** (`numberWentUp`). Inside the
  band, the refund applies (Paul's reading — never soften it to "unchanged").
- **Held results** (`remeasureResultsDecision`), in order: copy not approved → client on different terms → replay gave up
  (too few complete runs, or a run failed/capped) → incomparable → any matched question with fewer than 4 cells either side
  → **engine imbalance**. Held results are re-swept every 15 minutes.
- **Engine imbalance rule:** `ENGINE_BALANCE_MIN_RATIO = 0.9` — if either engine answered fewer than 90% as many matched
  cells on one side as on the other, the result is held (one engine having a bad day must not decide a refund).
- **Ended-client exclusion:** an ended or refunded client is never re-measured and never sent results.
- **The results email** (`_shared/remeasure-results.ts`) is claim-first on `remeasure_results_sent_at` (sends once) and is
  **HELD**: `REMEASURE_RESULTS_COPY_APPROVED = false` (`src/lib/remeasureResults.ts:38`) until Paul approves the exact copy
  in `docs/pre-sales-certification/final-certification.md` §8. Then a deliberate commit flips it.

**Guarantee logic** (identical on Build and Optimise): if the number has not gone up (beyond the noise band), the client
emails within **14 days of their results** (`REMEASURE_CLAIM_WINDOW_DAYS`, counted from `remeasure_results_sent_at`) and
gets the £99 back — **plus the first monthly payment if it has already been taken**; a valid claim ends the monthly
payments. Billing and the claim window are two separate clocks (billing starts 42 days after sign-up).

## 6. Service-truth hierarchy

From most to least trusted:

1. **CLIENT-CONFIRMED FACTS** — the client's onboarding answers (`services_list` / `services`) and verified build facts
   (`CLIENT_CONFIRMED_SOURCES = ['onboarding','build_facts']`).
2. **Verified onboarding / sales information** — the lead's `services_included` / `service_areas` recorded by Sales
   (useful, but not client-confirmed).
3. **Other trusted public evidence** — the client's own website (stored crawl) — `detected_*` suggestions only; it never
   merges into what the baseline measures.
4. **Discovery / generated suggestions** — never a source of services.

Rules (`resolveServiceTruth`, `src/lib/serviceScope.ts`; `siteServiceTruth.ts`; `clientFacts.ts`):

- The **highest-ranked non-empty list wins whole** — lists are never merged (a merge gives back a service the client
  deleted).
- The client's **"not offered"** list (`services_not_offered`, plus `must_not_say`) is a hard exclusion everywhere —
  baseline questions, Website Build pages, page generator.
- `clientFacts.ts` ranks other facts onboarding > client record > baseline > discovery > crawl; **rank breaks the tie but
  never hides the loser** — a differing lower value is raised as "client confirmation required".
- ⛔ **Discovery guesses must never become confirmed services.**

## Where older docs disagree with the code (verified 2026-10-05)

1. "Google AI Overview is recorded, never scored" — it is **not collected at all** now.
2. "8 weeks for a new-domain Build" — **always 4 weeks** since 2026-10-02 (some code comments still say 8).
3. "The full measure starts from `onBaselineFrozen`" — **not part of normal paid fulfilment**; never called.
4. "Judged on all 20" — strictly, judged on **matched** questions; in normal operation the replay asks the same 20, so it is
   the same thing.
5. A `capped` run counts as usable for the baseline freeze, but any capped replay run holds the results ("gave up").
6. Two stale code comments: `auditQuestionCounts.ts` ("12, NOT 10") and `create-ai-audit/index.ts` ("BASELINE_QUESTIONS
   (10)") — the constant is 20.
