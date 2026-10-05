/* ============================================================
   END-TO-END SALES CERTIFICATION — THE RULES (2026-10-05, QA, branch qa/end-to-end-sales-certification).

   One check per certified rule, each driving the REAL module that carries it (never a re-implementation):
     J  commission on the v3 terms (commission.ts)            I  the attribution hold (commission.ts + saleAttribution.ts)
     H  the seller (saleAttribution.ts + the SQL trigger)     N  the guarantee (clientTimeline.ts + remeasureResults.ts)
     O  Option B dates (clientTimeline.ts + client-terms.ts + delayed-subscription.ts)
     P  the Continuing Service (clientTimeline.ts)            M  the baseline shape (auditQuestionCounts + measurementHealth)
     G/F the checkout gate and webhook backstop (signupGate.ts + payment-hold.ts + findable-checkout source)
   Where a rule lives only in SQL or inside a Deno handler, the check says "source:" and reads the file.
   No database, no network: every Supabase / Stripe touch is a local fake.
   Run: npx tsx scripts/e2e-sales-certification-rules.test.ts
   ============================================================ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_COUNT_V3, COMMISSION_RECURRING_RATE, MONTHLY_TIERS, MONTHLY_TIER_RULE,
  commissionLines, earningsTotals, londonMonthStart, type CommissionLine, type LedgerRow,
} from '../src/lib/commission.ts';
import { ATTRIBUTION_HELD_STATUSES, isAttributionHeld } from '../src/lib/saleAttribution.ts';
import {
  ACCESS_DEADLINE_DAYS, COMMERCIAL_TERMS_V3, CONTINUING_SERVICE_AUTOMATION, CONTINUING_SERVICE_GBP, FALLBACK_START_WEEKS, OPTION_B_TIMING,
  REFUND_WINDOW_DAYS, approvalDay, approvalDayFromResults, chargeAllowedOn, guaranteeNumberWentUp, minimumTerm, minimumTermPayments,
  paymentStart, refundWindowEndDay, timelineActions, timelineView, ukDay, ukDayAtHourIso, type TimelineFacts,
} from '../src/lib/clientTimeline.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, REMEASURE_CLAIM_SENTENCE, recurringPaymentsFor } from '../src/lib/findableOffer.ts';
import { numberWentUp, remeasureResultsDecision, resultsEmailParagraphs, REMEASURE_RESULTS_COPY_APPROVED } from '../src/lib/remeasureResults.ts';
import { NOISE_BAND_PP, type MeasurementComparison } from '../src/lib/measurementCompare.ts';
import { BASELINE_QUESTIONS, BASELINE_RUNS } from '../src/lib/auditQuestionCounts.ts';
import { HEALTH_ENGINES, measurementHealth, type HealthRow, type HealthRun } from '../src/lib/measurementHealth.ts';
import { EDITABLE_BASELINE_STATUS_FILTER, isFrozenBaselineStatus } from '../src/lib/paidBaselineState.ts';
import { judgeRemeasure } from '../src/lib/baselineReplay.ts';
import { checkoutAgreementGate, webhookV3Verdict, type GateAcceptance } from '../src/lib/signupGate.ts';
import { CLIENT_AGREEMENT_VERSION, sha256Hex } from '../src/lib/clientAgreement.ts';
import { agreementPageHtml } from '../src/lib/agreementPageHtml.ts';
import { accessDateEmail, planPaymentStart } from '../supabase/functions/_shared/client-terms.ts';
import { minimumTermCancelAt, paymentStartHoldIso } from '../supabase/functions/_shared/delayed-subscription.ts';
import { holdPayment } from '../supabase/functions/_shared/payment-hold.ts';

let failures = 0;
let checks = 0;
const ok = (c: boolean, m: string) => { checks++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/* ── ledger fixtures ─────────────────────────────────────────────────────────────────────────── */
const SELLER = 'seller-A';
let n = 0;
const pay = (lead: string, kind: 'initial' | 'recurring', at: string, amount = 99, extra: Partial<LedgerRow> = {}): LedgerRow => {
  n += 1;
  return {
    id: 'row-' + String(n).padStart(5, '0'), lead_id: lead, kind, status: 'succeeded', amount_gbp: amount, occurred_at: at,
    stripe_object_id: 'pi_' + n, stripe_payment_intent_id: 'pi_' + n, stripe_charge_id: 'ch_' + n, stripe_invoice_id: kind === 'recurring' ? 'in_' + n : null,
    sold_by_user_id: SELLER, ...extra,
  };
};
const refund = (of: LedgerRow, at: string, amount = of.amount_gbp): LedgerRow => {
  n += 1;
  return {
    id: 'row-' + String(n).padStart(5, '0'), lead_id: of.lead_id, kind: 'refund', status: 'succeeded', amount_gbp: amount, occurred_at: at,
    stripe_object_id: 're_' + n, stripe_payment_intent_id: of.stripe_payment_intent_id, stripe_charge_id: of.stripe_charge_id, stripe_invoice_id: null, sold_by_user_id: of.sold_by_user_id,
  };
};
type Extra = {
  exclusionsOf?: Map<string, string>;
  attributionOf?: Map<string, { status: string; resolvedAt: string | null }>;
  sellerOfLead?: Map<string, string | null>;
};
/** v3 run: approval maps lead → Approval Date (null = not known yet). */
const runV3 = (ledger: LedgerRow[], approval: Record<string, string | null>, nowIso: string, extra: Extra = {}) => commissionLines({
  ledger, payouts: [], isCommissionable: (u) => u === SELLER,
  termsOf: new Map(Object.entries(approval).map(([lead, d]) => [lead, { terms: COMMERCIAL_TERMS_V3, approvalDay: d }])),
  nowIso, ...extra,
});
/** pre-v3 run: no terms at all. */
const runLegacy = (ledger: LedgerRow[], nowIso: string) => commissionLines({ ledger, payouts: [], isCommissionable: (u) => u === SELLER, nowIso });
const initialOf = (lines: CommissionLine[], lead: string) => lines.find((l) => l.leadId === lead && l.kind === 'payment' && l.paymentNumber === 1)!;

/** N sales for SELLER in one London month: lead ids P01..PNN, one hour apart from `startIso`. */
const monthOfSales = (prefix: string, count: number, startIso: string) => {
  const t0 = Date.parse(startIso);
  return Array.from({ length: count }, (_, i) => pay(prefix + String(i + 1).padStart(2, '0'), 'initial', new Date(t0 + i * 3_600_000).toISOString()));
};
const allApproved = (rows: LedgerRow[], day: string): Record<string, string | null> => Object.fromEntries(rows.map((r) => [r.lead_id!, day]));

