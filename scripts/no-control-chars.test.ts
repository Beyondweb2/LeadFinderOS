/* No stray control characters in source (2026-09-26).
   create-ai-audit's locQ regex carried two literal BACKSPACE characters (0x08) where `\b` was meant, so
   "does this town already say UK" never matched and "Bourne uk" became "Bourne uk UK". It parsed and
   typechecked fine: a control character inside a regex literal is legal, just wrong. A scripted edit
   on this Windows checkout turned `\b` into 0x08, and it can do it again. So every gated source file
   is checked for control characters other than tab, LF and CR. Behaviour is pinned below too. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

let failures = 0;
function ok(value: unknown, message: string) {
  if (value) console.log(`PASS ${message}`);
  else { failures++; console.error(`FAIL ${message}`); }
}

const root = resolve(import.meta.dirname, '..');
const BAD = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
const files = [...walk(join(root, 'src')), ...walk(join(root, 'supabase', 'functions'))];
const offenders = files.filter((f) => BAD.test(readFileSync(f, 'utf8')));
ok(files.length > 100, `scanned ${files.length} source files`);
ok(offenders.length === 0, `no control characters in src/ or supabase/functions/${offenders.length ? ': ' + offenders.map((f) => f.slice(root.length + 1)).join(', ') : ''}`);

// The regex create-ai-audit uses for both ukTown and locQ, as written in the file.
const src = readFileSync(join(root, 'supabase/functions/create-ai-audit/index.ts'), 'utf8');
const locQLine = src.split('\n').find((l) => l.includes('const locQ = isUK && locationText && !/')) ?? '';
ok(locQLine.includes(String.raw`!/\b(uk|united kingdom|england|scotland|wales)\b/i`), 'locQ uses real \\b word boundaries');
const re = /\b(uk|united kingdom|england|scotland|wales)\b/i;
ok(re.test('Bourne uk') && re.test('Leeds, England'), 'a town that already names the country is recognised (no double " UK")');
ok(!re.test('Ukfield') && !re.test('Englefield Green'), 'whole words only: Ukfield / Englefield Green are not mistaken for the country');

if (failures) throw new Error(`${failures} control-character checks failed`);
console.log('no-control-chars: all checks passed');
