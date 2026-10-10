#!/usr/bin/env node
/* TESTS FOR CHANGED FILES ONLY — `npm run test:changed` (2026-10-10, verification tiers, CLAUDE.md §3a).

   Picks the suites that are about what you changed and runs just those through the SAME runner the gate uses (scripts/run-tests.mjs:
   same grading, same Deno retry, same findable-site handling). This suite style asserts on SOURCE TEXT as well as importing modules, so a
   suite counts as "about" a file when it IS that file, or its text names the file's path or module name.
   Selection rule, for each changed file F (not a test):  a suite S is selected when S's text contains F's repo path, or F's extensionless
   path under src/ or supabase/functions/, or F's module name as an import specifier ('/name' or "name.ts").
   ⚠️ It is a SELECTION, not a proof: a test with no textual link to your change is not run. That is exactly why the full gate runs once
   before shipping. With no matching suite it says so (and runs nothing) rather than quietly passing.
   Usage:  npm run test:changed            (changed vs origin/main)
           npm run test:changed -- --list  (show the mapping, run nothing) */
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { changedFiles, printFullGateWarning, ROOT } from './changed-files.mjs';

const listOnly = process.argv.includes('--list');
const files = changedFiles();
const SCRIPTS = path.join(ROOT, 'scripts');
const suites = readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.ts') || f === 'check-cross-repo-sync.mjs');
const text = new Map(suites.map((s) => [s, readFileSync(path.join(SCRIPTS, s), 'utf8').replace(/\r\n/g, '\n')]));

const isTest = (f) => /^scripts\/.+\.test\.ts$/.test(f);
const selected = new Map(); // suite → [reasons]
const add = (s, why) => selected.set(s, [...(selected.get(s) ?? []), why]);

for (const f of files) {
  if (isTest(f)) { add(path.basename(f), 'itself changed'); continue; }
  if (!/\.(ts|tsx|mjs|sql|toml)$/.test(f)) continue;
  const noExt = f.replace(/\.[a-z]+$/, '');
  const base = path.basename(noExt);
  const needles = new Set([f, noExt]);
  // an import specifier is the name with a slash in front (…/auditPitchRule) — only for names distinctive enough to mean the module
  if (base.length >= 6 && base !== 'index') { needles.add(`/${base}'`); needles.add(`/${base}.ts`); needles.add(`/${base}"`); needles.add(`/${base}\``); }
  if (base === 'index') { const dir = path.basename(path.dirname(f)); needles.add(`functions/${dir}/index`); needles.add(`/${dir}/`); }
  for (const [s, t] of text) if ([...needles].some((n) => t.includes(n))) add(s, f);
}

console.log(`tests for changed files — ${files.length} changed file${files.length === 1 ? '' : 's'} vs origin/main`);
if (!selected.size) {
  console.log('no suite references the changed files — nothing to run here.');
  printFullGateWarning(files);
  console.log('(That is not a pass for the whole repo: the full gate still runs once before commit / push / deploy.)');
  process.exit(0);
}
const names = [...selected.keys()].sort();
for (const n of names) console.log(`  ${n}  ← ${[...new Set(selected.get(n))].slice(0, 3).join(', ')}${new Set(selected.get(n)).size > 3 ? ', …' : ''}`);
if (listOnly) process.exit(0);

let failed = 0;
const t0 = Date.now();
for (const n of names) {
  const r = spawnSync('node', ['scripts/run-tests.mjs', n], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  if (!ok) { failed++; console.log(`✗ ${n}\n${((r.stdout ?? '') + (r.stderr ?? '')).split('\n').slice(-30).join('\n')}`); }
}
console.log(`\n${failed ? `✗ ${failed} of ${names.length} suites FAILED` : `✓ ${names.length} suite${names.length === 1 ? '' : 's'} passed`} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
printFullGateWarning(files);
process.exit(failed ? 1 : 0);
