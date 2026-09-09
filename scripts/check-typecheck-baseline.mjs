#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════════════════════
   TYPECHECK AGAINST THE KNOWN BASELINE — `npm run typecheck:baseline`, and part of `npm run check`.

   🔴 WHY A PLAIN `tsc --noEmit` CANNOT BE THE GATE. This repo has a set of pre-existing type errors
   that are deliberately NOT fixed (supabase-js generic mismatches on generated Database types). So
   `tsc` always exits non-zero, which means it can never be a pass/fail check — and the actual rule
   ("no NEW errors") lived only as a sentence in CLAUDE.md, enforced by whoever remembered to read
   it. That is the same failure as the 77 tests nobody could run.

   ⛔ IT COMPARES LISTS, NOT COUNTS — CLAUDE.md's own instruction, learned the hard way: a count
   that matches can still hide one new error masking one removed one. Every error is normalised and
   diffed against scripts/typecheck-baseline.txt.

   ⛔ AND IT STRIPS LINE NUMBERS. The same instruction, for the same reason: these errors move every
   time the file above them changes, so a baseline pinned to line numbers would fail on edits that
   changed nothing about the errors. Matching is on FILE + CODE + MESSAGE. The long inline types
   inside a TS2352 also shift whenever a column is added to the generated Database type, so the
   "Conversion of type … to type 'X'" middle is elided — what identifies the error is which type it
   FAILED TO PRODUCE, not the 70-field literal it started from.

   ⚠️ A REMOVED ERROR FAILS TOO, and that is deliberate rather than pedantic. Genuinely fixing one is
   good news, but it must be recorded — otherwise the baseline silently drifts upward in
   permissiveness and stops describing the codebase. The failure message says exactly what to do.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts', 'typecheck-baseline.txt');
const UPDATE = process.argv.includes('--update');

/** file + TS code + message, with the volatile parts removed. See the header for why each goes. */
function normalise(line) {
  return line
    .replace(/\((\d+),(\d+)\)/, '')                                  // line:col — they move
    .replace(/(Conversion of type ).*?( to type )/, '$1…$2')          // 70-field generated literal
    .trim();
}

const res = spawnSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, encoding: 'utf8' });
const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
const actual = output.split('\n').filter((l) => l.includes('error TS')).map(normalise).sort();

if (UPDATE) {
  writeFileSync(BASELINE, `${actual.join('\n')}\n`);
  console.log(`Baseline updated: ${actual.length} known errors written to scripts/typecheck-baseline.txt`);
  console.log('⚠️  Commit this deliberately, and say in the message WHY each change happened.');
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('No scripts/typecheck-baseline.txt. Create it with: npm run typecheck:baseline -- --update');
  process.exit(1);
}
const expected = readFileSync(BASELINE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean).sort();

/* Multiset diff — several identical-after-normalising errors are legitimate (useOutreach has four
   of the same cast), so a Set would under-count and let a new duplicate through. */
function subtract(a, b) {
  const pool = [...b];
  const out = [];
  for (const x of a) {
    const i = pool.indexOf(x);
    if (i === -1) out.push(x);
    else pool.splice(i, 1);
  }
  return out;
}
const added = subtract(actual, expected);
const removed = subtract(expected, actual);

console.log(`typecheck: ${actual.length} errors, baseline ${expected.length}`);
if (!added.length && !removed.length) {
  console.log('✓ identical to the baseline — no new type errors.');
  process.exit(0);
}
if (added.length) {
  console.log(`\n\x1b[31m${added.length} NEW type error(s) — this is a regression:\x1b[0m`);
  for (const l of added) console.log(`  + ${l}`);
}
if (removed.length) {
  console.log(`\n\x1b[33m${removed.length} baseline error(s) no longer occur.\x1b[0m`);
  for (const l of removed) console.log(`  - ${l}`);
  console.log('  If you fixed these on purpose, re-record the baseline:');
  console.log('    npm run typecheck:baseline -- --update');
}
process.exit(1);
