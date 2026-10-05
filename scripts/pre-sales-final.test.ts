/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PRE-SALES FINAL — the combined candidate (integration/pre-sales-wave1 + fix/07-sales-bulk-audit),
   2026-10-05. docs/pre-sales-certification/final-certification.md.

   Wave 1 and WS-7 each have their own suites (wave1-integration, sales-prospect-check and the WS-1..WS-6
   records). A clean merge does not prove the PAIR is right, so this file checks only what sits BETWEEN
   them, through the real functions:
     1. who counts as a client — the bulk check, Quick Close, checkout and the role rules agree, on
        Ronnie- and MCL-shaped fixtures included (ended, paid);
     2. the bulk check on a lead that is really a client (wrongly assigned to a rep) spends nothing,
        calls no provider and writes nothing;
     3. 6/6 end to end: bulk result → the call screen (WS-5's script and close) → status untouched;
        the single check's queue path has no status rule; a person can still record Not interested;
     4. the budget pools: a bulk check is prospecting, never guarantee / client capacity, and the
        configured launch values;
     5. the commercial terms every surface reads;
     6. the WS-4 → WS-6 service truth has no Discovery input;
     7. the final migration sequence (static) and the WhatsApp hold;
     8. the results email: Paul's wording decisions applied, still held.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { FakeDb } from './fake-supabase.ts';
import { advance, startBatch, type SalesCheckDeps } from '../supabase/functions/_shared/sales-check.ts';
import { leadEligibility, stillWorkable, SALES_CHECK_BATCH_MAX, SALES_CHECK_DEFAULT_PER_REP_PER_DAY } from '../src/lib/salesCheck.ts';
import { quickCloseClosedRefusal, QUICK_CLOSE_PROMISE } from '../src/lib/quickClose.ts';
import { isClientLead, canWorkLead } from '../src/lib/roleRules.ts';
import { DEFAULT_PROTECTION_LIMITS } from '../src/lib/protectionLimits.ts';
import { budgetDecision, budgetPoolForPurpose, poolLedgerFilter, POOL_DAILY_CAP_USD, APIFY_RESERVE_PCT } from '../src/lib/auditBudget.ts';
import { buildColdCallPlaybook, callCardAudit, STRONG_VISIBILITY_HEADLINE } from '../src/lib/coldCallPlaybook.ts';
import { buildCallClose, GUARANTEE_HEADLINE } from '../src/lib/callClose.ts';
import { buildReportData } from '../src/lib/auditReport.ts';
import { initialHookStateV2 } from '../src/lib/hookScore.ts';
import { outcomePlan } from '../src/lib/leadState.ts';
import { leadPermissions, maySetStatus } from '../src/lib/access.ts';
import {
  FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_MONTHLY_DELAY_DAYS, totalPaymentsFor, termMonthsFor,
} from '../src/lib/findableOffer.ts';
import { siteServiceTruth, serviceConfirmed, measuredQuestionRefusal } from '../src/lib/siteServiceTruth.ts';
import { buildServiceScope, questionScope } from '../src/lib/serviceScope.ts';
import { resultsEmailParagraphs, remeasureResultsDecision, REMEASURE_RESULTS_COPY_APPROVED } from '../src/lib/remeasureResults.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log(`  ✓ ${m}`); else { f++; console.log(`  ✗ FAIL ${m}`); } };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const OWNER = '00000000-0000-4000-8000-0000000000aa';
const PAUL = '00000000-0000-4000-8000-0000000000ad';
const REP_A = '00000000-0000-4000-8000-00000000000a';
const REP_B = '00000000-0000-4000-8000-00000000000b';
const A = { id: REP_A, role: 'sales' };
let seq = 0;
const uid = () => `1f000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/* Fixture shapes (fixture names only; never the real rows). */
const prospect = (o: Record<string, unknown> = {}) => ({
  id: uid(), user_id: OWNER, assigned_to_user_id: REP_A, amount_paid: null, status: 'not_contacted', is_archived: false,
  business_name: 'ZZ QA Final Plumbing', search_keyword: 'plumber', category: null, search_location: 'Halifax', address: null,
  derived_town: 'Halifax', town_fetch_note: null, country: 'UK', website: 'https://zz-qa-final.example', phone: '07700 900650',
  email: null, services_included: ['Boiler repair'], service_areas: null, service_terminated_at: null, ...o,
});
/** Ronnie-shaped: a historic £49.99 custom one-off, engagement ended (client_ended_early). */
const RONNIE_SHAPE = { status: 'payment_received', amount_paid: 49.99, service_terminated_at: '2026-10-04T10:20:36Z', business_name: 'ZZ QA Ronnie-shaped Shoe Repairs' };
/** MCL-shaped: £99 paid, engagement ended. */
const MCL_SHAPE = { status: 'payment_received', amount_paid: 99, service_terminated_at: '2026-10-03T04:23:27Z', business_name: 'ZZ QA MCL-shaped Locksmiths' };

/* ═══ 1. Who counts as a client — one answer across the workstreams ═══════════════════════════════ */
console.log('── 1. client-ness: bulk check (WS-7) = Quick Close (WS-2) = checkout = role rules ──');
{
  const shapes: Array<[string, Record<string, unknown>]> = [
    ['Ronnie-shaped (ended, £49.99)', RONNIE_SHAPE],
    ['MCL-shaped (ended, £99)', MCL_SHAPE],
    ['paid, open', { status: 'payment_received', amount_paid: 99 }],
    ['in delivery', { status: 'in_delivery', amount_paid: 99 }],
    ['completed', { status: 'completed', amount_paid: 99 }],
    ['refunded (amount kept)', { status: 'refunded', amount_paid: 99 }],
    ['refunded (amount cleared)', { status: 'refunded', amount_paid: null }],
    ['money on an odd status', { status: 'contacted', amount_paid: 99 }],
  ];
  for (const [label, s] of shapes) {
    const l = prospect(s);
    const qc = quickCloseClosedRefusal(l as never);
    const sc = leadEligibility(REP_A, l as never);
    ok(qc !== null, `${label}: Quick Close refuses a link (${qc?.error})`);
    ok(!sc.ok && sc.reason === 'client', `${label}: the bulk check skips it as a client (${sc.ok ? 'ok' : sc.reason}) — no spend`);
    ok(isClientLead(l), `${label}: the role rules call it a client (sales never works it)`);
    ok(!stillWorkable(REP_A, l as never).ok, `${label}: a check already running on it is hidden from the rep`);
  }
  // Every shape Quick Close refuses as an ended engagement but whose amount was CLEARED: checkout now uses the same rule.
  const endedNoMoney = prospect({ status: 'contacted', amount_paid: null, service_terminated_at: '2026-10-04T10:00:00Z' });
  ok(quickCloseClosedRefusal(endedNoMoney as never)?.error === 'client_closed', 'an ended engagement is closed even with no amount on the lead (Quick Close rule)');
  const co = stripComments(read('supabase/functions/findable-checkout/index.ts'));
  ok(/import \{[^}]*\bquickCloseClosedRefusal\b[^}]*\} from "\.\.\/\.\.\/\.\.\/src\/lib\/quickClose\.ts"/.test(co), 'findable-checkout imports quickCloseClosedRefusal (ONE rule with Quick Close)');
  ok(/service_terminated_at/.test(co.match(/\.from\("outreach_leads"\)[\s\S]{0,200}\.select\("[^"]*"\)/)?.[0] ?? ''), 'checkout selects service_terminated_at on its own lead row');
  ok(/if \(lead && \(quickCloseClosedRefusal\(/.test(co) && /error: "already_client" \}, 403/.test(co), 'checkout refuses (already_client, 403) whenever Quick Close calls the lead closed — before any Stripe session');
  // An ordinary active prospect is workable everywhere.
  const p = prospect();
  ok(leadEligibility(REP_A, p as never).ok && quickCloseClosedRefusal(p as never) === null && !isClientLead(p), 'an active prospect of the rep: workable, no refusal');
  // Ownership agrees with the role rule (assigned_to_user_id, never user_id).
  for (const [label, o] of [['another rep', { assigned_to_user_id: REP_B }], ["Paul's (unassigned)", { assigned_to_user_id: null }], ["Paul's (his own)", { assigned_to_user_id: PAUL }], ['archived (still theirs)', { is_archived: true }]] as const) {
    const l = prospect(o);
    const e = leadEligibility(REP_A, l as never);
    ok(!e.ok, `${label}: the bulk check refuses (${e.ok ? 'ok' : e.reason})`);
    if (label !== 'archived (still theirs)') ok(!canWorkLead({ id: REP_A, role: 'sales' } as never, l), `${label}: the role rule refuses too`);
  }
}

/* ═══ 2. The engine on a client wrongly assigned to a rep: nothing spent, nothing written ═════════ */
console.log('── 2. bulk check on Ronnie-/MCL-shaped leads: zero provider calls, zero guard rows, no writes ──');
function world() {
  const db = new FakeDb();
  db.unique.sales_check_batches = [['actor_user_id', 'client_request_id']];
  db.unique.sales_check_items = [['batch_id', 'lead_id']];
  db.partialUnique.sales_check_batches = [{ cols: ['actor_user_id'], where: (r) => r.status === 'active' }];
  db.table('protection_settings').push({ id: 1, mode: 'running', limits: DEFAULT_PROTECTION_LIMITS });
  db.table('whatsapp_outreach_state').push({ id: 1, audit_complete_template: null });
  const clock = { now: T0 };
  const calls = { start: 0, crawl: 0, guard: 0, pool: 0 };
  const deps: SalesCheckDeps = {
    service: db, now: () => clock.now, estUsd: 0.0331, questionCount: 3,
    suppressed: async () => false, townGated: () => false,
    guard: async () => { calls.guard++; return { ok: true }; },
    prospecting: async () => { calls.pool++; return { poolSpentUsd: 1, apify: { usedUsd: 30, capUsd: 150 } }; },
    startAudit: async (body) => {
      calls.start++;
      const auditId = uid(), runId = uid();
      db.table('ai_audits').push({ id: auditId, lead_id: String(body.lead_id), user_id: body.user_id, created_at: iso(clock.now), audit_purpose: 'audit', baseline_target_runs: null, is_measurement: false, baseline_contract: null });
      db.table('ai_audit_runs').push({ id: runId, audit_id: auditId, status: 'pending', run_number: 1, created_at: iso(clock.now), actor_cost_usd: null });
      return { ok: true, status: 200, audit_id: auditId, run_id: runId };
    },
    runCrawl: async () => { calls.crawl++; return { ok: true }; },
  };
  return { db, clock, calls, deps };
}
let rid = 0;
const req = () => `final-${String(++rid).padStart(6, '0')}`;
{
  const w = world();
  const ronnie = prospect(RONNIE_SHAPE), mcl = prospect(MCL_SHAPE);
  w.db.table('outreach_leads').push(ronnie, mcl);
  const before = JSON.stringify(w.db.table('outreach_leads'));
  const out = await startBatch(w.deps, A, { lead_ids: [ronnie.id, mcl.id], client_request_id: req(), refresh: true });
  await advance(w.deps, A);
  const its = w.db.table('sales_check_items');
  ok(out.status === 200 && its.length === 2 && its.every((i) => i.status === 'skipped' && i.reason === 'client'), 'both skipped as clients');
  ok(w.calls.start === 0 && w.calls.crawl === 0 && w.calls.guard === 0, `no provider call, no crawl, no guard row (start ${w.calls.start}, crawl ${w.calls.crawl}, guard ${w.calls.guard})`);
  ok(JSON.stringify(w.db.table('outreach_leads')) === before, 'the client rows are byte-identical (no subscription, no status, no remeasure field touched)');
  ok(!w.db.writes.some((x) => x.table !== 'sales_check_batches' && x.table !== 'sales_check_items'), `only the job tables were written (${[...new Set(w.db.writes.map((x) => x.table))].join(', ')})`);
}

/* ═══ 3. 6/6 end to end — a finding on screen, never a status change ═════════════════════════════ */
console.log('── 3. 6/6: bulk result → call screen (WS-5) → status untouched; manual Not interested still works ──');
{
  const BIZ = 'ZZ QA Final Elland Drains';
  const Q = ['Who are the best plumbers in Halifax, UK?', 'Can you recommend a reliable plumber in Halifax, UK?', 'Which plumbers in Halifax, UK have the best reviews?'];
  const cell = (named: boolean) => ({ named, self_named: named, position: named ? 1 : null, citations: [], competitors: ['ZZ Rival Pennine Plumbing'], answer_text: named ? `${BIZ} is well reviewed, as is ZZ Rival Pennine Plumbing.` : 'Try ZZ Rival Pennine Plumbing.' });
  const rows = Q.map((q, i) => ({ id: `q${i}`, question: q, status: 'done', engines: ['chatgpt', 'gemini'], result: { chatgpt: cell(true), gemini: cell(true) } }));
  const runRow = { id: 'r6', audit_id: 'a6', run_number: 1, status: 'complete', mention_rate: 1, results: { hook: initialHookStateV2(Q), competitor_cleaning: { complete: true, at: 'x', attempts: 1, errors: [] } } };
  const report = buildReportData(rows as never, runRow as never, { businessName: BIZ, businessType: 'plumbers', locationText: 'Halifax', specialisms: '', isAggregatorUrl: () => false, ownWebsite: 'https://zz-qa-final-6.example' });
  const leadRow = { id: 'l6', business_name: BIZ, phone: '07700 900656', website: 'https://zz-qa-final-6.example' };
  const reportAudit = { id: 'a6', short_code: null, created_at: iso(T0 - DAY), business_name: BIZ, business_type: 'plumbers', location_text: 'Halifax' };
  const card = callCardAudit({ lead: leadRow, reportAudit, report: report as never, auditRunning: false, runCrawls: [], leadCrawl: null, nowMs: T0 });
  ok(card.state === 'ready' && card.headline === STRONG_VISIBILITY_HEADLINE && STRONG_VISIBILITY_HEADLINE === 'Strong AI visibility — named in all 6 answers', 'the bulk panel / call card line: "Strong AI visibility — named in all 6 answers"');
  const pb = buildColdCallPlaybook({ lead: leadRow, reportAudit, report: report as never, runCrawls: [], leadCrawl: null, messages: [], nowMs: T0 } as never);
  ok(pb.audit.headline === STRONG_VISIBILITY_HEADLINE, 'the call screen top line is the same helper (one copy)');
  const script = pb.callScript.join(' ');
  ok(!/did(?:n't| not) name (?:you|them)|not named|isn't naming|aren't naming|missing from|left out|never mentions/i.test(script), `the WS-5 call script makes no "AI missed you" claim on 6/6 ("${script.slice(0, 120)}…")`);
  ok(/ZZ QA Final Elland Drains|Elland Drains/.test(pb.opening.join(' ') + script), 'identity-first: the opening names the business');
  ok(pb.close.guarantee.headline === 'We improve AI visibility or you get your money back.' && GUARANTEE_HEADLINE === QUICK_CLOSE_PROMISE, 'the close carries the one guarantee line (shared with Quick Close)');
  // The single check: the queue holds no status rule and no edge code writes not_interested.
  const queue = stripComments(read('supabase/functions/process-ai-audit-queue/index.ts'));
  const NI_WRITE = /status["']?\s*:\s*["']not_interested["']|_status\s*:\s*["']not_interested["']|lead_set_stage|hook-not-interested/;
  ok(!NI_WRITE.test(queue), 'single check (the audit queue): no not_interested WRITE anywhere in its code (it only READS the status to refuse a send)');
  const fnFiles: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name)) fnFiles.push(p); } };
  walk(path.join(ROOT, 'supabase/functions'));
  const auditPaths = fnFiles.filter((p) => /process-ai-audit-queue|create-ai-audit|sales-prospect-check|_shared[\\/](sales-check|audit-reply|free-check-audit|outreach-audit|run-finalise)\.ts$/.test(p));
  ok(auditPaths.length >= 6, `the audit paths are found (${auditPaths.length})`);
  for (const p of auditPaths) ok(!NI_WRITE.test(stripComments(readFileSync(p, 'utf8'))), `${path.relative(ROOT, p).replace(/\\/g, '/')}: never writes the not_interested status`);
  // A person still can.
  const plan = outcomePlan('not_interested', { status: 'contacted', is_potential_work: true, next_action: 'call' }, T0);
  ok(plan.status === 'not_interested' && plan.clearNextAction === true, 'manual "Not interested" (the workspace outcome) still sets the status and clears the Next Action');
  ok(maySetStatus(leadPermissions('sales'), 'not_interested') && maySetStatus(leadPermissions('admin'), 'not_interested'), '…for a salesperson and for the admin');
  // The bulk path writes no lead row (6/6 or not) — the engine's own write list.
  const engine = stripComments(read('supabase/functions/_shared/sales-check.ts'));
  ok(!/from\("outreach_leads"\)\s*\.(update|insert|upsert|delete)/.test(engine) && !/lead_set_|lead_mark_|set_follow_up/.test(engine), 'the bulk engine never writes a lead (no status, star, Next Action or follow-up)');
}

/* ═══ 4. Budget separation and the launch configuration ══════════════════════════════════════════ */
console.log('── 4. budget pools: prospecting never draws on guarantee / client capacity ──');
{
  ok(POOL_DAILY_CAP_USD.guarantee === 10 && POOL_DAILY_CAP_USD.client === 8 && POOL_DAILY_CAP_USD.prospecting === 12, 'the launch pools: guarantee $10/day, other client work $8/day, prospecting $12/day');
  ok(APIFY_RESERVE_PCT.prospecting === 85 && APIFY_RESERVE_PCT.client === 95 && APIFY_RESERVE_PCT.guarantee >= 100, `Apify reserve: prospecting stops at 85%, client at 95%, guarantee runs to Apify's own cap (${APIFY_RESERVE_PCT.guarantee})`);
  ok(budgetPoolForPurpose('audit') === 'prospecting' && budgetPoolForPurpose(null) === 'prospecting', 'a bulk / single prospect check (audit_purpose audit) is the PROSPECTING pool');
  ok(budgetPoolForPurpose('baseline') === 'guarantee' && budgetPoolForPurpose('remeasure') === 'guarantee', 'baseline and re-measure are the GUARANTEE pool');
  ok(['measurement', 'discovery', 'weekly_check'].every((p) => budgetPoolForPurpose(p) === 'client'), 'full measure, Discovery, weekly check are the CLIENT pool');
  const g = poolLedgerFilter('guarantee'), c = poolLedgerFilter('client'), pr = poolLedgerFilter('prospecting');
  ok(g.eq === 'guarantee' && c.eq === 'client' && !/guarantee|client/.test(pr.or ?? ''), 'each pool counts only its own ledger rows — prospecting or client spend never fills the guarantee pool');
  const exhausted = { poolSpentUsd: 12, apify: { usedUsd: 140, capUsd: 150 } }; // prospecting at its cap AND Apify past 85%
  ok(!budgetDecision({ pool: 'prospecting', poolSpentUsd: exhausted.poolSpentUsd, estCostUsd: 0.0331, apify: exhausted.apify }).allowed, 'prospecting exhausted → a prospect check is refused');
  ok(budgetDecision({ pool: 'guarantee', poolSpentUsd: 0, estCostUsd: 0.6, apify: exhausted.apify }).allowed, '…while a BASELINE / RE-MEASURE (guarantee pool, its own spend) is still allowed, Apify at 93%');
  ok(!budgetDecision({ pool: 'client', poolSpentUsd: 8, estCostUsd: 0.1, apify: null }).allowed && budgetDecision({ pool: 'guarantee', poolSpentUsd: 0, estCostUsd: 0.6, apify: null }).allowed, 'other client work at its cap does not consume guarantee capacity');
  ok(SALES_CHECK_DEFAULT_PER_REP_PER_DAY === 30 && DEFAULT_PROTECTION_LIMITS.actions.sales_check.per_day === 30 && DEFAULT_PROTECTION_LIMITS.actions.sales_check.paid === true, 'salesperson allowance: 30 fresh checks per rep per day (paid action)');
  ok(SALES_CHECK_BATCH_MAX === 20, 'batch maximum: 20 leads per press');
  const mig = read('supabase/migrations/20261006070000_sales_prospect_checks.sql');
  ok(/"per_day"\s*:\s*30/.test(mig) && /where not \(limits->'actions' \? 'sales_check'\)|NOT \(limits -> 'actions' \? 'sales_check'\)|\? 'sales_check'/i.test(mig), 'the migration adds sales_check {per_day: 30} only if absent (never overwrites Paul\'s value)');
}

