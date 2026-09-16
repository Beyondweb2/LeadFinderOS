#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE IMPORT-GRAPH GATE — `node scripts/check-import-graph.mjs`, part of `npm run check`.

   🔴 WHY IT EXISTS. Every other local gate lets a deleted MODULE through. tsc covers src/ only;
   check-edge-syntax parses; check-edge-undefined discards module-resolution errors on purpose (it
   asks one question, TS2304). So a `_shared` file deleted while a function still imports it passes
   typecheck, build, both edge gates and every suite — and fails at deploy, with the function sitting
   on its previous version while `main` looks correct (CLAUDE.md §4, §26). Paul's rule for the deep
   clean (2026-09-15): the import graph becomes a gate BEFORE anything is deleted.

   What it checks, on every file under src/, supabase/functions/ and scripts/:
     1. Every relative or `@/` import RESOLVES to a file on disk. Assets count (a .png or .json is a
        real import). `?raw` / `?url` suffixes are stripped. Bare packages and URL imports are skipped.
     2. In the transitive closure of every edge entrypoint (supabase/functions/<fn>/index.ts): no `@/`
        alias and no extensionless relative import of a .ts file — the Supabase bundler refuses both,
        Vite and tsx accept both, which is exactly why they reached main twice (§4).
     3. It found something. An empty scan is a broken scanner, not a clean repo (§30e's lesson).

   Hard failures come from src/, supabase/functions/, scripts/*.test.ts and the scripts wired into
   package.json or run-tests.mjs. Anything else under scripts/ (one-off tools, untracked probes) is a
   WARNING — a broken scratch script must not block a deploy, but it should not be invisible either.

   Extras:  --reached-by <path>   print every edge function whose closure includes that file — the
                                  redeploy list, walked, not remembered.
            --orphans             list files reached from no entrypoint (report only, never a failure).
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv.find((a, i) => i > 1 && !a.startsWith('--') && process.argv[i - 1] !== '--reached-by') ?? '.');
const args = process.argv.slice(2);
const reachedByArg = args.includes('--reached-by') ? args[args.indexOf('--reached-by') + 1] : null;
const wantOrphans = args.includes('--orphans');

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const walk = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e === 'node_modules' || e === 'dist' || e === '.git') continue; walk(p, out); }
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(e)) out.push(p);
  }
  return out;
};
const files = ['src', 'supabase/functions', 'scripts'].flatMap((d) => walk(path.join(ROOT, d)));
const fileSet = new Set(files.map(rel));

/* Which scripts/ files are wired into the build. Anything else there is warning-only. */
const pkg = existsSync(path.join(ROOT, 'package.json')) ? JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) : { scripts: {} };
const wired = new Set();
for (const cmd of Object.values(pkg.scripts ?? {})) for (const m of String(cmd).matchAll(/scripts\/([\w.-]+\.mjs)/g)) wired.add(`scripts/${m[1]}`);
const runner = path.join(ROOT, 'scripts/run-tests.mjs');
if (existsSync(runner)) for (const m of readFileSync(runner, 'utf8').matchAll(/'([\w.-]+\.mjs)'/g)) wired.add(`scripts/${m[1]}`);
wired.add('scripts/run-tests.mjs');
const isHard = (r) => r.startsWith('src/') || r.startsWith('supabase/functions/') || /^scripts\/[^/]+\.test\.ts$/.test(r) || wired.has(r);

