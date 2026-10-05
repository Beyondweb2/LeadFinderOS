/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WAVE 1 INTEGRATION — the six pre-sales workstreams working TOGETHER (2026-10-04;
   docs/pre-sales-certification/wave1-integration.md). Run: npx tsx scripts/wave1-integration.test.ts

   Each workstream proved its own half. These are the joins — every scenario crosses at least two of them,
   through the real functions (the payment writes run against scripts/fake-supabase.ts, the site against
   the real gate). No network, no Stripe, no Meta, no real contact.

     1  call screen (WS-5) → Build Quick Close (WS-2) → 5 of 5, ready for payment
     2  Quick Close → payment (WS-3 writes) → Paid Client: Paul's first-contact step, seller locked out
     3  a payment replay never regresses a client
     4  an ended client stays ended (no link, no chase, no reactivation)
     5  an archived lead is in no task (WS-5) — an expired link (WS-2) included
     6  a salesperson cannot see Paul's saved texts (WS-1) after every migration in the wave
     7  a WhatsApp after a call finds its lead (WS-1)
     8  prospecting spend cannot block a baseline (WS-4)
     9  approved service truth → baseline questions (WS-4, incl. the integration's new-work fix)
    10  an unsupported / not-offered service → no baseline approval without a written reason
    11  an unsupported baseline prompt → no website page (WS-4 truth → WS-6 scope → page generator)
    12  a Build site passes the full gate with the truth wired in (WS-6)
    13  Optimise cannot reach Build production
    14  the Welcome Pack's ownership words follow the route (WS-3)
    15  the SEO grade is its own before / after measure, never the guarantee (Paul's ruling)
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { FakeDb } from './fake-supabase.ts';
import { establishLeadPayment, markOnboardingPaid, stampFirstContactOwed } from '../supabase/functions/_shared/payment-state.ts';
import { recordFirstContact } from '../supabase/functions/_shared/client-setup.ts';
import { handoffReadiness, type HandoffEvidence, type HandoffLead, type HandoffOnboarding } from '../src/lib/handoffReadiness.ts';
import { deliveryStage, type StageInput } from '../src/lib/deliveryStage.ts';
import { buildCallClose, GUARANTEE_HEADLINE } from '../src/lib/callClose.ts';
import {
  adoptLink, answersKey, cleanAnswers, linkStep, planQuickCloseSave, quickCloseClosedRefusal, quickCloseState, QUICK_CLOSE_PROMISE, QUICK_CLOSE_QUESTIONS,
  type QcRecord, type QuickCloseAnswers,
} from '../src/lib/quickClose.ts';
import { agreementRouteLock, maySetAgreementRoute } from '../src/lib/agreementRoute.ts';
import { foldSalesWorkspace } from '../src/lib/salesWorkspace.ts';
import { chooseInboundLead, phoneKeyLikeDb } from '../src/lib/inboundMatch.ts';
import { budgetDecision, budgetPoolForPurpose, POOL_DAILY_CAP_USD } from '../src/lib/auditBudget.ts';
import { buildServiceScope, questionScope, resolveServiceTruth } from '../src/lib/serviceScope.ts';
import { assessBaselineQuality, unresolvedBlocks } from '../src/lib/baselineQuality.ts';
import { measuredQuestionRefusal, serviceConfirmed, siteServiceTruth, truthSiteScope } from '../src/lib/siteServiceTruth.ts';
import { namesExcluded } from '../src/lib/siteScope.ts';
import { parseWebsiteBuild } from '../src/lib/websiteBuildState.ts';
import { candidateFacts, mergeFacts, type FactsContext } from '../src/lib/buildFacts.ts';
import { computeMapping } from '../src/lib/templateMapping.ts';
import { launchProblems, type BuildPackInput } from '../src/lib/buildPack.ts';
import { toRebuildPromptInput, type RebuildContextPayload } from '../src/lib/rebuildContext.ts';
import { siteIntentMap, siteIntentMapLines, type SiteIntentMap } from '../src/lib/siteGate.ts';
import { productionReadiness, buildToolingRefusal } from '../src/lib/websiteLaunch.ts';
import { auditSite, intentPage } from './site-quality-gate.mjs';
import { clearedForProduction } from './lib/website-launch-ready.ts';
import { AGREEMENT_KEY_POINTS, buildWelcomePackHtml } from '../src/lib/welcomePackHtml.ts';
import type { AiAuditReportData, AiAuditSeo } from '../src/lib/aiAuditReportHtml.ts';
import { FINDABLE_GUARANTEE, FINDABLE_MONTHLY_DELAY_DAYS, firstRecurringPaymentIso, totalPaymentsFor } from '../src/lib/findableOffer.ts';

let failures = 0;
const ok = (c: boolean, l: string) => { if (!c) failures++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const LEAD = '1f000000-0000-4000-8000-0000000000w1';
const OB = '2f000000-0000-4000-8000-0000000000w1';
const NOW = Date.parse('2026-10-05T10:00:00Z'); // Monday
const iso = (ms: number) => new Date(ms).toISOString();

/* ── Quick Close's row, with the edge function's conditional-write rule (quick-close-links.test.ts) ── */
type QcRow = { status: string; quick_close: QcRecord | null; cols: Record<string, unknown> };
const writeQc = (row: QcRow, expect: number | null, next: QcRecord, cols: Record<string, unknown> = {}) => {
  if ((row.quick_close?.rev ?? null) !== expect) return null;
  row.quick_close = { ...clone(next), rev: (expect ?? 0) + 1 }; Object.assign(row.cols, cols); return row.quick_close;
};
const qcSave = (row: QcRow, answers: Record<string, string>, expectRoute: unknown) => {
  const seen = clone(row.quick_close);
  const plan = planQuickCloseSave(seen, answers, { expectRoute, routeChangeConfirmed: false, actorId: 'rep-1', nowIso: iso(NOW) });
  if (!plan.ok) return plan;
  return writeQc(row, seen?.rev ?? null, plan.next, plan.cols) ? { ok: true as const } : { ok: false as const, error: 'busy' };
};
const counter = (a: QuickCloseAnswers) => {
  const shown = QUICK_CLOSE_QUESTIONS.filter((x) => !(x.key === 'access' && a.manager === 'no_website') && !(x.key === 'authority' && (a.manager === 'owner' || a.manager === 'employee' || a.manager === 'no_website')) && !(x.key === 'build_consents' && a.route !== 'build'));
  return `${shown.filter((x) => a[x.key]).length}/${shown.length}`;
};

/* ── the database a payment lands in (the webhook's own writes) ──────────────────────────────────── */
const dbWith = (lead: Record<string, unknown>, ob: Record<string, unknown> = { id: OB, status: 'answers_saved' }) => {
  const db = new FakeDb();
  db.table('outreach_leads').push({ id: LEAD, business_name: 'ZZ QA-W1 Plumbing', amount_paid: null, status: 'interested', payment_date: null, service_terminated_at: null,
    stripe_customer_id: null, stripe_payment_intent_id: null, client_contacted_at: null, first_contact_owed_since: null, ...lead });
  db.table('onboarding_responses').push({ ...ob });
  return db;
};
const leadOf = (db: FakeDb) => db.table('outreach_leads')[0];
/** stripe-webhook's checkout path, in its order: establish → onboarding paid → (first payment only) stamp. */
async function webhookPayment(db: FakeDb, eventIso: string) {
  const r = await establishLeadPayment(db, LEAD, { amountGbp: 99, paymentDay: eventIso.slice(0, 10), paidFor: 'Findable Build', stripeCustomerId: 'cus_W1', stripePaymentIntentId: 'pi_W1' });
  await markOnboardingPaid(db, OB, eventIso);
  const stamp = r.kind === 'first' ? await stampFirstContactOwed(db, LEAD, eventIso) : null;
  return { kind: r.kind, stamp };
}
const BUILD_OB: HandoffOnboarding = { services_list: ['Boiler repairs'], areas_list: ['Halifax'], confirmed_location: 'Halifax', website_platform: 'no_website', plan_tier: 'new_site',
  website_addon: true, gbp_status: 'done', domain_status: 'new', dns_permission: true, materials_confirmed: true, authority_confirmed: true } as HandoffOnboarding;
const stageFor = (lead: Record<string, unknown>, today: string, route: 'build' | 'optimise' = 'build'): ReturnType<typeof deliveryStage> => {
  const ev: HandoffEvidence = { crawl: false, crawlAgeDays: null, hookAudit: true, salesHandoff: { applies: 'not_needed_own_sale', complete: false, missing: 0 } };
  const L = { business_name: 'ZZ QA-W1 Plumbing', phone: '07700900611', contract_total_payments: totalPaymentsFor(route), ...lead };
  const input: StageInput = { readiness: handoffReadiness(L as HandoffLead, BUILD_OB, ev), lead: L as never, onboarding: { baseline_status: 'needs_questions' }, baselineAudit: null,
    discovery: { generated: false, started: false, finished: false }, route, today };
  return deliveryStage(input);
};

/* ═════════════════════════════════════════════════════════════════════════════════════════════ */
console.log('── 1. CALL SCREEN → BUILD QUICK CLOSE → 5/5 ──');
const row: QcRow = { status: 'answers_saved', quick_close: null, cols: {} };
{
  const close = buildCallClose('none');
  ok(close.routes.length === 1 && close.routes[0].route === 'build', 'a lead with no website: the call screen offers Build only');
  ok(close.guarantee.headline === QUICK_CLOSE_PROMISE && GUARANTEE_HEADLINE === QUICK_CLOSE_PROMISE, 'the call screen and Quick Close say the SAME guarantee line (one copy)');
  ok(close.routes[0].spoken.join(' ').includes(`${totalPaymentsFor('build')} payments in total`) && /six weeks after today/.test(close.routes[0].spoken.join(' ')), 'the spoken Build offer: 12 payments in total, monthly from six weeks');
  let route: unknown = null;
  for (const [k, v] of [['decision_maker', 'yes'], ['domain', 'no_domain'], ['manager', 'no_website'], ['route', 'build']] as const) {
    ok(qcSave(row, { [k]: v }, route).ok, `Quick Close saves ${k}=${v} (one answer per call, as the dialog sends it)`);
    route = cleanAnswers(row.quick_close?.answers).route ?? null;
  }
  ok(counter(cleanAnswers(row.quick_close!.answers)) === '4/5', 'four answers → 4 of 5 (the consents to confirm)');
  ok(qcSave(row, { build_consents: 'yes' }, 'build').ok, 'the Build consents are kept (the M-001 bug cannot recur)');
  ok(counter(cleanAnswers(row.quick_close!.answers)) === '5/5' && quickCloseState(row.status, row.quick_close, NOW) === 'ready', 'Build reaches 5 of 5 — READY FOR PAYMENT');
  ok(row.cols.plan_tier === 'new_site', 'the checkout reads Build from the row (plan_tier new_site)');
  // generate the link (claim → Stripe → adopt), as fn quick-close does
  const step = linkStep(row.status, clone(row.quick_close), NOW);
  ok(step.kind === 'claim', 'a link may be generated');
  writeQc(row, row.quick_close!.rev ?? null, { ...clone(row.quick_close!), link_claimed_at: iso(NOW), link_claimed_by: 'rep-1' });
  const a = adoptLink(row.status, clone(row.quick_close), answersKey(row.quick_close!.answers), { url: 'https://checkout.stripe.com/c/pay/cs_test_W1', session: 'cs_test_W1', expiresIso: iso(NOW + 24 * 3_600_000) }, 'rep-1', iso(NOW), NOW);
  ok(a.kind === 'store' && !!writeQc(row, row.quick_close!.rev ?? null, (a as { next: QcRecord }).next), 'the link is stored');
  ok(quickCloseState(row.status, row.quick_close, NOW) === 'link_generated', 'Quick Close: link generated');
}

console.log('\n── 2. QUICK CLOSE → PAYMENT → PAID CLIENT ──');
{
  const db = dbWith({ status: 'interested' });
  ok(quickCloseClosedRefusal(leadOf(db), { status: row.status }) === null, 'before payment Quick Close is open');
  const paidAt = '2026-10-05T11:00:00Z';
  const p = await webhookPayment(db, paidAt);
  ok(p.kind === 'first' && p.stamp === 'stamped', 'the payment establishes the client and stamps "first contact owed" (the rule activates on THIS payment)');
  row.status = String(db.table('onboarding_responses')[0].status);
  const L = leadOf(db);
  ok(L.amount_paid === 99 && L.status === 'payment_received' && L.payment_date === '2026-10-05', 'the lead is a client: £99, payment received, paid on the event day');
  const s = stageFor(L, '2026-10-05');
  ok(s.state === 'waiting_findable' && s.next.key === 'contact_client' && /by Wed 7 Oct/.test(s.next.label), `Paid Client: WAITING FOR FINDABLE — "Introduce yourself … by Wed 7 Oct" (got ${s.stateLabel} / ${s.next.label})`);
  ok(!s.missing.includes('Website') && !s.missing.some((m) => /access/i.test(m)), 'a Build client is never blocked for having no website or no login');
  const refusal = quickCloseClosedRefusal(L, { status: row.status });
  ok(refusal?.error === 'already_paid', 'the seller can no longer change answers, make, e-mail or WhatsApp a link (already_paid)');
  ok(quickCloseClosedRefusal({ ...L }, { status: 'in_delivery' })?.error === 'already_paid' && quickCloseClosedRefusal({ amount_paid: 99, status: 'payment_received' }, { status: 'completed' })?.error === 'already_paid',
    'still refused once the row has moved on to in_delivery / completed (the gap the old row-only check left)');
  ok(quickCloseClosedRefusal({ status: 'interested', amount_paid: null }, { status: 'paid' })?.error === 'already_paid', 'a row that already reads paid is refused even before the lead row catches up (the second signal)');
  const qcSrc = read('supabase/functions/quick-close/index.ts');
  ok(/const closedNow = quickCloseClosedRefusal\(lead as never, row as never\);\s*const usable = linkUsable\(cur, nowMs\) && !closedNow;/.test(qcSrc), 'the dialog is never handed a link URL for a paid / ended client, even one still in its window');
  ok(/first_contact: \{ state: s\.stage\.firstContact\.state, due: s\.stage\.firstContact\.due \}/.test(qcSrc) && /firstContactDueLabel\(v\.setup\.first_contact\.due\)/.test(read('src/components/QuickCloseDialog.tsx')),
    'the seller sees Paul will be in touch, with the SAME due day Paul\u2019s own screen shows');
  const lock = agreementRouteLock({ contractTotalPayments: L.contract_total_payments ?? totalPaymentsFor('build'), linkRoute: 'build', acceptances: [] } as never);
  ok(!maySetAgreementRoute(lock, 'optimise').ok, 'after payment the agreement route cannot drift (Build stays Build)');
  ok(firstRecurringPaymentIso(paidAt) === iso(Date.parse(paidAt) + FINDABLE_MONTHLY_DELAY_DAYS * 86_400_000) && FINDABLE_MONTHLY_DELAY_DAYS === 42, 'the monthly starts exactly six weeks (42 days) after the sign-up payment — the same calculation Stripe\u2019s trial_end uses');
  const r1 = await recordFirstContact(db, LEAD, 'paul', 'phone', null);
  ok(r1.ok && !r1.already, 'Paul records the introduction');
  const after = stageFor(leadOf(db), '2026-10-06');
  ok(after.firstContact.state === 'done' && after.next.key !== 'contact_client', 'and the normal setup step takes over');
}

console.log('\n── 3. A PAYMENT REPLAY NEVER REGRESSES A CLIENT ──');
{
  const db = dbWith({ status: 'in_delivery', amount_paid: 99, payment_date: '2026-09-20', stripe_payment_intent_id: 'pi_OLD', stripe_customer_id: 'cus_OLD', client_contacted_at: '2026-09-21T09:00:00Z' }, { id: OB, status: 'in_delivery' });
  const before = JSON.stringify(leadOf(db));
  const kinds: string[] = [];
  for (let i = 0; i < 3; i++) kinds.push((await webhookPayment(db, '2026-10-05T12:00:00Z')).kind);
  ok(kinds.join() === 'replay,replay,replay', 'three re-deliveries are replays');
  ok(JSON.stringify(leadOf(db)) === before, 'the lead is byte-identical: status, amount, day, payment intent, first contact');
  ok(db.table('onboarding_responses')[0].status === 'in_delivery', 'the onboarding row is not moved back to paid');
  const pre = dbWith({ status: 'payment_received', amount_paid: 99, payment_date: '2026-09-01' });
  await webhookPayment(pre, '2026-10-05T12:00:00Z');
  ok(leadOf(pre).first_contact_owed_since === null && stageFor(leadOf(pre), '2026-11-30').firstContact.state === 'not_recorded_before', 'a client paid BEFORE the deploy is never stamped by a replay — never "overdue"');
}

console.log('\n── 4. AN ENDED CLIENT STAYS ENDED ──');
{
  const ended = { status: 'payment_received', amount_paid: 49.99, payment_date: '2026-08-17', service_terminated_at: '2026-10-04T10:20:00Z', service_termination_reason: 'client_ended_early', stripe_customer_id: 'cus_RON', stripe_payment_intent_id: 'pi_RON' };
  const db = dbWith(ended, { id: OB, status: 'completed' });
  const before = JSON.stringify(leadOf(db));
  const p = await webhookPayment(db, '2026-10-05T12:00:00Z');
  ok(p.kind === 'replay' && p.stamp === null && JSON.stringify(leadOf(db)) === before, 'a late payment event changes nothing on an ended client (Ronnie-shaped fixture: £49.99 kept, end mark kept)');
  ok(await stampFirstContactOwed(db, LEAD, '2026-10-05T12:00:00Z') === 'kept', 'first contact is never stamped for an ended client, even if asked directly');
  ok(stageFor(leadOf(db), '2026-10-13').stage === 'ended' && stageFor(leadOf(db), '2026-10-13').next.key === 'none', 'the Paid Client stage is ENDED with no next step');
  ok(quickCloseClosedRefusal(leadOf(db), { status: 'completed' })?.error === 'client_closed', 'Quick Close refuses any link for an ended client (client_closed)');
  ok(quickCloseClosedRefusal({ status: 'refunded', amount_paid: 99 }, null)?.error === 'client_closed', '…and for a refunded one');
  ok(!(await recordFirstContact(db, LEAD, 'paul', 'phone', null)).ok, 'no first contact can be recorded for an ended client');
}

console.log('\n── 5. AN ARCHIVED LEAD IS IN NO TASK ──');
{
  const fact = (id: string) => ({ lead: { id, business_name: id, status: 'interested' }, thread: [], contactTimesMs: [NOW - 3 * 86_400_000], humanReplyTimesMs: [], firstContactMs: NOW - 3 * 86_400_000,
    lastContactMs: NOW - 3 * 86_400_000, contactCount: 1, channels: new Set(['phone']), respondedChannels: new Set(), responded: false, interested: true, notInterested: false,
    onboardingSent: false, onboardingOpened: false, won: false, interestedAtMs: NOW - 4 * 86_400_000, linkFirstSentAt: null, linkFirstOpenedAt: null });
  const lead = (id: string, archived: boolean) => [id, { id, business_name: id, status: 'interested', next_action: 'call', next_action_date: '2026-10-02', next_action_note: null, next_action_time: null, call_booked_at: null, is_archived: archived }] as const;
  const ws = foldSalesWorkspace({
    personId: 'me', nowMs: NOW,
    facts: [fact('Live Co'), fact('Archived Co')] as never,
    leads: new Map([lead('Live Co', false), lead('Archived Co', true)]) as never,
    audits: [], activity: [],
    quickClose: new Map([['Live Co', { state: 'link_expired' as const, linkAt: iso(NOW - 30 * 3_600_000) }], ['Archived Co', { state: 'link_expired' as const, linkAt: iso(NOW - 30 * 3_600_000) }]]),
  });
  const all = JSON.stringify({ a: ws.nextActions, f: ws.followUps, w: ws.waiting, p: ws.pipeline, h: ws.health });
  ok(ws.nextActions.some((x) => x.leadId === 'Live Co'), 'the fixture works: the live twin has a task');
  ok(!all.includes('Archived Co'), 'the archived lead is in no action, follow-up, pipeline card or warning — its expired payment link included');
  ok(ws.nextActions.find((x) => x.leadId === 'Live Co')?.title !== 'Payment link sent — not paid yet', 'an expired link is never shown as "sent, not paid"');
  ok(/\.or\("is_archived\.is\.null,is_archived\.eq\.false"\)|is_archived/.test(read('supabase/functions/quick-close/index.ts')), 'the "finish the handoff" card (my_handoffs) also leaves archived sales out');
}

console.log('\n── 6. A SALESPERSON CANNOT SEE PAUL\u2019S SAVED TEXTS ──');
{
  const dir = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const touching = files.filter((f) => /sales_select_templates/.test(read('supabase/migrations/' + f)));
  const last = touching[touching.length - 1];
  ok(last === '20261006010000_templates_owner_only.sql' && /drop policy if exists sales_select_templates/i.test(read('supabase/migrations/' + last)), 'the LAST migration to mention the cross-owner read drops it (no later wave-1 migration re-adds it)');
  ok(!files.filter((f) => f > '20261006010000').some((f) => /on public\.templates[\s\S]{0,200}book_owner_id/i.test(read('supabase/migrations/' + f))), 'no later migration grants a book-owner read on templates');
  const hook = read('src/hooks/useTemplates.ts');
  ok(!/DEFAULT_TEMPLATES\.map\(\(t\) => \(\{ \.\.\.t, user_id/.test(hook) && /return \(data \?\? \[\]\)\.map\(typeRow\);/.test(hook), 'a new rep\u2019s account is not seeded with the old default texts (an empty list stays empty)');
}

console.log('\n── 7. A WHATSAPP AFTER A CALL FINDS ITS LEAD ──');
{
  const stored = '07700 900611', meta = '447700900611';
  ok(phoneKeyLikeDb(stored) === phoneKeyLikeDb(meta) && phoneKeyLikeDb('+44 7700 900611') === phoneKeyLikeDb(meta), 'the number the rep typed and the number Meta sends meet on one key');
  const c = chooseInboundLead([{ id: LEAD, user_id: 'paul', assigned_to_user_id: 'rep-1', is_archived: false }, { id: 'old-archived', user_id: 'paul', assigned_to_user_id: null, is_archived: true }]);
  ok(c.kind === 'matched' && c.leadId === LEAD && c.holderUserId === 'rep-1', 'a lead we only RANG (no outbound WhatsApp) gets the reply, and its holder is the rep who called');
  ok(chooseInboundLead([{ id: 'a', user_id: 'p', assigned_to_user_id: 'r1', is_archived: false }, { id: 'b', user_id: 'p', assigned_to_user_id: 'r2', is_archived: false }]).kind === 'ambiguous', 'two live leads on one number → Unassigned for Paul, never a guess');
  ok(/inbound_lead_candidates/.test(read('supabase/functions/_shared/whatsapp-inbound.ts')), 'the inbound handler asks the database by phone key');
}

console.log('\n── 8. PROSPECTING SPEND CANNOT BLOCK A BASELINE ──');
{
  ok(POOL_DAILY_CAP_USD.guarantee === 10 && POOL_DAILY_CAP_USD.client === 8 && POOL_DAILY_CAP_USD.prospecting === 12, 'the pools are Paul\u2019s launch configuration: guarantee $10/day, client $8/day, prospecting $12/day');
  ok(budgetPoolForPurpose('baseline') === 'guarantee' && budgetPoolForPurpose('remeasure') === 'guarantee' && budgetPoolForPurpose('audit') === 'prospecting' && budgetPoolForPurpose(undefined) === 'prospecting', 'a sales audit is prospecting; a baseline / re-measure is the guarantee pool (unknown → prospecting)');
  const apify = { usedUsd: 90, capUsd: 100 };
  const pro = budgetDecision({ pool: 'prospecting', poolSpentUsd: 12, estCostUsd: 0.05, apify });
  const gua = budgetDecision({ pool: 'guarantee', poolSpentUsd: 0, estCostUsd: 0.25, apify });
  ok(!pro.allowed && gua.allowed, 'prospecting exhausted AND Apify at 90% → prospecting refused, the baseline still runs');
  ok(!budgetDecision({ pool: 'prospecting', poolSpentUsd: 0, estCostUsd: 0.05, apify: { usedUsd: 86, capUsd: 100 } }).allowed, 'prospecting stops at its Apify reserve, leaving the rest of the month for guarantee work');
}

console.log('\n── 9. APPROVED SERVICE TRUTH → BASELINE QUESTIONS ──');
const D2_TRUTH = { services: ['Gas boiler servicing', 'Boiler repairs and breakdowns', 'Radiator installation and replacement', 'Leak, tap and toilet repairs'], notOffered: ['new boilers', 'drains', 'bathroom fitting'], trade: 'Plumber and heating engineer', towns: ['Brighouse', 'Rastrick', 'Elland', 'Hipperholme', 'Lightcliffe'] };
{
  const truth = resolveServiceTruth({ onboardingList: D2_TRUTH.services, lead: ['Bathroom fitting'], notOffered: D2_TRUTH.notOffered.join(', ') });
  ok(truth.source === 'onboarding' && truth.clientConfirmed && !truth.services.includes('Bathroom fitting'), 'client onboarding outranks Sales notes — the lists are never merged');
  ok(resolveServiceTruth({ lead: ['Boiler repairs'] }).source === 'lead' && !resolveServiceTruth({ lead: ['Boiler repairs'] }).clientConfirmed, 'Sales notes are usable, never "client-confirmed"');
  const scope = buildServiceScope(D2_TRUTH);
  for (const q of ['Who can repair my boiler in Brighouse?', 'Who offers gas boiler servicing in Elland?', 'Which plumber in Brighouse can replace a radiator?', 'cheapest boiler service Brighouse']) {
    const v = questionScope(q, scope).verdict;
    ok(v === 'service' || v === 'core', `"${q}" is in scope (${v})`);
  }
  const rep = assessBaselineQuality({ questions: ['Can you recommend a good plumber in Brighouse, UK?', 'Who can repair my boiler in Brighouse?'], scope, primaryTown: 'Brighouse', areas: D2_TRUTH.towns, businessName: 'Brookfoot Plumbing & Heating', trade: D2_TRUTH.trade, servicesClientConfirmed: true });
  ok(!rep.blocking.some((b) => b.question === 'Who can repair my boiler in Brighouse?'), 'a boiler REPAIR question is not blocked by the client\u2019s "no new boilers" (the integration fix: a new-work negative binds only new work)');
}

console.log('\n── 10. AN UNSUPPORTED SERVICE CANNOT ENTER THE BASELINE UNSEEN ──');
{
  const scope = buildServiceScope(D2_TRUTH);
  const qs = ['Can you recommend a good plumber in Brighouse, UK?', 'Who can fit a new boiler in Brighouse?', 'Who unblocks drains in Elland?', 'Who does underfloor heating in Brighouse?'];
  const rep = assessBaselineQuality({ questions: qs, scope, primaryTown: 'Brighouse', areas: D2_TRUTH.towns, businessName: 'Brookfoot Plumbing & Heating', trade: D2_TRUTH.trade, servicesClientConfirmed: true });
  const codeOf = (q: string) => rep.blocking.find((b) => b.question === q)?.code;
  ok(codeOf(qs[1]) === 'not_offered' && codeOf(qs[2]) === 'not_offered', 'new boilers and drains → BLOCKED as not offered');
  ok(codeOf(qs[3]) === 'unsupported_service', 'underfloor heating (never confirmed) → BLOCKED as an unconfirmed service');
  ok(unresolvedBlocks(rep.blocking, []).length >= 3, 'approval is refused while they stand');
  ok(unresolvedBlocks(rep.blocking, rep.blocking.map((b) => ({ question: b.question, code: b.code, reason: 'ok' }))).length >= 3, 'a two-letter "reason" does not release them');
}

console.log('\n── 11. AN UNSUPPORTED BASELINE PROMPT NEVER SEEDS A WEBSITE PAGE ──');
const D2_QUESTIONS = ['plumber in Brighouse', 'Who can repair my boiler', 'radiator replacement', 'leaking tap repair', 'underfloor heating Brighouse', 'boiler installation Brighouse', 'blocked drain Elland'];
const ctx = {
  lead: { id: '1d000000-0000-0000-0000-0000000000d2', business_name: 'Brookfoot Plumbing & Heating', phone: '01632 960482', email: 'dean@brookfootplumbing.example', category: 'Plumber', website_build: {}, services_included: 'Bathroom fitting, Underfloor heating' },
  onboarding: { business_name: 'Brookfoot Plumbing & Heating', confirmed_location: 'Brighouse', confirmed_phone: '01632 960482', contact_email: 'dean@brookfootplumbing.example', contact_name: 'Dean',
    services_list: D2_TRUTH.services, areas_list: D2_TRUTH.towns, services_not_offered: 'new boilers, drains, bathroom fitting',
    must_not_say: 'No 24-hour or weekend call-outs.', baseline_questions: D2_QUESTIONS, plan_tier: 'new_site', website_addon: true },
  baseline_audit: null, baseline_audit_id: null, baseline_completed_at: null, report: null, discovery_audit: null, crawl: null, pages: [],
} as unknown as RebuildContextPayload;
const fact = (key: string, label: string, value: string) => ({ key, label, value, status: 'verified', source: 'added by Paul', source_url: '', notes: '', basis: 'operator' });
const D2_RAW = {
  version: 2, route: 'bespoke', repo_name: 'BrookfootPlumbing', github_owner: 'Beyondweb2', local_repo_path: 'C:\\Users\\paulj\\BrookfootPlumbing',
  cloudflare_project: 'brookfoot-plumbing', cloudflare_mode: 'direct_upload', canonical_domain: 'brookfootplumbing.example',
  facts: [fact('trade', 'Trade / category', 'Plumber and heating engineer'), fact('accreditations', 'Accreditations / credentials / checks', 'Gas Safe registered'),
    fact('prices', 'Prices', '£85 annual gas boiler service'), fact('opening_hours', 'Opening hours / availability', 'Mon–Fri 8am–6pm; no evening, weekend or 24-hour call-outs')],
  form: { enabled: true, site_key: 'brookfoot', recipient: 'dean@brookfootplumbing.example' },
  pages: [
    { id: 'p1', family: 'homepage', path: '/', title: 'Home', action: 'create' },
    { id: 'p2', family: 'services_index', path: '/services/', title: 'Plumbing and heating services', action: 'create' },
    { id: 'p3', family: 'service', path: '/services/gas-boiler-servicing/', title: 'Gas boiler servicing', action: 'create' },
    { id: 'p4', family: 'service', path: '/services/boiler-repairs/', title: 'Boiler repairs and breakdowns', action: 'create' },
    { id: 'p5', family: 'service', path: '/services/radiators/', title: 'Radiator installation and replacement', action: 'create' },
    { id: 'p6', family: 'service', path: '/services/leaks-taps-toilets/', title: 'Leak, tap and toilet repairs', action: 'create' },
    /* A page Paul planned for something the CLIENT never confirmed (only Sales wrote it on the lead). */
    { id: 'p7', family: 'service', path: '/services/underfloor-heating/', title: 'Underfloor heating', action: 'create' },
    { id: 'p9', family: 'about', path: '/about/', title: 'About', action: 'create' },
    { id: 'p10', family: 'faq', path: '/faqs/', title: 'FAQs', action: 'create' },
    { id: 'p11', family: 'contact', path: '/contact/', title: 'Contact', action: 'create' },
    { id: 'p12', family: 'legal', path: '/privacy/', title: 'Privacy', action: 'create' },
  ],
  quality: { strengths_reviewed: true, strengths: [], intents: {} },
};
function input(raw: Record<string, unknown>, extra: Partial<BuildPackInput> = {}): BuildPackInput {
  const s = parseWebsiteBuild(raw);
  const ev = toRebuildPromptInput(ctx);
  const facts = mergeFacts(candidateFacts(ctx as unknown as FactsContext, s.canonical_domain), s.facts, null);
  const ob = (ctx as unknown as { onboarding: Record<string, unknown> }).onboarding;
  return { state: s, template: null, facts, evidence: ev, businessName: 'Brookfoot Plumbing & Heating', existingSiteUrl: '', mustNotSay: ev.facts.mustNotSay.value ?? '', generatedAt: '2026-10-04T00:00:00Z',
    serviceRoute: 'build', clientTruth: { onboardingList: ob.services_list, onboardingText: ob.services, notOffered: ob.services_not_offered, leadServices: (ctx.lead as Record<string, unknown>).services_included }, ...extra };
}
let map: SiteIntentMap;
{
  const i = input(D2_RAW);
  map = siteIntentMap(i, computeMapping(i.state, null, i.facts, i.businessName));
  const why = (q: string) => map.unownedWhy.find((w) => w.question === q)?.reason ?? '';
  const ownerOf = (q: string) => map.intents.find((x) => x.question === q)?.page ?? '';
  ok(map.unconfirmedServices.join() === 'Underfloor heating', `the planned page for a service only Sales wrote down is flagged as unconfirmed (got ${map.unconfirmedServices.join(', ') || 'none'})`);
  ok(map.unowned.includes('underfloor heating Brighouse') && /NOT one of the client's confirmed services/.test(why('underfloor heating Brighouse')), 'its baseline question owns NO page — the reason says the client never confirmed it');
  ok(map.unowned.includes('boiler installation Brighouse') && map.unowned.includes('blocked drain Elland'), 'not-offered questions (new boilers, drains) own no page');
  ok(ownerOf('Who can repair my boiler') === '/services/boiler-repairs/' && ownerOf('radiator replacement') === '/services/radiators/', 'confirmed services still own their questions (boiler repair → the repairs page, radiators → the radiator page)');
  ok(ownerOf('plumber in Brighouse') === '/', '"<trade> in <home town>" is the home page\u2019s');
  ok(map.notOffered.join('|').includes('new boilers'), 'the expect file carries the client\u2019s not-offered list');
  const lines = siteIntentMapLines(map, i).join('\n');
  ok(/PLANNED service pages are NOT on the client's confirmed services[^\n]*Underfloor heating/.test(lines) && /The client does NOT offer: new boilers, drains, bathroom fitting/.test(lines), 'the build prompt tells the builder both, in words');
  // the page generator's rule for measured questions
  const t = siteServiceTruth({ onboardingList: D2_TRUTH.services, notOffered: 'new boilers, drains, bathroom fitting', leadServices: 'Underfloor heating', mustNotSay: 'No 24-hour or weekend call-outs.', trade: 'Plumber', towns: D2_TRUTH.towns });
  const sc = truthSiteScope(t, { homeTown: 'Brighouse', businessName: 'Brookfoot Plumbing & Heating' });
  ok(!!measuredQuestionRefusal('underfloor heating Brighouse', sc) && !!measuredQuestionRefusal('blocked drain Elland', sc) && !!measuredQuestionRefusal('plumber Halifax', sc), 'page generator: an unconfirmed service, a not-offered one and an unserved town get no Q&A / plan page');
  ok(measuredQuestionRefusal('Who can repair my boiler', sc) === null && measuredQuestionRefusal('leaking tap repair', sc) === null && measuredQuestionRefusal('How much does a boiler service cost in Brighouse?', sc) === null, '…while the client\u2019s real services (and a price question) still may');
  ok(serviceConfirmed('Gas boiler servicing', [], t) && !serviceConfirmed('Underfloor heating', [], t) && !serviceConfirmed('New boiler installation', [], t), 'serviceConfirmed: confirmed yes; Sales-only no; not-offered no');
  ok(!serviceConfirmed('Gas boiler servicing', [], siteServiceTruth({ trade: 'Plumber', towns: [] })), 'no truth list at all → nothing is confirmed (absence is never "offered")');
  ok(namesExcluded('Bathroom fitting', { excluded: t.excluded, outOfHoursVerified: true }).refused, 'service pages: a listed service the client also said they do NOT offer never becomes a page');
  const pg = read('supabase/functions/page-generator/index.ts');
  ok(/qaTruth \? qaTruth\.truth\.services/.test(pg) && /excluded: qaTruth \? qaTruth\.excluded/.test(pg) && /if \(qaTruth && isMeasured\)/.test(pg), 'page generator Q&A: the truth list, the not-offered refusal and the measured-question rule are wired');
  ok(/planServices = planTruth\.truth\.services/.test(pg) && /measuredQuestionRefusal\(p\.primaryQuestion, tScope\)/.test(pg), 'page-plan queue: truth services, and an unsupported primary question is HELD');
  ok(/services_not_offered/.test(read('supabase/functions/paid-client-hub/index.ts')) && /clientTruth: \{/.test(read('src/pages/WebsiteBuild.tsx')), 'Website Build reads the client\u2019s not-offered answer from the hub');
}

console.log('\n── 12. A BUILD SITE PASSES THE FULL GATE WITH THE TRUTH WIRED IN ──');
{
  const O = 'https://' + map.domain;
  const paths = new Set<string>(['/', '/contact/', '/privacy/', ...map.intents.map((it) => intentPage(it.page).path).filter(Boolean)]);
  const nav = '<header><nav>' + [...paths].map((p) => '<a href="' + p + '">' + p + '</a>').join(' ') + ' <a href="tel:' + map.phone.replace(/\s/g, '') + '">' + map.phone + '</a></nav></header>';
  const words = ['door', 'boiler', 'visit', 'call', 'street', 'morning', 'quote', 'parts', 'van', 'radiator', 'kitchen', 'stairs'];
  const prose = (seed: string) => { let h = 7; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return Array.from({ length: 150 }, () => { h = (h * 1103515245 + 12345) >>> 0; return words[h % words.length] + (h % 4 ? '' : ' ' + seed.replace(/[^a-z]/g, '')); }).join(' '); };
  const BIZ = { '@type': 'Plumber', '@id': O + '/#business', name: map.businessName, telephone: map.phone, url: O + '/', areaServed: [map.homeTown] };
  const pages = new Map<string, string>();
  for (const p of paths) {
    const owned = map.intents.filter((it) => intentPage(it.page).path === p && !it.section);
    const svc = owned.find((it) => it.service)?.service ?? '';
    const subject = svc || (p === '/' ? 'Plumber in ' + map.homeTown : 'Page ' + p);
    const h1 = p === '/' ? map.businessName + ' — Plumber in ' + map.homeTown : subject;
    const crumbs = p === '/' ? [] : [{ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: O + '/' }, { '@type': 'ListItem', position: 2, name: h1, item: O + p }] }];
    const form = p === '/contact/' && map.form ? '<form action="' + map.form.endpoint + '?site=' + map.form.siteKey + '" method="post"><input name="name"><input name="company_website" hidden></form>' : '';
    pages.set(p, '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + subject + ' | ' + map.businessName + '</title>' +
      '<meta name="description" content="' + map.businessName + ': ' + subject + ' — plain answers, the verified details and how to get in touch (' + p + ').">' +
      '<link rel="canonical" href="' + O + p + '"><script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@graph': [p === '/' ? BIZ : { '@id': BIZ['@id'] }, ...crumbs] }) + '</script></head><body>' + nav +
      '<main><h1>' + h1 + '</h1><p>' + map.businessName + ' provides ' + (svc || 'plumbing') + ' for homes in ' + map.homeTown + ' and nearby, with a clear answer to what customers ask before they call us today.</p>' +
      (p === '/' ? '<p>Gas Safe registered. An annual gas boiler service is £85.</p>' : '') + '<p>' + prose(p) + '</p>' + form + '</main><footer><p>' + map.businessName + ' · <a href="mailto:' + map.email + '">' + map.email + '</a></p></footer></body></html>');
  }
  const site = { mode: 'dist', pages, files: new Set<string>(), sizes: new Map(), live: null, llms: false, redirects: '',
    sitemaps: new Map([['/sitemap-index.xml', '<sitemapindex><sitemap><loc>' + O + '/sitemap-0.xml</loc></sitemap></sitemapindex>'], ['/sitemap-0.xml', '<urlset>' + [...paths].map((p) => '<url><loc>' + O + p + '</loc></url>').join('') + '</urlset>']]),
    robots: 'User-agent: *\nAllow: /\n\nSitemap: ' + O + '/sitemap-index.xml\n', headers: 'https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n' };
  const r = auditSite(site, { domain: map.domain, expect: map });
  const fails = r.checks.filter((c: { level: string }) => c.level === 'fail').map((c: { id: string; details: string[] }) => c.id + ': ' + c.details.slice(0, 2).join(' / '));
  ok(r.passed === true, 'the Build site generated from the integrated expect file PASSES the whole site gate' + (r.passed ? '' : ' — ' + fails.join(' | ')));
  const cleared = input(clearedForProduction({ ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' }, { existingSite: false }));
  ok(launchProblems(cleared).length === 0, 'a cleared Build client is offered production' + (launchProblems(cleared).length ? ' — ' + launchProblems(cleared).join(' | ') : ''));
}

console.log('\n── 13. OPTIMISE CANNOT REACH BUILD PRODUCTION ──');
{
  const cleared = clearedForProduction({ ...D2_RAW, preview_url: 'https://preview.brookfoot-plumbing.pages.dev' }, { existingSite: false });
  const opt = input(cleared, { serviceRoute: 'optimise' });
  ok(launchProblems(opt).length === 1 && /Optimise/i.test(launchProblems(opt)[0]), 'an Optimise client is refused production even with a fully cleared preview');
  ok(!!buildToolingRefusal('optimise') && buildToolingRefusal('build') === '', 'Build tooling: refused for Optimise, allowed for Build');
  ok(productionReadiness({ state: parseWebsiteBuild(cleared), route: null, hasExistingSite: false }).some((p) => /not Build/.test(p)), 'an unrecorded route is never treated as Build');
}

console.log('\n── 14. THE WELCOME PACK\u2019S OWNERSHIP WORDS FOLLOW THE ROUTE ──');
const REPORT: AiAuditReportData = {
  businessName: 'ZZ QA-W1 Plumbing', businessType: 'plumbers', locationText: 'Brighouse', named: 6, total: 120, pct: 5, questionsAsked: 20, enginesUsed: 2, measurementRuns: 3,
  perEngine: [{ label: 'ChatGPT', named: 5, total: 60 }, { label: 'Gemini', named: 1, total: 60 }], competitors: [], topCompetitors: [], gutPunch: null, generatedAtLabel: '5 Oct 2026', questionBreakdown: [],
} as unknown as AiAuditReportData;
const SEO: AiAuditSeo = { overallGrade: 'C+', categories: { onPage: { grade: 'C', score: 61 }, contentTechnical: { grade: 'B-', score: 72 } } as AiAuditSeo['categories'], leadFindings: [{ title: 'Missing meta descriptions', detail: 'Four pages have none.', severity: 'medium' }] as AiAuditSeo['leadFindings'] };
const text = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '\u2019').replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
{
  const b = AGREEMENT_KEY_POINTS.build.join(' '), o = AGREEMENT_KEY_POINTS.optimise.join(' ');
  ok(/12 payments/.test(b) && /We own the website and our work until your final payment/.test(b), 'Build: 12 payments; the website becomes theirs on the FINAL payment');
  ok(/6 payments/.test(o) && /Your website is always yours\. We will never take it offline\./.test(o) && !/We own the website/.test(o), 'Optimise: 6 payments; their own site is always theirs');
  const pb = text(buildWelcomePackHtml({ businessName: 'ZZ QA-W1 Plumbing', report: { ...REPORT }, agreement: { url: 'https://findable.live/agree/x', termsKnown: true, route: 'build' } }));
  const po = text(buildWelcomePackHtml({ businessName: 'ZZ QA-W1 Plumbing', report: { ...REPORT }, agreement: { url: 'https://findable.live/agree/x', termsKnown: true, route: 'optimise' } }));
  ok(/We own the website and our work until your final payment/.test(pb) && !/We own the website/.test(po) && /Your website is always yours/.test(po), 'the rendered packs say it per route');
}

console.log('\n── 15. THE SEO GRADE IS ITS OWN MEASURE — NEVER THE GUARANTEE ──');
{
  const before = text(buildWelcomePackHtml({ businessName: 'ZZ QA-W1 Plumbing', report: { ...REPORT, seo: SEO } }));
  ok(/Your website\u2019s SEO grade/.test(before) && /Before — your website as we measured it at the start: overall C\+/.test(before), 'the pack shows the MEASURED grade as "Before" (C+), factual');
  ok(/It is separate from your AI visibility\. Your money-back guarantee is judged only on AI visibility, measured before we start and re-measured after four weeks; this grade does not decide it\./.test(before), 'it says, in words, that the guarantee is judged on AI visibility alone');
  ok(/After — not measured yet\. An after grade appears here only once your website has actually been scanned again; we never estimate one\./.test(before), 'no after scan → "not measured yet", never a projected grade');
  ok(!/\bA\+?\b grade|grade of A|will (?:get|reach|earn) an? A/i.test(before) && !/After — measured/.test(before), 'no "A" is promised or implied');
  const withAfter = text(buildWelcomePackHtml({ businessName: 'ZZ QA-W1 Plumbing', report: { ...REPORT, seo: SEO, seoAfter: { seo: { ...SEO, overallGrade: 'B+' }, measuredAt: '2026-11-20T10:00:00Z' } } }));
  ok(/After — measured on 20 November 2026: overall B\+/.test(withAfter), 'a GENUINE later scan shows as "After", with its date and its own grade');
  ok(before.includes(FINDABLE_GUARANTEE.slice(0, 40)) || /money-back guarantee/.test(before), 'the guarantee itself is still stated where it always was');
  const results = read('src/lib/remeasureResults.ts') + read('supabase/functions/_shared/remeasure-results.ts');
  ok(!/seo|overallGrade/i.test(results.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'the four-week results (the guarantee decision) never read an SEO grade');
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL PASS'}`);
if (failures) process.exit(1);
