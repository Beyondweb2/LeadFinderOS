#!/usr/bin/env node
/* QUICK CHECK — `npm run check:quick` (2026-10-10, verification tiers, CLAUDE.md §3a). The "while working" tier: about half a minute
   instead of the full gate's ~3½ minutes.

   What it runs:
     1. typecheck against the committed baseline (the SAME script the gate uses — whole-project tsc, ~25 s; TypeScript cannot check a
        subset of a project honestly, so this is the one fixed cost)
     2. eslint on the CHANGED .ts/.tsx files only (advisory: the repo has pre-existing lint findings and lint is NOT part of the full
        gate, so a finding here is printed, never a failure; `--strict-lint` makes it one)
     3. only if edge / shared library code changed: the three edge-function static checks (syntax, undefined names, import graph — ~10 s)
   What it deliberately does NOT run: the build and the test suites (use `npm run test:changed`, and the full gate before shipping).
   ⛔ A green quick check is NOT permission to ship. `npm run check` runs once, after all changes are finished, and always for the
      sensitive areas it names when it prints the warning (auth / tenancy, database, sending, payments, secrets). */
import { spawnSync } from 'node:child_process';
import { changedFiles, printFullGateWarning, ROOT } from './changed-files.mjs';

const strictLint = process.argv.includes('--strict-lint');
const files = changedFiles();
const run = (label, cmd, args) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  const ok = r.status === 0;
  console.log(`${ok ? '✓' : '✗'} ${label} (${secs}s)`);
  if (!ok) console.log(((r.stdout ?? '') + (r.stderr ?? '')).split('\n').slice(-40).join('\n'));
  return { ok, out: (r.stdout ?? '') + (r.stderr ?? '') };
};

console.log(`quick check — ${files.length} changed file${files.length === 1 ? '' : 's'} vs origin/main`);
if (!files.length) { console.log('nothing changed — nothing to check.'); process.exit(0); }
let failed = false;

const codeChanged = files.some((f) => /\.(ts|tsx|mjs)$/.test(f) && !f.startsWith('docs/'));
if (codeChanged) {
  if (!run('typecheck vs baseline', 'node', ['scripts/check-typecheck-baseline.mjs']).ok) failed = true;
} else {
  console.log('· typecheck skipped — no code files changed (docs / copy / config only)');
}

const lintable = files.filter((f) => /^(src|scripts|supabase)\/.*\.(ts|tsx)$/.test(f));
if (lintable.length) {
  const r = run(`eslint on ${lintable.length} changed file${lintable.length === 1 ? '' : 's'}`, 'npx', ['eslint', ...lintable]);
  if (!r.ok && strictLint) failed = true;
  else if (!r.ok) console.log('  (advisory — lint is not part of the full gate; fix what you introduced)');
}

if (files.some((f) => /^supabase\/functions\//.test(f) || /^src\/lib\//.test(f))) {
  for (const [label, script] of [['edge syntax', 'check-edge-syntax.mjs'], ['edge undefined names', 'check-edge-undefined.mjs'], ['import graph', 'check-import-graph.mjs']]) {
    if (!run(label, 'node', [`scripts/${script}`]).ok) failed = true;
  }
}

const sensitive = printFullGateWarning(files);
console.log(failed ? '\n✗ quick check FAILED' : `\n✓ quick check passed${sensitive ? ' — but the full gate is still required (see above)' : ' — the full gate still runs once before commit / push / deploy'}`);
process.exit(failed ? 1 : 0);
