/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE QUESTION CEILINGS AGREE, AND THE GENERATOR'S ABSOLUTE CAP IS NAMED.

   🔴 WHAT THIS PINS. create-ai-audit's generator re-clamped EVERY call at the baseline ceiling (20)
   as an "absurd value" guard, while the measurement POLICY allowed 75 and the wizard offered
   10/20/25/40/60/75. So a 40-question measurement asked the model for 20, and nothing said so: the
   policy ceiling above the generator's real cap was a number the screen said and the queue never
   did. Raising MAX to 30 would have silently given 20.

   ⛔ THE PROPERTY: every policy ceiling is <= GENERATOR_ABSOLUTE_MAX_QUESTIONS, the generator's
   clamp line names that constant and no other, and the full measure is ONE fixed number that the
   server's min, max and default all derive from — so the SPA cannot offer a size the server will
   not run. Read from SOURCE, not from a mirror: a test that models the clamp loosely passes while
   the real clamp regresses (the audit-kind lesson).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  OUTREACH_HOOK_QUESTIONS, WIZARD_MIN_QUESTIONS, WIZARD_MAX_QUESTIONS, WIZARD_DEFAULT_QUESTIONS,
  BASELINE_QUESTIONS, FULL_MEASURE_QUESTIONS, FULL_MEASURE_MIN_QUESTIONS, FULL_MEASURE_MAX_QUESTIONS,
  MEASUREMENT_MIN_RUNS, MEASUREMENT_MAX_RUNS, MEASUREMENT_DEFAULT_RUNS,
  GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from "../src/lib/auditQuestionCounts.ts";
import { planGenerationBatches } from "../src/lib/fullMeasure.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
/* Strip comments so a declaration pattern inside prose can never satisfy or defeat a check
   (the FOUNDER_PRICE_GBP lesson, and the onboarding-steps test's own first-run failure). */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const server = stripComments(read("supabase/functions/create-ai-audit/index.ts"));
const wizard = stripComments(read("src/pages/AiAudit.tsx"));

console.log("── EVERY POLICY CEILING SITS UNDER THE GENERATOR'S ABSOLUTE CAP ──");
const policies: Array<[string, number]> = [
  ["OUTREACH_HOOK_QUESTIONS", OUTREACH_HOOK_QUESTIONS],
  ["WIZARD_MAX_QUESTIONS", WIZARD_MAX_QUESTIONS],
  ["BASELINE_QUESTIONS", BASELINE_QUESTIONS],
  ["FULL_MEASURE_QUESTIONS", FULL_MEASURE_QUESTIONS],
];
/* ⚠️ FULL_MEASURE_MAX_QUESTIONS IS DELIBERATELY NOT IN THIS LIST. It is the one ceiling above the
   per-call cap, and it is legitimate only because the generation is batched — which the batching
   section below asserts directly rather than exempting it here. */
/* The server's own literals, read from source. BASELINE_MAX_QUESTION_COUNT is the one policy
   ceiling that still lives only in the edge function. */
const baselineMax = Number((server.match(/^const BASELINE_MAX_QUESTION_COUNT = (\d+);/m) ?? [])[1]);
ok(Number.isFinite(baselineMax) && baselineMax > 0, `read BASELINE_MAX_QUESTION_COUNT from source (${baselineMax})`);
policies.push(["BASELINE_MAX_QUESTION_COUNT (server)", baselineMax]);
for (const [name, n] of policies) {
  ok(n <= GENERATOR_ABSOLUTE_MAX_QUESTIONS, `${name} = ${n} <= GENERATOR_ABSOLUTE_MAX_QUESTIONS (${GENERATOR_ABSOLUTE_MAX_QUESTIONS})`);
}
ok(WIZARD_MIN_QUESTIONS <= WIZARD_DEFAULT_QUESTIONS && WIZARD_DEFAULT_QUESTIONS <= WIZARD_MAX_QUESTIONS, "wizard default sits inside its bounds");

console.log("\n── THE GENERATOR'S CLAMP NAMES THE ABSOLUTE CAP, NOT A POLICY CEILING ──");
/* 🔴 The exact regression. The clamp inside generateQuestions must reference the named absolute
   constant. Borrowing BASELINE_MAX_QUESTION_COUNT there is how 75 became 20. */
