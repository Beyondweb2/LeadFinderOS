/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FULL MEASUREMENT'S TWO DIALS — how many questions, and how many runs of each.

   ⛔ WHAT THIS PINS, AND WHY EACH CLAUSE IS HERE.

   1. THE BOUNDS ARE A REFUSAL, NOT A CLAMP, ON THE PATH AN OPERATOR DRIVES. Silently running 80 as
      20 is the fault this whole area is scarred by (the 10..75 dial over a generator capped at 20,
      and the 16-question baseline truncated to 12). So the server states a range and refuses
      outside it, and the test drives 81 and 4 rather than trusting the comment.

   2. THE RUN COUNT CONTROLS EXECUTION. A run count that lives only in the UI is the easiest
      possible version of this feature and a lie. The number chosen is written to
      ai_audits.baseline_target_runs at creation and advanceBaseline fires the repeats from THAT —
      asserted against the source, because there is no way to run the queue from here.

   3. THE REPLAY REPRODUCES THE BASELINE'S CONFIGURATION. It used to post no run count and take the
      server's default, which is right for a 3-run baseline and silently wrong for any other.

   4. THE OUTREACH HOOK IS UNTOUCHED. It is the volume path, one lever away from tripling the Apify
      bill, and none of this applies to it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  OUTREACH_HOOK_QUESTIONS, WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS,
  FULL_MEASURE_QUESTIONS, FULL_MEASURE_MIN_QUESTIONS, FULL_MEASURE_MAX_QUESTIONS,
  MEASUREMENT_MIN_RUNS, MEASUREMENT_MAX_RUNS, MEASUREMENT_DEFAULT_RUNS,
} from "../src/lib/auditQuestionCounts.ts";
import {
  clampFullMeasureQuestions, clampMeasurementRuns,
  isValidFullMeasureQuestionCount, isValidMeasurementRuns,
  expectedResponses, planGenerationBatches, fullMeasureAllocation,
} from "../src/lib/fullMeasure.ts";
import { reconcileSelection, selectAll, selectedQuestions } from "../src/lib/questionSelection.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const server = stripComments(read("supabase/functions/create-ai-audit/index.ts"));
const baseline = stripComments(read("supabase/functions/_shared/audit-baseline.ts"));
const wizard = stripComments(read("src/pages/AiAudit.tsx"));

console.log("── THE SHAPES PAUL ASKED FOR ACTUALLY RESOLVE ──");
/* questions × runs × engines, with two engines queued (AUDIT_ENGINES). Each of these is a
   configuration the operator can now dial in; the expected-response total is what the screen
   quotes before the button and what the run records afterwards. */
const ENGINES = 2;
for (const [q, r, expect] of [[1, 1, 2], [20, 3, 120], [40, 2, 160], [80, 3, 480]] as const) {
  ok(isValidFullMeasureQuestionCount(q) && isValidMeasurementRuns(r), `${q} questions × ${r} run(s) is a valid configuration`);
  ok(expectedResponses(q, r, ENGINES) === expect, `…and expects ${expect} AI responses (${q} × ${r} × ${ENGINES})`);
  ok(planGenerationBatches(q, 0).reduce((n, b) => n + b, 0) >= q, `…and ${q} questions can actually be generated`);
}
ok(expectedResponses(80, 3, 1) === 240, "one engine enabled halves the total — the engine count is a factor, not a constant");
ok(expectedResponses(0, 3, 2) === 0 && expectedResponses(20, 0, 2) === 0, "nothing selected or no runs expects nothing");

console.log("\n── AND THE ONES HE ASKED TO BE IMPOSSIBLE ──");
ok(!isValidFullMeasureQuestionCount(81), "81 questions is not a valid count");
ok(!isValidFullMeasureQuestionCount(0), "0 questions is not a valid count");
ok(!isValidMeasurementRuns(4), "4 runs is not a valid run count");
ok(!isValidMeasurementRuns(0), "0 runs is not a valid run count");
ok(!isValidFullMeasureQuestionCount(20.5) && !isValidMeasurementRuns(2.5), "a fraction is not a count");
ok(!isValidFullMeasureQuestionCount("20" as unknown) && !isValidMeasurementRuns("3" as unknown), "a numeric STRING is not a count — the body is untrusted JSON");
/* The clamps exist for a garbled persisted value, NOT as the validation. Both behaviours are
   pinned, because a clamp quietly standing in for a refusal is how silent truncation returns. */
