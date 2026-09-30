/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AI BUSINESS SUMMARY (release 6) — it may only use numbers that are in the data.
   Run: npx tsx scripts/business-summary.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { allowedNumbers, buildSummaryFacts, changePct, fallbackLookAt, validateNumbers, type OverviewLike } from '../src/lib/businessSummary.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const ov = (o: Partial<OverviewLike['totals']> = {}, extra: Partial<OverviewLike> = {}): OverviewLike => ({
  period: { label: 'Last 7 days', fromDay: '2026-09-24', toDay: '2026-09-30' },
  totals: { whatsappSent: 312, leadsMessaged: 290, calls: 15, emails: 1, social: 2, replies: 18, interested: 4, meetings: 2, paid: 1, revenue: 99, notInterested: 3, optOuts: 1, cohort: { contacted: 250, replied: 40, interested: 5, meeting: 1, paid: 1 }, ...o },
  team: [{ name: 'Paul', whatsappSent: 312, calls: 15, replies: 18, interested: 4, meetings: 2, paid: 1, followUpsOverdue: 12 }],
  money: { period: { net: 99, gross: 99, refunds: 0 }, cost: { period: { usd: 32.9, byFeature: [{ key: 'AI visibility audits', usd: 20.5 }] } }, commission: { periodAdded: 0 }, payingClients: 3 },
  templates: { meta: [{ template: 'initial_contact', leadsSent: 918, replies: 404, positive: 37, notInterested: 8, flags: [] }] },
  niches: [{ label: 'Electricians', messaged: 619, replied: 205, interested: 7, paid: 0, verdict: 'in_line' }],
  bottlenecks: [{ title: 'Interested leads with no next step', status: 'flag', evidence: '38 leads are interested now with no Next Action set' }],
  attention: [{ group: 'urgent', kind: 'payment_dispute' }, { group: 'today', kind: 'quote_quiet' }],
  clients: [{ business: 'MC Locksmiths', refunded: false, health: { weekly: { trendLabel: '↑ improving', thisWeek: { named: { chatgpt: 6, gemini: 3 }, answered: { chatgpt: 10, gemini: 10 } } }, blockers: [] } }],
  features: [{ label: 'Paid Enrich', uses: 0, previous: 0, flags: ['unused'] }],
  site: { sessions: 120, free_check_submitted: 3, checkout_sessions: 1, paid: 1, tracking_since: '2026-09-30T10:00:00Z' },
  triage: { byBucket: { no_action: 30, rep_action: 12, admin_action: 2, urgent_admin: 0, review: 1 }, suppressed: 1 },
  ...extra,
});

const facts = buildSummaryFacts(ov(), ov({ whatsappSent: 236, replies: 20 }));
const allowed = allowedNumbers(facts);

ok(changePct(312, 236) === 32 && changePct(5, 0) === null, 'changes are worked out in code (32%), and no base means no percentage');
ok(facts.outreach.whatsapps_sent.change_pct === 32, 'the change is in the facts, so the model never has to calculate it');
ok(validateNumbers('This week outreach increased 32%, with 312 WhatsApps and 18 replies.', allowed).length === 0, 'numbers taken from the facts pass');
ok(validateNumbers('Revenue was £99.00 and API spend $32.90; 1,000 is not ours.', allowed).join() === '1,000', 'an invented number is caught (and money formats of real ones pass)');
ok(validateNumbers('Replies rose 45% this week.', allowed).includes('45'), 'an invented percentage is caught');
ok(validateNumbers('MC Locksmiths: ChatGPT 6/10, Gemini 3/10.', allowed).length === 0, 'the weekly check figures are quotable');
ok(validateNumbers('Figures for 2026-09-24 to 2026-09-30.', allowed).length === 0, 'the period dates are quotable');
ok(fallbackLookAt(facts)[0].startsWith('1 urgent item') && fallbackLookAt(facts).some((x) => x.includes('38 leads')), 'with no grounded draft, the page shows the fixed checks, urgent first');
ok(!JSON.stringify(facts).includes('@') && !/07\d{9}|\+44/.test(JSON.stringify(facts)), 'the facts carry no email or phone number — totals only');

const fn = readFileSync(new URL('../supabase/functions/business-summary/index.ts', import.meta.url), 'utf8');
ok(/validateNumbers\(/.test(fn) && /status = "rejected"/.test(fn) && /summary: status === "ok" \? summary : null/.test(fn), 'a draft with an unknown number is stored as rejected and never shown');
ok(/\(await paidMode\(service\)\) === "all_stop"/.test(fn) && /SUMMARY_MIN_INTERVAL_MINUTES/.test(fn) && /admin_job_claim/.test(fn), 'emergency stop, one refresh an hour, one run at a time');
ok(!/from\("outreach_leads"\)|payment_ledger|contact_suppressions/.test(fn), 'it never touches a lead, money or a suppression');
ok(/loadAdminOverview/.test(fn), 'it reads the SAME loader as the dashboard — one set of numbers');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