const clampLine = server.match(/const n = clampCount\(count, MIN_QUESTION_COUNT, ([A-Z_]+)\);/);
ok(!!clampLine, "found the generator's clamp line");
ok(clampLine?.[1] === "GENERATOR_ABSOLUTE_MAX_QUESTIONS", `the clamp uses ${clampLine?.[1] ?? "(nothing)"} — must be GENERATOR_ABSOLUTE_MAX_QUESTIONS`);
ok(/import \{[^}]*GENERATOR_ABSOLUTE_MAX_QUESTIONS[^}]*\} from "\.\.\/\.\.\/\.\.\/src\/lib\/auditQuestionCounts\.ts"/s.test(server),
   "…and imports it from the shared policy module with an explicit .ts extension");

console.log("\n── THE FULL MEASURE'S BOUNDS ARE ONE SET OF NUMBERS ON BOTH SIDES ──");
/* 🔴 THE DIAL IS BACK (2026-09-21) AND THE ORIGINAL FAULT MUST STAY DEAD. What made 10..75 a lie
   was not the dial: it was a POLICY ceiling above what the generator would answer in one call.
   So the property is no longer "one fixed number" but "the screen and the server read the same
   bounds, and every ceiling above the per-call cap is reachable by batching". */
for (const [bound, constant] of [
  ["MIN", "FULL_MEASURE_MIN_QUESTIONS"], ["MAX", "FULL_MEASURE_MAX_QUESTIONS"], ["DEFAULT", "FULL_MEASURE_QUESTIONS"],
] as const) {
  const re = new RegExp(`^const MEASUREMENT_${bound}_QUESTION_COUNT = ${constant};`, "m");
  ok(re.test(server), `server MEASUREMENT_${bound}_QUESTION_COUNT derives from ${constant}`);
}
ok(FULL_MEASURE_MIN_QUESTIONS <= FULL_MEASURE_QUESTIONS && FULL_MEASURE_QUESTIONS <= FULL_MEASURE_MAX_QUESTIONS,
   "the full measure's default sits inside its bounds");
ok(MEASUREMENT_MIN_RUNS <= MEASUREMENT_DEFAULT_RUNS && MEASUREMENT_DEFAULT_RUNS <= MEASUREMENT_MAX_RUNS,
   "the run count's default sits inside its bounds");
ok(MEASUREMENT_DEFAULT_RUNS === 3, `a full measure still defaults to 3 runs (got ${MEASUREMENT_DEFAULT_RUNS})`);
ok(!/FULL_QUESTION_OPTIONS|FULL_MAX_QUESTIONS|FULL_DEFAULT_QUESTIONS|clampFullCount/.test(wizard),
   "the old 10/20/25/40/60/75 dial and its stub clamp are gone from the wizard");
ok(/clampFullMeasureQuestions|clampMeasurementRuns/.test(wizard) && /from '@\/lib\/fullMeasure'/.test(wizard),
   "the wizard clamps both dials with the SHARED functions the server validates against");

console.log("\n── EVERY CEILING ABOVE THE PER-CALL CAP IS REACHED BY BATCHING, NOT BY HOPE ──");
/* The exact regression, restated for the dial: a target the generator cannot answer in one call
   must be split, and every batch must sit at or under the cap the generator actually clamps to. */
for (const target of [1, 20, 40, 41, 80]) {
  const batches = planGenerationBatches(target, 0);
  const sum = batches.reduce((n, b) => n + b, 0);
  ok(batches.length > 0 && batches.every((b) => b <= GENERATOR_ABSOLUTE_MAX_QUESTIONS),
     `${target} questions plan to ${batches.join("+")} — every call at or under ${GENERATOR_ABSOLUTE_MAX_QUESTIONS}`);
  ok(sum >= target, `…and the batches ask for at least the target (${sum} >= ${target})`);
}
ok(planGenerationBatches(80, 20).every((b) => b <= GENERATOR_ABSOLUTE_MAX_QUESTIONS),
   "the baseline-exclusion over-ask is batched too, never one oversized call");
ok(/const mixed = await generateMeasurementSet\(/.test(server),
   "create-ai-audit generates a measurement through the BATCHING helper, not a single capped call");
ok((server.match(/await generateWithMoney\(/g) ?? []).length === 2,
   "generateWithMoney is called only from inside generateMeasurementSet (its one- and many-batch arms)");

console.log("\n── THE MODEL IS ASKED FOR EXACTLY n ──");
/* If the tool schema ever gained a hidden maxItems below the policy, the generator would fall back
   to templates on every full measure and nobody would see it. */
ok(/minItems: n, maxItems: n/.test(server), "tool schema is minItems: n, maxItems: n — no hidden cap below the policy");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
