/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FINAL CONTACT-STATE CONSISTENCY (2026-10-01, docs/outreach-workspace.md §F): the Outreach status filter
   agrees with the row pill; attention / AI-sorting labels never call a lead reached by phone "New"; opening
   the WhatsApp app (or any attempt) never marks a lead Contacted.
   Run: node scripts/run-tests.mjs contact-state-final
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { pillStatusOf, salesStateOf, type LeadStateInput } from '../src/lib/leadState.ts';
import { statusesForFilter, canonicalFilterValue, type StatusFilterValue, type LeadStatus } from '../src/types/outreach.ts';
import { whatsAppCapabilityOf, WHATSAPP_CAPABILITY_LABEL } from '../src/lib/whatsAppCapability.ts';
import { stateLabelOf } from '../src/lib/adminMetrics.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-10-01T10:00:00Z');
const S = '2026-09-28T10:00:00Z';
const logged = (outcome: string, reached?: boolean) => ({ outcome, at: S, reached });

/* The row's pill status and the filter, as OutreachTable computes them (rowSalesState → pillStatusOf). */
const shown = (l: LeadStateInput) => pillStatusOf(l.status, salesStateOf(l, NOW)) ?? '';
const inFilter = (l: LeadStateInput, f: StatusFilterValue) => statusesForFilter(f).includes(shown(l) as LeadStatus);
const CONTACTED = canonicalFilterValue('initial_contact' as StatusFilterValue);
const NEW = canonicalFilterValue('not_contacted' as StatusFilterValue);

console.log('── the filter agrees with the row (every case in the brief) ──');
const cases: [string, LeadStateInput, StatusFilterValue][] = [
  ['New', { status: 'not_contacted' }, NEW],
  ['contacted by a successful WhatsApp', { status: 'initial_contact', whatsapp_sent_at: S }, CONTACTED],
  ['contacted by a phone conversation (spoke to owner)', { status: 'not_contacted', lastLogged: logged('spoke_to_owner') }, CONTACTED],
  ['call back (a conversation)', { status: 'not_contacted', lastLogged: logged('call_back') }, CONTACTED],
  ['no-answer only', { status: 'not_contacted', lastLogged: logged('no_answer') }, NEW],
  ['voicemail only', { status: 'not_contacted', lastLogged: logged('left_voicemail') }, NEW],
  ['failed WhatsApp', { status: 'whatsapp_failed', whatsapp_sent_at: S }, 'whatsapp_failed' as StatusFilterValue],
  ['No WhatsApp', { status: 'no_whatsapp', whatsapp_sent_at: S }, canonicalFilterValue('no_whatsapp' as StatusFilterValue)],
  ['No WhatsApp, then reached by phone', { status: 'no_whatsapp', whatsapp_sent_at: S, lastLogged: logged('spoke_to_owner') }, CONTACTED],
  ['interested', { status: 'interested', is_potential_work: true }, 'interested' as StatusFilterValue],
  ['meeting booked (pipeline still Contacted)', { status: 'initial_contact', whatsapp_sent_at: S, call_booked_at: '2026-10-02T13:00:00Z' }, CONTACTED],
  ['client', { status: 'payment_received', amount_paid: 99 }, 'payment_received' as StatusFilterValue],
];
for (const [label, lead, filter] of cases) {
  const appears = inFilter(lead, filter);
  const notElsewhere = !(filter !== NEW && inFilter(lead, NEW)) && !(filter !== CONTACTED && inFilter(lead, CONTACTED));
  ok(appears && notElsewhere, `${label}: pill "${shown(lead)}" ↔ only under its own filter`);
}

console.log('\n── WhatsApp: a mobile is not WhatsApp ──');
ok(WHATSAPP_CAPABILITY_LABEL[whatsAppCapabilityOf({ status: 'not_contacted', line_type: 'mobile' })] === 'Mobile number', 'mobile but unverified → "Mobile number"');
ok(whatsAppCapabilityOf({ status: 'no_whatsapp', line_type: 'mobile' }) === 'not_on_whatsapp', 'No WhatsApp beats the mobile guess');

console.log('\n── the table reads ONE status for pill and filter, over every lead ──');
const table = read('src/components/OutreachTable.tsx');
ok(table.includes('wanted.includes(pillStatusOf(lead.status, rowSalesState(lead)) as LeadStatus)'), 'the status filter reads what the pill shows');
ok(table.includes('const lastLogged = useAllLoggedContacts();') && !table.includes('useLastLoggedContacts(pageLeadIds)'), 'the logged contacts are read for every lead, not just the page');
ok((table.match(/const rowSalesState = /g) ?? []).length === 1, 'one rowSalesState, shared by the pill and the filter');

console.log('\n── an attempt never marks Contacted (the old "Open in WhatsApp app" path) ──');
const ca = read('src/hooks/useContactAction.tsx');
const oa = read('src/hooks/useOutreachAttempt.ts');
ok(!/updates\.status = 'initial_contact'/.test(ca) && !/updates\.status = 'initial_contact'/.test(oa), 'neither the contact action nor the attempt logger sets initial_contact');
ok(/last_outreach_attempt_at/.test(ca) && /event_type: 'attempt'/.test(oa), '…the attempt itself is still recorded (worked count, duplicate-opener protection)');

console.log('\n── Needs your attention and the AI sorting context ──');
const lead = { id: 'L', business_name: 'X', created_at: S, added_by_user_id: null, assigned_to_user_id: null, sold_by_user_id: null, status: 'not_contacted', amount_paid: null, is_potential_work: false, call_booked_at: null, whatsapp_sent_at: null } as never;
ok(stateLabelOf(lead, { contacts: [{ at: Date.parse(S), who: 'u', channel: 'call', outcome: 'spoke_to_owner', kind: 'call_outcome' }] } as never, NOW).label === 'Contacted', 'reached by phone → the attention line says Contacted, not New');
ok(stateLabelOf(lead, { contacts: [{ at: Date.parse(S), who: 'u', channel: 'call', outcome: 'no_answer', kind: 'call_outcome' }] } as never, NOW).label === 'New', 'a no-answer only → still New');
const admin = read('src/lib/adminMetrics.ts');
ok(/const stateOf = \(l: AdminLead\) => stateLabelOf\(l, factsById\.get\(l\.id\), nowMs\)\.label;/.test(admin) && /state: stateLabelOf\(f\.lead, f, input\.nowMs\)\.label/.test(admin), 'attention items and reply-triage items both use the label helper');
ok(/const settled = !NEVER_SETTLED\.has\(r\.category\) && \(st\.state === 'client'/.test(admin), '…and the priority decision (settled) still reads its own, unchanged input');
const triage = read('supabase/functions/conversation-triage/index.ts');
ok(/lastLogged: lc \? \{ outcome: lc\.outcomeValue \?\? "", at: lc\.at, reached: lc\.everReached \} : null/.test(triage) && /\.in\("kind", \["call_outcome", "contact_logged"\]\)/.test(triage), 'the AI is told the same state (logged contacts included)');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
