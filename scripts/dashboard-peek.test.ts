/* The dashboard's "Last 3" peek, "Your next actions" list, and the dashboard templates in the Inbox picker (Paul, 2026-10-26).
   Pure + source checks; nothing is read from or sent to anyone. Run: npx tsx scripts/dashboard-peek.test.ts */
import { readFileSync } from 'node:fs';
import { PEEK_MESSAGE_COLUMNS, peekLine, peekLines, type PeekRow } from '../src/lib/messagePeek.ts';
import { INBOX_DASHBOARD_TEMPLATES, inboxDashboardSendability, needsTypedItem } from '../src/lib/inboxDashboardTemplates.ts';
import { DASHBOARD_TEMPLATE_NAMES, dashboardTemplateTranscript } from '../src/lib/dashboardTemplates.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { buildMyNextActions, daysUntilLabel, latestSetters, nextActionCounts, type NextActionLead } from '../src/lib/myNextActions.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const row = (o: Partial<PeekRow>): PeekRow => ({ id: 'm' + Math.random(), created_at: '2026-10-26T10:00:00Z', direction: 'inbound', body: null, message_type: 'text', template_name: null, ...o });

console.log('1. peek lines: who, text, media labels, templates');
{
  ok(peekLine(row({ body: 'Yes please' })).who === 'them' && peekLine(row({ body: 'Yes please' })).text === 'Yes please', 'inbound text is them + the words');
  ok(peekLine(row({ direction: 'outbound', body: 'Hi' })).who === 'us', 'outbound is us');
  ok(peekLine(row({ message_type: 'audio', body: '[audio]' })).text === '[voice note]', 'voice note is a plain label');
  ok(peekLine(row({ direction: 'outbound', message_type: 'audio', body: 'Voice note (0:08)' })).text === '[voice note]', 'our voice note too');
  ok(peekLine(row({ message_type: 'sticker', body: '[sticker]' })).text === '[sticker]', 'sticker');
  ok(peekLine(row({ message_type: 'image', body: 'our van' })).text === '[image] our van', 'image keeps its caption after the label');
  ok(peekLine(row({ message_type: 'document', body: '[document]' })).text === '[file]', 'document is [file]');
  ok(peekLine(row({ body: '[image]' })).text === '[image]', 'a placeholder body on a text row reads as the label');
  const t = peekLine(row({ direction: 'outbound', message_type: 'template', template_name: 'needs_from_you',
    body: dashboardTemplateTranscript('needs_from_you', { business: 'Acme', greeting: 'Jo', neededItem: 'your logo' }) }));
  ok(t.tag?.startsWith('Template · ') && t.text.includes('What we need') && t.text.includes('needed: your logo') && t.text.includes('Jo') && !t.text.includes('approved wording'), 'a dashboard template shows its label and values, never the stored line');
  const snap = peekLine(row({ direction: 'outbound', message_type: 'template', template_name: 're_engage_49', template_snapshot: { version: 1, template_name: 're_engage_49', language: 'en', body: 'Where did we get to?' } }));
  ok(snap.text === 'Where did we get to?', 'a stored snapshot is the words the Inbox shows');
  ok(peekLine(row({ direction: 'outbound', status: 'failed', body: 'x' })).failed, 'a failed send says so');
  const ls = peekLines([row({ id: 'c', created_at: '2026-10-26T12:00:00Z', body: '3' }), row({ id: 'b', created_at: '2026-10-26T11:00:00Z', body: '2' }), row({ id: 'a', body: '1' }), row({ id: 'z', body: '0' })]);
  ok(ls.map((l) => l.text).join() === '1,2,3', 'three only, newest at the bottom');
  ok(!PEEK_MESSAGE_COLUMNS.includes('*'), 'explicit columns, never *');
}

console.log('2. the peek is read-only');
{
  for (const p of ['src/lib/messagePeek.ts', 'src/hooks/useLeadPeek.ts']) {
    const s = read(p);
    ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(s) && !/functions\.invoke|sendWhatsApp|mark_?read|markRead/.test(s), `${p}: no write, no send, no read receipt`);
  }
  const hook = read('src/hooks/useLeadPeek.ts');
  ok(/enabled: enabled &&/.test(hook) && /\.limit\(PEEK_COUNT\)/.test(hook), 'loaded only when opened, three rows');
  const list = read('src/components/admin/NeedsMeList.tsx');
  ok(/peekOpen\.has\(r\.key\) && <LeadPeek/.test(list), 'the panel mounts (and so loads) only for an opened row');
  ok(/whatsAppLinkForLead\(row\.leadId!\)/.test(list), 'Open in Inbox goes to that lead\'s conversation');
}