async function main() {
  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     J. COMMISSION (v3)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('── J. COMMISSION (v3 terms) ──');
  {
    const init = pay('J1', 'initial', '2026-11-02T15:00:00Z');
    const before = initialOf(runV3([init], { J1: '2026-12-22' }, '2026-12-21T23:00:00Z').lines, 'J1');
    const t = earningsTotals([before], [], [], '2026-12-21');
    ok(before.status === 'pending' && t.due === 0 && t.earned === 0 && t.pending === 29.7,
      'J1 initial commission is PENDING (not due, not earned) the day before the Approval Date');
    const unknown = initialOf(runV3([init], { J1: null }, '2027-03-01T10:00:00Z').lines, 'J1');
    ok(unknown.status === 'pending' && unknown.provisional === true, 'J1b no Approval Date known (no results sent) → still pending, never due on a guess');
    const on = initialOf(runV3([init], { J1: '2026-12-22' }, '2026-12-22T00:30:00Z').lines, 'J1');
    ok(on.status === 'due' && on.commission === 29.7 && on.periodMonth === '2026-12-01', 'J1c on the Approval Date (UK) → APPROVED and due in the Approval month');
  }
  {
    ok(MONTHLY_TIERS[0].upTo === 12 && MONTHLY_TIERS[0].rate === 0.30 && MONTHLY_TIERS[1].upTo === 24 && MONTHLY_TIERS[1].rate === 0.40 && MONTHLY_TIERS[2].rate === 0.50,
      'J2 ladder thresholds in code: sales 1-12 = 30%, 13-24 = 40%, 25+ = 50%');
    const rows = monthOfSales('L', 25, '2026-11-02T09:00:00Z');
    const lines = runV3(rows, allApproved(rows, '2026-12-22'), '2026-12-23T10:00:00Z').lines;
    const rate = (k: number) => initialOf(lines, 'L' + String(k).padStart(2, '0')).rate;
    const seq = (k: number) => initialOf(lines, 'L' + String(k).padStart(2, '0')).monthSeq;
    ok(rate(12) === 0.30 && seq(12) === 12 && rate(13) === 0.40 && seq(13) === 13, 'J2a boundary 12|13: sale 12 earns 30%, sale 13 earns 40%');
    ok(rate(24) === 0.40 && rate(25) === 0.50, 'J2b boundary 24|25: sale 24 earns 40%, sale 25 earns 50%');
    ok(rate(1) === 0.30 && initialOf(lines, 'L25').commission === 49.5, 'J2c each sale keeps its own place (sale 1 stays 30%; sale 25 = £49.50)');
  }
  {
    ok(londonMonthStart('2026-10-31T23:30:00Z') === '2026-10-01', 'J3a 2026-10-31T23:30Z (23:30 GMT, 31 Oct) counts in OCTOBER');
    ok(londonMonthStart('2026-11-01T00:30:00Z') === '2026-11-01', 'J3b 2026-11-01T00:30Z (00:30 GMT, 1 Nov) counts in NOVEMBER');
    ok(londonMonthStart('2026-09-30T23:30:00Z') === '2026-10-01', 'J3c BST: 2026-09-30T23:30Z is 00:30 BST on 1 Oct → OCTOBER, not September');
    // Through the engine: 12 October sales + a BST-edge sale at 2026-09-30T23:30Z → the last October sale is the 13th (40%).
    const bstEdge = pay('EDGE', 'initial', '2026-09-30T23:30:00Z');
    const oct = monthOfSales('O', 12, '2026-10-10T09:00:00Z');
    const linesA = runV3([bstEdge, ...oct], allApproved([bstEdge, ...oct], '2026-11-20'), '2026-11-21T10:00:00Z').lines;
    ok(initialOf(linesA, 'EDGE').monthStart === '2026-10-01' && initialOf(linesA, 'EDGE').monthSeq === 1 && initialOf(linesA, 'O12').monthSeq === 13 && initialOf(linesA, 'O12').rate === 0.40,
      'J3d engine: the BST-edge sale is sale 1 of October, so the 12th October-dated sale is place 13 (40%)');
    const late = pay('LATE', 'initial', '2026-10-31T23:30:00Z');
    const next = pay('NEXT', 'initial', '2026-11-01T00:30:00Z');
    const oct2 = monthOfSales('Q', 12, '2026-10-05T09:00:00Z');
    const linesB = runV3([...oct2, late, next], allApproved([...oct2, late, next], '2026-12-20'), '2026-12-21T10:00:00Z').lines;
    ok(initialOf(linesB, 'LATE').monthSeq === 13 && initialOf(linesB, 'LATE').rate === 0.40 && initialOf(linesB, 'NEXT').monthStart === '2026-11-01' && initialOf(linesB, 'NEXT').monthSeq === 1 && initialOf(linesB, 'NEXT').rate === 0.30,
      'J3e engine: 31 Oct 23:30 GMT is October sale 13 (40%); 1 Nov 00:30 GMT is November sale 1 (30%)');
  }
  {
    // 13 November sales; sale 1 fully refunded BEFORE its Approval Date → cancelled, out of the ladder → sale 13 becomes place 12.
    const rows = monthOfSales('R', 13, '2026-11-02T09:00:00Z');
    const ref = refund(rows[0], '2026-12-01T10:00:00Z');
    const lines = runV3([...rows, ref], allApproved(rows, '2026-12-22'), '2026-12-23T10:00:00Z').lines;
    const r1 = initialOf(lines, 'R01');
    ok(r1.status === 'cancelled' && earningsTotals(lines.filter((l) => l.leadId === 'R01'), [], [], '2026-12-23').earned === 0,
      'J4a refunded before its Approval Date → its commission is CANCELLED (earns nothing)');
    ok(initialOf(lines, 'R13').monthSeq === 12 && initialOf(lines, 'R13').rate === 0.30, 'J4b … and it drops out of the ladder (sale 13 re-worked to place 12, 30%)');
    // Excluded before approval.
    const ex = new Map([['R02', '2026-12-01T10:00:00Z']]);
    const linesX = runV3(rows, allApproved(rows, '2026-12-22'), '2026-12-23T10:00:00Z', { exclusionsOf: ex }).lines;
    ok(initialOf(linesX, 'R02').status === 'cancelled' && initialOf(linesX, 'R02').commission === 0 && initialOf(linesX, 'R13').monthSeq === 12,
      'J4c excluded before its Approval Date → earns nothing and drops out of the ladder');
    // Refunded / excluded AFTER approval → locked.
    const refLate = refund(rows[0], '2026-12-28T10:00:00Z');
    const linesL = runV3([...rows, refLate], allApproved(rows, '2026-12-22'), '2026-12-29T10:00:00Z').lines;
    const revL = linesL.find((l) => l.kind === 'reversal' && l.leadId === 'R01')!;
    ok(initialOf(linesL, 'R01').status === 'due' && initialOf(linesL, 'R01').commission === 29.7 && revL.commission === 0 && initialOf(linesL, 'R13').rate === 0.40,
      'J4d refunded AFTER its Approval Date → commission unchanged (reversal £0) and sale 13 keeps 40%');
    const exLate = new Map([['R02', '2026-12-28T10:00:00Z']]);
    const linesXL = runV3(rows, allApproved(rows, '2026-12-22'), '2026-12-29T10:00:00Z', { exclusionsOf: exLate }).lines;
    ok(initialOf(linesXL, 'R02').status === 'due' && initialOf(linesXL, 'R02').commission === 29.7 && initialOf(linesXL, 'R13').rate === 0.40,
      'J4e excluded AFTER its Approval Date → locked, nothing changes');
  }
  {
    // Sale 13 approved on 10 Dec; sale 1 refunded on 15 Dec (inside ITS OWN window, approval 22 Dec).
    const rows = monthOfSales('K', 13, '2026-11-02T09:00:00Z');
    const ref = refund(rows[0], '2026-12-15T10:00:00Z');
    const approvals = { ...allApproved(rows, '2026-12-22'), K13: '2026-12-10' };
    const locked = initialOf(runV3([...rows, ref], approvals, '2026-12-23T10:00:00Z').lines, 'K13');
    const notYet = initialOf(runV3([...rows, ref], allApproved(rows, '2026-12-22'), '2026-12-23T10:00:00Z').lines, 'K13');
    ok(locked.rate === 0.40 && locked.monthSeq === 13 && notYet.rate === 0.30,
      'J5a approval LOCKS the rate: sale 13 approved before sale 1 dropped out keeps 40%; the same sale not yet approved re-works to 30%');
    const later = pay('K14', 'initial', '2026-11-28T09:00:00Z');
    const withLater = runV3([...rows, ref, later], { ...approvals, K14: '2026-12-22' }, '2026-12-23T10:00:00Z').lines;
    ok(initialOf(withLater, 'K13').rate === 0.40 && initialOf(withLater, 'K13').monthSeq === 13, 'J5b a later sale in the same month does not re-rate the approved one');
  }
  {
    const init = pay('T', 'initial', '2026-11-02T15:00:00Z');
    const months = ['2026-12-22', '2027-01-22', '2027-02-22', '2027-03-22', '2027-04-22', '2027-05-22', '2027-06-22'];
    const rec = months.map((d) => pay('T', 'recurring', d + 'T10:00:00Z'));
    const lines = runV3([init, ...rec], { T: '2026-12-22' }, '2027-07-01T10:00:00Z').lines.filter((l) => l.kind === 'payment' && l.paymentNumber > 1).sort((a, b) => a.paymentNumber - b.paymentNumber);
    ok(COMMISSION_RECURRING_COUNT_V3 === 5 && lines.slice(0, 5).every((l) => l.rate === COMMISSION_RECURRING_RATE && l.commission === 19.8 && l.status === 'due'),
      'J6a trailing 20% (£19.80) on each of the first FIVE £99 recurring payments');
    ok(lines.slice(5).length === 2 && lines.slice(5).every((l) => l.rate === 0 && l.commission === 0), 'J6b nothing on the sixth and seventh £99 recurring payments');
  }
  {
    const init = pay('CS', 'initial', '2026-11-02T15:00:00Z');
    const r99 = ['2026-12-22', '2027-01-22', '2027-02-22', '2027-03-22', '2027-04-22'].map((d) => pay('CS', 'recurring', d + 'T10:00:00Z'));
    const cont = pay('CS', 'recurring', '2027-05-22T10:00:00Z', FINDABLE_CONTINUING_GBP);
    const contEarly = pay('CS2', 'recurring', '2026-12-22T10:00:00Z', FINDABLE_CONTINUING_GBP);
    const init2 = pay('CS2', 'initial', '2026-11-03T15:00:00Z');
    const lines = runV3([init, ...r99, cont, init2, contEarly], { CS: '2026-12-22', CS2: '2026-12-22' }, '2027-06-01T10:00:00Z').lines;
    const cl = lines.find((l) => l.id === 'pay:' + cont.id)!;
    const cl2 = lines.find((l) => l.id === 'pay:' + contEarly.id)!;
    ok(cl.rate === 0 && cl.commission === 0 && cl.status === 'not_commissionable' && cl.continuingService === true && cl2.commission === 0 && cl2.continuingService === true,
      'J7 no commission on a £29.99 Continuing Service payment (after the term, or even inside the first five)');
  }
  {
    // Historical pre-v3 sale (no client_service_terms row): the stamped rate stands, due at once, trailing SIX, and £29.99 earns.
    const init = pay('H1', 'initial', '2026-09-02T15:00:00Z', 99, { commission_rule: MONTHLY_TIER_RULE, commission_month_start: '2026-09-01', commission_month_seq: 13, commission_rate: 0.4 });
    const rec = ['2026-10-14', '2026-11-14', '2026-12-14', '2027-01-14', '2027-02-14', '2027-03-14', '2027-04-14'].map((d) => pay('H1', 'recurring', d + 'T10:00:00Z'));
    const lines = runLegacy([init, ...rec], '2026-09-03T10:00:00Z').lines;
    const i1 = initialOf(lines, 'H1');
    ok(i1.rate === 0.4 && i1.status === 'due' && i1.provisional === undefined, 'J8a pre-v3 sale: the database-stamped rate (40%) stands and is due immediately — no Pending, no Approval Date');
    const recL = runLegacy([init, ...rec], '2027-05-01T10:00:00Z').lines.filter((l) => l.paymentNumber > 1).sort((a, b) => a.paymentNumber - b.paymentNumber);
    ok(COMMISSION_RECURRING_COUNT === 6 && recL.slice(0, 6).every((l) => l.rate === 0.2) && recL[6].rate === 0, 'J8b pre-v3 sale keeps the old trailing rule: SIX recurring payments at 20%, the seventh 0%');
    const leg = pay('H2', 'initial', '2026-08-02T15:00:00Z');
    const leg29 = pay('H2', 'recurring', '2026-09-14T10:00:00Z', 29.99);
    const legLines = runLegacy([leg, leg29], '2026-10-01T10:00:00Z').lines;
    ok(initialOf(legLines, 'H2').rate === 0.30 && legLines.find((l) => l.id === 'pay:' + leg29.id)!.commission === 6.0,
      'J8c pre-v3 unstamped sale keeps the flat 30%, and its £29.99 monthly still earns 20% (£6.00) under the old rule');
    const src = read('src/lib/commission.ts');
    ok(/const v3 = !!termsRow && isV3Terms\(termsRow\.terms\);/.test(src), 'J8d source: v3 vs historical is decided ONLY by a client_service_terms stamp of COMMERCIAL_TERMS_V3 (isV3Terms)');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     I. ATTRIBUTION HOLD
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── I. ATTRIBUTION HOLD ──');
  {
    const h0 = pay('H0', 'initial', '2026-11-01T10:00:00Z');
    const rest = monthOfSales('S', 12, '2026-11-02T09:00:00Z'); // S12 is the 13th sale of November when H0 counts
    const ledger = [h0, ...rest];
    const approvals = { ...allApproved(rest, '2026-12-22'), H0: '2026-12-20' };
    const att = (status: string, resolvedAt: string | null) => new Map([['H0', { status, resolvedAt }]]);
    const open = runV3(ledger, approvals, '2026-12-23T10:00:00Z', { attributionOf: att('open', null) }).lines;
    ok(initialOf(open, 'H0').commission === 0 && initialOf(open, 'H0').sellerId === null && initialOf(open, 'H0').status === 'not_commissionable',
      'I1a review OPEN → no commission on the held sale');
    ok(initialOf(open, 'S12').monthSeq === 12 && initialOf(open, 'S12').rate === 0.30, 'I1b review OPEN → the held sale is not in the ladder (the last sale is place 12, not 13)');
    const nc = runV3(ledger, approvals, '2026-12-23T10:00:00Z', { attributionOf: att('not_credited', '2026-12-05T10:00:00Z') }).lines;
    ok(initialOf(nc, 'H0').commission === 0 && initialOf(nc, 'S12').monthSeq === 12, 'I2 NOT CREDITED → no commission, never in the ladder');
    const confEarly = runV3(ledger, approvals, '2026-12-23T10:00:00Z', { attributionOf: att('confirmed', '2026-12-01T10:00:00Z') }).lines;
    ok(initialOf(confEarly, 'H0').commission === 29.7 && initialOf(confEarly, 'H0').status === 'due' && initialOf(confEarly, 'S12').monthSeq === 13 && initialOf(confEarly, 'S12').rate === 0.40,
      'I3a CONFIRMED before the others were approved → normal rules: it earns, and counts for sales approved after the confirmation');
    const confLate = runV3(ledger, approvals, '2027-01-06T10:00:00Z', { attributionOf: att('confirmed', '2027-01-05T10:00:00Z') }).lines;
    ok(initialOf(confLate, 'S12').rate === 0.30 && initialOf(confLate, 'S12').monthSeq === 12, 'I3b CONFIRMED after a sale was approved → that locked rate is NOT re-rated retroactively');
    ok(initialOf(confLate, 'H0').commission === 29.7 && initialOf(confLate, 'H0').periodMonth === '2027-01-01',
      'I3c the confirmed sale earns from its confirmation: owed in the confirmation month (January), never a month already closed');
    ok(isAttributionHeld('surprise_status') === true && isAttributionHeld(null) === false && ATTRIBUTION_HELD_STATUSES.join(',') === 'open,not_credited',
      'I4 an unknown review status is HELD (fails closed); no review is not held');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     H. SELLER = creator of the paid sign-up
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── H. SELLER ──');
  {
    const mig = read('supabase/migrations/20261010130000_v3_signup_seller_attribution.sql');
    ok(/create or replace function public\.sale_attribution_decision/.test(mig) && /if old\.sold_by_user_id is not null then\s*\n\s*new\.sold_by_user_id := old\.sold_by_user_id;/.test(mig),
      'H1 source (SQL only): the seller is decided in the database (sale_attribution_decision) and frozen once stamped');
    const a = pay('SB', 'initial', '2026-11-02T15:00:00Z', 99, { sold_by_user_id: null });
    const viaLead = initialOf(runV3([a], { SB: '2026-12-01' }, '2026-12-02T10:00:00Z', { sellerOfLead: new Map([['SB', SELLER]]) }).lines, 'SB');
    ok(viaLead.sellerId === SELLER && viaLead.commission === 29.7, 'H2 TS consumer: no seller on the ledger row → falls back to outreach_leads.sold_by_user_id');
    const b = pay('SC', 'initial', '2026-11-02T15:00:00Z');
    const held = initialOf(runV3([b], { SC: '2026-12-01' }, '2026-12-02T10:00:00Z', { sellerOfLead: new Map([['SC', SELLER]]), attributionOf: new Map([['SC', { status: 'open', resolvedAt: null }]]) }).lines, 'SC');
    ok(held.sellerId === null && held.commission === 0, 'H3 TS consumer: a held review overrides a stamped sold_by (no seller, no commission)');
    const noSeller = initialOf(runV3([pay('SD', 'initial', '2026-11-02T15:00:00Z', 99, { sold_by_user_id: null })], { SD: '2026-12-01' }, '2026-12-02T10:00:00Z').lines, 'SD');
    ok(noSeller.sellerId === null && noSeller.commission === 0, 'H4 no seller stamped anywhere → nobody earns');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     N. GUARANTEE
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── N. GUARANTEE ──');
  {
    ok(guaranteeNumberWentUp(39, 40) === true, 'N1 39 → 40 named answers = gone up (no refund)');
    ok(guaranteeNumberWentUp(39, 39) === false, 'N2 39 → 39 = not gone up (refund applies)');
    ok(guaranteeNumberWentUp(39, 38) === false, 'N3 39 → 38 = not gone up (refund applies)');
    // The real decision path: a 39/120 → 40/120 comparison is +0.83pp — INSIDE the ±NOISE_BAND_PP band — yet it counts as gone up.
    const cmp = (b: number, a: number): MeasurementComparison => ({
      questions: [], before: { named: b, answered: 120 } as never, after: { named: a, answered: 120 } as never,
      ratePpDelta: ((a - b) / 120) * 100, namedCellsDelta: a - b, movement: 'within_noise', withinNoise: true, noiseBandPp: NOISE_BAND_PP,
      unevenRuns: false, matchedCount: 20, onlyBefore: [], onlyAfter: [], headline: '', engineBalance: {}, engineShort: [],
    });
    ok(numberWentUp(cmp(39, 40)) === true && numberWentUp(cmp(39, 39)) === false && numberWentUp(cmp(39, 38)) === false,
      'N4 the sender\'s decision (numberWentUp) ignores the noise band: +1 inside ±' + NOISE_BAND_PP + 'pp still counts as gone up');
    const dec = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }, { status: 'complete' }, { status: 'complete' }], replayTarget: 3, comparison: cmp(39, 40), terms: { current: true }, copyApproved: true });
    const words = resultsEmailParagraphs({ businessName: 'Acme', town: 'Leeds', beforeNamed: 39, beforeAnswered: 120, afterNamed: 40, afterAnswered: 120, questions: 20, wentUp: numberWentUp(cmp(39, 40)), withinNoise: true, documentUrl: 'u' }).join(' ');
    const wordsSame = resultsEmailParagraphs({ businessName: 'Acme', town: 'Leeds', beforeNamed: 39, beforeAnswered: 120, afterNamed: 39, afterAnswered: 120, questions: 20, wentUp: numberWentUp(cmp(39, 39)), withinNoise: true, documentUrl: 'u' }).join(' ');
    ok(dec.send === true && /has gone up/.test(words) && !words.includes(REMEASURE_CLAIM_SENTENCE) && wordsSame.includes(REMEASURE_CLAIM_SENTENCE),
      'N5 a within-band 39→40 is SENT as "gone up" with no refund offer; 39→39 carries the refund sentence');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const guaranteeFiles = ['src/lib/remeasureResults.ts', 'src/lib/remeasureResultsHtml.ts', 'supabase/functions/_shared/remeasure-results.ts', 'src/lib/clientTimeline.ts'];
    const offenders = guaranteeFiles.filter((f) => /NOISE_BAND_PP|withinNoise\s*\?|withinNoise\s*&&|within_noise'?\s*\)|movement\s*===\s*'improved'/.test(strip(read(f)).replace(/withinNoise: (c|comparison|copy)\.withinNoise/g, '').replace(/withinNoise: boolean;/g, '').replace(/within_noise: copy\.withinNoise/g, '')));
    ok(offenders.length === 0, 'N6 source: no ±NOISE_BAND_PP / movement==="improved" / withinNoise branch in any guarantee-decision file' + (offenders.length ? ' — found in ' + offenders.join(', ') : ''));
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     O. OPTION B DATES
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── O. OPTION B ──');
  const v3 = (f: Partial<TimelineFacts>): TimelineFacts => ({ terms: COMMERCIAL_TERMS_V3, route: 'build', initialPaidAt: '2026-09-14T15:00:00Z', accessDate: '2026-09-20', resultsSentAt: null, guaranteeCeasedAt: null, ...f });
  {
    ok(REFUND_WINDOW_DAYS === 14 && refundWindowEndDay('2026-10-17') === '2026-10-31' && approvalDayFromResults('2026-10-17') === '2026-11-01',
      'O1 Results 17 Oct → Refund Window ends 31 Oct (month end) → Approval / Payment Start 1 Nov');
    ok(approvalDayFromResults('2027-02-14') === '2027-03-01' && approvalDayFromResults('2026-12-17') === '2027-01-01', 'O2 month/year ends: Results 14 Feb 2027 → Approval 1 Mar; Results 17 Dec → Approval 1 Jan 2027');
    const f = v3({ resultsSentAt: '2026-10-10T09:00:00Z' });
    ok(paymentStart(f).day === '2026-10-25' && paymentStart(f).basis === 'results' && approvalDay(f) === '2026-10-25',
      'O3 Results 10 Oct (BST) → Approval on 25 Oct 2026, the BST→GMT change day');
    ok(ukDayAtHourIso('2026-10-25', 10) === '2026-10-25T10:00:00.000Z' && ukDayAtHourIso('2026-10-24', 10) === '2026-10-24T09:00:00.000Z' && ukDayAtHourIso('2026-10-25', 0) === '2026-10-24T23:00:00.000Z',
      'O4 UK hours across the clock change: 10:00 on 24 Oct = 09:00Z (BST), 10:00 on 25 Oct = 10:00Z (GMT), midnight 25 Oct = 23:00Z on the 24th');
    ok(paymentStart(v3({ resultsSentAt: '2026-10-11T23:30:00Z' })).day === '2026-10-27', 'O5 a send at 23:30Z on 11 Oct is 00:30 BST on 12 Oct → Results Date 12 Oct → Approval 27 Oct');
    ok(!chargeAllowedOn(f, '2026-10-24T22:59:00Z') && chargeAllowedOn(f, '2026-10-25T00:30:00Z'), 'O6 no charge allowed on the UK day before the Approval Date; allowed on it');
    const sub = { id: 'sub_1', status: 'trialing', metadata: { lead_id: 'LEAD', payment_timing: OPTION_B_TIMING } };
    const plan = planPaymentStart(f, 'LEAD', sub, '2026-10-12T10:00:00Z');
    const approvalStart = Date.parse(ukDayAtHourIso('2026-10-25', 0));
    ok(plan.ok && plan.trialEndSec * 1000 >= approvalStart && ukDay(new Date(plan.trialEndSec * 1000).toISOString()) === '2026-10-25',
      'O7 the Stripe trial_end (first charge) set by planPaymentStart is ON the Approval Date, never earlier');
    const latePlan = planPaymentStart(f, 'LEAD', sub, '2026-11-03T10:00:00Z');
    ok(latePlan.ok && latePlan.trialEndSec * 1000 > Date.parse('2026-11-03T10:00:00Z'), 'O8 set late → the first charge moves LATER (now + 1h), never back into the window');
    const noResults = planPaymentStart(v3({}), 'LEAD', sub, '2026-10-12T10:00:00Z');
    ok(!noResults.ok, 'O9 no Results Date → planPaymentStart refuses (Stripe stays on its hold)');
    const hold = paymentStartHoldIso('2026-09-14T15:00:00Z')!;
    ok(ukDay(hold)! > approvalDayFromResults('2026-12-31') && ukDay(hold)! > '2026-10-27', 'O10 the sign-up hold trial (365 days) is later than any realistic Approval Date (and than the six-week fallback)');
    ok(minimumTermCancelAt(Math.floor(Date.parse('2026-10-25T10:00:00Z') / 1000), recurringPaymentsFor('build')) === Math.floor(Date.parse('2027-09-25T10:00:00Z') / 1000),
      'O11 the subscription stops after the 11 Build recurring payments (cancel_at = trial_end + 11 months)');
  }
  {
    const init = '2026-11-02T15:00:00Z';
    const noAccess = v3({ initialPaidAt: init, accessDate: null });
    ok(ACCESS_DEADLINE_DAYS === 30 && FALLBACK_START_WEEKS === 6 && paymentStart({ ...noAccess, guaranteeCeasedAt: '2026-12-03T10:00:00Z' }).day === '2026-12-15' && paymentStart({ ...noAccess, guaranteeCeasedAt: '2026-12-03T10:00:00Z' }).basis === 'fallback',
      'O12 no access within 30 days (guarantee recorded as ceased) → Payment Start = the day after six weeks from the £99 (2 Nov → 15 Dec)');
    const acts = timelineActions(noAccess, '2026-12-03T10:00:00Z');
    ok(acts.some((a) => a.kind === 'access_deadline' && a.urgent && a.dueDay === '2026-12-02') && paymentStart(noAccess).day === null,
      'O13 access deadline passed but not yet recorded → Paul gets an URGENT action; no date is invented (the fallback needs his record)');
    ok(paymentStart({ ...noAccess, guaranteeCeasedAt: '2027-01-10T10:00:00Z' }).day === '2027-01-11', 'O14 a cessation recorded after the fallback date → the day after recording (never retroactive)');
    const crossBst = v3({ initialPaidAt: '2026-09-14T15:00:00Z', accessDate: null, guaranteeCeasedAt: '2026-10-15T10:00:00Z' });
    ok(paymentStart(crossBst).day === '2026-10-27', 'O15 fallback across the clock change: £99 on 14 Sep → Payment Start 27 Oct');
  }
  {
    // Results Date = the SEND event, never access + 28.
    const f = v3({ accessDate: '2026-11-10', resultsSentAt: null });
    const view = timelineView(f, '2027-01-15T10:00:00Z');
    ok(view.resultsTargetDay === '2026-12-08' && view.resultsDay === null && view.refundWindowEndDay === null && view.paymentStart.day === null && approvalDay(f) === null,
      'O16 66 days after access with no results sent: a 28-day TARGET exists but NO Results Date, Refund Window or Approval Date is invented');
    const init = pay('RD', 'initial', '2026-11-02T15:00:00Z');
    ok(initialOf(runV3([init], { RD: approvalDay(f) }, '2027-01-15T10:00:00Z').lines, 'RD').status === 'pending', 'O17 … so the initial commission stays Pending');
    const ct = read('supabase/functions/_shared/client-terms.ts');
    const earn = read('supabase/functions/_shared/earnings.ts');
    ok(/resultsSentAt: \(lead\.remeasure_results_sent_at as string \| null\) \?\? null/.test(ct) && /resultsSentAt: l\?\.remeasure_results_sent_at \?\? null/.test(earn),
      'O18 source: the timeline and the earnings both read the Results Date from outreach_leads.remeasure_results_sent_at (the send stamp)');
    // Who writes that stamp? Only the results sender — which is held while REMEASURE_RESULTS_COPY_APPROVED is false.
    const writers = ['supabase/functions/_shared/remeasure-results.ts', 'supabase/functions/paid-client-hub/index.ts', 'supabase/functions/paid-baseline/index.ts', 'supabase/functions/stripe-webhook/index.ts']
      .filter((p) => /update\(\{\s*remeasure_results_sent_at:\s*nowIso/.test(read(p)));
    const held = remeasureResultsDecision({ replayRuns: [{ status: 'complete' }, { status: 'complete' }, { status: 'complete' }], replayTarget: 3, comparison: { matchedCount: 20, questions: [], engineShort: [], movement: 'improved', before: { named: 1 }, after: { named: 2 } } as never, terms: { current: true } });
    ok(writers.length === 1 && writers[0].endsWith('remeasure-results.ts'),
      'O19 the ONLY writer of the Results Date (remeasure_results_sent_at) is the results sender — no hand-set date can start the Refund Window');
    ok(REMEASURE_RESULTS_COPY_APPROVED ? held.send === true : held.send === false && held.kind === 'copy_not_approved',
      'O20 the sender obeys REMEASURE_RESULTS_COPY_APPROVED (currently ' + REMEASURE_RESULTS_COPY_APPROVED + ')');
    if (!REMEASURE_RESULTS_COPY_APPROVED) {
      /* ⚠️ KNOWN, OPEN (E2E-01 in docs/pre-sales-certification/end-to-end-sales-certification.md): while the copy is
         unapproved no v3 client can get a Results Date, so no Refund Window, Approval Date or monthly charge
         (the Stripe hold keeps it late, never early) and the initial commission stays Pending. Paul's copy approval
         is due before the FIRST v3 client's results (about four weeks after their Access Date). */
      console.log('WARN O21 E2E-01: REMEASURE_RESULTS_COPY_APPROVED is false — a v3 Results Date cannot be produced until Paul approves the results copy');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     P. CONTINUING SERVICE
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── P. CONTINUING SERVICE ──');
  {
    const opt = v3({ route: 'optimise', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-05', resultsSentAt: '2026-12-01T12:00:00Z' });
    ok(paymentStart(opt).day === '2026-12-16', 'P0 fixture: Results 1 Dec → Payment Start 16 Dec');
    const days = ['2026-12-16', '2027-01-16', '2027-02-16', '2027-03-16', '2027-04-16'];
    const full = { ...opt, recurringPaidAt: days.map((d) => d + 'T10:00:00Z') };
    const mt = minimumTerm(full);
    ok(minimumTermPayments('optimise') === 6 && mt.recurringNeeded === 5 && mt.finalPaymentActual && mt.finalPaymentDay === '2027-04-16' && mt.continuingStartDay === '2027-05-16',
      'P1 Optimise: after 6 £99 payments (sign-up + 5 actual recurring) the term is complete → £' + CONTINUING_SERVICE_GBP + ' Continuing Service from 16 May');
    const build = v3({ route: 'build', initialPaidAt: '2026-11-02T15:00:00Z', accessDate: '2026-11-05', resultsSentAt: '2026-12-01T12:00:00Z' });
    const b11 = Array.from({ length: 11 }, (_, k) => new Date(Date.UTC(2026, 11 + k, 16, 10)).toISOString());
    const mtb = minimumTerm({ ...build, recurringPaidAt: b11 });
    const mtb10 = minimumTerm({ ...build, recurringPaidAt: b11.slice(0, 10) });
    ok(minimumTermPayments('build') === 12 && mtb.recurringNeeded === 11 && mtb.finalPaymentActual && mtb.finalPaymentDay === '2027-10-16' && mtb.continuingStartDay === '2027-11-16' && !mtb10.finalPaymentActual,
      'P2 Build: complete only after 12 £99 payments (sign-up + 11 actual recurring); 10 recurring is not complete');
    const gappy = minimumTerm({ ...opt, recurringPaidAt: ['2026-12-16T10:00:00Z', '2027-01-16T10:00:00Z', '2027-04-16T10:00:00Z'] });
    ok(!gappy.finalPaymentActual && gappy.recurringPaid === 3 && gappy.finalPaymentDay === '2027-06-16' && gappy.continuingStartDay === '2027-07-16',
      'P3 based on ACTUAL payments: two missed months push the £29.99 start to 16 Jul (calendar alone would say 16 May)');
    ok(mt.clientReminderDueDay === '2027-04-16' && mt.paulActionDay === '2027-04-02', 'P4 reminders: client notice due 30 days before (16 Apr); Paul\'s action 14 days before that (2 Apr)');
    const confirmed = { ...full, paymentStartScheduledDay: '2026-12-16', paymentStartConfirmedAt: '2026-12-02T10:00:00Z' };
    const kinds = (f: TimelineFacts, d: string) => timelineActions(f, d + 'T10:00:00Z').map((a) => a.kind);
    ok(kinds(confirmed, '2027-04-05').includes('continuing_prepare') && kinds(confirmed, '2027-04-20').includes('continuing_reminder_overdue'),
      'P5 Paul is prompted to prepare the client reminder, and told when it is overdue');
    const sent = { ...confirmed, continuingReminderSentAt: '2027-04-10T10:00:00Z' };
    ok(kinds(sent, '2027-05-10').includes('continuing_decision') && !kinds(sent, '2027-05-10').includes('continuing_reminder_overdue'),
      'P6 client reminder recorded as sent → Paul is asked to record Continue / Cancel before the start');
    ok(!kinds({ ...sent, continuingDecision: 'continue' }, '2027-05-10').some((k) => k.startsWith('continuing')) && !kinds({ ...sent, continuingDecision: 'cancel' }, '2027-05-10').some((k) => k.startsWith('continuing')),
      'P7 Continue / Cancel recorded → the Continuing Service actions close');
    ok(CONTINUING_SERVICE_AUTOMATION.clientReminderEmail === false && CONTINUING_SERVICE_AUTOMATION.stripeSwitch === false && CONTINUING_SERVICE_AUTOMATION.autoState === false,
      'P8 CONTINUING_SERVICE_AUTOMATION: no automatic reminder, no automatic Stripe switch, no automatic state');
    const fnFiles = ['supabase/functions/_shared/client-terms.ts', 'supabase/functions/_shared/delayed-subscription.ts', 'supabase/functions/stripe-webhook/index.ts', 'supabase/functions/paid-client-hub/index.ts'];
    const autoCharge = fnFiles.filter((p) => /unit_amount[^\n]{0,40}(2999|FINDABLE_CONTINUING_GBP|CONTINUING_SERVICE_GBP)|(FINDABLE_CONTINUING_GBP|CONTINUING_SERVICE_GBP)\s*\*\s*100/.test(read(p)));
    const hub = read('supabase/functions/paid-client-hub/index.ts');
    ok(autoCharge.length === 0 && /stripe_automatic: CONTINUING_SERVICE_AUTOMATION\.stripeSwitch/.test(hub) && FINDABLE_CONTINUING_GBP === 29.99,
      'P9 source: no Stripe price/charge for £29.99 is created anywhere in the payment functions; recording a decision reports stripe_automatic=false');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     M. BASELINE
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── M. BASELINE ──');
  {
    ok(BASELINE_QUESTIONS === 20 && BASELINE_RUNS === 3 && HEALTH_ENGINES.join(',') === 'chatgpt,gemini', 'M1 20 approved questions × 3 runs × 2 engines (ChatGPT + Gemini)');
    const qs = Array.from({ length: BASELINE_QUESTIONS }, (_, i) => 'best plumber question ' + (i + 1));
    const runs: HealthRun[] = [1, 2, 3].map((k) => ({ id: 'run' + k, run_number: k, status: 'complete' }));
    const rows: HealthRow[] = runs.flatMap((r) => qs.map((q, i) => ({ id: r.id + '-' + i, run_id: r.id, question: q, status: 'done', result: { chatgpt: { text: 'a' }, gemini: { text: 'b' } } })));
    const h = measurementHealth({ runs, rows, targetRuns: BASELINE_RUNS, questions: BASELINE_QUESTIONS, frozen: true });
    ok(h.expectedCells === 120 && h.answeredCells === 120 && h.state === 'complete', 'M2 a full baseline = 120 answers, complete');
    const short = rows.map((r, i) => (i === 7 ? { ...r, result: { chatgpt: { text: 'a' } } } : r));
    const h2 = measurementHealth({ runs, rows: short, targetRuns: BASELINE_RUNS, questions: BASELINE_QUESTIONS, frozen: true });
    ok(h2.state === 'partial' && h2.answeredCells === 119, 'M3 one Gemini answer missing → 119 of 120, NOT complete');
    ok(['approved', 'starting', 'running', 'complete'].every(isFrozenBaselineStatus) && !isFrozenBaselineStatus('needs_approval') && !/approved|starting|running|complete/.test(EDITABLE_BASELINE_STATUS_FILTER),
      'M4 questions are frozen once approved (and while running / complete); only needs_questions / needs_approval / failed are editable');
    const same = judgeRemeasure({ proposed: [...qs].reverse(), baselineAsked: qs, targetRuns: 3 });
    const changed = judgeRemeasure({ proposed: [...qs.slice(0, 19), 'a different question'], baselineAsked: qs, targetRuns: 3 });
    ok(same.allow && same.countsAsMeasurement === true && !changed.allow, 'M5 the re-measure must ask the frozen 20 exactly (a changed question is refused)');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     G/F. CHECKOUT GATE + WEBHOOK BACKSTOP
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  console.log('\n── G/F. CHECKOUT ──');
  {
    const text = 'the agreed text';
    const sha = await sha256Hex(text);
    const good: GateAcceptance = { id: 'acc1', lead_id: 'L1', onboarding_id: 'OB1', agreement_version: CLIENT_AGREEMENT_VERSION, service_route: 'build', method: 'agree_page', authority_confirmed: true, agreed_text_sha256: sha };
    const gate = (a: GateAcceptance | null, over: Partial<{ leadId: string; onboardingId: string; route: 'build' | 'optimise' }> = {}) =>
      checkoutAgreementGate({ acceptance: a, leadId: over.leadId ?? 'L1', onboardingId: over.onboardingId ?? 'OB1', route: over.route ?? 'build', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: a ? sha : null });
    const refusal = (r: ReturnType<typeof gate>) => ('refusal' in r ? r.refusal : 'ok');
    ok(CLIENT_AGREEMENT_VERSION === 'v3' && gate(good).ok === true, 'G1 signed v3 acceptance for this sign-up → checkout permitted');
    ok(refusal(gate(null)) === 'not_signed', 'G2 unsigned → refused (not_signed)');
    ok(refusal(gate({ ...good, agreement_version: 'v1', method: 'checkout' })) === 'wrong_method' && refusal(gate({ ...good, agreement_version: 'v1' })) === 'old_version',
      'G3 a v1 / legacy acceptance (checkout tick, or v1 on the page) → refused');
    ok(refusal(gate(good, { onboardingId: 'OB2' })) === 'other_signup' && refusal(gate(good, { leadId: 'L2' })) === 'other_client' && refusal(gate(good, { route: 'optimise' })) === 'other_route',
      'G4 an acceptance belonging to another sign-up / client / route → refused');
    ok(refusal(gate({ ...good, authority_confirmed: false })) === 'no_authority' && refusal(checkoutAgreementGate({ acceptance: good, leadId: 'L1', onboardingId: 'OB1', route: 'build', currentVersion: 'v3', recomputedSha: 'x' })) === 'tampered',
      'G5 no authority tick, or a tampered record → refused');
    const page = agreementPageHtml({ mode: 'sign', businessName: 'Acme Plumbing', route: 'build', values: {}, errors: [], signupId: 'OB1' });
    const boxes = page.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    ok(boxes.length >= 2 && boxes.every((b) => !/\bchecked\b/.test(b)), 'G6 the agree form: ' + boxes.length + ' checkboxes, none pre-ticked');
    const co = read('supabase/functions/findable-checkout/index.ts');
    const gateAt = co.indexOf('checkoutAgreementGate({');
    const stripeAt = co.indexOf('https://api.stripe.com/v1/checkout/sessions');
    ok(gateAt > 0 && gateAt < stripeAt && /if \(!gateResult\.ok\) \{[\s\S]{0,300}kind: "agreement_required"/.test(co) && (co.match(/api\.stripe\.com\/v1\/checkout\/sessions/g) ?? []).length === 1,
      'G7 source: findable-checkout runs the gate before its ONLY Stripe session create, and answers agreement_required');
    const meta = { commercial_terms: COMMERCIAL_TERMS_V3, agreement_version: CLIENT_AGREEMENT_VERSION, agreement_acceptance_id: 'acc1', service_route: 'build' };
    const v = (m: Record<string, string | undefined>, a: GateAcceptance | null = good) => webhookV3Verdict({ metadata: m, acceptance: a, leadId: 'L1', onboardingId: 'OB1', currentVersion: CLIENT_AGREEMENT_VERSION, recomputedSha: sha, v3Terms: COMMERCIAL_TERMS_V3 });
    ok(v(meta).ok === true && v({}).ok === false && v({ ...meta, agreement_version: 'v1' }).ok === false && v(meta, { ...good, onboarding_id: 'OB9' }).ok === false,
      'F1 webhook backstop: a legacy / v1 / other-sign-up payment is NOT a v3 sale (it is held)');
    const inserted: string[] = [];
    const chain = (table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'limit', 'order']) c[m] = () => c;
      c.maybeSingle = async () => ({ data: table === 'team_members' ? { user_id: 'paul' } : null, error: null });
      c.insert = async () => { inserted.push(table); return { error: null }; };
      c.upsert = async () => { inserted.push(table); return { error: null }; };
      c.update = () => { inserted.push(table + ':update'); return c; };
      return c;
    };
    await holdPayment({ from: chain }, { id: 'cs_X', payment_intent: 'pi_X', amount_total: 9900, metadata: {} }, { leadId: 'L1', onboardingId: 'OB1', reason: 'not_a_v3_checkout', eventId: 'evt' }, async () => ({ ok: true, status: 200, error: null }));
    ok(inserted.includes('client_payment_holds') && !inserted.some((t) => /payment_ledger|outreach_leads|client_service_terms/.test(t)),
      'F2 a held payment is recorded in client_payment_holds and writes no ledger row (so no commission) and does not mark the lead paid');
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════
     L. ACCESS DATE (paid-client-hub confirm_access_date; the email; the baseline waits for it)
     ══════════════════════════════════════════════════════════════════════════════════════════════ */
  {
    const hub = read('supabase/functions/paid-client-hub/index.ts');
    const at = hub.indexOf('if (action === "confirm_access_date") {');
    const block = hub.slice(at, hub.indexOf('if (action === "record_guarantee_ceased")', at));
    const refuseAt = block.indexOf('if (!access.ready) return json({ ok: false, error: "access_incomplete"');
    const writeAt = block.indexOf('.update({ access_date: day');
    ok(at > 0 && refuseAt > 0 && writeAt > refuseAt && block.indexOf('future_date') < writeAt && block.indexOf('before_payment') < writeAt,
      'L1 source: Confirm Access Date refuses (access_incomplete / future / before the £99) BEFORE its only write');
    ok(/\.is\("access_date", null\)/.test(block) && block.includes('appendTermsEvent(service, leadId, "access_confirmed"'),
      'L2 source: the date is written once (only while empty) and the History event access_confirmed is appended');
    ok(block.indexOf('qaEmailHold(') > 0 && block.indexOf('qaEmailHold(') < block.indexOf('sendAccessDateEmail(') && /emailed = sent\.ok/.test(block),
      'L3 source: the client email passes the QA email guard first and is recorded as sent ONLY when Resend accepted it');
    const mail = accessDateEmail({ businessName: 'ZZ E2E Plumbing', accessDay: '2026-11-10', resultsTargetDay: '2026-12-08' });
    ok(mail.subject.includes('ZZ E2E Plumbing') && /10 November 2026/.test(mail.text) && /8 December 2026/.test(mail.text)
      && /day after your 14-day refund window closes/.test(mail.text) && !/guess|cannot promise|engines decide|six weeks|8 weeks|eight weeks|£9\.99/i.test(mail.text),
      'L4 the Access Date email renders the business, the date, the results target and Option B timing, with no hedge or stale terms');
    const pb = read('supabase/functions/_shared/audit-baseline.ts');
    ok(/if \(!baselineMayStart\(terms[^)]*\)\) \{\s*return \{ ok: true, skipped: "awaiting_access_date" \};/.test(pb),
      'L5 source: the paid baseline start is skipped (awaiting_access_date) for a v3 client until the Access Date is confirmed');
  }

  console.log('\n' + (checks - failures) + '/' + checks + ' checks passed.');
  if (failures) { console.error(failures + ' FAILURES'); process.exit(1); }
  console.log('All end-to-end sales certification rule checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