const ASSET = /\.(png|jpe?g|gif|svg|webp|css|json|html|txt|md|woff2?|ttf)$/i;
const tryResolve = (base) => {
  const cands = [base, base + '.ts', base + '.tsx', base + '.mts', base + '.mjs', base + '.js',
    base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  for (const c of cands) { if (fileSet.has(rel(c))) return rel(c); if (ASSET.test(c) && existsSync(c)) return rel(c); }
  return null;
};

const specRe = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/gm;
const deps = new Map();      // file -> Set(target)
const edges = new Map();     // file -> [{spec, target}]
const unresolved = [];       // {file, spec}
for (const f of files) {
  const r = rel(f);
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  deps.set(r, new Set()); edges.set(r, []);
  let m;
  while ((m = specRe.exec(src))) {
    const raw = m[1];
    if (/^(https?:|npm:|node:|jsr:|data:)/.test(raw)) continue;
    const spec = raw.replace(/\?(raw|url|inline)$/, '');
    let target = null;
    if (spec.startsWith('@/')) target = tryResolve(path.join(ROOT, 'src', spec.slice(2)));
    else if (spec.startsWith('.') || spec.startsWith('/')) target = tryResolve(path.resolve(path.dirname(f), spec));
    else continue; // bare package
    if (target) { deps.get(r).add(target); edges.get(r).push({ spec, target }); }
    else unresolved.push({ file: r, spec: raw });
  }
}

/* Edge closures. */
const edgeEntries = [...fileSet].filter((r) => /^supabase\/functions\/[^_][^/]*\/index\.ts$/.test(r));
const reach = (start) => { const seen = new Set(); const st = [start]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const d of deps.get(x) ?? []) st.push(d); } return seen; };
const closures = new Map(edgeEntries.map((e) => [e, reach(e)]));
const edgeFaults = [];
for (const [fn, cl] of closures) {
  for (const f of cl) for (const { spec, target } of edges.get(f) ?? []) {
    if (spec.startsWith('@/')) edgeFaults.push({ fn, file: f, spec, why: 'Vite alias — the Supabase bundler cannot resolve @/' });
    else if (target.endsWith('.ts') && !/\.(ts|js)$/.test(spec)) edgeFaults.push({ fn, file: f, spec, why: 'extensionless import of a .ts file — the bundler needs the .ts' });
  }
}

/* --reached-by: the redeploy list. */
if (reachedByArg) {
  const target = reachedByArg.split(path.sep).join('/').replace(/^\.\//, '');
  const fns = [...closures].filter(([, cl]) => cl.has(target)).map(([fn]) => fn.split('/')[2]).sort();
  if (!fileSet.has(target)) { console.error(`no such file in the scan: ${target}`); process.exit(2); }
  console.log(fns.length ? `${target} is reached by ${fns.length} edge function(s):\n  ${fns.join('\n  ')}` : `${target} is reached by NO edge function.`);
  process.exit(0);
}

/* Orphans (report only). */
if (wantOrphans) {
  const entries = new Set([...edgeEntries, 'src/main.tsx', ...[...fileSet].filter((r) => /^scripts\/[^/]+\.(test\.ts|mjs|mts)$/.test(r))]);
  const all = new Set(); for (const e of entries) for (const x of reach(e)) all.add(x);
  const orphans = [...fileSet].filter((r) => !all.has(r) && !entries.has(r) && !/^scripts\/_/.test(r) && !r.endsWith('.d.ts')).sort();
  console.log(`orphans (reached from no entrypoint; report only):\n  ${orphans.join('\n  ') || '(none)'}`);
}

/* Verdict. */
if (files.length < 100 || edgeEntries.length < 10) {
  console.error(`check-import-graph: scanned only ${files.length} files / ${edgeEntries.length} edge entrypoints — the scan itself is broken. FAIL.`);
  process.exit(2);
}
const hard = unresolved.filter((u) => isHard(u.file));
const soft = unresolved.filter((u) => !isHard(u.file));
for (const u of soft) console.log(`  warn  ${u.file} imports "${u.spec}" which does not exist (unwired tool — not a gate failure)`);
for (const u of hard) console.log(`  FAIL  ${u.file} imports "${u.spec}" — does not resolve to any file`);
for (const e of edgeFaults) console.log(`  FAIL  ${e.file} imports "${e.spec}" (reached by edge fn ${e.fn.split('/')[2]}) — ${e.why}`);
const n = hard.length + edgeFaults.length;
console.log(`${n ? 'FAIL' : 'OK'} check-import-graph: ${files.length} files, ${edgeEntries.length} edge entrypoints, ${unresolved.length - soft.length} unresolved imports in gated files, ${edgeFaults.length} edge-closure faults${soft.length ? `, ${soft.length} warning(s) in unwired scripts` : ''}.`);
process.exit(n ? 1 : 0);
