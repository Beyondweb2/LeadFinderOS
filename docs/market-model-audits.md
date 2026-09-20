# Market-model audits — local / national / hybrid (2026-09-20)

The record behind `src/lib/marketModel.ts`. The rules it taught are in CLAUDE.md §6; this is the
story.

## The fault

The manual audit wizard asked **"How do clients work with you?"** and offered *They come to my
premises / I work remotely / A mix of both*. That is a question about **delivery**, and the answer
was used as **geography**. Two things broke because of it.

**A national business could not describe itself.** Findable is a UK national business that serves
UK local businesses remotely. On that wording it either claimed to work remotely (true, but the
option was framed as a delivery method rather than a market) or fell to the default, and the default
path required a town, injected it into every question and judged the result in a town the business
does not trade in. The same applies to SaaS, agencies, consultants, remote accountants, nationwide
services and ecommerce.

**And the national path, once taken, produced one question.** The national prompt block said:

> EVERY question must be a SPECIFIC service or problem, qualified by AUDIENCE and national scope.
> Use the pattern "[specific service] for [audience] [country]" …

One sentence pattern. A 20-question national set was twenty rewrites of it; a 40-question set would
have been forty. The local path had a town to vary and a trade vocabulary to spread across, so its
sets looked varied by accident of having somewhere to go. National had neither.

**Hybrid did not exist at all.** `business_scope: 'hybrid'` fell through to the model's own
"classify this from the location" branch, which saw a town and produced a purely local set. Picking
"a mix of both" changed nothing measurable. Worse, `dropMissingTown` — which demands every question
name the town — ran for hybrid, so any wider-market question the model did produce was rejected and
topped up with a local template. The guard would have deleted the feature even if the prompt had
asked for it.

## The model

Three models, about the **market**, not the delivery:

| | Meaning | Town | Audience |
|---|---|---|---|
| `local` | chosen mainly for proximity to a town or area | required | not asked — the buyer is whoever is in the town |
| `national` | chosen across a country/market; proximity is irrelevant | never | asked, and used |
| `hybrid` | a real local market AND a wider one | required | asked, and used |

`townRequiredFor` / `audienceUsefulFor` are the one implementation of those two columns, shared by
the wizard's "can I continue" and the server's `local_scope_needs_town` refusal, so the screen and
the refusal cannot disagree.

## The national intent mix

Seven intents, weighted, split by largest remainder across whatever count was asked for:

| Intent | Weight | What it measures |
|---|---|---|
| provider / commercial | 3 | who supplies this, asked as a buyer |
| problem / need | 3 | the symptom in the buyer's own words |
| service-specific | 3 | one named service or deliverable |
| audience-specific | 2 | the same need qualified by who the buyer is |
| category discovery | 2 | the buyer naming the category rather than a firm |
| comparison / alternative | 1 | weighing options |
| terminology / informational | 1 | the term itself, only where the answer names suppliers |

At 40 that is 8 / 8 / 8 / 5 / 5 / 3 / 3. Below eight questions the mix takes the highest-weight
intents whole rather than fragmenting into sevenths — at n=3 that is three different intents of one
each, which is what a three-question set wants. An intent that rounds to zero is dropped rather than
given a token question: "do not force every category if inappropriate".

Hybrid splits the count 50/50, local taking the odd one (12 → 6/6, 3 → 2/1), and the prompt says
explicitly that the two halves must not be the same question with and without the town.

## The three guards that had to give way

Each is opt-in and defaults to off, so every caller that has not been updated generates byte-for-byte
what it generated before.

**`dropMissingTown` is skipped for hybrid.** It is the guard that demanded a town of every question.
`qualifyPlace` still runs, and it returns any question that does not mention the town untouched — so
the local half is still pinned to `<town> UK` and the wider half is left alone. A **null** scope keeps
the old behaviour: the model classified it, so it was told to put the town in.

**`offTradeReason` gained a third door.** It was measured and tuned against 3,198 local questions —
it rejects 118 and throws away one good one — and it works by asking whether the question carries the
trade's own word or a known intent for that trade. A national business's best questions carry
neither: *"who can help if chatgpt recommends my competitors instead of my business"* names no
service and appears in no `TRADE_INTENTS` list. The third door is the operator's own services/topics,
sectors and audience, and it is passed for **national and hybrid only**. Local keeps the tight guard.

⚠️ Short words match **exactly** in that door. `contentTokens` drops anything under four characters,
which silently threw away every acronym an operator actually types — "SEO", "GEO", "AI" — and those
are precisely the words a national business's questions are built from. Exact match only, so a
two-letter token cannot match half the language.

