/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INTERESTED IS THE STAR (2026-10-01, docs/outreach-workspace.md §G): every "Interested" filter reads the gold
   star (leadState.isStarred) whatever the status; every "Interested" in a status menu writes the star through
   the one function (lead_mark_interested, History "Starred"); the star never changes the contact pill.
   Run: node scripts/run-tests.mjs interested-star
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { isStarred, pillStatusOf, salesStateOf, type LeadStateInput } from '../src/lib/leadState.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const NOW = Date.parse('2026-10-01T10:00:00Z');
const S = '2026-09-28T10:00:00Z';
const pill = (l: LeadStateInput) => pillStatusOf(l.status, salesStateOf(l, NOW));

console.log('── the star is the one interest reading ──');
ok(isStarred({ is_potential_work: true }), 'starred → Interested');
ok(!isStarred({ is_potential_work: false }) && !isStarred({ is_potential_work: null }) && !isStarred(null), 'no star (false / null / no lead) → not Interested');

console.log('\n── the brief\'s cases: the star sits beside the real status, never replaces it ──');
const reached = { outcome: 'spoke_to_owner', at: S };
const cases: [string, LeadStateInput, string][] = [
  ['starred + never reached → ⭐ + New', { status: 'not_contacted', is_potential_work: true }, 'not_contacted'],
  ['starred + reached by phone → ⭐ + Contacted', { status: 'not_contacted', is_potential_work: true, lastLogged: reached }, 'initial_contact'],
  ['starred + WhatsApp sent → ⭐ + Contacted', { status: 'initial_contact', is_potential_work: true, whatsapp_sent_at: S }, 'initial_contact'],
  ['starred + replied → ⭐ + Replied', { status: 'replied', is_potential_work: true, whatsapp_sent_at: S }, 'replied'],
  ['starred + No WhatsApp → ⭐ + No WhatsApp', { status: 'no_whatsapp', is_potential_work: true }, 'no_whatsapp'],
  ['starred + client → ⭐ + Paid', { status: 'payment_received', is_potential_work: true, amount_paid: 99 }, 'payment_received'],
  ['starred + meeting booked (reached) → ⭐ + Contacted', { status: 'not_contacted', is_potential_work: true, call_booked_at: '2026-10-02T13:00:00Z', lastLogged: { outcome: 'meeting_booked', at: S } }, 'initial_contact'],
];
for (const [label, lead, want] of cases) ok(pill(lead) === want, `${label} (pill "${pill(lead)}")`);

console.log('\n── adding or removing the star never moves the pill ──');
const bases: LeadStateInput[] = [
  { status: 'not_contacted' }, { status: 'not_contacted', lastLogged: reached }, { status: 'not_contacted', lastLogged: { outcome: 'no_answer', at: S } },
  { status: 'initial_contact', whatsapp_sent_at: S }, { status: 'replied', whatsapp_sent_at: S }, { status: 'awaiting_reply', whatsapp_sent_at: S },
  { status: 'no_whatsapp' }, { status: 'no_whatsapp', lastLogged: reached }, { status: 'whatsapp_failed', whatsapp_sent_at: S }, { status: 'price_given' },
];
for (const b of bases) {
  const off = pill({ ...b, is_potential_work: false }); const on = pill({ ...b, is_potential_work: true });
  ok(off === on, `${b.status}${b.lastLogged ? ' + ' + b.lastLogged.outcome : ''}: "${off}" with or without the star`);
}

console.log('\n── the pre-star stored status "interested" is never a pill ──');
ok(pill({ status: 'interested', is_potential_work: true, whatsapp_sent_at: S }) === 'initial_contact', 'stored interested, reached → Contacted');
ok(pill({ status: 'interested', is_potential_work: true }) === 'not_contacted', 'stored interested, never reached → New');
ok(pillStatusOf('interested', null) === 'interested', '…with no stage to read it is left as it is (absent never becomes a reading)');

console.log('\n── every Interested FILTER reads the star ──');
const table = read('src/components/OutreachTable.tsx');
ok(table.includes("} else if (statusFilter === 'interested') {") && table.includes('result = result.filter((lead) => isStarred(lead));'), 'Outreach status filter "Interested ⭐" → isStarred');
ok(/if \(trackedOnly\) \{\n\s+result = result\.filter\(\(lead\) => isStarred\(lead\)\);/.test(table), 'Outreach ⭐ Interested toggle → isStarred');
ok(!table.includes("lead.status === 'interested'"), 'no Outreach filter or tint reads the stored status');
const inbox = read('src/pages/Inbox.tsx');
ok(inbox.includes("? byCampaign.filter((c) => isStarred({ is_potential_work: c.isPotentialWork }) || c.unassigned || c.isPaid)") && !inbox.includes('INTERESTED_STATUSES'), 'Inbox "Interested" filter → isStarred (Price given without a star is out)');

console.log('\n── every "Interested" in a menu writes the star through ONE function ──');
const outreach = read('src/hooks/useOutreach.ts');
ok(!/\.update\(\{\s*is_potential_work: true,?\s*\}\)/.test(outreach), 'useOutreach no longer writes the star directly (admin)');
ok((outreach.match(/markLeadInterested\(/g) ?? []).length === 2, '…markAsInterested and markMultipleAsInterested call lead_mark_interested');
const page = read('src/pages/Outreach.tsx');
ok(page.includes('if (lead && !lead.is_potential_work) await markMultipleAsInterested([leadId]);'), 'the Outreach status menus\' "Interested" → markMultipleAsInterested');
const quick = read('src/lib/leadQuickActions.ts');
ok(quick.includes("if (status === 'interested') return markLeadInterested(leadId, isAdmin, true);"), 'setLeadPipelineStatus("interested") → the star, for both roles');
ok(!table.includes('onMarkAsInterested([lead.id]);\n') && !read('src/components/OutreachMobileCard.tsx').includes('onAutoTrack'), 'no second star write after the menu change (row, phone card, bulk)');
ok(read('src/lib/statusPatch.ts').includes("status === 'interested'\n    ? { is_potential_work: true }"), 'the status patch still never writes status "interested"');

console.log('\n── no SMS suggestion ──');
const modal = read('src/components/PostContactModal.tsx');
ok(!modal.includes('noWhatsappTrySms') && !modal.includes('MessageSquare'), 'the WhatsApp tips popup has no SMS tip');
const en = read('src/i18n/locales/en.json');
ok(!/[Tt]ry (sending an )?SMS|SMS or call|SMS, or call/.test(en) && !read('src/components/SingleWhatsAppDialog.tsx').includes('Try SMS') && !read('src/components/OutreachIntroModal.tsx').includes('SMS'), 'no screen suggests SMS');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
