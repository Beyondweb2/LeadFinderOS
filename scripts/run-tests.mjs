#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE TEST RUNNER — `npm test`.

   🔴 WHY THIS EXISTS. There were 77 test files and no way to run them. Nothing in package.json, no
   CI, no command. So they were run only when somebody remembered, which meant in practice they
   were not run at all: on 2026-09-09 FOUR were failing, three of them broken by changes made in
   the preceding week, and one had been failing to even LOAD for six days because it imported a
   constant deleted in the flat-price change. Paul's actual complaint — "I fix one thing and
   another breaks" — is that sentence. Typecheck was clean and the build passed the whole time, so
   both green lights were on while three tests were red.

   ⛔ A TEST THAT CANNOT RUN IS A FAILURE, NOT A SKIP. Three ways a suite can quietly stop
   verifying, and all three are counted as failures here rather than glossed:
     · it throws on import (the deleted-symbol case above);
     · it needs a runtime this runner did not try (site-origin.test.ts reads Deno.env, so it fails
       under tsx and passes under Deno — the runner retries rather than shrugging);
     · it reports "skipped, nothing was verified" and exits non-zero (check-cross-repo-sync when
       findable-site is not checked out — the guard on the PRICE and the GUARANTEE. Its own output
       says "This is NOT a pass", so neither is it here).

   Usage:  npm test            all suites
           npm test market     only files whose name contains "market"
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { readdirSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const filter = process.argv[2] ?? '';

/* Deno lives outside PATH for non-interactive shells; look where the install put it before
   deciding a Deno-only suite cannot be run. */
const DENO = ['/home/paulj/.deno/bin/deno', 'deno'].find((p) => p === 'deno' || existsSync(p));

/** The .mjs guards worth running every time. Everything else in scripts/ is a database tool
 *  (seeding, probes, one-off diagnostics) and must NOT be run by `npm test`. Named explicitly for
 *  that reason — a glob would eventually sweep a script that spends money. */
const EXTRA_GUARDS = ['check-cross-repo-sync.mjs'];

const CONCURRENCY = 8;
const TIMEOUT_MS = 120_000;

/* 🔴 `shell: true` ON WINDOWS, AND WITHOUT IT THIS HARNESS HAS NEVER RUN ON PAUL'S MACHINE.
   `spawn('npx', …)` looks for a file literally called `npx`; on Windows the executable is `npx.cmd`,
   so every one of the 83 tsx suites died with `Error: spawn npx ENOENT` and the run reported
   "1/84 suites passed" — the single .mjs suite, which spawns `node` and resolves fine.
   ⚠️ IT READ AS 83 BROKEN TESTS, NOT AS A BROKEN RUNNER. That is the dangerous part: the output
   looks like a catastrophically failing codebase, so the natural response is to distrust the
   suite and stop running it — which is exactly what makes `npm run check` (CLAUDE.md §0's stated
   gate) stop being a gate. Every one of those suites passes when invoked directly.
   ⚠️ Scoped to win32 deliberately: `shell: true` changes quoting rules, and there is no reason to
   alter behaviour on the platform where this already worked. No path here is user-supplied — the
   commands are literals and the arguments are filenames from readdirSync of scripts/. */
function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: process.platform === 'win32' });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += '\n[timed out]'; }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, out: String(e) }); });
  });
}

/* 🔴 A SUITE THAT PRINTS FAILURES AND EXITS 0 HAS TO COUNT AS FAILED, AND 40 OF THE 83 COULD NOT
   FAIL THE BUILD UNTIL THIS EXISTED (measured 2026-09-12).

   They use the house helper — `const ok = (c, l) => { if (!c) f++; console.log(`${c?"PASS":"FAIL"} ${l}`) }`
   — and then simply never call process.exit, so a red suite returned 0 and the harness reported it
   PASS. `re-engage-vars.test.ts` had been printing "3 FAILURES" and passing for days; that is how
   two registry faults and a stale assertion stayed invisible while `npm run check` looked green.

   ⛔ FIXED HERE RATHER THAN IN 40 FILES, and that is the point: editing each suite to add an exit
   code fixes the 40 that exist and does nothing for the 41st somebody writes next week. The runner
   is the one place that cannot be forgotten.
   ⚠️ THE PATTERN IS THIS CODEBASE'S OWN CONVENTION, not a guess: a failing assertion prints a line
   beginning "FAIL ", and the summary prints "N FAILURES". Both are anchored to start-of-line so a
   test that merely mentions the word in a label or a quoted string does not trip it.
   ⚠️ It can only ever turn a pass into a failure. A suite that exits non-zero was already failing. */
const FAILURE_IN_OUTPUT = /^[^\S\r\n]*(?:\d+\s+FAILURES?\b|FAIL\b)/m;

/** Exit code OR printed failures. See FAILURE_IN_OUTPUT. */
function grade(r) {
  return r.code !== 0 || FAILURE_IN_OUTPUT.test(r.out) ? { ...r, code: r.code || 1 } : r;
}