ok(clampFullMeasureQuestions(81) === FULL_MEASURE_MAX_QUESTIONS && clampFullMeasureQuestions(0) === FULL_MEASURE_MIN_QUESTIONS, "the clamp pulls an out-of-range count to the bound");
ok(clampFullMeasureQuestions(undefined) === FULL_MEASURE_QUESTIONS, "junk clamps to the DEFAULT, not to a bound");
ok(clampMeasurementRuns(4) === MEASUREMENT_MAX_RUNS && clampMeasurementRuns(0) === MEASUREMENT_MIN_RUNS, "the run clamp pulls to the bound");
ok(clampMeasurementRuns(undefined) === MEASUREMENT_DEFAULT_RUNS, `an absent run count is ${MEASUREMENT_DEFAULT_RUNS}, the default`);

console.log("\n── SOURCE: THE SERVER VALIDATES INDEPENDENTLY OF THE SCREEN ──");
ok(/error: "question_count_out_of_range"/.test(server), "an out-of-range question count is refused by name");
ok(/error: "runs_out_of_range"/.test(server), "an out-of-range run count is refused by name");
ok(/error: "too_many_questions"/.test(server), "a supplied list over the cap is refused rather than truncated");
ok(/if \(isMeasurement && droppedQuestions\.length\)/.test(server), "…and that refusal is keyed on the FULL MEASURE, so no automation's replay is refused for a cap it cannot control");
ok(/isValidFullMeasureQuestionCount|isValidMeasurementRuns/.test(server), "the server validates with the shared predicates, not with inline numbers");
ok(!/\b(80|81)\b/.test(server.split("const MEASUREMENT_MIN_QUESTION_COUNT")[0] ?? ""), "the ceiling is never written as a literal above the constants");

console.log("\n── SOURCE: THE RUN COUNT CONTROLS EXECUTION, NOT JUST THE SUMMARY ──");
ok(/const measurementRuns = clampMeasurementRuns\(rawRuns\);/.test(server), "the chosen run count is resolved once, from the request");
ok(/: \(isMeasurement \|\| isRemeasure\) \? measurementRuns/.test(server),
   "…and it IS baselineTargetRuns for a measurement and a replay — not the old hardcoded MEASUREMENT_RUNS");
ok(/if \(baselineTargetRuns > 1 \|\| isMeasurement \|\| isRemeasure\) auditRow\.baseline_target_runs = baselineTargetRuns;/.test(server),
   "…and it is STORED even when it is 1, so a one-run measure is distinguishable from an unconfigured one");
ok(/const target = Number\(audit\?\.baseline_target_runs \?\? 0\);/.test(baseline),
   "advanceBaseline drives the repeats from the stored column — the same number the operator chose");
ok(/\.gt\("baseline_target_runs", 1\)/.test(baseline),
   "the stalled-baseline sweep filters >1 in the QUERY, so stored 1s cannot starve its window");
