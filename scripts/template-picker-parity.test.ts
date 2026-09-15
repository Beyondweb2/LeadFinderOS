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

console.log('\n-- ONE SENDABLE LIST, AND EVERY PICKER READS IT --');
/* 🔴 WHY THIS SECTION EXISTS (2026-09-15). Everything above passed while the INBOX could not send
   four approved templates. The parity checks compare the server registry against
   WHATSAPP_TEMPLATES and both were correct — what nobody asserted was that the screens actually
   RENDER that list. `useInbox.ts` exported a second hardcoded array, `WA_REPLY_TEMPLATES`, seven
   entries, and Inbox.tsx's thread picker and bulk-send dialog read THAT. So `competitor_hook` was
   approved at Meta on 09-14 and unsendable from the Inbox from that day; `audit_followup`,
   `explain_offer` and `contact_followup` were invisible too. Sendable by the server, absent from
   the one screen an operator sends from.
   ⛔ SO THE PROPERTY IS NOT "is the list right" — it is "is there only one of it". A copy is
   correct on the day it is written and wrong on the day a template is added, which is why a
   reviewer cannot catch this and the diff that breaks it looks innocent. Same shape as
   questionnaire-complete (five copies) and audit-kind (a writer and a reader that disagreed):
   grep the importers, fail the build on a local copy.
   ⚠️ IT MATCHES ON SHAPE, NOT NAME. A renamed second list is still a second list, so this looks
   for an OPTION-LIST LITERAL — `{ name|value: '<a real template>' }` — rather than for the
   identifier that happened to cause it. Bare-string sets (Inbox's REPORT_TEMPLATES) and label
   MAPS (`video_template: 'Audit result hook'`) answer different questions, legitimately have their
   own lists, and are deliberately not matched. */
const SRC = path.join(ROOT, 'src');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(d, e.name);
  return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : [];
});
const files = walk(SRC);
ok(files.length > 50, `scanned the SPA source (${files.length} files)`);

const KEYS = new Set([...SERVER, ...LEGACY]);
const OPTION_ENTRY = /(?:\bname|\bvalue)\s*:\s*['"`]([a-z_0-9]+)['"`]/g;
const CANONICAL = path.join(SRC, 'types', 'outreach.ts');
let copies = 0;
for (const file of files) {
  if (file === CANONICAL) continue;                       // the one list, by definition
  const body = fs.readFileSync(file, 'utf8');
  const found = new Set([...body.matchAll(OPTION_ENTRY)].map((m) => m[1]).filter((k) => KEYS.has(k)));
  /* Two would be a coincidence worth allowing (a pair of special cases); three or more entries of
     option shape in one file is a list. The deleted WA_REPLY_TEMPLATES had seven. */
  if (found.size >= 3) { copies++; ok(false, `${path.relative(ROOT, file)} holds a SECOND sendable list — ${[...found].join(', ')}`); }
}
ok(copies === 0, `no second sendable list anywhere in src/ (${files.length} files scanned)`);

/* ⛔ AND THE INBOX SPECIFICALLY, because it is the screen the fault hid on and the only one that
   sends a template by hand. Not redundant with the sweep: the sweep proves no SECOND list exists,
   this proves the FIRST one arrived. */
const inbox = read('src/pages/Inbox.tsx');
ok(/import\s*\{[^}]*\bWHATSAPP_TEMPLATES\b[^}]*\}\s*from\s*'@\/types\/outreach'/.test(inbox),
   'Inbox.tsx imports the canonical WHATSAPP_TEMPLATES');
ok(/WHATSAPP_TEMPLATES\.map\(/.test(inbox), 'and renders it in its picker(s)');
ok(!/WA_REPLY_TEMPLATES\s*=/.test(read('src/hooks/useInbox.ts')),
   'useInbox.ts declares no sendable list of its own');

/* The four that were invisible. Named individually so a regression says WHICH, not "a count moved". */
for (const t of ['competitor_hook', 'audit_followup', 'explain_offer', 'contact_followup']) {
  ok(PICKER.includes(t), `${t.padEnd(18)} is offered by the one list the Inbox now reads`);
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
