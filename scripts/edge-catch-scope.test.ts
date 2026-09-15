/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AN EDGE FUNCTION'S OUTER `catch` MUST NOT REFERENCE ANYTHING DECLARED INSIDE ITS `try`.

   🔴 THE FAULT (2026-09-15). `send-whatsapp-message` gained a `let phase` inside its handler's try
   block and read it in the catch. A catch clause is a SIBLING scope, not a child of the try block,
   so that name is simply not there: EVERY throw became a ReferenceError *inside the error handler*,
   which escaped Deno.serve entirely. The runtime then answered with its own 500 carrying none of
   our CORS headers, the browser refused to read it, and supabase-js reported "Failed to send a
   request to the Edge Function" — a third distinct symptom for what was still just "something
   threw", on a button that had already cost two live prospects.

   ⛔ NOTHING ELSE IN THIS REPO CAN CATCH IT. `npm run typecheck` does not cover supabase/functions
   (CLAUDE.md §3), `check-edge-syntax.mjs` parses without resolving names, and Deno is not installed
   on this machine — so the deploy succeeded and the bug shipped. The failure is silent until the
   first throw, and its whole effect is to destroy the error report.

   ⚠️ IT IS A SCOPE CHECK, NOT A TYPE CHECK: comments and strings are stripped, property accesses
   (`x.foo`) and object keys are ignored, and anything declared above the `try` — or imported, or a
   known global — is fine. It looks only at the handler's OUTERMOST try/catch, which is the one
   whose failure takes the CORS headers with it.

   Run: npx tsx scripts/edge-catch-scope.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions');
/** The handler's outermost try, at the two-space indent inside Deno.serve's arrow. */
const TRY_MARKER = '\n  try {';

/** Comments and string/template literals removed, so a name inside prose is never a reference. */
function strip(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(new RegExp('`(?:\\[\\s\\S]|[^`\\\\])*`', 'g'), '``')
    .replace(new RegExp(String.raw`'(?:\\.|[^'\\\\])*'`, 'g'), "''")
    .replace(new RegExp(String.raw`"(?:\\.|[^"\\\\])*"`, 'g'), '""');
}

const GLOBALS = new Set([
  'Deno', 'console', 'JSON', 'Response', 'Request', 'Error', 'Date', 'Math', 'Number', 'String',
  'Boolean', 'Object', 'Array', 'Promise', 'Set', 'Map', 'URL', 'URLSearchParams', 'crypto', 'fetch',
  'undefined', 'null', 'true', 'false', 'globalThis', 'isNaN', 'parseInt', 'parseFloat', 'NaN',
]);
const KEYWORDS = new Set([
  'const', 'let', 'var', 'if', 'else', 'return', 'await', 'async', 'function', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'new', 'of', 'in', 'for', 'while', 'switch', 'case',
  'default', 'break', 'continue', 'do', 'this', 'void', 'delete', 'as', 'from', 'import', 'export',
  'string', 'number', 'boolean', 'any', 'unknown', 'never', 'null', 'true', 'false', 'undefined',
]);

const entrypoints = fs.readdirSync(FN_DIR)
  .filter((d) => fs.existsSync(path.join(FN_DIR, d, 'index.ts')))
  .sort();
ok(entrypoints.length > 20, `found ${entrypoints.length} edge entrypoints`);

let checked = 0;
for (const fn of entrypoints) {
  const raw = fs.readFileSync(path.join(FN_DIR, fn, 'index.ts'), 'utf8').replace(/\r\n/g, '\n');
  const src = strip(raw);
  /* The handler's OUTERMOST try — two-space indent inside Deno.serve's arrow — and the catch that
     closes it at the same indent. A function without that shape has no such catch to get wrong. */
  const iTry = src.indexOf(TRY_MARKER);
  if (iTry < 0) continue;
  const m = /\n  \} catch \((\w+)[^)]*\) \{\n([\s\S]*?)\n  \}\n/.exec(src.slice(iTry));
  if (!m) continue;
  checked++;
  const [, param, bodyRaw] = m;

  /* ⛔ THE PRECISE RULE, AND IT IS DELIBERATELY NARROW: a name is a fault only when EVERY
     declaration of it in the file sits inside this try block. Module-level declarations are fine
     wherever they appear — the module is evaluated long before a request — and so is anything in the
     handler's preamble. Asking instead "is it declared above the try" would fail correct code (a
     hoisted `function json()` written below the handler), which is a check failing for its own
     reasons, the trap CLAUDE.md §4 keeps recording. */
  const tryStart = iTry + TRY_MARKER.length;
  let depth = 1, i = tryStart;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const tryEnd = i - 1;
  const catchStart = iTry + (m.index ?? 0);

  /* Property accesses and object keys are not references to a binding. */
  const refs = bodyRaw.replace(/\.\s*[A-Za-z_$][\w$]*/g, '.').replace(/([A-Za-z_$][\w$]*)\s*:/g, '');
  const names = [...new Set([...refs.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((x) => x[1]))]
    .filter((n) => !GLOBALS.has(n) && !KEYWORDS.has(n) && n !== param);

  const unknownNames = names.filter((n) => {
    const decl = new RegExp('(?:const|let|var|function|class)\\s+' + n + '\\b', 'g');
    const at = [...src.matchAll(decl)].map((d) => d.index ?? -1);
    /* Declared nowhere we can see (an import binding, a parameter, a global we did not list) — not
       this check's business. Only a name whose declarations ALL live inside the try is a fault. */
    if (at.length === 0) return false;
    return at.every((x) => x > tryStart && x < tryEnd && x < catchStart);
  });

  ok(unknownNames.length === 0,
     `${fn.padEnd(28)} outer catch references only names in scope${unknownNames.length ? ` — NOT IN SCOPE: ${unknownNames.join(', ')}` : ''}`);
}
ok(checked >= 5, `checked ${checked} handlers with an outer try/catch`);

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
