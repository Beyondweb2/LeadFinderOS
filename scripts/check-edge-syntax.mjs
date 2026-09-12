#!/usr/bin/env node
/* Guard: every edge function and every src/lib file it can reach must PARSE.
 *
 * WHY THIS EXISTS (2026-09-12). A stray closing brace in create-ai-audit/index.ts passed the whole
 * local gate — typecheck at baseline (it does not cover supabase/functions), the Vite build (it does
 * not bundle edge code), 79/84 suites (they read the file's TEXT) — and was caught only by the
 * Supabase bundler at deploy time: "Expected ',', got 'catch'". Deno is not on this machine
 * (CLAUDE.md §0), so `deno check` cannot be the gate. esbuild IS here (Vite depends on it), and its
 * transform parses TypeScript without type-checking, which is exactly the class of fault the deploy
 * kept catching: syntax, not types.
 *
 * ⚠️ WHAT IT DOES NOT CATCH: a missing `.ts` extension on a relative import, an `@/` alias, a type
 * error, an unresolved module. Those still need the deploy (CLAUDE.md §4). This is the cheap parse
 * pass in front of it.
 *
 * Run: node scripts/check-edge-syntax.mjs   (exits non-zero on the first file that will not parse)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transformSync } from 'esbuild';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules') walk(p, out); }
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(join(ROOT, 'supabase', 'functions')),
  ...walk(join(ROOT, 'src', 'lib')),
];

let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  try {
    transformSync(src, { loader: 'ts', format: 'esm', target: 'esnext', logLevel: 'silent' });
  } catch (e) {
    bad++;
    const msg = e?.errors?.[0];
    const where = msg?.location ? `:${msg.location.line}:${msg.location.column}` : '';
    console.error(`✗ ${relative(ROOT, f)}${where} — ${msg?.text ?? (e instanceof Error ? e.message : String(e))}`);
  }
}

if (bad) {
  console.error(`\n${bad} file(s) will not parse. The Supabase bundler would refuse the deploy.`);
  process.exit(1);
}
console.log(`✓ ${files.length} edge-reachable TypeScript files parse (esbuild). Types and import extensions are still the deploy's job.`);
