/* ════════════════════════════════════════════════════════════════════════════════════════════════
   REPLY TRIAGE — Paul's examples (2026-09-30 brief), the calibration finds, the AI's limits, and what
   reaches his list. Run: npx tsx scripts/reply-triage.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { triageByRules, decisionFromAi, isOptOut, triageIsOpen, HIGH_INTENT, REP_ESCALATE_HOURS, TRIAGE_SURFACE_DAYS } from '../src/lib/replyTriage.ts';
import { foldAdminOverview, type AdminInput, type AdminLead, type TriageRow } from '../src/lib/adminMetrics.ts';
import { buildExclusions } from '../src/lib/metricExclusions.ts';
import { resolvePeriod } from '../src/lib/reportingPeriod.ts';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const lead = { isClient: false, messageType: 'text' };
const client = { isClient: true, messageType: 'text' };
const r = (t: string, c = lead) => triageByRules(t, c);

console.log('── Paul\'s examples ──');
{
  ok(r('No thanks').category === 'not_interested' && r('No thanks').bucket === 'no_action', '"No thanks" → not interested, no admin alert');
  ok(r('Stop messaging me').category === 'opt_out' && r('Stop messaging me').suppress && r('Stop messaging me').bucket === 'no_action', '"Stop messaging me" → opt out, suppressed, no admin alert');
  ok(r("I've already got someone").category === 'already_sorted' && r("I've already got someone").bucket === 'no_action', '"I\'ve already got someone" → no admin alert');
  ok(r('How much is it?').category === 'price' && r('How much is it?').bucket === 'rep_action', '"How much is it?" → an actionable sales conversation');
  ok(r('Can you call me tomorrow?').category === 'call_request' && r('Can you call me tomorrow?').bucket === 'rep_action', '"Can you call me tomorrow?" → a salesperson action');
  ok(r("Yes I'm interested").category === 'interested' && HIGH_INTENT.has(r("Yes I'm interested").category), '"Yes I\'m interested" → high-intent sales action');
  ok(r('Who are you and why are you messaging me?').bucket === 'rep_action', '"Who are you and why are you messaging me?" → a salesperson response');
  ok(r("This is harassment, I'm reporting you").bucket === 'urgent_admin', '"This is harassment / I\'m reporting you" → admin attention');
}

console.log('\n── opt-out is phrases only, and narrow ──');
{
  for (const t of ['STOP', 'stop', 'Stop.', 'Unsubscribe', 'Please remove me from your list', 'Do not contact me again', "don't message me", 'Take me off your list', 'leave me alone', 'scrub me off your list and stop bothering me', 'Opt out'])
    ok(isOptOut(t), `opt-out: "${t}"`);
  for (const t of ['one stop shop for all your plumbing', "can't stop the leak", 'Stop by the shop tomorrow?', 'no thanks', 'wrong number'])
    ok(!isOptOut(t), `NOT an opt-out: "${t}"`);
  ok(r('wrong number').category === 'wrong_person' && !r('wrong number').suppress, 'wrong number stays its own flow — never suppressed here');
  const c = r('STOP', client);
  ok(c.bucket === 'urgent_admin' && !c.suppress, "a paying client's STOP goes to Paul and is never auto-suppressed (it would stop their service messages)");
}

console.log('\n── measured on 1,843 real replies (2026-09-30) ──');
{
  for (const t of ['Yes', 'Yes it is', 'Hi yes it is', 'Hi, yes it is. How can I help?', 'How can I help?', 'Yes, how can I help?', 'It is', 'Yeah', 'Speaking', 'Hi'])
    ok(r(t).category === 'confirmed_contact' && !HIGH_INTENT.has(r(t).category), `"${t}" answers "is this <business>?" — not interest`);
  ok(r('Can you show me a sample of the report you provide?').bucket !== 'urgent_admin', '"the report you provide" is not "I\'ll report you"');
  for (const t of ["Cause if I got to give i ain't interested", "Hi Paul - my diary is full for months ahead so not something I'm interested in", 'Thanks, I am so sorry but not this time.'])
    ok(r(t).category === 'not_interested', `negated interest: "${t.slice(0, 50)}…"`);
  ok(r('No, thank you').category === 'not_interested' && r('Nope').category === 'not_interested', 'a bare no, with or without the comma');
  ok(r('Thank you for the information. We don’t need any services').category === 'not_interested', '"we don\'t need any services" → no');
  ok(r('👍').bucket === 'no_action' && r('🙏🙏').bucket === 'no_action', 'an emoji reaction needs nobody');
  ok(r('Thank you for your message. My working hours are between 8am - 4:30pm.').category === 'automated', 'a working-hours notice is automated');
  ok(r('Yes please').category === 'interested' && r('Go on then').category === 'interested', '"Yes please" / "Go on then" are interest');
  ok(r('Hi, thanks for explaining. Yes, I’m interested. Could you explain your prices').category === 'price', 'interest with a price question files as price (still high intent)');
}

console.log('\n── clients, media, the AI hand-off ──');
{
  ok(r('When will my new site be live?', client).bucket === 'admin_action', "a paying client's question is Paul's");
  ok(r('I want a refund', client).bucket === 'urgent_admin', "a client's refund request is urgent");
  ok(r('thanks', client).bucket === 'no_action', "a client's thanks needs nobody");
  ok(r('[image]', { isClient: false, messageType: 'image' }).category === 'media', 'a bare photo is media for a person to look at');
  ok(r('We come up in nuneaton though so we are getting there').method === 'needs_ai', 'an unrecognised human message goes to the AI');
}

console.log('\n── the AI can only file ──');
{
  ok(decisionFromAi({ category: 'opt_out', confidence: 0.99, reason: 'said stop' }, lead).bucket === 'review' && !decisionFromAi({ category: 'opt_out', confidence: 0.99, reason: '' }, lead).suppress, 'an AI opt-out is REVIEW and never suppresses');
  ok(decisionFromAi({ category: 'interested', confidence: 0.5, reason: 'maybe' }, lead).bucket === 'review', 'low confidence → review');
  ok(decisionFromAi({ category: 'buy_now', confidence: 0.9, reason: '' }, lead).bucket === 'review', 'an unknown category → review');
  ok(decisionFromAi(null, lead).bucket === 'review', 'no answer → review');
  ok(decisionFromAi({ category: 'interested', confidence: 0.9, reason: 'wants it' }, lead).bucket === 'rep_action', 'a confident interested → salesperson');
  ok(decisionFromAi({ category: 'escalation', confidence: 0.9, reason: 'threat' }, lead).bucket === 'urgent_admin', 'a confident escalation → urgent');
  ok(decisionFromAi({ category: 'interested', confidence: 0.9, reason: 'x' }, client).bucket === 'admin_action', "a client's message is Paul's whatever the model says");
}

console.log('\n── open / closed ──');
{
  const now = Date.parse('2026-09-30T12:00:00Z');
  const base = { messageAt: '2026-09-29T12:00:00Z', answeredAfter: false, actedAfter: false, settled: false, resolvedAt: null, nowMs: now };
  ok(triageIsOpen(base), 'unanswered, recent → open');
  ok(!triageIsOpen({ ...base, answeredAfter: true }) && !triageIsOpen({ ...base, actedAfter: true }) && !triageIsOpen({ ...base, settled: true }) && !triageIsOpen({ ...base, resolvedAt: '2026-09-30T00:00:00Z' }), 'answered, acted on, settled or handled → closed');
  ok(!triageIsOpen({ ...base, messageAt: new Date(now - (TRIAGE_SURFACE_DAYS + 1) * 86_400_000).toISOString() }), `older than ${TRIAGE_SURFACE_DAYS} days → not surfaced`);
}

console.log('\n── what reaches Paul\'s list ──');
{
  const NOW = Date.parse('2026-09-30T12:00:00Z');
  const PAUL = 'p1', REP = 'r1';
  let n = 0;
  const L = (o: Partial<AdminLead>): AdminLead => ({
    id: `L${++n}`, business_name: `Biz ${n}`, created_at: '2026-09-01T10:00:00Z', added_by_user_id: PAUL, assigned_to_user_id: null, sold_by_user_id: null, sold_at: null,
    status: 'replied', amount_paid: null, is_potential_work: null, call_booked_at: null, whatsapp_sent_at: '2026-09-20T10:00:00Z', next_action: null, next_action_date: null,
    is_archived: false, phone: null, email: null, search_keyword: 'plumber', category: null, payment_date: null, refunded_at: null, service_terminated_at: null,
    subscription_status: null, contract_total_payments: null, baseline_audit_id: null, remeasure_due_date: null, remeasure_audit_id: null, ...o,
  });
  const T = (l: AdminLead, category: string, bucket: string, hoursAgo: number, o: Partial<TriageRow> = {}): TriageRow => ({
    id: `T-${l.id}`, message_id: `M-${l.id}`, lead_id: l.id, message_at: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    category, bucket, reason: 'r', confidence: 1, method: 'rule', action_taken: null, resolved_at: null, ...o,
  });
  const noThanks = L({}), paulPrice = L({}), repPriceFresh = L({ assigned_to_user_id: REP }), repPriceStale = L({ assigned_to_user_id: REP }),
    repQuestion = L({ assigned_to_user_id: REP }), answered = L({}), urgent = L({}), review = L({}), handled = L({}), confirmed = L({});
  const leads = [noThanks, paulPrice, repPriceFresh, repPriceStale, repQuestion, answered, urgent, review, handled, confirmed];
  const p = (k: string) => resolvePeriod(k, NOW);
  const input: AdminInput = {
    period: p('7d'), today: p('today'), yesterday: p('yesterday'), week: p('week'), month: p('mtd'), nowMs: NOW, bookOwnerId: PAUL,
    people: [{ userId: PAUL, name: 'Paul', role: 'admin', excluded: false }, { userId: REP, name: 'Sumi', role: 'sales', excluded: false }],
    exclusions: buildExclusions([]), leads,
    messages: [{ lead_id: answered.id, direction: 'outbound', status: 'sent', created_at: new Date(NOW - 1 * 3_600_000).toISOString(), body: null, sent_by_user_id: PAUL, template_name: null, test_mode: false }],
    activity: [], suppressions: [], ledger: [], onboarding: [], commissionLines: [], commissionTotals: null, commissionDueBySeller: new Map(), payoutsBySeller: new Map(),
    cost: { period: [], today: [], yesterday: [], week: [], month: [] },
    triage: [
      T(noThanks, 'not_interested', 'no_action', 3), T(paulPrice, 'price', 'rep_action', 3), T(repPriceFresh, 'price', 'rep_action', 3),
      T(repPriceStale, 'price', 'rep_action', REP_ESCALATE_HOURS + 2), T(repQuestion, 'question', 'rep_action', 48), T(answered, 'price', 'rep_action', 3),
      T(urgent, 'escalation', 'urgent_admin', 2), T(review, 'unclear', 'review', 2, { method: 'ai', confidence: 0.4 }), T(handled, 'price', 'rep_action', 3, { resolved_at: new Date(NOW).toISOString() }),
      T(confirmed, 'confirmed_contact', 'rep_action', 3),
    ],
  };
  const o = foldAdminOverview(input);
  const on = (l: AdminLead) => o.attention.some((a) => a.leadId === l.id);
  ok(!on(noThanks), 'a "no thanks" never reaches the list');
  ok(on(paulPrice), 'a price question on a lead Paul holds (nobody else working it) reaches the list');
  ok(!on(repPriceFresh), "a salesperson's fresh price question stays with the salesperson");
  ok(on(repPriceStale) && /hasn't answered/.test(o.attention.find((a) => a.leadId === repPriceStale.id)!.why), `…until it has waited ${REP_ESCALATE_HOURS} hours`);
  ok(!on(repQuestion), "a salesperson's ordinary question never reaches Paul");
  ok(!on(answered), 'a reply someone has answered since is closed');
  ok(o.attention.find((a) => a.leadId === urgent.id)?.group === 'urgent', 'an escalation is urgent');
  ok(o.attention.find((a) => a.leadId === review.id)?.group === 'review', 'a low-confidence AI filing is on the list as REVIEW — it does not disappear');
  ok(!on(handled), 'marked handled → gone');
  ok(!on(confirmed), '"Yes it is" (confirming the opener) never reaches the list');
  ok(o.triage?.byBucket.no_action === 1 && o.triage?.byBucket.rep_action === 7, 'the summary counts the sorting');
  const o2 = foldAdminOverview({ ...input, triage: null });
  ok(o2.triage === null, 'triage unavailable is reported as unavailable, never as "nothing needs you"');
}

console.log('\n── the History kind exists in the migration and has a label ──');
{
  const mig = readFileSync(new URL('../supabase/migrations/20261001110000_conversation_triage.sql', import.meta.url), 'utf8');
  ok(/'state_changed', 'opted_out'/.test(mig), 'lead_activity_kind_check gains opted_out');
  ok(/opted_out: 'Asked to stop'/.test(readFileSync(new URL('../src/lib/salesCrm.ts', import.meta.url), 'utf8')), 'History labels it');
  const fn = readFileSync(new URL('../supabase/functions/conversation-triage/index.ts', import.meta.url), 'utf8');
  ok(!/from\("outreach_leads"\)\.update/.test(fn) && !/payment_ledger/.test(fn), 'the triage function never writes a lead or money');
  ok(/\(await paidMode\(service\)\) === "all_stop"/.test(fn) && /AI_DAILY_CAP_USD/.test(fn) && /AI_MAX_PER_RUN/.test(fn), 'the model call honours the emergency stop, a per-run cap and a daily cap');
  ok(/reason: "opted_out", source: "whatsapp_optout_inbound"/.test(fn) && /if \(d\.suppress\)/.test(fn), 'only a rule decision (d.suppress) can suppress, through the shared suppress()');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