**The deterministic fallback templates take the same intent spread.** The old national fallback was
thirteen `[trade] for [audience] uk` lines — the fallback's own version of the fault. A fallback fires
on any generation failure and the audit still completes, so an OpenAI outage would have silently
turned a national audit into the thing this change exists to remove.

## One context, two requests

`auditQuestionContext.ts` is the single business-context shape. The wizard used to build the preview
body from it and then **hand-write a second, different body on confirm** — which is how a field could
exist on the screen, shape the questions the operator reviews, and never reach the stored audit.
`buildAuditPreviewRequest` and `buildAuditRunRequest` are now built off the same object, and the
model decides which fields are even sent (a local audit sends no audience; a national one sends no
service areas), enforced in the builder rather than only in the wizard.

## No migration

`business_scope` already existed on `ai_audits`. Services, specialisms and sectors merge into the
`specialisms` free-text column the audit row already has. The target audience is a question-shaping
**input**, not a stored fact — the shape of the question set is the thing it produces, and that IS
stored, as the questions.

## What was deliberately not changed

- **The outreach hook.** Adaptive 1→3, one run, explicitly `hook_audit`. It sends no
  `business_scope`, and `marketContext` is null without one, so nothing about it moved.
- **The paid baseline.** 20 × 3, frozen, replayed verbatim at day 28. `providedQuestions`
  short-circuits generation entirely on a repeat, so a re-measurement cannot acquire a new question
  shape whatever this file says.
- **`FULL_MEASURE_QUESTIONS` is still 20.** The brief asked for a "meaningful 40-question set" and
  the generator honours 40 (`GENERATOR_ABSOLUTE_MAX_QUESTIONS`), but the full measure's count is a
  **spend** policy — raising it to 40 doubles the Apify bill on every measure. That is Paul's
  decision, not a code change. The wizard still offers 3–5 quick, or Full at 20.
- **The multi-town area loop** passes `null` for the market context and forces `"local"` per area: a
  per-area set is local by construction.

## Discovery — the third manual mode (2026-09-20, follow-up)

`DISCOVERY_QUESTIONS = 40`, `DISCOVERY_RUNS = 1`, `audit_purpose = 'discovery'`. A manual-only
breadth scan: where a business appears, where it is missing, who keeps getting named instead, which
sources the engines lean on. It uses the market-model context above, so national gets the seven-intent
spread with no town and hybrid gets its split.

**Why a third mode rather than raising the count.** Paul's decision: raising
`FULL_MEASURE_QUESTIONS` to 40 doubles the Apify bill on every paying client's measurement, and a
measurement is not what was wanted. Discovery buys **coverage** with the runs a baseline spends on
**confidence**.

⛔ **It is not a measurement and must never be read as one.** One ask per question per engine is a
single sample, and the variance here is brutal — one business swung 0 → 0.5 → 0 → 0.5 → 0.6 across
five identical runs with no work done. A gap discovery finds is somewhere to look, not a finding.
The wizard's own explainer says so in those words.

⛔ **The marker is the PURPOSE, never the count.** `GENERATOR_ABSOLUTE_MAX_QUESTIONS` is also 40, so
a count-based marker would turn any caller asking for the maximum into a discovery audit. The test
asserts no branch anywhere reads `question_count === 40`.

⛔ **Exactly one `ai_audit_run`, and the mechanism is an ABSENCE.** `baselineTargetRuns` is what
creates extra runs; `isDiscovery` does not appear in that expression, so it stays 0. The test
asserts the absence from that one expression rather than asserting "runs === 1" somewhere else,
because the absence is the mechanism. A provider failure retries queue work inside that run.

What discovery does NOT do: no money-question split (its two-call directive fights the counted
intent spread), no SEO scan (`seoScanAllowed` is a positive allowlist of `baseline`), no reuse of
an existing audit on the lead (40 questions bolted onto an old 3-question hook run is not a
discovery scan), and no hook logic — `isHookAudit` requires `ORDINARY_AUDIT_PURPOSE`, so a discovery
report can never render the "Quick AI Visibility Check" eyebrow. `capHeads` IS on: 40 is the count
most able to fill itself with one question wearing forty adjectives.

**No migration.** `ai_audits.audit_purpose` is plain nullable `text` with no CHECK constraint —
verified against the live database on 2026-09-20 before writing the new value.

⚠️ **A placement lesson.** `!isDiscovery` was first added between `!isRemeasure` and `!freshAudit`
in the per-lead reuse condition, which broke `first-reply-audit-reliability.test.ts` — it pins the
tail `&& !isRemeasure && !freshAudit && !isHookAudit) {` literally, to prove `fresh_audit` touches
that condition and nothing else. Moved to sit beside `!isMeasurement`, which is where it belongs
anyway: same exemption, same reason.

