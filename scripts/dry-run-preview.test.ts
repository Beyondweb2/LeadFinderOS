/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DRY RUN MUST BE THE SAME PATH, AND IT MUST STOP BEFORE ANYTHING LEAVES THE BUILDING.

   🔴 WHY IT EXISTS (2026-09-15). `audit_followup` failed twice in front of live prospects, each time
   showing the operator nothing but "Edge Function returned a non-2xx status code". There was no way
   to ask send-whatsapp-message what it WOULD do — every refusal and every throw needed a real
   attempt on a real lead to provoke, so the first evidence of a fault was always a burned prospect.

   ⛔ THE TWO PROPERTIES, AND BOTH ARE STRUCTURAL RATHER THAN BEHAVIOURAL:

   1. THE PREVIEW RETURNS BEFORE THE SEND AND BEFORE EVERY WRITE. If the `if (dryRun)` return ever
      drifts below the Graph POST or either insert, a preview becomes a send — the worst possible
      regression in this file, and one no unit test of a pure function could see.
   2. A PAYLOAD THAT CANNOT BE BUILT IS A 200 HOLD, NEVER A 500. That is the whole lesson of §30b:
      every DESIGNED refusal here answers 200 with ok:false, so a non-2xx meant "a resolver threw
      and the reason is in an edge log nobody can read".

   ⚠️ IT READS THE SOURCE, deliberately. The function needs Deno, a Meta token and a live database;
   the only thing assertable here is the SHAPE, and the shape is exactly what went wrong.

   Run: npx tsx scripts/dry-run-preview.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENDER = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-whatsapp-message/index.ts'), 'utf8');

console.log('-- the mode exists and is read strictly --');
ok(/const dryRun: boolean = body\.mode === "dry_run";/.test(SENDER),
   'dry_run is an exact string match on mode — no truthy value can turn a send into a preview, or back');

console.log('\n-- it returns BEFORE the send and before every write --');
const iDry = SENDER.indexOf('if (dryRun) {');
/* ⚠️ lastIndexOf, and the reason matters: `test_send` has its OWN earlier Graph POST and returns
   long before this branch is reached. indexOf would compare against that one and read FAIL on
   correct code — a check failing for its own reasons (CLAUDE.md §4). */
const iGraph = SENDER.lastIndexOf('await sendViaGraph(');
const iMsgInsert = SENDER.indexOf('.from("whatsapp_messages").insert(');
const iSendInsert = SENDER.indexOf('.from("whatsapp_sends").insert(');
const iStatus = SENDER.indexOf('status: "report_sent"');
ok(iDry > 0, 'the dry-run return is present');
for (const [name, i] of [['the Graph POST', iGraph], ['the whatsapp_messages insert', iMsgInsert],
                         ['the whatsapp_sends insert', iSendInsert], ['the report_sent status move', iStatus]] as const) {
  ok(i > 0 && iDry < i, `it returns before ${name}`);
}

console.log('\n-- and it is the REAL payload, not a second rendering of it --');
/* ⛔ THE ONE-RULE-IN-TWO-PLACES TRAP, PRE-EMPTED. A preview that built its own payload would agree
   with the sender until the day it mattered. There is exactly one claimTemplatePayload call per
   branch and the preview reads the variable they all assign. */
ok(!/dryRun[\s\S]{0,400}claimTemplatePayload/.test(SENDER),
   'the dry-run block calls no resolver of its own — it returns the payload the send path built');
ok(/if \(dryRun\) \{[\s\S]{0,600}payload,/.test(SENDER), 'it echoes that payload');
ok(/if \(dryRun\) \{[\s\S]{0,600}body: storedBody,/.test(SENDER), 'and the transcript body the Inbox would store');
ok(/if \(dryRun\) \{[\s\S]{0,600}mode: "dry_run",/.test(SENDER),
   'it echoes mode:"dry_run" — the marker proving WHICH deployed version answered (CLAUDE.md §4)');

console.log('\n-- a build failure is a readable hold, never a 500 --');
ok(/let phase: "build" \| "send" = "build";/.test(SENDER), 'the phase flag exists');
const iPhaseSend = SENDER.indexOf('phase = "send";');
ok(iPhaseSend > 0 && iPhaseSend < iGraph && iPhaseSend > iDry,
   'phase flips to "send" after the preview returns and before the Graph POST');
ok(/if \(phase === "build"\)[\s\S]{0,700}template_not_buildable/.test(SENDER),
   'an unprefixed throw during the build returns 200 template_not_buildable with the reason');
ok(/if \(phase === "build"\)[\s\S]{0,700}unsafe_template_var/.test(SENDER),
   'and a prefixed one keeps the specific shape the UI already reads');
ok(/console\.error\("\[send-whatsapp-message\] error:"[\s\S]{0,200}"internal" \}, 500\)/.test(SENDER),
   'a failure AFTER the send is still a 500 — a half-completed send must not read as a refusal');

console.log('\n-- the Inbox asks the server, and refuses to trust an older deploy --');
const HOOK = fs.readFileSync(path.join(ROOT, 'src/hooks/useInbox.ts'), 'utf8');
ok(/mode: 'dry_run'/.test(HOOK), 'useInbox.preview sends the mode');
ok(/preview_unsupported/.test(HOOK),
   'a response with no dry_run marker is reported as unsupported — an old deploy WOULD have sent');
ok(!/fetchAll\(\)/.test(HOOK.slice(HOOK.indexOf('const preview'), HOOK.indexOf('// Optimistic single-lead status patch'))),
   'a preview refetches nothing — it changed nothing');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