/* ═══ 5. Commercial terms ═════════════════════════════════════════════════════════════════════════ */
console.log('── 5. commercial terms: Build 12 / Optimise 6, £99 + £99/month from six weeks ──');
{
  ok(FINDABLE_SETUP_PRICE_GBP === 99 && FINDABLE_MONTHLY_GBP === 99 && FINDABLE_MONTHLY_DELAY_DAYS === 42, '£99 at sign-up, £99/month starting 42 days (six weeks) later');
  ok(totalPaymentsFor('build') === 12 && termMonthsFor('build') === 12, 'Build: 12 payments in total, 12-month minimum');
  ok(totalPaymentsFor('optimise') === 6 && termMonthsFor('optimise') === 6, 'Optimise: 6 payments in total, 6-month minimum');
  const own = buildCallClose('own_site'), none = buildCallClose(null);
  const b = own.routes.find((r) => r.route === 'build')!, o = own.routes.find((r) => r.route === 'optimise')!;
  ok(/build you a new website, host it and look after it/.test(b.spoken.join(' ')) && /Once the 12 payments are done the site is yours/.test(b.spoken.join(' ')), 'Build: Findable builds, hosts and manages; the site is theirs after the final payment');
  ok(/You keep your own website and it stays yours/.test(o.spoken.join(' ')) && /never take it offline/.test(o.spoken.join(' ')), 'Optimise: they keep their own site; Findable never takes it offline');
  ok(none.routes.length === 1 && none.routes[0].route === 'build', 'no website → Build only (Optimise needs their own site)');
  const words = [...own.routes.flatMap((r) => r.spoken), own.guarantee.spoken, own.guarantee.headline].join(' ');
  ok(!/rank(ing)?\b(?! a)|#1|guaranteed (citation|recommend)|will name you|top of/i.test(words.replace('Never promise a ranking', '')), 'no ranking / citation / recommendation guarantee in the spoken offer');
}

/* ═══ 6. Service truth: Discovery is never an input ══════════════════════════════════════════════ */
console.log('── 6. service truth (WS-4 → WS-6): client > Sales notes > never Discovery ──');
{
  const t = siteServiceTruth({ onboardingList: ['Boiler repair'], leadServices: ['Bathroom fitting'], notOffered: 'no new boilers', trade: 'plumber', towns: ['Halifax'] });
  ok(t.truth.services.includes('Boiler repair') && !t.truth.services.includes('Bathroom fitting'), 'the client\'s own list wins over Sales notes when it exists');
  ok(!serviceConfirmed('Underfloor heating', [], t), 'a service nobody confirmed cannot own a page');
  ok(!serviceConfirmed('New boiler installation', [], t) && !serviceConfirmed('Boiler installation', [], t), '"no new boilers" blocks a new / installation page (final fix: the client\'s own "no" is not a word of the service)');
  ok(serviceConfirmed('Boiler repair', [], t), '…and binds only new work (wave-1 fix): repairs stay theirs');
  for (const [neg, refusedQ, keptQ] of [
    ['We don’t fit new boilers', 'New boiler installation in Halifax', 'Who can repair my boiler in Halifax'],
    ['No bathroom fitting', 'bathroom fitters in Halifax', 'cheapest boiler repair in Halifax'],
    ['Not offered: commercial', 'commercial plumber in Halifax', 'Who can repair my boiler in Halifax'],
  ] as const) {
    const tt = siteServiceTruth({ onboardingList: ['Boiler repair', 'Boiler servicing'], notOffered: neg, trade: 'plumber', towns: ['Halifax'] });
    const scope = { services: tt.truth.services.map((name) => ({ name, aliases: [] })), excluded: tt.excluded, towns: tt.towns, homeTown: 'Halifax', trade: ['plumber'], businessName: 'ZZ QA', pricesVerified: true, outOfHoursVerified: true };
    ok(measuredQuestionRefusal(refusedQ, scope as never) !== null, `"${neg}": a measured question "${refusedQ}" cannot seed a page`);
    ok(measuredQuestionRefusal(keptQ, scope as never) === null, `"${neg}": "${keptQ}" still can`);
    const sc = buildServiceScope({ services: tt.truth.services, notOffered: tt.truth.notOffered, trade: 'plumber', towns: ['Halifax'] });
    ok(questionScope(refusedQ, sc).verdict === 'not_offered', `"${neg}": "${refusedQ}" is NOT OFFERED for the baseline (${questionScope(refusedQ, sc).verdict})`);
    ok(questionScope(keptQ, sc).verdict === 'service', `"${neg}": "${keptQ}" stays in scope for the baseline`);
  }
  const src = stripComments(read('src/lib/siteServiceTruth.ts')) + stripComments(read('src/lib/serviceScope.ts'));
  ok(!/discovery/i.test(src.match(/export function resolveServiceTruth[\s\S]*?\n\}/)?.[0] ?? 'x discovery') , 'resolveServiceTruth has no Discovery input at all (it cannot become a verified source)');
}

