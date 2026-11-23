/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SERVER'S WHATSAPP HAND TEST (2026-11-23, fix-wa-sends). send-whatsapp-message lets a CRON_SECRET call with the
   hand-test job header run test_send ONLY: destination = the WHATSAPP_TEST_NUMBER secret (never the request), one
   whatsapp_messages row (test_mode, no lead) so the webhook's delivered/failed is readable, never a whatsapp_sends row.
   Run: npx tsx scripts/wa-hand-test-door.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const swm = readFileSync('supabase/functions/send-whatsapp-message/index.ts', 'utf8');
const door = swm.slice(swm.indexOf('const handTest ='), swm.indexOf('const operatorId = actor.id'));

ok(/const HAND_TEST_JOB_HEADER = "wa-hand-test"/.test(swm), 'the hand-test header value is named once');
ok(/req\.headers\.get\("x-internal-job"\) === HAND_TEST_JOB_HEADER/.test(door), 'the door opens only on the hand-test job header');
ok(/if \(handTest && \(!isInternalCall\(req\) \|\| body\.mode !== "test_send"\)\) return json\(\{ ok: false, error: "forbidden" \}, 403\)/.test(door),
  'without the CRON_SECRET, or for any mode but test_send, it is refused (no fall-through)');
ok(door.indexOf('return json({ ok: false, error: "forbidden" }, 403)') < door.indexOf('else if (handTest)'), 'the refusal comes before the actor is set');
ok(/!sched && req\.headers/.test(door), 'the inbox drain door keeps its own header');

const ts = swm.slice(swm.indexOf('if (body.mode === "test_send")'), swm.indexOf('if (!text && !templateName) return json'));
ok(ts.indexOf('const dest = toWhatsAppNumber(Deno.env.get("WHATSAPP_TEST_NUMBER")') > -1, 'test_send still sends only to the secret test number');
const log = ts.slice(ts.indexOf('if (handTest && r.ok && r.messageId)'));
ok(log.length > 0 && /from\("whatsapp_messages"\)\.insert/.test(log.slice(0, 600)), 'a hand test leaves one whatsapp_messages row');
ok(!/whatsapp_sends/.test(log.slice(0, 600).replace(/Not whatsapp_sends[^\n]*/, '')), 'and never a whatsapp_sends row (queue count + breaker)');
ok(/test_mode: true/.test(log.slice(0, 600)) && /phone: dest/.test(log.slice(0, 600)), 'the row is test_mode, to the test number');

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nAll hand-test door checks passed');
