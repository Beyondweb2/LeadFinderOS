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
import { spawn } from 'node:child_process';
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

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: process.env });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += '\n[timed out]'; }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, out: String(e) }); });
  });
}

async function runSuite(file) {
  const full = path.join('scripts', file);
  if (file.endsWith('.mjs')) {
    const r = await run('node', [full]);
    return { file, ...r, via: 'node' };
  }
  let r = await run('npx', ['tsx', full]);
  if (r.code !== 0 && /Deno is not defined|Deno\.env/.test(r.out) && DENO) {
    /* Not a failure — the wrong runtime. Retry under Deno and report THAT result, so a suite
       written for the edge runtime is genuinely verified instead of permanently red. */
    r = await run(DENO, ['run', '--sloppy-imports', '--allow-env', '--allow-read', full]);
    return { file, ...r, via: 'deno' };
  }
  return { file, ...r, via: 'tsx' };
}

const files = [
  ...readdirSync(SCRIPTS).filter((f) => f.endsWith('.test.ts')),
  ...EXTRA_GUARDS.filter((f) => existsSync(path.join(SCRIPTS, f))),
].filter((f) => !filter || f.includes(filter)).sort();

if (!files.length) {
  console.error(`No suites matched "${filter}".`);
  process.exit(1);
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
