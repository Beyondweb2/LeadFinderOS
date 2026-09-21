/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DISCOVERY'S TWO DIALS — how many questions, and how many runs of each.

   ⛔ WHAT THIS PINS, AND WHY EACH CLAUSE IS HERE.

   1. THE BOUNDS ARE A REFUSAL, NOT A CLAMP, ON THE PATH AN OPERATOR DRIVES. Silently running 80 as
      40 is the fault this area is scarred by — the 10..75 full-measure dial over a generator
      capped at 20, a 16-question baseline truncated to 12, a 40-question discovery re-run sliced
      to 5. So the server states a range and refuses outside it, and this test drives 81 and 4
      rather than trusting the comment.

   2. A CEILING ABOVE ONE MODEL CALL IS REACHED BY BATCHING, NOT BY HOPE. 80 is only an honest
      number because planGenerationBatches splits it into calls the generator will answer.

   3. THE RUN COUNT CONTROLS EXECUTION. A run count that lives only in the UI is the easiest
      possible version of this feature and a lie. discoveryRuns feeds baselineTargetRuns and
      advanceBaseline fires the repeats from the stored column — asserted against source, because
      there is no way to run the queue from here.

   4. THE PAID METHODOLOGY IS UNTOUCHED. The full measure stays 20 x 3, the baseline stays
      BASELINE_QUESTIONS x BASELINE_RUNS with its frozen set, the replay still carries that set
      verbatim, and the outreach hook is not in this feature at all. Paul, 2026-09-21: discovery is
      where the dials live precisely so none of that has to move.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  OUTREACH_HOOK_QUESTIONS, WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS,
  DISCOVERY_QUESTIONS, DISCOVERY_MIN_QUESTIONS, DISCOVERY_MAX_QUESTIONS,
  DISCOVERY_MIN_RUNS, DISCOVERY_MAX_RUNS, DISCOVERY_DEFAULT_RUNS,
  FULL_MEASURE_QUESTIONS, BASELINE_QUESTIONS, BASELINE_RUNS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from "../src/lib/auditQuestionCounts.ts";
import {
  clampDiscoveryQuestions, clampDiscoveryRuns,
  isValidDiscoveryQuestionCount, isValidDiscoveryRuns,
  expectedResponses, planGenerationBatches,
} from "../src/lib/auditPlan.ts";
import { reconcileSelection, selectAll, selectedQuestions } from "../src/lib/questionSelection.ts";
import { buildAuditRunRequest } from "../src/lib/auditQuestionContext.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const server = stripComments(read("supabase/functions/create-ai-audit/index.ts"));
const baseline = stripComments(read("supabase/functions/_shared/audit-baseline.ts"));
const ui = stripComments(read("src/pages/AiAudit.tsx"));

console.log("── THE SHAPES PAUL ASKED FOR ACTUALLY RESOLVE ──");
/* Two engines are queued (AUDIT_ENGINES), so the expected-response total is questions x runs x 2.
   Each of these is a configuration the operator can now dial in. */
const ENGINES = 2;
for (const [q, r, expect] of [[1, 1, 2], [1, 3, 6], [40, 1, 80], [40, 2, 160], [40, 3, 240], [80, 3, 480]] as const) {
  ok(isValidDiscoveryQuestionCount(q) && isValidDiscoveryRuns(r), `${q} question(s) × ${r} run(s) is a valid discovery configuration`);
  ok(expectedResponses(q, r, ENGINES) === expect, `…and expects ${expect} AI responses (${q} × ${r} × ${ENGINES})`);
  ok(planGenerationBatches(q, 0).reduce((n, b) => n + b, 0) >= q, `…and ${q} question(s) can actually be generated`);
}
ok(expectedResponses(80, 3, 1) === 240, "one engine enabled halves the total — the engine count is a factor, not a constant");
ok(expectedResponses(0, 3, 2) === 0 && expectedResponses(40, 0, 2) === 0, "nothing selected, or no runs, expects nothing");

