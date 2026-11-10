#!/usr/bin/env node
/* THE FULL GATE — `npm run check` (2026-11-10, gate-speed pass; record docs/gate-speed.md).

   Runs EXACTLY the steps the old `a && b && c && …` chain ran, but side by side instead of one after another:
     typecheck vs baseline · edge syntax · edge undefined names · import graph · vite build · every test suite.
   None of them reads another's output (no suite reads dist/; the static checks read only source), so order never changed a result.
   ⛔ Every step always runs to the end and the gate fails if ANY step fails — the old chain stopped at the first red step, which
      hid the later ones. Each failing step's output tail is printed; each step's time is printed so a slow one is visible.
   Usage: npm run check      (TEST_CONCURRENCY=<n> to give the suites fewer workers when other sessions are busy) */
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const node = process.execPath;
const STEPS = [
  ['typecheck vs baseline', node, ['scripts/check-typecheck-baseline.mjs']],
  ['edge syntax', node, ['scripts/check-edge-syntax.mjs']],
  ['edge undefined names', node, ['scripts/check-edge-undefined.mjs']],
  ['import graph', node, ['scripts/check-import-graph.mjs']],
  ['build', node, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build']],
  ['tests', node, ['scripts/run-tests.mjs', '--slowest']],
];

const t0 = Date.now();
const secs = (ms) => `${(ms / 1000).toFixed(0)}s`;
const run = ([label, cmd, args]) => new Promise((resolve) => {
  const s = Date.now();
  const child = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: false });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => { const r = { label, code, out, ms: Date.now() - s }; console.log(`${code === 0 ? '✓' : '✗'} ${label} (${secs(r.ms)})`); resolve(r); });
  child.on('error', (e) => { const r = { label, code: 1, out: String(e), ms: Date.now() - s }; console.log(`✗ ${label} (could not start)`); resolve(r); });
});

console.log(`full gate — ${STEPS.length} steps in parallel`);
const results = await Promise.all(STEPS.map(run));
const failed = results.filter((r) => r.code !== 0);
const tests = results.find((r) => r.label === 'tests');
/* the test summary (and the slowest list) every time; it is the line people look for */
const summary = tests.out.trimEnd().split('\n').filter((l) => /suites passed|^Slowest suites|^\s+\d+\.\ds\s/.test(l));
if (summary.length) console.log('\n' + summary.join('\n'));
for (const r of failed) {
  console.log(`\n${'═'.repeat(70)}\n✗ ${r.label} FAILED (exit ${r.code}) — last lines:`);
  const lines = r.out.trimEnd().split('\n');
  const keep = r.label === 'tests' ? lines.filter((l) => !/\bPASS\b/.test(l)).slice(-120) : lines.slice(-40);
  console.log(keep.map((l) => `    ${l}`).join('\n'));
}
console.log(`\n${failed.length ? `✗ full gate FAILED: ${failed.map((r) => r.label).join(', ')}` : '✓ full gate passed'} (${secs(Date.now() - t0)} wall clock)`);
process.exit(failed.length ? 1 : 0);
