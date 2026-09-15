#!/usr/bin/env node
/* ============================================================================================
   EVERY NAME AN EDGE FUNCTION USES MUST ACTUALLY BE DEFINED.

   THE FAULT (2026-09-15). `send-whatsapp-message` called `rivalHookDecision` and
   `templateNeedsRivals` in its audit branch and NEVER IMPORTED THEM. They were written in on
   2026-09-14 and the import line was simply forgotten. It is a plain ReferenceError, and it sat
   there for a day because nothing in this repo could see it:

     - `npm run typecheck` does not cover supabase/functions at all (CLAUDE.md section 3);
     - `check-edge-syntax.mjs` PARSES with esbuild and never resolves a name;
     - the Supabase deploy bundles happily, because an unresolved identifier is legal JavaScript
       until the line runs;
     - and Deno is not installed on this machine, so `deno check` is unavailable.

   So the deploy succeeded, the function was "live", and the first evidence was a prospect thread.
   The same shape as the `phase` scope bug the day before, and the reason both shipped is the same
   gap: nothing resolves names in edge code.

   WHAT THIS DOES. Runs tsc over every edge entrypoint purely to collect TS2304 ("Cannot find
   name"), ignoring the Deno runtime globals that are expected to be unknown here. It is NOT a
   typecheck: module-resolution errors, type errors and library mismatches are all discarded. One
   error code, one question — is this name defined anywhere?

   Run: node scripts/check-edge-undefined.mjs
   ============================================================================================ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions');

/* Runtime globals that are genuinely absent from the compiler's view here and are NOT faults.
   Keep this list short and specific: every name added is a name this check stops protecting. */
const RUNTIME_GLOBALS = new Set(['Deno', 'EdgeRuntime']);

const entrypoints = fs.readdirSync(FN_DIR)
  .filter((d) => fs.existsSync(path.join(FN_DIR, d, 'index.ts')))
  .map((d) => path.join('supabase', 'functions', d, 'index.ts'))
  .sort();

let out = '';
try {
  /* shell:true on win32 — CLAUDE.md section 0: plain 'npx' cannot be found there, and that exact
     ENOENT once made 83 suites read as "1/84 passed". Naming npx.cmd directly ALSO fails here, and
     it fails the dangerous way: execFileSync throws, the catch hands back an empty string, nothing
     matches and the check reports a cheerful OK. The empty-output guard below is what stops a
     runner that never ran from passing. */
  execFileSync('npx', ['tsc', '--noEmit', '--skipLibCheck', '--target', 'es2022', '--module',
    'esnext', '--moduleResolution', 'bundler', '--lib', 'es2022,dom', ...entrypoints],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' });
} catch (e) {
  /* tsc exits non-zero because of the module-resolution and type errors we are DISCARDING, so a
     non-zero exit is the normal case here and must not be read as a failure. */
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
}

/* The compiler ALWAYS has something to say here — every edge file uses Deno, which this invocation
   cannot see — so silence means tsc never ran, not that the code is clean. Failing towards "fine"
   is the recorded way a gate becomes decoration. */
if (!/error TS/.test(out)) {
  console.error('X  tsc produced no output at all — the check did not run, so it proves nothing.');
  process.exit(1);
}

const undefinedNames = [];
for (const line of out.split(/\r?\n/)) {
  const m = /^(.+?)[(](\d+),(\d+)[)]: error TS2304: Cannot find name '([^']+)'/.exec(line);
  if (!m) continue;
  const [, file, ln, , name] = m;
  if (RUNTIME_GLOBALS.has(name)) continue;
  undefinedNames.push(`${file.replace(/\\\\/g, '/')}:${ln}  ${name}`);
}

if (undefinedNames.length) {
  console.error('X  Undefined names in edge code (a ReferenceError the moment that line runs):');
  for (const u of [...new Set(undefinedNames)]) console.error(`   ${u}`);
  console.error('   Add the import, or delete the call. Nothing else in this repo can see this.');
  process.exit(1);
}
console.log(`OK ${entrypoints.length} edge entrypoints: every name resolves (TS2304 only; Deno globals allowed).`);
