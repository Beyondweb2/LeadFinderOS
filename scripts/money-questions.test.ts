/* ============================================================
   MONEY QUESTIONS — Paul's spec, 2026-08-30.

   Two properties this suite exists for:
   ⛔ money questions are ALWAYS a strict minority, at every question count;
   ⛔ nothing this module emits can be destroyed by the guards that already run on generated
      questions — stripNearMe (a hard ban) and dropResearchIntent. A template that trips either
      would be silently deleted and the audit would come back short, with nothing saying why.
   ============================================================ */
import {
  moneyQuestionShare, moneyQuestionDirective, moneyFallbackQuestions,
  MONEY_QUESTION_MIN_COUNT,
} from "../src/lib/moneyQuestions.ts";
import { researchIntentReason } from "../src/lib/seedGuard.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE SHARE: Paul's target, and always a minority ──");
ok(moneyQuestionShare(5) === 2, "⛔ 5 questions → 2 money + 3 standard (the stated target)");
ok(moneyQuestionShare(3) === 1, "3 → 1");
ok(moneyQuestionShare(4) === 1, "4 → 1");
ok(moneyQuestionShare(8) === 3, "8 → 3");
ok(moneyQuestionShare(10) === 4, "10 → 4");
ok(moneyQuestionShare(20) === 8, "20 → 8 (a full measurement)");
for (const n of [3, 4, 5, 8, 10, 12, 20, 75]) {
  ok(moneyQuestionShare(n) * 2 < n, `⛔ ${n}: money (${moneyQuestionShare(n)}) is a STRICT minority`);
  ok(moneyQuestionShare(n) <= n - 1, `  ${n}: at least one standard question always survives`);
}

console.log("\n── TOO SMALL, AND JUNK INPUT, YIELD ZERO ──");
for (const n of [0, 1, 2]) {
  ok(moneyQuestionShare(n) === 0, `${n} (< MONEY_QUESTION_MIN_COUNT=${MONEY_QUESTION_MIN_COUNT}) → 0`);
}
for (const bad of [null, undefined, NaN, -5, "abc"]) {
  ok(moneyQuestionShare(bad as number) === 0, `junk ${JSON.stringify(bad)} → 0, never a share of nothing`);
}

console.log("\n── THE DIRECTIVE IS ABSENT WHEN OFF (so every other caller is untouched) ──");
ok(moneyQuestionDirective(0, 5, "Wisbech UK") === "", "⛔ 0 money questions → EMPTY directive, prompt unchanged");
ok(moneyQuestionDirective(-1, 5, "Wisbech UK") === "", "negative → empty too");
{
  const d = moneyQuestionDirective(2, 5, "Wisbech UK");
  ok(d.includes("2 of the 5"), "states the split");
  ok(d.includes("URGENT NEED") && d.includes("SWITCHING") && d.includes("HIGH-VALUE"), "all three types named");
  ok(d.includes('"Wisbech UK"'), "pins the exact place string");
  ok(/never write "near me"/i.test(d), "⛔ forbids near-me, which stripNearMe would delete");
  ok(/how to/i.test(d) && /qualifications/i.test(d), "⛔ forbids the research phrasings dropResearchIntent rejects");
  ok(/longer and more conversational/i.test(d), "overrides the 'short, terse' rule for these only");
  ok(moneyQuestionDirective(2, 5, "").includes("Write the place") === false,
    "a national audit gets no place instruction");
}

console.log("\n── ⛔ THE FALLBACK SURVIVES THE GUARDS THAT ALREADY RUN ──");
{
  const trades = ["accountant", "plumber", "locksmith", "electrician"];
  for (const trade of trades) {
    for (const q of moneyFallbackQuestions(trade, "Wisbech UK", 7)) {
      ok(!/near\s*me/i.test(q), `no "near me" in "${q.slice(0, 44)}…"`);
      ok(researchIntentReason(q, trade) === null,
        `  survives dropResearchIntent (${trade}): "${q.slice(0, 44)}…"`);
    }
  }
}
ok(moneyFallbackQuestions("accountant", "Wisbech UK", 2).length === 2, "count is honoured");
ok(moneyFallbackQuestions("accountant", "Wisbech UK", 0).length === 0, "0 → none");
ok(moneyFallbackQuestions("accountant", "", 3).every((q) => !q.includes(" in ")),
  "no place → no dangling ' in ' (the town-less template fault)");
ok(new Set(moneyFallbackQuestions("plumber", "Hastings UK", 7)).size === 7,
  "the seven templates are distinct — dedupeQuestions cannot thin the set");

console.log("\n── all three types are represented in the fallback ──");
{
  const qs = moneyFallbackQuestions("plumber", "Hastings UK", 7).join(" | ");
  ok(/emergency|urgent/.test(qs), "type 1 (urgent) present");
  ok(/turns up|switch to|letting me down/.test(qs), "type 2 (switching) present");
  ok(/bigger job|important work/.test(qs), "type 3 (high-value) present");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
