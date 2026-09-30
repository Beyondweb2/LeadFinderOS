/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES INTELLIGENCE (release 3) — templates, niches, bottlenecks: factual, sampled, never a score.
   Run: npx tsx scripts/admin-intelligence.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { foldTemplates, foldNiches, findBottlenecks, foldFeatureUsage, nicheOf, TEMPLATE_MIN_LEADS, NICHE_MIN_MESSAGED, BOTTLENECK_THRESHOLDS, type IntelFact, type IntelMessage } from '../src/lib/adminIntelligence.ts';
import { resolvePeriod } from '../src/lib/reportingPeriod.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const NOW = Date.parse('2026-09-30T12:00:00Z');
const P = resolvePeriod('30d', NOW);
const at = (d: number, h = 10) => new Date(NOW - d * 86_400_000 + (h - 12) * 3_600_000).toISOString();
let n = 0;
function lead(o: Partial<IntelFact['lead']> = {}, f: Partial<IntelFact> = {}): IntelFact {
  return { lead: { id: `L${++n}`, created_at: at(20), search_keyword: 'plumbers', category: null, phone: '07000', status: 'replied', amount_paid: null, website: 'x.co.uk', ...o },
    contacts: [], humanReplies: [], interestedEver: false, meetingEver: false, notInterested: [], optOut: [], ...f };
}
const out = (f: IntelFact, tpl: string | null, d: number, status = 'delivered'): IntelMessage => ({ id: `m${++n}`, lead_id: f.lead.id, direction: 'outbound', status, created_at: at(d), body: null, template_name: tpl, test_mode: false });
const inn = (f: IntelFact, d: number, body = 'How much is it?'): IntelMessage => ({ id: `m${++n}`, lead_id: f.lead.id, direction: 'inbound', status: 'received', created_at: at(d, 11), body, template_name: null, test_mode: false });

console.log('── templates ──');
{
  const a = lead({}, { interestedEver: true }), b = lead({}, { notInterested: [{ at: 0 }] }), c = lead(), d = lead();
  const msgs = new Map<string, IntelMessage[]>();
  const rA = inn(a, 5);
  msgs.set(a.lead.id, [out(a, 'opener', 6), rA]);
  msgs.set(b.lead.id, [out(b, 'opener', 6), out(b, 'chase', 5), inn(b, 4, 'no thanks')]);   // contested: opener then chase, no reply between
  msgs.set(c.lead.id, [out(c, null, 6), inn(c, 5, 'ok')]);                                  // free-form only
  msgs.set(d.lead.id, [out(d, 'opener', 6, 'simulated'), inn(d, 5)]);                        // a test send is never a send
  const t = foldTemplates({ period: P, facts: [a, b, c, d], msgsBy: msgs, triageByMessage: new Map([[rA.id!, 'price']]), paidAtOf: new Map() });
  const opener = t.meta.find((r) => r.template === 'opener')!, chase = t.meta.find((r) => r.template === 'chase')!;
  ok(opener.leadsSent === 2 && opener.sends === 2, 'sends count real sends only (simulated excluded)');
  ok(opener.replies === 1 && chase.replies === 1 && chase.repliesContested === 1, 'last touch: the chase takes the credit, and it is marked contested');
  ok(opener.positive === 1 && opener.interested === 1, "a reply the sorter filed as a price question is 'positive'; interested follows the credited lead");
  ok(chase.notInterested === 1, 'a no after the chase counts against the chase');
  ok(!t.meta.some((r) => r.template === null as unknown as string) && t.freeForm.sends === 1 && t.freeForm.leadsSent === 1, 'free-form sends are kept apart from Meta templates');
  ok(opener.flags.includes('tiny_sample'), `under ${TEMPLATE_MIN_LEADS} leads is a tiny sample — no comparison`);
  ok(t.costRecorded === false, 'WhatsApp message cost is declared unrecorded, never shown as £0');

  // A big template with no replies, and a rejection-heavy one.
  const facts: IntelFact[] = []; const m2 = new Map<string, IntelMessage[]>();
  for (let i = 0; i < 45; i++) { const f = lead(); facts.push(f); m2.set(f.lead.id, [out(f, 'silent', 6)]); }
  for (let i = 0; i < 40; i++) { const f = lead({}, i < 12 ? { notInterested: [{ at: 0 }] } : {}); facts.push(f); m2.set(f.lead.id, [out(f, 'blunt', 6), ...(i < 12 ? [inn(f, 5, 'no')] : [])]); }
  const t2 = foldTemplates({ period: P, facts, msgsBy: m2, triageByMessage: new Map(), paidAtOf: new Map() });
  ok(t2.meta.find((r) => r.template === 'silent')!.flags.includes('no_replies'), '45 leads, 0 replies → flagged');
  ok(t2.meta.find((r) => r.template === 'blunt')!.flags.includes('high_rejection'), '12 replies, all no → high rejection');
}