## The 0/5 fault — measured, 2026-09-20

Paul ran the first Findable discovery audit. It **worked**: audit `9a0c2b79`, run `5059b156`,
40 questions queued, all 40 done, run `complete`. Eleven minutes later a second run appeared showing
**0/5** and seeming to stall; he stopped it.

What the database says:

| run | created | rows | status |
|---|---|---|---|
| `5059b156` | 04:59:02 | **40**, all `done` | complete |
| `a26bdfdd` | 05:10:50 | **5** (2 done, 3 cancelled) | cancelled |

Run 2's five questions are a subset of run 1's forty. It was a **re-run** of the same audit, and
`confirmReRun` in the wizard decided what to send like this:

```
const curIsMeasurement = is_measurement === true || baseline_target_runs > 1;
body: { audit_id, questions: clean, ...(curIsMeasurement ? { purpose: 'measurement' } : {}) }
```

A discovery audit is **neither** of those things, so no purpose was sent, `MAX_QUESTIONS` fell to the
5-question wizard cap, and `providedQuestions = supplied.slice(0, MAX_QUESTIONS)` silently cut 40 to
5. The "0/5" was truthful — that run really did hold five rows. Nothing was wrong with the progress
UI, the queue, the processor or the generator.

⛔ **THIS WAS THE THIRD INSTANCE OF ONE FAULT.** Baseline 10→5, measurement 40→20, discovery 40→5 —
and the comment sitting on the broken line *described the first two*. Every previous fix taught a
CALLER to declare itself, which is a guard keyed to today's instances (CLAUDE.md §4). The caller
cannot be the source of truth: **the audit row already knows what it is.**

**The fix.** `create-ai-audit` reads the stored `audit_purpose` for any explicit `audit_id` and
derives `storedCeiling` from it; `MAX_QUESTIONS = Math.max(REQUESTED_MAX_QUESTIONS, storedCeiling)`,
so an inherited cap can only ever RAISE the limit to what that audit was created at, and only the
CAP moves — `isMeasurement`/`isBaseline` still come from the request, so no other per-purpose
behaviour can shift under a repeat. The browser now sends `{ audit_id, questions }` and nothing else.

`advanceBaseline` carried the same shape (`free_check ? free_check : is_measurement ? measurement :
baseline`), which would have posted a discovery repeat as `"baseline"` and capped its 40 at 20. It
now sends whatever purpose is stored, with the two-column reading kept only as the legacy fallback
for rows written before `audit_purpose` existed.

**Provider spend on the incident:** 42 questions answered (40 + 2), about $0.44 of Apify. **Stop
worked**: queue rows insert as `pending`, Stop cancels `['pending','running']`, and the processor's
claim is atomic on `status = 'pending'`, so a cancelled row can never be picked up. The audit is left
in place as evidence.

## Discovery runs: 1, 2 or 3

`DISCOVERY_MAX_RUNS = 3`, default `DISCOVERY_RUNS = 1`, chosen in the wizard and **clamped on the
server** — the browser states a preference, it does not grant one. `run_count` is its own field and
is never inferred from the question count.

Runs 2 and 3 go through `advanceBaseline`, the same mechanism the paid baseline and the free check
already use, so they replay the **stored** set: `providedQuestions` short-circuits generation
entirely, which makes "no regeneration" structural rather than a promise. Three runs of the same 40
is what turns a per-question result into "named 2 of 3" — fragmentation, which is what discovery is
looking for.

3 and not 5: cost is linear (40 × 3 = 120 Apify questions on one audit, against a shared monthly
cap), and the paid baseline's own confidence number is 3.

## Files

`src/lib/marketModel.ts` (new) · `src/lib/auditQuestionContext.ts` · `src/lib/seedGuard.ts` ·
`src/pages/AiAudit.tsx` · `supabase/functions/create-ai-audit/index.ts` ·
`scripts/market-model-audits.test.ts` (new) · `scripts/head-term-cap.test.ts`

Discovery adds: `src/lib/auditQuestionCounts.ts` · `src/lib/auditKind.ts` ·
`src/components/audit/AuditPills.tsx` · `scripts/discovery-audit.test.ts` (new).

The 0/5 fix and the run selector add: `supabase/functions/_shared/audit-baseline.ts`.

Deployed: `create-ai-audit`, `paid-baseline`, `process-ai-audit-queue`, `render-remeasure-results`,
`stripe-webhook` — the last three because they reach `seedGuard.ts`.
