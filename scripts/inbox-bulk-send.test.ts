/* ============================================================
   BULK TEMPLATE SEND — who the batch actually reaches.

   Run: npx tsx scripts/inbox-bulk-send.test.ts

   ⛔ WHAT THIS GUARDS. A control that fires one template at fifty real businesses, where a mistake
   cannot be recalled. The three failures that would matter, in order of how bad they are:
     1. a COLD template going out to people already in conversation — the 2026-09-02 incident
        (16 hook sends, 12 to numbers already talking to us, 4 marked not interested) with a
        multiplier on it;
     2. the same PERSON messaged twice because they hold two lead rows on one phone number —
        measured that same day: 101 numbers across 234 unarchived rows;
     3. the batch silently shrinking, so the operator believes they messaged 40 and they messaged 12.
   ============================================================ */
import { planBulkSend, groupSkips, type BulkCandidate } from '../src/lib/inboxBulkSend.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const c = (key: string, leadId: string | null, phone = `+4470000${key}`): BulkCandidate =>
  ({ key, leadId, label: `Biz ${key}`, phone });
const noAudits = { auditByLeadId: {} as Record<string, { auditId: string }> };
const withAudit = (...leadIds: string[]) => ({
  auditByLeadId: Object.fromEntries(leadIds.map((id) => [id, { auditId: `audit-${id}` }])),
});

console.log('\n── THE COLD GATE REFUSES THE WHOLE BATCH ──');
for (const cold of ['initial_contact', 'audit_result_hook', 'made_up_template', '', '   ']) {
  const p = planBulkSend([c('1', 'l1'), c('2', 'l2')], cold, noAudits);
  ok(p.send.length === 0, `"${cold.trim() || '(blank)'}" sends to nobody`);
  ok(!!p.refusal, `"${cold.trim() || '(blank)'}" is refused with a stated reason`);
}
/* ⛔ UNKNOWN IS COLD. The absent-value law pointed the safe way: a template nobody has classified
   must not become bulk-sendable by default the day it is registered. */
ok(!!planBulkSend([c('1', 'l1')], 'brand_new_template_2027', noAudits).refusal,
   'an UNKNOWN template is treated as cold, not waved through');

console.log('\n── A REFUSAL IS NOT "ZERO RECIPIENTS" ──');
{
  const refused = planBulkSend([c('1', 'l1')], 'initial_contact', noAudits);
  const empty = planBulkSend([], 'questionnaire_followup', noAudits);
  ok(refused.refusal !== undefined && empty.refusal === undefined,
     'a bad TEMPLATE reports a refusal; an empty SELECTION does not — different answers');
}

console.log('\n── CONTINUATION TEMPLATES ARE ALLOWED ──');
{
  const p = planBulkSend([c('1', 'l1'), c('2', 'l2')], 'questionnaire_followup', noAudits);
  ok(p.refusal === undefined, 'questionnaire_followup is not refused');
  ok(p.send.length === 2, `both conversations are in the batch (${p.send.length})`);
  ok(p.skipped.length === 0, 'nothing skipped');
}

console.log('\n── ONE MESSAGE PER PHONE NUMBER, NOT PER ROW ──');
{
  const dup = [c('1', 'l1', '+447700900123'), c('2', 'l2', '+447700900123'), c('3', 'l3', '+447700900999')];
  const p = planBulkSend(dup, 'questionnaire_followup', noAudits);
  ok(p.send.length === 2, `two sends, not three (${p.send.length})`);
  ok(p.send.map((x) => x.key).join(',') === '1,3', `the FIRST row for a number wins (${p.send.map((x) => x.key)})`);
  ok(p.skipped.some((s) => s.key === '2' && /same phone/.test(s.reason)),
     'the duplicate is skipped WITH the reason, not dropped');
}

console.log('\n── A CONVERSATION WITH NO LEAD CANNOT TAKE A TEMPLATE ──');
{
  const p = planBulkSend([c('1', 'l1'), c('2', null)], 'questionnaire_followup', noAudits);
  ok(p.send.length === 1 && p.send[0].key === '1', 'only the linked one is sent');
  ok(p.skipped.some((s) => s.key === '2' && s.reason === 'no linked lead'), 'the unlinked one says why');
}

console.log('\n── PER-LEAD TEMPLATE REQUIREMENTS STILL APPLY ──');
{
  /* audit_reply needs a completed audit for THAT lead. One has, one has not. */
  const p = planBulkSend([c('1', 'l1'), c('2', 'l2')], 'audit_reply', withAudit('l1'));
  ok(p.refusal === undefined, 'audit_reply is a continuation, so the batch is allowed');
  ok(p.send.length === 1 && p.send[0].key === '1', `only the lead WITH a report is sent (${p.send.length})`);
  ok(p.skipped.some((s) => s.key === '2' && /audit/i.test(s.reason)),
     'the lead without one is skipped, naming the audit as the reason');
}

console.log('\n── EVERY EXCLUSION IS ACCOUNTED FOR ──');
{
  const all = [c('1', 'l1'), c('2', null), c('3', 'l3', '+44777'), c('4', 'l4', '+44777')];
  const p = planBulkSend(all, 'questionnaire_followup', noAudits);
  ok(p.send.length + p.skipped.length === all.length,
     `sent + skipped equals what was selected (${p.send.length} + ${p.skipped.length} = ${all.length})`);
  ok(p.skipped.every((s) => !!s.reason && !!s.label), 'every skip carries a reason and a name');
}

console.log('\n── SKIPS GROUP FOR A HONEST CONFIRM ──');
{
  const g = groupSkips([
    { key: 'a', label: 'A', reason: 'no linked lead' },
    { key: 'b', label: 'B', reason: 'no linked lead' },
    { key: 'c', label: 'C', reason: 'same phone number as another selected conversation' },
  ]);
  ok(g[0].reason === 'no linked lead' && g[0].count === 2, 'biggest group first, with its count');
  ok(g[0].labels.join(',') === 'A,B', 'the names travel with the group');
  ok(groupSkips([]).length === 0, 'nothing skipped groups to nothing');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
