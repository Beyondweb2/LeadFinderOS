/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE QUEUE'S TEMPLATE MIRROR AND THE REAL REGISTRY MUST AGREE.

   🔴 WHAT THIS PINS (2026-09-14). `video_template` is registered at Meta with a VIDEO header. The
   drip assembled its own send payload from `templateBodyParams`, which returns the BODY only — so
   every attempt was rejected with (#132012) "header component parameter should not be empty".
   Attempted 4 times, accepted 0, over the ENTIRE life of the template. The operator's
   best-performing asset had never successfully sent, and because `whatsapp_sends` rows are written
   whatever Meta answers, the row count looked like traffic.

   ⛔ THE HEADER LIVED IN WA_TEMPLATES AND THE QUEUE KEPT ITS OWN COPY WITHOUT IT. The comment above
   that copy said "MIRRORS whatsapp-send.ts; change both together" — the field that mattered was
   never mirrored, because it was added after the copy was written. A comment is not a mechanism:
   the fourth rules-in-N-copies fault found in one day, after the questionnaire rule, the template
   picker and GBP_ADD_STEPS.

   ⚠️ THE MIRROR IS KEPT, NOT DELETED, AND THAT IS A DELIBERATE CHOICE. The two answer different
   questions — WA_TEMPLATES is "every template Meta knows and its true SHAPE (including the header)",
   the mirror is "which templates this queue may SEND, and with what vars". That is the same
   sendable-versus-exists split the send pickers already make. What must never differ is the shape
   of an entry they share, which is what this file enforces.
   ⛔ AND THE MIRROR MUST NEVER AGAIN CARRY SHAPE THE PAYLOAD DEPENDS ON. Payloads come from
   claimTemplatePayload, which reads the real registry; the mirror is an allowlist and nothing more.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* ⚠️ BRACE-MATCHED, NOT REGEX. A line-anchored regex silently missed every multi-line entry and
   reported 9 of 12 with three phantom "missing" names — a parse that fails quietly is how you
   delete a live send registry by accident. This counts braces and asserts the totals look sane. */
function parseRegistry(src: string, startMarker: string): Record<string, string> {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error(`registry not found: ${startMarker}`);
  /* ⚠️ START AT THE ASSIGNMENT BRACE, NOT THE FIRST ONE. The declaration is
     `Record<string, { lang: string; vars: … }> = {` — the first `{` belongs to the TYPE, so a naive
     scan closes on the type's own `}` and returns an empty registry. Caught by the sanity checks
     below, which is what they are for. */
  let depth = 0, started = false, end = i;
  const open = src.indexOf('= {', i);
  if (open < 0) throw new Error(`no assignment found for ${startMarker}`);
  for (let k = open + 2; k < src.length; k++) {
    if (src[k] === '{') { depth++; started = true; }
    else if (src[k] === '}') { depth--; if (started && depth === 0) { end = k; break; } }
  }
  const body = src.slice(i, end).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/([a-z_0-9]+):\s*\{\s*lang:\s*"([^"]+)",\s*vars:\s*\[([^\]]*)\]/g)) {
    out[m[1]] = `${m[2]}|${m[3].replace(/["\s]/g, '')}`;
  }
  return out;
}

const queue = read('supabase/functions/process-whatsapp-queue/index.ts');
const send = read('supabase/functions/_shared/whatsapp-send.ts');
const MIRROR = parseRegistry(queue, 'const TEMPLATES: Record<string');
const REAL = parseRegistry(send, 'export const WA_TEMPLATES: Record<string');

console.log('-- the parse itself has to be trustworthy --');
ok(Object.keys(MIRROR).length >= 10, `the mirror parsed (${Object.keys(MIRROR).length} entries)`);
ok(Object.keys(REAL).length >= 14, `the real registry parsed (${Object.keys(REAL).length} entries)`);
ok(!!MIRROR.video_template && !!REAL.video_template, 'and both contain video_template');
ok(!!MIRROR.hook_followup, 'and the mirror contains hook_followup, which the queue reads by name');

console.log('\n-- every shared entry agrees on lang and vars --');
for (const name of Object.keys(MIRROR)) {
  if (!REAL[name]) { ok(false, `${name} is in the mirror but NOT in WA_TEMPLATES — the queue could send a template the sender cannot build`); continue; }
  ok(MIRROR[name] === REAL[name], `${name.padEnd(24)} ${MIRROR[name] === REAL[name] ? 'agrees' : `DIFFERS  mirror=${MIRROR[name]}  real=${REAL[name]}`}`);
}

console.log('\n-- 🔴 the drip builds NO payload of its own --');
/* The one line that caused this. If an inline template payload ever comes back, a header-bearing
   template silently loses its header again and Meta rejects every send. */
ok(/\.\.\.claimTemplatePayload\(templateName, lang, lead\.business_name as string, resolvedUrl, templateExtra\)/.test(queue),
   'the drip sends via claimTemplatePayload');
ok(!/components: templateBodyParams\(/.test(queue), 'and never assembles `components` itself');
ok(!/import \{[^}]*templateBodyParams/.test(queue), 'templateBodyParams is not even imported any more');

console.log('\n-- the header still comes from the registry --');
ok(/headerVideoUrl: VIDEO_TEMPLATE_HEADER_URL/.test(send), 'video_template still declares its video header');
ok(/if \(entry\.headerVideoUrl\) \{/.test(send), 'and claimTemplatePayload still adds it');
/* ⛔ THE MIRROR MUST NOT GROW A headerVideoUrl. Shape belongs in one place; a second copy of the
   header is how this happened. */
ok(!/headerVideoUrl/.test(queue), 'the mirror carries NO header — shape lives in the real registry only');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
