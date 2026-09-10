/* ============================================================
   THREE RUNS ARE ONE MEASUREMENT, AND A MISSING ANSWER IS NOT A ZERO.

   ⛔ THE SHAPE. A paid baseline asks the same questions three times. The results screen read the
   highest run_number and showed "7/24" — one third of the evidence, with no sign the other two
   runs existed. Pooling is the same model the before/after comparison has always used (CLAUDE.md
   §17); the headline simply never caught up.

   ⛔ THE UNIT IS THE ANSWER CELL: question × engine × run. Averaging three runs' percentages
   instead would give a run that failed half its questions the same weight as a complete one.

   ⚠️ AND THE ABSENT CASE POINTS THE USUAL WAY HERE: a question that failed, or was dropped as a
   straggler, must contribute NOTHING — not a "not named". Counting an answer we never received
   as evidence of absence would depress the exact number a customer's guarantee is measured on.
   ============================================================ */
import { poolRuns, engineSummary, type PooledInput } from "../src/lib/pooledRuns.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const SCORED = ["chatgpt", "gemini"] as const;
const DISPLAY = ["chatgpt", "gemini", "ai_overview", "google_organic"] as const;

const cell = (named: boolean) => ({
  named, position: null, competitors: [], citations: [], answer_text: "x",
});

/** One question, one run, naming as told. */
const row = (runNumber: number, question: string, chatgpt: boolean, gemini: boolean): PooledInput => ({
  runId: `run-${runNumber}`, runNumber, question, status: "done",
  result: { chatgpt: cell(chatgpt), gemini: cell(gemini) },
});

console.log("── THE HEADLINE CASE: 2 questions × 2 engines × 3 runs = 12 cells, not 4 ──");
{
  const rows: PooledInput[] = [];
  for (const n of [1, 2, 3]) {
    rows.push(row(n, "locksmith huntingdon", n <= 2, false)); // ChatGPT names in 2 of 3
    rows.push(row(n, "emergency locksmith st neots", false, false));
  }
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.runs === 3, `runs = ${p.runs} (3)`);
  ok(p.total === 12, `total cells = ${p.total} (2 questions × 2 engines × 3 runs)`);
  ok(p.named === 2, `named cells = ${p.named} (ChatGPT twice on the first question)`);
  ok(p.questions.length === 2, `2 pooled questions from 6 rows`);
  const q1 = p.questions[0];
  ok(q1.perEngine.chatgpt.named === 2 && q1.perEngine.chatgpt.answered === 3,
    `question 1 ChatGPT ${engineSummary(q1.perEngine.chatgpt)} (2/3)`);
  ok(q1.perEngine.gemini.named === 0 && q1.perEngine.gemini.answered === 3,
    `question 1 Gemini ${engineSummary(q1.perEngine.gemini)} (0/3)`);
}

console.log("\n── 🔴 A FAILED QUESTION IS ABSENT, NOT A ZERO ──");
/* The denominator must not grow for an answer we never got. This is the number a paying
   customer's guarantee is measured against. */
{
  const rows: PooledInput[] = [
    row(1, "q", true, true),
    { runId: "run-2", runNumber: 2, question: "q", status: "failed", result: null },
    { runId: "run-3", runNumber: 3, question: "q", status: "done", result: null },
  ];
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.total === 2, `total = ${p.total} — only the one answered run's 2 cells`);
  ok(p.named === 2, `named = ${p.named}`);
  ok(p.unanswered === 2, `unanswered = ${p.unanswered}, reported separately`);
  ok(p.questions[0].runsAnswered === 1, `runsAnswered = 1 of 3`);
  ok(p.runs === 3, `runs still counts all 3 — the runs existed, the answers did not`);
}

