/* ONLY A REP'S OWN SUCCESSFUL ACTIONS COUNT (v1-rep-limits-own-actions, 2026-11-19; src/lib/usageRefund.ts).
   The case: Valentin, 19 Nov — 6 of his 40 checks failed and still used his daily checks; one "Add 41 leads" drew 51
   per-minute refusals (and a restriction alert) because 8 lookups ran at once against a 40-a-minute limit.
   A. the rule's words and window.  B. failed work is given back, at every place it can fail.  C. the per-lead limit counts
   only the rep's own clicks.  D. the rep sees "X of Y checks used today".  E. system work never writes a row in a rep's name. */
import { readFileSync } from 'node:fs';
import {
  AUDIT_START_ACTIONS, COUNTED_OUTCOMES, REFUNDED_OUTCOME, perLeadLimitWords, refundReason, refundWindow, usedLine,
} from '../src/lib/usageRefund.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ── A ── */
ok(JSON.stringify(AUDIT_START_ACTIONS) === '["hook_audit","sales_check"]' && !COUNTED_OUTCOMES.includes(REFUNDED_OUTCOME), 'A: a rep\'s audit clicks; a refunded row is not counted');
const w = refundWindow('2026-11-19T10:53:00Z');
ok(!!w && w.fromIso === '2026-11-19T10:50:00.000Z' && w.toIso === '2026-11-19T10:53:15.000Z' && refundWindow('nope') === null, 'A: the click is looked for in the 3 minutes before the audit');
ok(refundReason('audit failed') === 'refunded: audit failed', 'A: the ledger says why');
ok(usedLine(7, 50) === '7 of 50 checks used today', 'A: the plain line');
ok(perLeadLimitWords(3, 3).startsWith("You've used 3 of 3 audits on this lead today. Failed audits and automatic ones don't count."), 'A: the per-lead refusal in words');

/* ── B ── */
const refund = read('supabase/functions/_shared/usage-refund.ts');
ok(refund.includes('.update({ outcome: REFUNDED_OUTCOME, estimated_cost_usd: 0, reason: refundReason(o.why) })') && refund.includes('.eq("id", id).in("outcome", [...COUNTED_OUTCOMES])') && refund.includes('.limit(1)'),
  'B: ONE still-counted row is refunded, estimate zeroed (a second call never refunds another click)');
ok(!/\.delete\(/.test(refund), 'B: nothing is deleted from the ledger');
const q = read('supabase/functions/process-ai-audit-queue/index.ts');
ok(q.includes('if ((allFailed || (isCapped && doneQuestions === 0)) && runRow?.audit_id) {') && q.includes('a.audit_purpose === "audit"') && q.includes('refundGuardRow(service, { leadId: a.lead_id, atIso: a.created_at,'),
  'B: an audit that failed (or never ran) gives the rep\'s click back, once, at the finalise winner');
const sc = read('supabase/functions/_shared/sales-check.ts');
ok((sc.match(/refundGuardRow\(deps\.service, \{/g) ?? []).length === 3, 'B: a check that did not start, never started, or was restarted gives its click back');
ok(sc.includes('.eq("audit_source", "new").neq("status", "failed").gte("started_at", since)'), 'B: failed checks do not use the daily allowance');

/* ── C ── */
const cai = read('supabase/functions/create-ai-audit/index.ts');
ok(cai.includes('.eq("api_type", "guard").eq("user_id", actor.id).eq("lead_id", leadId).in("action", [...AUDIT_START_ACTIONS])') && cai.includes('.in("outcome", [...COUNTED_OUTCOMES])'),
  'C: the per-lead limit counts the rep\'s OWN counted clicks on this lead');
ok(!/from\("ai_audits"\)\.select\("id, ai_audit_runs\(status\)"\)/.test(cai), 'C: never the lead\'s audits (the system starts some of those)');
ok(cai.includes('detail: perLeadLimitWords(mine ?? 0, SALES_HOOKS_PER_LEAD_PER_DAY)'), 'C: the refusal says "X of Y used"');

/* ── D ── */
const bar = read('src/components/OutreachAiCheck.tsx');
ok(bar.includes('checks used today') && !bar.includes('Checks left today:'), 'D: the rep sees "X of Y checks used today"');

/* ── E: the system's own work is never booked as a rep's click ── */
for (const p of ['supabase/functions/_shared/quick-check-retry.ts', 'supabase/functions/_shared/enrichment/apify-slots.ts', 'supabase/functions/_shared/first-reply-audit.ts']) {
  ok(!/guardAction\(|guard_action/.test(read(p)), `E: ${p} never writes a guard row (heals, hedges and reply-chain audits are not the rep's)`);
}
ok(!/guardAction\(|guard_action/.test(q), 'E: the audit queue (lanes, hedges, Google AI runs, heals) never writes a guard row');

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
