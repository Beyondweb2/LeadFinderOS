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
  BASELINE_QUESTIONS, FULL_MEASURE_QUESTIONS, GENERATOR_ABSOLUTE_MAX_QUESTIONS,
} from "../src/lib/auditQuestionCounts.ts";

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

console.log("\n── THE FULL MEASURE IS ONE NUMBER ON BOTH SIDES ──");
for (const bound of ["MIN", "MAX", "DEFAULT"]) {
  const re = new RegExp(`^const MEASUREMENT_${bound}_QUESTION_COUNT = FULL_MEASURE_QUESTIONS;`, "m");
  ok(re.test(server), `server MEASUREMENT_${bound}_QUESTION_COUNT derives from FULL_MEASURE_QUESTIONS`);
}
ok(/^const FULL_MEASURE_COUNT = FULL_MEASURE_QUESTIONS;/m.test(wizard), "wizard's full-measure count derives from FULL_MEASURE_QUESTIONS");
ok(!/FULL_QUESTION_OPTIONS|FULL_MAX_QUESTIONS|FULL_DEFAULT_QUESTIONS/.test(wizard), "the 10/20/25/40/60/75 dial is gone from the wizard");
ok(/const clampFullCount = \(_n: number\) => FULL_MEASURE_COUNT;/.test(wizard),
   "a persisted full-mode count clamps to the fixed value on read (a stale 40 cannot be sent)");

console.log("\n── THE MODEL IS ASKED FOR EXACTLY n ──");
/* If the tool schema ever gained a hidden maxItems below the policy, the generator would fall back
   to templates on every full measure and nobody would see it. */
ok(/minItems: n, maxItems: n/.test(server), "tool schema is minItems: n, maxItems: n — no hidden cap below the policy");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
if (f) process.exit(1);