ok(/targetRuns: measurementRuns,/.test(server), "judgeRemeasure is told the runs this audit will actually do");
ok(/expected_responses: expectedResponses\(/.test(server), "the run records its expected response total with the shared function");

console.log("\n── SOURCE: A FROZEN BASELINE REMEMBERS ITS CONFIGURATION, AND THE REPLAY REUSES IT ──");
ok(/runs: BASELINE_RUNS,/.test(baseline) && /engines: \[\.\.\.SCORED_ENGINES\],/.test(baseline) && /askedQuestions: askedAll,/.test(baseline),
   "the frozen contract records the run count, the engines and the asked set in queued ORDER");
const fire = baseline.slice(baseline.indexOf("export async function fireDueRemeasures"), baseline.indexOf("export async function sweepStalledBaselines"));
ok(/baseline_target_runs/.test(fire), "the replay READS the baseline's run count");
ok(/runs: clampMeasurementRuns\(b!\.baseline_target_runs \?\? MEASUREMENT_DEFAULT_RUNS\),/.test(fire),
   "…and sends it, so a 2-run baseline is re-measured over 2 runs and never silently over 3");
ok(/questions: plan\.questions,/.test(fire) && /question_count: plan\.asked,/.test(fire),
   "…alongside the baseline's asked set, verbatim and in order — unchanged");
ok(/if \(!providedQuestions\?\.length\) return await refuse\("remeasure_requires_questions"/.test(server),
   "a replay with no supplied question set is still refused outright");

console.log("\n── SOURCE: THE OUTREACH HOOK AND THE QUICK AUDIT ARE UNTOUCHED ──");
ok(OUTREACH_HOOK_QUESTIONS === 3, `the outreach hook is still ${OUTREACH_HOOK_QUESTIONS} questions`);
ok(WIZARD_MIN_QUESTIONS === 3 && WIZARD_MAX_QUESTIONS === 5, "the quick wizard is still 3–5 questions");
ok(/const MIN_QUESTION_COUNT = WIZARD_MIN_QUESTIONS;/.test(server) && /const DEFAULT_QUESTION_COUNT = OUTREACH_HOOK_QUESTIONS;/.test(server),
   "the server's ordinary bounds still come from the hook and wizard constants");
ok(/\.\.\.\(fullMode \? \{ purpose: 'measurement', skip_seo: true, runs: runCount \} : \{\}\)/.test(wizard),
   "the wizard sends `runs` ONLY in full mode — a quick audit's body is unchanged");
ok(/const runCount = fullMode \? clampMeasurementRuns\(fullRuns\) : 1;/.test(wizard),
   "…and a quick audit is one run, stated rather than implied");
ok(/\{\.\.\.\(fullMode \? \{ selected, onToggle: toggleQuestion \} : \{\}\)\}/.test(wizard),
   "the question editor gets a selection column ONLY in full mode");

console.log("\n── THE SELECTION SURVIVES EDITING, WHICH IS THE PART THAT SILENTLY GOES WRONG ──");
const qs = ["a", "b", "c", "d"];
ok(selectedQuestions(qs, selectAll(qs)).length === 4, "a fresh set is fully selected");
ok(selectedQuestions(qs, new Set([0, 2])).join(",") === "a,c", "only the ticked questions are returned, in list order");
ok(selectedQuestions(["a", "   ", "c"], selectAll(["a", "   ", "c"])).join(",") === "a,c", "a blank question is never queued, ticked or not");
/* An in-place edit keeps the indexes. */
ok([...reconcileSelection(qs, ["a", "B", "c", "d"], new Set([1, 3]))].sort().join(",") === "1,3", "editing a question in place keeps the selection on it");
/* A removal shifts everything after it — the case that, done wrong, looks like the checkboxes
   ticking themselves. Remove index 1 ("b"): the selection {0,2,3} must become {0,1,2}. */
ok([...reconcileSelection(qs, ["a", "c", "d"], new Set([0, 2, 3]))].sort((x, y) => x - y).join(",") === "0,1,2",
   "removing a question shifts every later selection down by one");
ok([...reconcileSelection(qs, ["a", "c", "d"], new Set([1]))].length === 0, "removing the only selected question leaves nothing selected");
/* An append is selected, because a question you just added is one you meant to ask. */
ok([...reconcileSelection(qs, [...qs, ""], new Set([0]))].sort((x, y) => x - y).join(",") === "0,4", "an added question arrives selected");
/* A paste is a different list. Selecting all of it is the safe failure: too many is visible in
   the count and refused at 81; too few would run a smaller audit than anyone chose. */
ok([...reconcileSelection(qs, ["x", "y"], new Set([0]))].sort((x, y) => x - y).join(",") === "0,1", "a paste that replaces the list selects all of it");
ok([...reconcileSelection([], ["x", "y", "z"], new Set())].length === 3, "the first generated set arrives fully selected");

console.log("\n── THE ALLOCATOR SPREADS THE CHOSEN SIZE, NOT A FIXED ONE ──");
const at80 = fullMeasureAllocation("Huntingdon", ["St Neots", "Cambridge"], 80);
ok(at80.allocation.reduce((n, a) => n + a.questions, 0) === 80, "80 across three towns sums to exactly 80");
const at1 = fullMeasureAllocation("Huntingdon", [], 1);
ok(at1.allocation.length === 1 && at1.allocation[0].questions === 1, "a single-question measure allocates one question to the home town");
ok(fullMeasureAllocation("Huntingdon", []).allocation[0].questions === FULL_MEASURE_QUESTIONS,
   "…and the default argument is unchanged, so every existing caller allocates exactly what it did before");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
