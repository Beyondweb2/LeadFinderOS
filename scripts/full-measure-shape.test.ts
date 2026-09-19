/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE THREE-TYPE MEASUREMENT MODEL: BASELINE IS HOME-TOWN-ONLY, THE FULL MEASURE IS DISJOINT.

   🔴 WHAT THIS PINS (Paul's spec, 2026-09-12):
     · BASELINE  = approximately 20 operator-approved questions, home town, 3 runs, frozen.
       The refund and winnability are judged on it.
     · FULL MEASURE = optional broader discovery and remains DISJOINT from the baseline.
     · ORDER MATTERS: no paid audit starts until the operator approves and runs the baseline.

   ⛔ The pure halves are tested directly. The edge-function halves are read from SOURCE, because
   a test that models the server loosely passes while the server regresses (the audit-kind lesson).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { BASELINE_QUESTIONS, BASELINE_RUNS, FULL_MEASURE_QUESTIONS, GENERATOR_ABSOLUTE_MAX_QUESTIONS } from "../src/lib/auditQuestionCounts.ts";
import { excludeAsked, overAskFor, fullMeasureAllocation } from "../src/lib/fullMeasure.ts";
import { MIN_CELLS_FOR_QUESTION_CLAIM } from "../src/lib/measurementCompare.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const baselineSrc = stripComments(read("supabase/functions/_shared/audit-baseline.ts"));
const serverSrc = stripComments(read("supabase/functions/create-ai-audit/index.ts"));

console.log("── THE NUMBERS ──");
ok(BASELINE_QUESTIONS === 20, `BASELINE_QUESTIONS is 20 (got ${BASELINE_QUESTIONS})`);
ok(FULL_MEASURE_QUESTIONS === 20, `FULL_MEASURE_QUESTIONS is 20 (got ${FULL_MEASURE_QUESTIONS})`);
ok(BASELINE_RUNS === 3, "three runs");
/* The reason the full measure need not re-ask the judged set: the baseline alone already clears
   the per-question claim threshold on every judged question. */
const cellsPerJudgedQuestion = BASELINE_RUNS * 2;   // two engines
ok(cellsPerJudgedQuestion >= MIN_CELLS_FOR_QUESTION_CLAIM,
   `a ${BASELINE_RUNS}-run baseline gives ${cellsPerJudgedQuestion} cells per judged question >= MIN_CELLS_FOR_QUESTION_CLAIM (${MIN_CELLS_FOR_QUESTION_CLAIM}) — winnability on the judged set needs no second measurement`);

console.log("\n── excludeAsked: THE FULL MEASURE CAN NEVER CONTAIN A JUDGED QUESTION ──");
const asked = ["locksmith in Huntingdon", "Emergency locksmith St Neots", "lock change cambridge"];
const gen = ["Locksmith in huntingdon", "car key replacement Huntingdon", "emergency locksmith st neots!", "upvc door locks Cambridge", "lock change Cambridge"];
const kept = excludeAsked(gen, asked);
ok(kept.length === 2, `5 generated, 3 paraphrase the baseline → ${kept.length} survive (expect 2)`);
ok(kept[0] === "car key replacement Huntingdon" && kept[1] === "upvc door locks Cambridge", "order preserved, nothing added");
ok(excludeAsked(gen, []).length === gen.length, "an empty exclusion set changes nothing — every other caller is byte-for-byte unchanged");
ok(excludeAsked([], asked).length === 0, "nothing in → nothing out");
/* Case, punctuation and whitespace are not identity — the queue's own dedupe rule. */
ok(excludeAsked(["  LOCK CHANGE  CAMBRIDGE?? "], asked).length === 0, "case/punctuation/whitespace variants are the same question");
/* The invariant the server logs against: filter, then check that nothing judged survived. */
ok(kept.every((q) => excludeAsked([q], asked).length === 1), "every survivor is individually disjoint from the baseline");

console.log("\n── overAskFor: ENOUGH EXTRA TO SURVIVE THE FILTER, NEVER ABOVE THE NAMED CEILING ──");
ok(overAskFor(20, 0) === 20, "no exclusion → ask for exactly the target");
ok(overAskFor(20, 12) === 32, "20 wanted, 12 excluded → ask for 32");
ok(overAskFor(20, 12) <= GENERATOR_ABSOLUTE_MAX_QUESTIONS, "…which sits under the generator's absolute cap");
ok(overAskFor(20, 100) === GENERATOR_ABSOLUTE_MAX_QUESTIONS, `an absurd exclusion clamps to GENERATOR_ABSOLUTE_MAX_QUESTIONS (${GENERATOR_ABSOLUTE_MAX_QUESTIONS}), never above`);
ok(overAskFor(4, 12) === 16, "a small per-town share over-asks by the whole exclusion too");
ok(overAskFor(-3, -3) === 0, "junk → 0, not negative");

console.log("\n── fullMeasureAllocation: THE TOWNS LIVE IN THE FULL MEASURE (option C) ──");
const four = fullMeasureAllocation("Huntingdon", ["St Neots", "Cambridge", "Peterborough"]);
ok(four.allocation.map((a) => `${a.town}:${a.questions}`).join(" ") === "Huntingdon:10 St Neots:4 Cambridge:3 Peterborough:3",
   `four towns → 10 / 4 / 3 / 3 (got ${four.allocation.map((a) => a.questions).join("/")})`);
ok(four.allocation.reduce((n, a) => n + a.questions, 0) === FULL_MEASURE_QUESTIONS, "sums to exactly the full measure");
ok(four.dropped.length === 0, "no town dropped at four");
ok(four.allocation[0].isMain === true, "home town is main");
const one = fullMeasureAllocation("Huntingdon", []);
ok(one.allocation.length === 1 && one.allocation[0].questions === FULL_MEASURE_QUESTIONS, "no extra towns → all 20 on the home town");
const dup = fullMeasureAllocation("Huntingdon", ["huntingdon", " St Neots ", "St Neots"]);
ok(dup.allocation.length === 2, "the home town and a repeated area are de-duplicated");
const many = fullMeasureAllocation("Huntingdon", ["a", "b", "c", "d", "e", "f", "g"]);
ok(many.allocation.reduce((n, a) => n + a.questions, 0) === FULL_MEASURE_QUESTIONS && many.dropped.length > 0,
   `seven towns: still exactly ${FULL_MEASURE_QUESTIONS} questions, ${many.dropped.length} dropped and NAMED rather than measured on one question`);

console.log("\n── SOURCE: THE BASELINE IS HOME-TOWN-ONLY AND UNSEEDED ──");
const startBody = baselineSrc.slice(baselineSrc.indexOf("export async function startPaidBaseline"), baselineSrc.indexOf("export async function preparePaidBaselineQuestions"));
ok(/question_count: approvedQuestions\.length,/.test(startBody) && /questions: approvedQuestions,/.test(startBody), "startPaidBaseline sends the approved question set");
ok(!/\bareas\s*:/.test(startBody), "…and sends NO `areas` (single town)");
ok(!/\bquestions:\s*seed/i.test(startBody) && !/seedQuestions/.test(startBody), "…and sends NO seed questions");
ok(!/decideGuarantee|allocateAreas\(/.test(baselineSrc), "decideGuarantee and the baseline's allocateAreas are gone from audit-baseline");
ok(!/applySeed\(/.test(serverSrc) && !/export function applySeed/.test(stripComments(read("src/lib/seedGuard.ts"))), "applySeed is gone from the server and from seedGuard");
ok(/version: 2,/.test(startBody) && /areasMeasuredInFullMeasure: rawAreas/.test(startBody), "the contract is v2 and records the areas deferred to the full measure");

console.log("\n── SOURCE: THE FULL MEASURE STARTS FROM THE WINNING FINALISATION, ONCE ──");
ok(/\.is\("baseline", null\)\s*\.select\("id"\)/.test(baselineSrc), "the snapshot write is conditional on baseline IS NULL and selects the row it won");
ok(/if \(won\) await onBaselineFrozen\(service, audit as FrozenBaseline\);/.test(baselineSrc), "the baseline freeze hand-off hangs off `won`, never off 'this code ran'");
ok(/export async function startFullMeasure/.test(baselineSrc), "startFullMeasure exists");
const sfm = baselineSrc.slice(baselineSrc.indexOf("export async function startFullMeasure"), baselineSrc.indexOf("export async function sweepStalledBaselines"));
ok(/purpose: "measurement",/.test(sfm) && /question_count: FULL_MEASURE_QUESTIONS,/.test(sfm), "it asks for purpose measurement × FULL_MEASURE_QUESTIONS");
ok(/town_confirmed: true,/.test(sfm), "…exempt from the town gate on the same evidence as the baseline");
ok(/skip_seo: true,/.test(sfm), "…with SEO off");
ok(/\.eq\("audit_purpose", "measurement"\)/.test(sfm), "…and skips if a full measure already exists for the lead");
ok(!/await startFullMeasure\(service, audit\)/.test(baselineSrc), "normal paid fulfilment does not automatically start a full measure");

console.log("\n── SOURCE: THE SERVER MAKES A MEASUREMENT DISJOINT AND ENFORCES THE ORDER ──");
ok(/import \{ excludeAsked, overAskFor \} from "\.\.\/\.\.\/\.\.\/src\/lib\/fullMeasure\.ts";/.test(serverSrc), "create-ai-audit imports the pure helpers with an explicit .ts extension");
ok(/const disjoint = \(qs: string\[\]\) => excludeAsked\(qs, baselineAsked\);/.test(serverSrc), "the exclusion is applied through excludeAsked");
ok(/coverageDirective\(baselineAsked, businessType\)/.test(serverSrc), "…and the model is steered by a coverage directive built from the baseline's asked set");
ok(/refuse\("baseline_not_frozen"/.test(serverSrc) && /isMeasurement && leadPaid && !\(pointer && pointerFrozen\)/.test(serverSrc), "a paying lead with no frozen baseline is refused with baseline_not_frozen");
/* judgeRemeasure gates ONLY the replay (purpose remeasure). A full measure must be disjoint, so it must never be judged like-for-like. */
const judged = serverSrc.slice(serverSrc.indexOf("if (isRemeasure) {"), serverSrc.indexOf("if (isMeasurement && leadPaid"));
ok((serverSrc.match(/judgeRemeasure\(/g) ?? []).length === 1 && /judgeRemeasure\(/.test(judged), "judgeRemeasure is called exactly once, inside the isRemeasure branch — never on a full measure");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