console.log("\n── ⚠️ AN ENGINE THAT DID NOT ANSWER DOES NOT GET A DENOMINATOR EITHER ──");
{
  const rows: PooledInput[] = [
    { runId: "r1", runNumber: 1, question: "q", status: "done", result: { chatgpt: cell(true) } },
    { runId: "r2", runNumber: 2, question: "q", status: "done", result: { chatgpt: cell(false) } },
  ];
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.total === 2, `total = ${p.total} — ChatGPT only; Gemini never answered so it is not counted`);
  ok(p.questions[0].perEngine.gemini.answered === 0, "Gemini answered 0");
  ok(engineSummary(p.questions[0].perEngine.gemini) === "—", "Gemini renders as a dash, not 0/0");
}

console.log("\n── ⛔ A QUESTION IS ITS TEXT, VERBATIM — a rewording is a DIFFERENT question ──");
/* Re-measures reuse the previous set so the strings match by construction. Merging a reworded
   question with the one it replaced would compare two different measurements (CLAUDE.md §17). */
{
  const rows: PooledInput[] = [
    row(1, "accountant in wisbech", true, false),
    row(2, "Best accountants in Wisbech?", false, false),
  ];
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.questions.length === 2, "two different strings stay two questions");
  const trailing = poolRuns([row(1, "q ", true, false), row(2, "q", false, false)], SCORED, DISPLAY);
  ok(trailing.questions.length === 2, "not even whitespace is normalised away");
}

console.log("\n── ORDER IS FIRST APPEARANCE, AND SURVIVES THE RESULTS CHANGING ──");
/* The sequence must not reshuffle when the numbers do, or two exports of one audit cannot be
   read against each other (CLAUDE.md §17). */
{
  const mk = (namedFirst: boolean) => poolRuns([
    row(1, "alpha", namedFirst, false),
    row(1, "beta", !namedFirst, false),
    row(2, "alpha", namedFirst, false),
    row(2, "beta", !namedFirst, false),
  ], SCORED, DISPLAY).questions.map((q) => q.question);
  ok(JSON.stringify(mk(true)) === JSON.stringify(["alpha", "beta"]), "asked order kept");
  ok(JSON.stringify(mk(false)) === JSON.stringify(["alpha", "beta"]), "same order when the winner flips");
}

console.log("\n── A SINGLE RUN POOLS TO EXACTLY ITSELF (no behaviour change for 1-run audits) ──");
{
  const rows = [row(1, "a", true, false), row(1, "b", false, false)];
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.runs === 1 && p.total === 4 && p.named === 1, `1 run → ${p.named}/${p.total} over ${p.runs} run`);
}

console.log("\n── EMPTY AND DEGENERATE INPUTS ──");
{
  const p = poolRuns([], SCORED, DISPLAY);
  ok(p.questions.length === 0 && p.runs === 0 && p.total === 0 && p.named === 0,
    "no rows → zeroes, no throw");
  /* ⛔ 0/0 must never render as 0% "nobody names them" — the caller checks total > 0, and this
     asserts the fold gives it the honest zero to check. */
  ok(p.total === 0, "total 0 so the caller can say 'not measured' rather than 0%");

  const allFailed = poolRuns([
    { runId: "r", runNumber: 1, question: "q", status: "failed", result: null },
  ], SCORED, DISPLAY);
  ok(allFailed.total === 0 && allFailed.unanswered === 1,
    "every row failed → total 0, unanswered 1 (not 0% named)");
}

console.log("\n── THE REAL SHAPE: RG's 12 questions × 2 engines × 3 runs = 72 cells ──");
{
  const rows: PooledInput[] = [];
  for (const n of [1, 2, 3]) {
    for (let i = 0; i < 12; i++) rows.push(row(n, `q${i}`, i < 5, i === 0));
  }
  const p = poolRuns(rows, SCORED, DISPLAY);
  ok(p.total === 72, `total = ${p.total} (72) — not the 24 the old screen showed`);
  ok(p.questions.length === 12, "12 pooled questions from 36 rows");
  ok(p.named === (5 + 1) * 3, `named = ${p.named} (5 ChatGPT + 1 Gemini, three times)`);
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
