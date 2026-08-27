#!/usr/bin/env node
/* Guard: the re-audit screen's run count must equal the server's.
 *
 * WHY THIS EXISTS. The panel priced a measurement re-audit at "× 1 run" while create-ai-audit ran 3,
 * understating a 47-question Solene re-audit as ~47p against a real ~£1.17. A comment asking for the
 * two to be kept in sync cannot fail a build; this can.
 *
 * Compares MEASUREMENT_RUNS in src/lib/measurementRuns.ts (what the UI prices with) against
 * supabase/functions/create-ai-audit/index.ts (what actually runs). Exits non-zero on any drift.
 * Run: node scripts/check-measurement-runs.mjs
 */
import { readFileSync } from 'node:fs';

const read = (p) => {
  try { return readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'); }
  catch { console.error(`check-measurement-runs: cannot read ${p}`); process.exit(2); }
};

/* Take the FIRST `const MEASUREMENT_RUNS = <n>` in each file. ⚠️ Never write that declaration
 * pattern inside a comment in either file — the regex takes the first match, comments included
 * (the FOUNDER_PRICE_GBP lesson). */
const grab = (src, file) => {
  /* Anchored to column 0 (a top-level declaration) so INDENTED comment text can never
     satisfy it — caught while proving this guard: the doc comment in measurementRuns.ts contained
     the declaration pattern, the regex took it first, and the check passed on real drift. */
  const m = src.match(/^(?:export\s+)?const\s+MEASUREMENT_RUNS\s*=\s*(\d+)/m);
  if (!m) { console.error(`check-measurement-runs: MEASUREMENT_RUNS not found in ${file}`); process.exit(2); }
  return Number(m[1]);
};

const ui = grab(read('src/lib/measurementRuns.ts'), 'src/lib/measurementRuns.ts');
const server = grab(read('supabase/functions/create-ai-audit/index.ts'), 'create-ai-audit/index.ts');

if (ui !== server) {
  console.error(`✗ MEASUREMENT_RUNS DRIFT — the re-audit screen would misprice the run.`);
  console.error(`    src/lib/measurementRuns.ts : ${ui}`);
  console.error(`    create-ai-audit/index.ts   : ${server}  <- what actually runs`);
  console.error(`  Make them equal (the server is authoritative), then redeploy whichever changed.`);
  process.exit(1);
}
console.log(`✓ MEASUREMENT_RUNS in sync: ${ui} runs per question (UI estimate === create-ai-audit)`);