console.log('3. the Inbox picker group');
{
  ok(INBOX_DASHBOARD_TEMPLATES.map((t) => t.value).sort().join() === [...DASHBOARD_TEMPLATE_NAMES].sort().join(), 'every dashboard template is offered');
  ok(!INBOX_DASHBOARD_TEMPLATES.some((t) => t.value === ('final_nudge' as string) || t.value === ('payment_failed' as string)), 'no final_nudge / payment_failed');
  ok(WHATSAPP_TEMPLATES.some((t) => t.value === 're_engage_49'), 're_engage_49 is already in the main list');
  ok(!WHATSAPP_TEMPLATES.some((t) => (DASHBOARD_TEMPLATE_NAMES as string[]).includes(t.value)), 'not added to the bulk/queue list (admin-only server branch)');
  ok(INBOX_DASHBOARD_TEMPLATES.every((t) => t.label.length > 15 && !t.label.includes('_')), 'plain-English labels');
  ok(!inboxDashboardSendability('nudge_24h', { isAdmin: false, sms: false, prospectOnly: false }).ok, 'a salesperson cannot pick them');
  ok(!inboxDashboardSendability('nudge_24h', { isAdmin: true, sms: true, prospectOnly: false }).ok, 'never on the SMS tab');
  ok(!inboxDashboardSendability('agreement_next_steps', { isAdmin: true, sms: false, prospectOnly: true }).ok, 'Australia: no agreement/questionnaire/payment template');
  ok(inboxDashboardSendability('pick_up_conversation', { isAdmin: true, sms: false, prospectOnly: true }).ok, 'Australia: the pick-up message is fine');
  ok(needsTypedItem('needs_from_you') && !needsTypedItem('nudge_24h'), 'only needs_from_you asks for a typed item');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/templateVars: \{ needed_item: neededItem \}/.test(inbox) && (inbox.match(/needed_item: neededItem/g) ?? []).length >= 2, 'the item goes with both Preview and Send');
  ok(/\{isAdmin && \(\s*<SelectGroup/.test(inbox) && /const s = dashboardPickable\(t\.value\)/.test(inbox), 'the group is drawn for an admin only, each item through its gate (greyed on texts)');
  const hook = read('src/hooks/useInbox.ts');
  ok(/template_vars: args\.templateVars/.test(hook), 'the dry run carries template_vars');
}

console.log('4. your next actions');
{
  ok(daysUntilLabel(-3, true) === '3 days overdue' && daysUntilLabel(-1, true) === '1 day overdue', 'overdue days');
  ok(daysUntilLabel(0, false) === 'Due today' && daysUntilLabel(1, false) === 'Tomorrow' && daysUntilLabel(5, false) === 'In 5 days' && daysUntilLabel(null, false) === 'No date set', 'today / tomorrow / in n / no date');
  const L = (id: string, o: Partial<NextActionLead>): NextActionLead => ({ id, business_name: id, next_action: 'call', next_action_date: null, next_action_time: null, next_action_note: null, assigned_to_user_id: null, ...o });
  const leads = [
    L('later', { next_action_date: '2026-10-31', assigned_to_user_id: 'me' }),
    L('late', { next_action_date: '2026-10-23', next_action_note: 'ring about the logo' }),
    L('none', { next_action: 'none', next_action_date: '2026-10-26' }),
    L('undated', { assigned_to_user_id: 'me' }),
    L('theirs', { next_action_date: '2026-10-26', assigned_to_user_id: 'me' }),
  ];
  const setters = latestSetters([
    { lead_id: 'late', actor_user_id: 'rep', created_at: '2026-10-01' }, { lead_id: 'late', actor_user_id: 'me', created_at: '2026-10-02' },
    { lead_id: 'theirs', actor_user_id: 'rep', created_at: '2026-10-05' },
  ]);
  const today = '2026-10-26';
  const now = Date.parse('2026-10-26T09:00:00Z');
  const mine = buildMyNextActions(leads, setters, 'me', 'mine', today, now);
  ok(mine.map((r) => r.lead.id).join() === 'late,later,undated', 'set by me: newest History setter wins; no History → assigned to me; cleared ones never shown; soonest first, undated last');
  ok(mine[0].days === -3 && mine[0].daysLabel === '3 days overdue' && mine[0].view.note === 'ring about the logo', 'days and what to do');
  ok(mine[1].daysLabel === 'In 5 days', 'counts days ahead');
  const all = buildMyNextActions(leads, setters, 'me', 'everyone', today, now);
  ok(all.length === 4 && all.some((r) => r.lead.id === 'theirs' && !r.mine && r.setBy === 'rep'), 'everyone shows who set it');
  ok(buildMyNextActions(leads, setters, null, 'mine', today, now).length === 0, 'no signed-in id → nothing is "mine"');
  const c = nextActionCounts(all);
  ok(c.overdue === 1 && c.today === 1 && c.week === 1, 'header counts');
  const comp = read('src/components/admin/NextActionsList.tsx');
  ok(/<NextActionEditor lead=/.test(comp), 'edit and ✓ close go through the one Next Action write');
  const hook = read('src/hooks/useMyNextActions.ts');
  ok(!/\.(insert|update|upsert|delete|rpc)\(/.test(hook), 'the list read writes nothing');
  ok(/\.order\('id'/.test(hook) && /fetchAllRows/.test(hook), 'paginated with an id tiebreak');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