console.log("\n── AND THE ONES HE ASKED TO BE IMPOSSIBLE ──");
ok(!isValidDiscoveryQuestionCount(81), "81 questions is not a valid count");
ok(!isValidDiscoveryQuestionCount(0), "0 questions is not a valid count");
ok(!isValidDiscoveryRuns(4), "4 runs is not a valid run count");
ok(!isValidDiscoveryRuns(0), "0 runs is not a valid run count");
ok(!isValidDiscoveryQuestionCount(40.5) && !isValidDiscoveryRuns(2.5), "a fraction is not a count");
ok(!isValidDiscoveryQuestionCount("40" as unknown) && !isValidDiscoveryRuns("3" as unknown),
   "a numeric STRING is not a count — the body is untrusted JSON");
/* The clamps exist for a garbled persisted value, NOT as the validation. Both behaviours are
   pinned, because a clamp quietly standing in for a refusal is how silent truncation returns. */
ok(clampDiscoveryQuestions(81) === DISCOVERY_MAX_QUESTIONS && clampDiscoveryQuestions(0) === DISCOVERY_MIN_QUESTIONS,
   "the clamp pulls an out-of-range count to the bound");
ok(clampDiscoveryQuestions(undefined) === DISCOVERY_QUESTIONS, "junk clamps to the DEFAULT, not to a bound");
ok(clampDiscoveryRuns(4) === DISCOVERY_MAX_RUNS && clampDiscoveryRuns(0) === DISCOVERY_MIN_RUNS, "the run clamp pulls to the bound");
ok(clampDiscoveryRuns(undefined) === DISCOVERY_DEFAULT_RUNS, `an absent run count is ${DISCOVERY_DEFAULT_RUNS}, the default`);