/* ═══ 7. The final migration sequence (static) and the WhatsApp hold ═════════════════════════════ */
console.log('── 7. migrations (static) and the Meta hold ──');
{
  const FINAL = [
    '20261006010000_templates_owner_only.sql', '20261006010100_inbound_lead_candidates.sql', '20261006020000_quick_close_link_sharing.sql',
    '20261006070000_sales_prospect_checks.sql',
    '20261007030000_payment_client_state.sql', '20261007040000_audit_budget_pools.sql', '20261007040100_onboarding_service_truth.sql',
    '20261007040200_remeasure_date_guard.sql', '20261007105000_call_workspace_guards.sql', '20261007200000_first_contact_activation.sql',
  ];
  /* Already on origin/main (shipped before the candidate was cut) — not part of this release's SQL. */
  const ON_MAIN = ['20261006100000_client_monthly_updates.sql', '20261006110000_service_end_client_ended_early.sql', '20261006120000_campaign_ownership.sql', '20261006130000_lead_unqueue.sql'];
  const all = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  for (const m of FINAL) ok(all.includes(m), `${m} is present`);
  const newer = all.filter((n) => n.slice(0, 14) > '20261006000000');
  const stamps = newer.map((n) => n.slice(0, 14));
  ok(new Set(stamps).size === stamps.length, 'no two recent migration files share a timestamp');
  /* Shipped AFTER the certified release (deployed 2026-10-05): later releases add their own migrations; the pin is
     that the certified ten are exactly these, not that nothing may follow them. */
  const LATER = ['20261008100000_sales_workspace_v2.sql'];
  const candidate = newer.filter((n) => !ON_MAIN.includes(n) && !LATER.includes(n));
  ok(candidate.length === FINAL.length && candidate.every((n) => FINAL.includes(n)), `exactly the ten candidate migrations are new in this release (${candidate.length}: ${candidate.map((n) => n.slice(0, 14)).join(' ')})`);
  const sc = read('supabase/migrations/20261006070000_sales_prospect_checks.sql');
  ok(/create table if not exists public\.sales_check_batches/i.test(sc) && /create table if not exists public\.sales_check_items/i.test(sc), 'WS-7: both job tables, create-if-not-exists');
  ok(/revoke (all|insert, update, delete|insert,update,delete)[^;]*on public\.sales_check_items[^;]*from (anon, )?authenticated/i.test(sc) || /revoke[\s\S]*sales_check_items[\s\S]*authenticated/i.test(sc), 'WS-7: authenticated cannot write the job tables');
  // No later migration re-types an allowed-value list the WS-7 change depends on, and WS-7 touches no other migration's object.
  ok(!/lead_activity_kind_check|quick_close_events_kind_check|lead_set_follow_up|monthly_update_save|first_contact_owed_since|budget_pool/.test(sc), 'WS-7 touches none of the objects Wave 1\'s nine migrations own');
  // The WhatsApp hold: the fail-closed gate lives only in whatsapp-status.
  const gateUsers = readdirSync(path.join(ROOT, 'supabase/functions'), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== '_shared')
    .filter((d) => existsSync(path.join(ROOT, 'supabase/functions', d.name, 'index.ts')) && /judgeWhatsAppWebhookPost|metaWebhookGate/.test(read(`supabase/functions/${d.name}/index.ts`)))
    .map((d) => d.name);
  ok(gateUsers.length === 1 && gateUsers[0] === 'whatsapp-status', `the fail-closed webhook gate is in exactly one function: ${gateUsers.join(', ')}`);
  ok(/\[functions\.sales-prospect-check\]\s*\nverify_jwt = true/.test(read('supabase/config.toml')), 'sales-prospect-check has its config.toml entry (verify_jwt = true)');
}

