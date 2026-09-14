/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A LEAD WAITING ON AN AUDIT MUST NOT HOLD UP THE ONES BEHIND IT.

   🔴 THE FAULT, MEASURED 2026-09-14. The queue is strict FIFO and sends ONE lead per tick. When the
   lead at the front had an audit still running, the handler `return`ed the WHOLE tick — so every
   lead behind it waited too, including ones whose audits had finished an hour earlier. Live that
   afternoon: 40 leads queued, 11 audits run, six or more complete, and TWO messages sent in 68
   minutes. Throughput was one send per audit-completion, serialised, not one send per tick.

   ⛔ SKIPPING IS NOT DROPPING. The September fix that stopped 16 leads being silently un-queued is
   the thing this must not undo: a skipped lead has NOTHING written to it — status, queued_at and
   delivery fields are all untouched — and it is examined again, first, on the next tick.

   ⛔ AND SKIPPING CANNOT STARVE THE HEAD, because it is a per-tick fallback rather than a
   reordering. The oldest lead is re-examined at the top of every tick and wins the moment its audit
   completes. Its worst case is exactly what it was before: once the audit passes
   OUTREACH_AUDIT_STALE_MS the existing branch dequeues it with its reason.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTREACH_AUDIT_CONCURRENCY, OUTREACH_AUDIT_STALE_MS } from '../supabase/functions/_shared/outreach-audit.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const q = read('supabase/functions/process-whatsapp-queue/index.ts');

console.log('-- the tick can see past the head --');
ok(/\.limit\(QUEUE_LOOKAHEAD\);/.test(q), 'the queue read takes a look-ahead, not one row');
ok(/const QUEUE_LOOKAHEAD = 10;/.test(q), 'bounded at 10');
/* ⛔ IT MUST EXCEED THE AUDIT CONCURRENCY. At most OUTREACH_AUDIT_CONCURRENCY leads can be waiting
   on an in-flight audit at once, so a look-ahead larger than that always reaches a ready lead if
   one exists. Equal would be enough only if nothing else ever blocked. */
ok(10 > OUTREACH_AUDIT_CONCURRENCY,
   `and larger than the audit concurrency (${OUTREACH_AUDIT_CONCURRENCY}), so a ready lead is always in reach`);
ok(/\.order\("queued_at", \{ ascending: true \}\)/.test(q), 'still strictly oldest-first — the order never changes');

console.log('\n-- 🔴 skipping writes NOTHING to the lead it passes over --');
const block = q.slice(q.indexOf('const candidates = (leadRows ?? [])'), q.indexOf('/* "empty_queue", "nothing left but archived'));
ok(block.length > 200, `the selection block was found (${block.length} chars)`);
ok(!/\.update\(/.test(block), 'no update in the selection — a skipped lead is untouched');
ok(!/status:/.test(block), 'and nothing sets a status');
ok(!/queued_at/.test(block), 'and nothing touches queued_at, so its place in the queue is unchanged');

console.log('\n-- the head is the fallback, so it is still judged every tick --');
/* ⛔ RETURNING EARLY HERE WHEN NOTHING IS SENDABLE WOULD BE STARVATION INTRODUCED BY THE FIX FOR
   STARVATION: a permanently wedged head would never reach the branch that dequeues it. */
ok(/let lead: Record<string, unknown> \| null = candidates\[0\] \?\? null;/.test(block),
   'lead starts as the OLDEST candidate');
ok(!/return json/.test(block), 'the selection never returns early — the existing branches still run');
ok(/skipped: "awaiting_audit"/.test(q), 'and the wait branch still exists for the head');
ok(/status: "not_contacted", whatsapp_delivery_status: "audit_reply_unavailable"/.test(q),
   'as does the stale dequeue — the only path that changes a lead status');
ok(OUTREACH_AUDIT_STALE_MS === 45 * 60 * 1000, 'the head\'s worst case is still the 45-minute stale bound');

console.log('\n-- a template that needs no audit is never skipped --');
ok(/if \(!templateNeedsAudit\(vars\)\) \{ lead = c; break; \}/.test(block),
   'nothing to wait for means it sends');

console.log('\n-- readiness is completedAt, read in ONE batched query --');
ok(/const states = await readAuditStates\(service, candidates\.map\(/.test(block),
   'one read for the whole look-ahead, not one per candidate');
ok(/states\.get\(String\(c\.id\)\)\?\.completedAt/.test(block), 'ready means a completed audit');
/* ⚠️ decideOutreachAudit reads search_keyword, category, search_location, address and website —
   none of which this query SELECTs. Judging a lead on fields that are undefined because of the
   select rather than because of the data is the trap the prefill note records. */
ok(!/decideOutreachAudit\(c/.test(block),
   'and it does NOT call decideOutreachAudit on a row whose fields this query never selected');

console.log('\n-- and it says what it did --');
ok(/looked past \$\{skippedForAudit\} lead\(s\) waiting on an audit/.test(q),
   'a skip is logged with its count, so silence still means nothing was skipped');

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILURE(S)`);
if (f > 0) process.exit(1);