console.log("\n── 80 IS HONEST BECAUSE THE GENERATION IS BATCHED ──");
for (const target of [1, 40, 41, 80]) {
  const batches = planGenerationBatches(target, 0);
  ok(batches.length > 0 && batches.every((b) => b <= GENERATOR_ABSOLUTE_MAX_QUESTIONS),
     `${target} plans to ${batches.join("+")} — every call at or under ${GENERATOR_ABSOLUTE_MAX_QUESTIONS}`);
  ok(batches.reduce((n, b) => n + b, 0) >= target, `…asking for at least the target (${target})`);
}
ok(planGenerationBatches(40, 0).length === 1, "the default 40 is still ONE call — unchanged for every existing discovery audit");
ok((server.match(/await generateDiscoverySet\(/g) ?? []).length === 2,
   "…and so does the preview, which IS discovery generation step — both, or the review shows a set the run does not");
ok(/fillGenerated\("discovery preview"/.test(server), "the preview fills to target too, so 80 reviewed is 80 offered");
ok(/coverageDirective\(out, businessType\)/.test(server), "each batch is steered off the questions already produced, not left to paraphrase them");

console.log("\n── SOURCE: THE SERVER VALIDATES INDEPENDENTLY OF THE SCREEN ──");
ok(/error: "question_count_out_of_range"/.test(server), "an out-of-range question count is refused by name");
ok(/error: "runs_out_of_range"/.test(server), "an out-of-range run count is refused by name");
ok(/error: "too_many_questions"/.test(server), "a supplied list over the cap is refused rather than truncated");
ok(/if \(isDiscovery && droppedQuestions\.length\)/.test(server),
   "…and that refusal is keyed on DISCOVERY, so no automation's replay is refused for a cap it cannot control");
ok(/isValidDiscoveryQuestionCount|isValidDiscoveryRuns/.test(server), "the server validates with the shared predicates, not inline numbers");
ok(/const DISCOVERY_MAX_QUESTION_COUNT = DISCOVERY_MAX_QUESTIONS;/.test(server), "its cap derives from the shared constant");

console.log("\n── SOURCE: THE RUN COUNT CONTROLS EXECUTION, NOT JUST THE SUMMARY ──");
ok(/const discoveryRuns = isDiscovery \? clampDiscoveryRuns\(body\.run_count\) : 0;/.test(server),
   "the chosen run count is resolved once, from its own field");
ok(/isDiscovery \? discoveryRuns/.test(server), "…and it IS baselineTargetRuns for a discovery audit");
ok(/const target = Number\(audit\?\.baseline_target_runs \?\? 0\);/.test(baseline),
   "advanceBaseline drives the repeats from the stored column — the same number the operator chose");
ok(/expected_responses: expectedResponses\(/.test(server), "the run records its expected total with the shared function");
ok(/runResults\.discovery_config/.test(server), "…alongside the questions and runs it was configured with");

console.log("\n── SOURCE: THE PAID METHODOLOGY DID NOT MOVE ──");
ok(FULL_MEASURE_QUESTIONS === 20, `the full measure is still ${FULL_MEASURE_QUESTIONS} questions`);
ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3, "the paid baseline is still 20 × 3");
ok(/const MEASUREMENT_MIN_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;/.test(server)
   && /const MEASUREMENT_MAX_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;/.test(server)
   && /const MEASUREMENT_DEFAULT_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;/.test(server),
   "the full measure is STILL one fixed number on the server — min, max and default alike");
ok(/const MEASUREMENT_RUNS = 3;/.test(server), "and still three runs");
ok(/\(isMeasurement \|\| isRemeasure\) \? MEASUREMENT_RUNS/.test(server),
   "the measurement and the day-28 replay still take MEASUREMENT_RUNS — no dial reached them");
ok(/baseline_target_runs: BASELINE_RUNS,/.test(baseline), "startPaidBaseline still asks for BASELINE_RUNS");
ok(/questions: approvedQuestions,/.test(baseline), "…with the operator-approved set, frozen");
const fire = baseline.slice(baseline.indexOf("export async function fireDueRemeasures"), baseline.indexOf("export async function sweepStalledBaselines"));
ok(/questions: plan\.questions,/.test(fire) && /question_count: plan\.asked,/.test(fire),
   "the replay still carries the baseline's asked set verbatim and in order");
ok(/purpose: "remeasure",/.test(fire), "…as a remeasure, unchanged");
ok(!/discovery/i.test(fire), "and nothing about discovery reaches the replay");

console.log("\n── SOURCE: THE OUTREACH HOOK AND THE QUICK WIZARD ARE UNTOUCHED ──");
ok(OUTREACH_HOOK_QUESTIONS === 3, `the outreach hook is still ${OUTREACH_HOOK_QUESTIONS} questions`);
ok(WIZARD_MIN_QUESTIONS === 3 && WIZARD_MAX_QUESTIONS === 5, "the quick wizard is still 3–5 questions");
ok(/const MIN_QUESTION_COUNT = WIZARD_MIN_QUESTIONS;/.test(server) && /const DEFAULT_QUESTION_COUNT = OUTREACH_HOOK_QUESTIONS;/.test(server),
   "the server's ordinary bounds still come from the hook and wizard constants");
ok(/\.\.\.\(discoveryMode \? \{ runCount: discoveryRuns \} : \{\}\)/.test(ui),
   "the wizard sends a run count ONLY in discovery mode — a quick or full body is unchanged");
ok(/const runCount = discoveryMode \? clampDiscoveryRuns\(discoveryRuns\) : 1;/.test(ui),
   "…and every other mode is one run, stated rather than implied");
ok(/\{\.\.\.\(discoveryMode \? \{ selected, onToggle: toggleQuestion \} : \{\}\)\}/.test(ui),
   "the question editor gets a selection column ONLY in discovery mode");

console.log("\n── THE UI CANNOT START AN INVALID AUDIT, AND ITS NUMBERS ARE LIVE ──");
ok(/disabled=\{running \|\| tooFewQuestions \|\| tooManyQuestions\}/.test(ui), "Confirm & run is disabled with nothing selected, or over the cap");
ok(/const tooFewQuestions = runQuestions\.length < 1;/.test(ui), "…on the SELECTED list, not the generated one");
ok(/if \(clean\.length === 0\)/.test(ui), "…and confirmAndRun refuses an empty set even if the button were reachable");
ok(/const runQuestions = useMemo\(/.test(ui) && /\[discoveryMode, questions, selected\]/.test(ui),
   "the run list recomputes on every selection change, so the count and the total update live");
ok(/const totalResponses = expectedResponses\(runQuestions\.length, runCount, engineTotal\);/.test(ui),
   "…and the expected total is derived from it and from the chosen run count, not stored");
ok(/questions selected/.test(ui), "the live selected count is rendered");
ok(/Expected AI responses/.test(ui), "…beside the expected-response total");
ok(/questionCount: clean\.length,/.test(ui), "the count POSTED is the count being posted, never the wizard's target");

/* ⛔ A STATED RUN COUNT MUST TRAVEL, AND 1 IS A STATED RUN COUNT. buildAuditRunRequest omitted
   run_count unless it was > 1, which was correct only while the server's absent-default was a
   single run. The moment DISCOVERY_DEFAULT_RUNS became 3, "1" travelling as an absence came back
   as three runs and three times the Apify bill — the absent-value-as-a-real-one fault, on a
   spending path. These assert the WIRE, not the screen. */
const wireCtx = {
  business_name: "Acme Locks", business_category: "locksmith", website: "https://acme.test",
  primary_location: "Wisbech", services: [], service_areas: [], specialisms: [], country: "GB",
};
const wireQs = ["who fixes locks in Wisbech?"];
const wireFor = (runCount: number) =>
  buildAuditRunRequest(wireCtx, { questionCount: 1, purpose: "discovery", questions: wireQs, runCount });
for (const n of [DISCOVERY_MIN_RUNS, 2, DISCOVERY_MAX_RUNS]) {
  ok(wireFor(n).run_count === n, `a discovery run count of ${n} is SENT to the server as run_count=${n}`);
}
ok(buildAuditRunRequest(wireCtx, { questionCount: 1, questions: wireQs }).run_count === undefined,
   "…while a caller that never had the dial still sends nothing, and gets the server's default");

console.log("\n── THE SELECTION SURVIVES EDITING, WHICH IS THE PART THAT SILENTLY GOES WRONG ──");
const qs = ["a", "b", "c", "d"];
ok(selectedQuestions(qs, selectAll(qs)).length === 4, "a fresh set is fully selected");
ok(selectedQuestions(qs, new Set([0, 2])).join(",") === "a,c", "only the ticked questions are returned, in list order");
ok(selectedQuestions(["a", "   ", "c"], selectAll(["a", "   ", "c"])).join(",") === "a,c", "a blank question is never queued, ticked or not");
ok([...reconcileSelection(qs, ["a", "B", "c", "d"], new Set([1, 3]))].sort().join(",") === "1,3", "editing a question in place keeps the selection on it");
/* Remove index 1 ("b"): a selection of {0,2,3} must become {0,1,2}. Done wrong, this looks like
   the checkboxes ticking themselves. */
ok([...reconcileSelection(qs, ["a", "c", "d"], new Set([0, 2, 3]))].sort((x, y) => x - y).join(",") === "0,1,2",
   "removing a question shifts every later selection down by one");
ok([...reconcileSelection(qs, ["a", "c", "d"], new Set([1]))].length === 0, "removing the only selected question leaves nothing selected");
ok([...reconcileSelection(qs, [...qs, ""], new Set([0]))].sort((x, y) => x - y).join(",") === "0,4", "an added question arrives selected");
/* A paste is a different list. Selecting all of it is the safe failure: too many is visible in the
   count and refused at 81; too few would run a smaller audit than anyone chose. */
ok([...reconcileSelection(qs, ["x", "y"], new Set([0]))].sort((x, y) => x - y).join(",") === "0,1", "a paste that replaces the list selects all of it");
ok([...reconcileSelection([], ["x", "y", "z"], new Set())].length === 3, "the first generated set arrives fully selected");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
