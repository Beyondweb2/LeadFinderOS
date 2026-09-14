/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PICKER AND THE SERVER REGISTRY MUST AGREE ABOUT WHAT EXISTS.

   🔴 WHAT THIS PINS (2026-09-14). `video_template` — the approved outreach hook with the video
   header, the operator's best-performing asset — was reported as missing from the campaign
   template dropdown. It was not missing. It was listed under **the name of the template it
   replaced**: `audit_result_hook`, retired on 2026-09-12. Two months of sends under one name, a
   successor with different approved words and a video header, and one label still carrying the
   dead name. The operator read the list, did not find "video", and concluded the product could not
   send its best message.

   ⛔ THE STRUCTURAL FAULT UNDERNEATH IS rules-in-N-copies, AND src/types/outreach.ts SAYS SO IN ITS
   OWN COMMENT: "Keep in sync with the edge function's TEMPLATES allowlist in
   process-whatsapp-queue." A sentence asking a human to keep two lists in step is not a mechanism.

   ⚠️ AND THE TWO LISTS CANNOT SIMPLY BE MERGED, which is why this is a CHECK and not a refactor.
   `whatsapp-send.ts` reads `Deno.env` at module scope, so the SPA must never import it (§6g) — the
   duplication is forced by the runtime boundary. What is NOT forced is letting them drift silently:
   every template the server can send must be accounted for HERE, in exactly one list, on purpose.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WHATSAPP_TEMPLATES, LEGACY_WHATSAPP_TEMPLATES, templateLabel } from '../src/types/outreach';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

/* Parsed as TEXT rather than imported, for the Deno reason above. The registry is the server's
   own answer to "what can be sent", so it is the side that decides. */
const send = read('supabase/functions/_shared/whatsapp-send.ts');
/* ⚠️ THE CONSTANT IS `WA_TEMPLATES`. CLAUDE.md calls it `WA_TEMPLATE_REQS` in two places and no
   such name exists in that file — indexOf returned -1, the slice silently produced nonsense, and
   the parse reported ZERO templates while every assertion below still ran and "failed" for the
   wrong reason. A parse that cannot find its input must say so instead of returning empty. */
const reqsBlock = (() => {
  const i = send.indexOf('export const WA_TEMPLATES');
  if (i < 0) throw new Error('WA_TEMPLATES not found in whatsapp-send.ts — the registry was renamed or moved');
  const j = send.indexOf('\n};', i);
  return send.slice(i, j);
})();
const SERVER = [...reqsBlock.matchAll(/^ {2}([a-z_0-9]+):\s*\{/gm)].map((m) => m[1]);
ok(SERVER.length > 10, `the server registry parsed (${SERVER.length} templates)`);
/* ⛔ AND IT STOPS, rather than letting every "is it in the registry" check fail against an empty
   list and read as nine separate faults. An empty parse is one fault, and it is this one. */
if (SERVER.length === 0) { console.log('FAIL the registry parsed EMPTY — everything below is meaningless'); process.exit(1); }

/* The four places a template may legitimately be accounted for on the SPA side. */
const PICKER = WHATSAPP_TEMPLATES.map((t) => t.value);
const LEGACY = LEGACY_WHATSAPP_TEMPLATES.map((t) => t.value);
const outreach = read('src/types/outreach.ts');
const serverOnlyBlock = outreach.slice(outreach.indexOf('const SERVER_ONLY_TEMPLATE_LABELS'),
  outreach.indexOf('};', outreach.indexOf('const SERVER_ONLY_TEMPLATE_LABELS')));
const SERVER_ONLY = [...serverOnlyBlock.matchAll(/^ {2}([a-z_0-9]+):/gm)].map((m) => m[1]);

console.log('\n-- every sendable template is accounted for, in exactly one list --');
/* ⛔ THE ASSERTION THAT WOULD HAVE CAUGHT THIS. A template the server can send and nothing here
   names is either a picker entry somebody forgot or a raw key printing on the dashboard. */
for (const t of SERVER) {
  const where = [PICKER.includes(t) && 'picker', LEGACY.includes(t) && 'legacy', SERVER_ONLY.includes(t) && 'server-only']
    .filter(Boolean) as string[];
  ok(where.length === 1, `${t.padEnd(24)} → ${where.join(' + ') || 'NOWHERE — unlabelled and unofferable'}`);
}

console.log('\n-- and the picker never offers something the server cannot send --');
/* The other direction, and it is the expensive one: a dropdown entry the server refuses is a send
   that fails at Meta after the operator has chosen it. */
for (const t of PICKER) ok(SERVER.includes(t), `${t} is in the server registry`);

console.log('\n-- every offered template has a label that is not its key --');
/* A raw key in a dropdown is what made this bug findable only by reading source. */
for (const t of [...PICKER, ...LEGACY, ...SERVER_ONLY]) {
  ok(templateLabel(t) !== t, `${t.padEnd(24)} has a real label ("${templateLabel(t)}")`);
}

console.log('\n-- the video template says it carries a video --');
/* 🔴 THE REGRESSION IN ONE LINE. video_template and audit_reply_warm do the same job and are told
   apart ONLY by their labels; video_template additionally carries the header asset that makes it
   worth choosing. A label naming the retired template is how it went unfindable for two days. */
const video = WHATSAPP_TEMPLATES.find((t) => t.value === 'video_template');
ok(!!video, 'video_template is offered in the picker');
ok(/video/i.test(video?.label ?? ''), `its label names the video ("${video?.label}")`);
ok(!/^Audit result hook \(outreach\)$/.test(video?.label ?? ''),
   'and is no longer the retired audit_result_hook\'s name');
/* The retired template keeps its body for the 135 rows sent under it, and must never be offered. */
ok(!PICKER.includes('audit_result_hook'), 'the retired audit_result_hook is NOT sendable');
ok(!SERVER.includes('audit_result_hook'), 'and the server does not carry it either');
ok(/audit_result_hook:/.test(read('src/lib/templateBodies.ts')),
   'but its BODY survives — those sends must still render as words');

console.log('\n-- re_engage: the live one is offered, the retired one is not --');
/* ⚠️ The old `re_engage` body is kept ONLY so 21 August transcripts render. Offering it would send
   a message quoting a price that has not existed since 2026-09-12. */
ok(PICKER.includes('re_engage_49'), 're_engage_49 (the live one) is in the picker');
ok(!PICKER.includes('re_engage'), 'the retired re_engage is NOT');
ok(!SERVER.includes('re_engage'), 'and it is not sendable server-side');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