async function runSuite(file) {
  const full = path.join('scripts', file);
  if (file.endsWith('.mjs')) {
    const r = await run('node', [full]);
    return { file, ...grade(r), via: 'node' };
  }
  let r = await run('npx', ['tsx', full]);
  if (r.code !== 0 && /Deno is not defined|Deno\.env/.test(r.out) && DENO) {
    /* Not a failure — the wrong runtime. Retry under Deno and report THAT result, so a suite
       written for the edge runtime is genuinely verified instead of permanently red. */
    r = await run(DENO, ['run', '--sloppy-imports', '--allow-env', '--allow-read', full]);
    return { file, ...grade(r), via: 'deno' };
  }
  return { file, ...grade(r), via: 'tsx' };
}

const files = [
  ...readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.ts')),
  ...EXTRA_GUARDS.filter((f) => existsSync(path.join(SCRIPTS, f))),
].filter((f) => !filter || f.includes(filter)).sort();

if (!files.length) {
  console.error(`No suites matched "${filter}".`);
  process.exit(1);
}
/* ══ THE findable-site SIBLING IS PART OF THE TEST INPUT — SAY WHEN IT IS STALE (2026-10-02) ═══════
   Several suites read findable-site's SOURCE (cross-repo sync, the onboarding copy, the report
   proxies, the onboarding audit fields) from FINDABLE_SITE_DIR or ../findable-site. On 2026-10-02
   that sibling pointed at a checkout two weeks behind master with uncommitted edits, and FOUR suites
   failed against code that is not live, which read as product failures for days.
   ⛔ This does NOT skip or pass anything: those suites still run against whatever the sibling holds.
   It prints which tree they read and whether it matches the last-fetched origin/master, so a red
   line that is really a stale checkout says so. Fix: point FINDABLE_SITE_DIR at a clean worktree of
   origin/master, or refresh the mirror the sibling links to (CLAUDE.md §3). */
{
  const siteDir = process.env.FINDABLE_SITE_DIR || path.resolve(ROOT, '..', 'findable-site');
  const git = (...a) => spawnSync('git', ['-C', siteDir, ...a], { encoding: 'utf8' });
  if (!existsSync(siteDir)) {
    console.log(`⚠️  findable-site not found at ${siteDir} — the cross-repo suites will fail.\n`);
  } else {
    const head = git('rev-parse', 'HEAD').stdout.trim();
    const master = git('rev-parse', 'origin/master').stdout.trim();
    const dirty = git('status', '--porcelain', '--', 'src', 'functions', 'public').stdout.trim();
    const behind = head && master ? Number(git('rev-list', '--count', `${head}..${master}`).stdout.trim() || 0) : NaN;
    if (!head || !master) console.log(`⚠️  findable-site at ${siteDir} is not a git checkout with origin/master — cannot tell if it is current.\n`);
    else if (behind > 0 || dirty) {
      console.log('\x1b[33m' + '═'.repeat(70));
      console.log(`⚠️  ENVIRONMENT: the findable-site the cross-repo suites read is NOT current master.`);
      console.log(`    ${siteDir}`);
      console.log(`    ${behind > 0 ? `${behind} commit${behind === 1 ? '' : 's'} behind origin/master (as last fetched)` : 'at origin/master'}${dirty ? ', with uncommitted edits in src/functions/public' : ''}.`);
      console.log('    Red results in check-cross-repo-sync, manual-onboarding, self-sourced-handoff and');
      console.log('    onboarding-audit-fields may describe that checkout, not live code. Set FINDABLE_SITE_DIR');
      console.log('    to a clean origin/master worktree, or refresh the mirror (CLAUDE.md §3).');
      console.log('═'.repeat(70) + '\x1b[0m\n');
    } else console.log(`findable-site input: ${siteDir} at origin/master (${head.slice(0, 7)}), clean.\n`);
  }
}
console.log(`Running ${files.length} suite${files.length === 1 ? '' : 's'}${filter ? ` matching "${filter}"` : ''}…\n`);

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
    while (next < files.length) {
      const file = files[next++];
      const r = await runSuite(file);
      results.push(r);
      const tag = r.code === 0 ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
      console.log(`  ${tag}  ${file}${r.via === 'deno' ? '  (deno)' : ''}`);
    }
  }),
);

const failed = results.filter((r) => r.code !== 0).sort((a, b) => a.file.localeCompare(b.file));
if (failed.length) {
  console.log(`\n${'═'.repeat(70)}`);
  for (const r of failed) {
    console.log(`\n\x1b[31mFAILED\x1b[0m  scripts/${r.file}  (via ${r.via}, exit ${r.code})`);
    /* The tail, not the head: these suites print a PASS line per assertion and the failures plus
       the summary are at the bottom. Printing the first 20 lines would show only passes. */
    const lines = r.out.trimEnd().split('\n');
    console.log(lines.slice(-25).map((l) => `    ${l}`).join('\n'));
  }
}
console.log(`\n${results.length - failed.length}/${results.length} suites passed.`);
process.exit(failed.length ? 1 : 0);