console.log('\n── niches ──');
{
  ok(nicheOf({ search_keyword: 'Plumbers', category: null }).key === nicheOf({ search_keyword: 'plumber', category: null }).key, 'plumbers and plumber are one niche');
  ok(nicheOf({ search_keyword: null, category: null }).label === 'No trade stored', 'no trade is its own bucket, not dropped');
  const facts: IntelFact[] = [];
  for (let i = 0; i < 40; i++) facts.push(lead({ search_keyword: 'electricians' }, { contacts: [{ at: Date.parse(at(5)), who: null, kind: 'whatsapp' }], humanReplies: i < 16 ? [Date.parse(at(4))] : [], interestedEver: i === 0 }));
  for (let i = 0; i < 40; i++) facts.push(lead({ search_keyword: 'accountants', website: '' }, { contacts: [{ at: Date.parse(at(5)), who: null, kind: 'whatsapp' }], humanReplies: i < 2 ? [Date.parse(at(4))] : [] }));
  for (let i = 0; i < 5; i++) facts.push(lead({ search_keyword: 'roofer' }, { contacts: [{ at: Date.parse(at(5)), who: null, kind: 'whatsapp' }], humanReplies: [Date.parse(at(4))] }));
  const nz = foldNiches({ period: P, facts, paidAtOf: new Map() });
  const row = (k: string) => nz.rows.find((r) => r.label.toLowerCase().startsWith(k))!;
  ok(row('electric').verdict === 'promising', 'reply rate above the book and at least one interested → PROMISING DATA');
  ok(row('account').verdict === 'weak_so_far', 'reply rate at half the book or less → WEAK RESPONSE SO FAR');
  ok(row('roof').verdict === 'needs_more_data', `5 messaged (under ${NICHE_MIN_MESSAGED}) — even at 100% replies → NEEDS MORE DATA`);
  ok(row('account').noSiteOnRecord.messaged === 40 && row('electric').withSite.messaged === 40, 'website cohorts split by what is on record');
}

console.log('\n── bottlenecks ──');
{
  const base = { contacted: 200, replied: 60, interested: 10, meetings: 1, sales: 0, signupStarts: 1, signupsPaid: 0, apiUsd: 10, revenue: 0, interestedWithoutNextAction: 4, deadTemplates: [], periodLabel: '30 days' };
  const b = findBottlenecks(base);
  const s = (k: string) => b.find((x) => x.key === k)!;
  ok(s('contacts_few_replies').status === 'ok', '30% reply rate is not flagged');
  ok(s('interested_few_meetings').status === 'flag', '1 meeting from 10 interested is flagged (follow-up problem)');
  ok(s('meetings_few_sales').status === 'not_enough_data', `1 meeting is under ${BOTTLENECK_THRESHOLDS.meetingsForSaleCheck} — not judged`);
  ok(s('signups_few_payments').status === 'not_enough_data', 'one sign-up is not judged');
  ok(s('interested_no_next_action').status === 'flag' && /4 leads/.test(s('interested_no_next_action').evidence), 'interested with no next step says how many');
  ok(b.every((x) => x.evidence.length > 10), 'every check carries the numbers it used');
  ok(!b.some((x) => /score/i.test(x.title + x.evidence)), 'no scores anywhere');
}

console.log('\n── feature usage ──');
{
  const T = 'test-user', P = 'paul';
  const now = [
    { feature: 'hook_audit', user_id: null, uses: 3 }, { feature: 'voice_note', user_id: P, uses: 2 }, { feature: 'voice_note', user_id: T, uses: 9 },
    { feature: 'niche_check', user_id: P, uses: 1 }, { feature: 'call_script', user_id: P, uses: 4 },
  ];
  const previous = [{ feature: 'hook_audit', user_id: null, uses: 40 }, { feature: 'voice_note', user_id: P, uses: 2 }];
  const f = foldFeatureUsage({ now, previous, costByFeature: [{ key: 'Niche Check', usd: 7 }], nameOf: (u) => (u === P ? 'Paul' : 'x'), isExcludedUser: (u) => u === T, periodFromDay: '2026-09-01' });
  const row = (k: string) => f.find((r) => r.key === k)!;
  ok(row('voice_note').uses === 2 && row('voice_note').people.some((p) => p.name === 'Internal/test' && p.uses === 9), "a test account's uses are shown apart, never in the total");
  ok(row('hook_audit').flags.includes('dropped'), '3 uses after 40 → dropped sharply');
  ok(row('niche_check').flags.includes('costly_low_use'), '$7 on 1 use → costly for its use');
  ok(row('call_script').flags.includes('new_tracking') && !row('call_script').flags.includes('unused'), 'a newly tracked feature is labelled as new tracking, not judged');
  ok(row('discovery').uses === 0 && row('discovery').flags.includes('unused'), 'a tracked feature with no use is flagged unused');
  const b = findBottlenecks({ contacted: 0, replied: 0, interested: 0, meetings: 0, sales: 0, signupStarts: 0, signupsPaid: 0, apiUsd: 0, revenue: 0, interestedWithoutNextAction: 0, deadTemplates: [], periodLabel: '30 days', costlyFeatures: null, unusedFeatures: null });
  ok(b.find((x) => x.key === 'costly_low_use')?.status === 'not_enough_data', 'usage unreadable → the cost check says so, never "fine"');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