/* ═══ 8. The results email — Paul's wording, still held ══════════════════════════════════════════ */
console.log('── 8. results email: wording applied, sending held ──');
{
  const base = { businessName: 'ZZ QA Calder Plumbing', town: 'Halifax', beforeNamed: 12, beforeAnswered: 120, afterNamed: 27, afterAnswered: 120, questions: 20, documentUrl: 'https://findable.live/r/ABC123', withinNoise: false, monthlyStartsOn: '16 November 2026', totalPayments: 12 };
  const up = resultsEmailParagraphs({ ...base, wentUp: true }), flat = resultsEmailParagraphs({ ...base, afterNamed: 15, wentUp: false, withinNoise: true });
  ok(up[up.length - 1] === 'Paul, Findable' && flat[flat.length - 1] === 'Paul, Findable', 'signed "Paul, Findable"');
  ok(!/every week/i.test([...up, ...flat].join(' ')), 'no "every week"');
  ok(/a new page each month/.test(up.join(' ')) && !/first monthly payment/i.test(flat.join(' ')), 'the actual service named; no monthly payment paragraph after the guarantee');
  const balanced = { movement: 'improved', matchedCount: 20, questions: [], engineShort: [], engineBalance: {} } as never;
  ok(REMEASURE_RESULTS_COPY_APPROVED === false && remeasureResultsDecision({ replayRuns: [{ status: 'complete' }, { status: 'complete' }, { status: 'complete' }], replayTarget: 3, comparison: balanced, terms: { current: true } }).send === false, 'a perfect result is still HELD (copy not approved)');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
