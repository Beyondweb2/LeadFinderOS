/* ══ COMMISSION OWED (Paul, 2026-11-02, docs/commission-owed.md) ════════════════════════════════════════════════════════════════
   What Paul owes, built from the SAME lines the earnings page lists, so the two can never disagree. Pure: lines and recorded payments
   in, one view out. Used by fn sales-earnings (which recomputes it before recording a payment, so the browser never decides money) and
   by the screen.
   - NOW   : due today or overdue. The big number is the sum of each person's net.
   - SOON  : earned, with a date still ahead.
   - WAITING: first payment with no date yet (the four-week results have not been sent). There is no backstop.
   - HELD  : a dispute is open on it.
   ⛔ A refund on a line not yet paid comes off that line. On a line already paid it is an OFFSET, a negative item due at once, netted
   against that person's next commission and never paid out as a negative: an offset bigger than what is due carries forward.
   Pure. ⚠️ Edge-reachable: relative imports, explicit .ts. */
import type { CommissionLine } from './commission.ts';
import { BIG_MONTH_BONUS_GBP } from './commissionConfig.ts';
import { commissionPlanWords, salePlanParts } from './salePlan.ts';

export type OwedBucket = 'now' | 'soon' | 'waiting' | 'held';
export interface OwedPart { lineId: string; part: number; amount: number }
export interface OwedItem {
  /** The item's id: the payment line it comes from, or the reversal line for an offset. */
  key: string;
  bucket: OwedBucket;
  sellerId: string;
  leadId: string;
  business: string;
  plan: string | null;
  planWords: string;
  /** Plain words for what this item is. */
  label: string;
  /** Net of any refund not yet settled. Negative = an offset. */
  amount: number;
  clientAmount: number;
  rate: number;
  collectedAt: string;
  /** Null while waiting for the four-week audit. */
  payableOn: string | null;
  countdown: string;
  overdueDays: number;
  /** A plan mismatch to show beside the sale (salePlan.ts). */
  flag: string | null;
  /** What gets recorded when this item is marked paid. */
  parts: OwedPart[];
}

/** One live row of commission_line_payments. */
export interface LinePaymentRow {
  id: string;
  batch_id: string;
  line_key: string;
  part: number;
  user_id: string;
  lead_id: string | null;
  amount_gbp: number;
  business_name: string | null;
  plan: string | null;
  label: string | null;
  rate: number | null;
  client_amount_gbp: number | null;
  collected_at: string | null;
  payable_on: string | null;
  paid_at: string;
  paid_by: string;
  undone_at?: string | null;
}

export interface OwedPerson {
  sellerId: string;
  /** Never below zero. */
  owedNow: number;
  /** An offset still bigger than what is due: it comes off the next commission. Zero or negative. */
  carriedOffset: number;
  comingSoon: number;
  waiting: number;
  paidSoFar: number;
  /** The items "Mark as paid" on this person would settle. */
  nowKeys: string[];
}

/** One sale on the fixed rules, in plain progress. */
export interface OwedSale {
  leadId: string;
  sellerId: string;
  business: string;
  /** "Complete monthly · 2 of 6 paid · £50 of £150", "Complete up front · £300", "Complete monthly · client claimed · nothing payable". */
  progress: string;
  /** "+£25 big-month bonus", or null. */
  bonusWords: string | null;
  /** Earned so far, net of refunds and bonus included. Zero once a claim stops the sale. */
  earned: number;
  /** A guarantee claim: 'marked' by Paul (he can undo it), 'refunded' by Stripe. */
  claim: 'marked' | 'refunded' | null;
  /** The client can still claim: the first payment's commission has not become payable and has not been paid. */
  windowOpen: boolean;
}

export interface OwedView {
  today: string;
  totalOwedNow: number;
  people: OwedPerson[];
  /** Due now and coming soon, soonest first. */
  next: OwedItem[];
  /** Waiting for the audit, and held for a dispute. */
  quiet: OwedItem[];
  /** Every sale on the fixed rules, newest first. */
  sales: OwedSale[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayMs = (d: string) => Date.parse(`${d.slice(0, 10)}T12:00:00Z`);

/** Whole days from today to a date: 0 = today, negative = passed. */
export function daysUntil(payableOn: string, today: string): number {
  return Math.round((dayMs(payableOn) - dayMs(today)) / 86_400_000);
}

/** "in 3 days" · "tomorrow" · "due today" · "2 days overdue". */
export function countdownWords(payableOn: string | null, today: string): string {
  if (!payableOn) return 'waiting for four-week audit';
  const d = daysUntil(payableOn, today);
  if (d === 0) return 'due today';
  if (d === 1) return 'tomorrow';
  if (d > 1) return `in ${d} days`;
  return d === -1 ? '1 day overdue' : `${-d} days overdue`;
}

/** "£50" for whole pounds, "£7.58" otherwise. */
export const poundWords = (n: number): string => (Number.isInteger(round2(n)) ? `£${round2(n)}` : `£${round2(n).toFixed(2)}`);

export const BONUS_WORDS = `+£${BIG_MONTH_BONUS_GBP} big-month bonus`;

function whatItIs(l: CommissionLine): string {
  if (l.fixedRules) {
    if (l.fixedCount === 1) return l.bonus ? `One payment, ${BONUS_WORDS}` : 'One payment';
    return `Payment ${l.paymentNumber} of ${l.fixedCount}${l.bonus ? `, ${BONUS_WORDS}` : ''}`;
  }
  if (l.paymentNumber === 1) return 'First payment';
  return `Monthly payment ${l.paymentNumber - 1}`;
}

/** Each sale's plain progress. "Paid" counts the customer's payments that earned and were not taken back, not what Paul has paid the salesperson. */
export function saleProgress(input: { lines: readonly CommissionLine[]; businessOf: (leadId: string) => string; planOf: (leadId: string) => string | null }): OwedSale[] {
  const byLead = new Map<string, CommissionLine[]>();
  for (const l of input.lines) {
    if (!l.fixedRules && !(l.kind === 'reversal' && input.lines.some((x) => x.id === l.reversesLineId && x.fixedRules))) continue;
    const a = byLead.get(l.leadId) ?? []; a.push(l); byLead.set(l.leadId, a);
  }
  const out: (OwedSale & { at: string })[] = [];
  for (const [leadId, lines] of byLead) {
    const pays = lines.filter((l) => l.kind === 'payment' && l.fixedRules);
    const first = pays.find((l) => l.paymentNumber === 1);
    if (!first?.sellerId || first.testSale || pays.every((l) => l.status === 'not_commissionable')) continue;
    const plan = input.planOf(leadId);
    /* What the engine paid on, so the words can never disagree with the money. */
    const fixed = { perPayment: first.fixedPerPayment ?? 0, payments: first.fixedCount ?? 0 };
    const name = commissionPlanWords(plan);
    const claim = first.claim ?? null;
    const taken = (id: string) => lines.filter((r) => r.kind === 'reversal' && r.reversesLineId === id && !r.held && r.status !== 'not_commissionable').reduce((s, r) => s + r.commission, 0);
    const live = pays.filter((l) => l.commission > 0 && l.status !== 'cancelled' && l.status !== 'reversed' && l.status !== 'not_commissionable');
    const net = live.map((l) => round2(l.commission + taken(l.id))).filter((n) => n > 0);
    const earned = round2(net.reduce((s, n) => s + n, 0));
    const bonusKept = live.some((l) => (l.bonus ?? 0) > 0);
    const base = bonusKept ? round2(earned - BIG_MONTH_BONUS_GBP) : earned;
    const heldLines = lines.filter((r) => r.kind === 'reversal' && r.held && r.status !== 'cancelled' && r.status !== 'not_commissionable');
    const held = round2(heldLines.reduce((s, r) => s - r.commission, 0));
    const max = fixed.perPayment * fixed.payments;
    const progress = claim ? `${name} · client claimed · nothing payable`
      : earned <= 0 && !live.length ? `${name} · nothing payable`
      : fixed.payments === 1 ? `${name} · ${poundWords(base)}`
      : `${name} · ${net.length} of ${fixed.payments} paid · ${poundWords(base)} of ${poundWords(max)}`;
    out.push({
      leadId, sellerId: first.sellerId, business: input.businessOf(leadId),
      progress: held > 0 ? `${progress} · ${poundWords(held)} held` : progress,
      bonusWords: bonusKept && !claim ? BONUS_WORDS : null,
      earned, claim, windowOpen: first.status === 'pending' || (claim === 'marked' && !first.paidAmount),
      at: first.occurredAt,
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).map(({ at: _at, ...s }) => s);
}

export function buildOwed(input: {
  lines: readonly CommissionLine[];
  payments: readonly LinePaymentRow[];
  /** What older payouts recorded per person (commission_payouts). They count towards paid so far. */
  monthlyPayouts?: readonly { user_id: string; amount_gbp: number }[];
  businessOf: (leadId: string) => string;
  planOf: (leadId: string) => string | null;
  flagOf?: (leadId: string) => string | null;
  today: string;
}): OwedView {
  const { lines, today } = input;
  const live = input.payments.filter((p) => !p.undone_at);
  const paidPartsOf = (lineId: string) => live.filter((p) => p.line_key === lineId);
  const nextPart = (lineId: string) => paidPartsOf(lineId).reduce((m, p) => Math.max(m, p.part), 0) + 1;
  const reversalsOf = new Map<string, CommissionLine[]>();
  for (const l of lines) {
    if (l.kind !== 'reversal' || !l.reversesLineId) continue;
    const a = reversalsOf.get(l.reversesLineId) ?? []; a.push(l); reversalsOf.set(l.reversesLineId, a);
  }
  const items: OwedItem[] = [];
  const push = (l: CommissionLine, o: { key: string; bucket: OwedBucket; amount: number; payableOn: string | null; label: string; parts: OwedPart[] }) => {
    if (!l.sellerId) return;
    const plan = input.planOf(l.leadId);
    items.push({
      key: o.key, bucket: o.bucket, sellerId: l.sellerId, leadId: l.leadId, business: input.businessOf(l.leadId), plan, planWords: l.fixedRules ? commissionPlanWords(plan) : salePlanParts(plan).words,
      label: o.label, amount: round2(o.amount), clientAmount: l.clientAmount, rate: l.rate, collectedAt: l.occurredAt,
      payableOn: o.payableOn, countdown: countdownWords(o.payableOn, today), overdueDays: o.payableOn ? Math.max(0, -daysUntil(o.payableOn, today)) : 0,
      flag: input.flagOf?.(l.leadId) ?? null, parts: o.parts,
    });
  };

  for (const l of lines) {
    if (l.kind !== 'payment' || l.commission <= 0) continue;
    if (l.status === 'not_commissionable' || l.status === 'cancelled' || l.status === 'reversed') continue;
    const revs = reversalsOf.get(l.id) ?? [];
    const held = revs.filter((r) => r.held && r.status !== 'not_commissionable' && r.status !== 'cancelled');
    const taken = revs.filter((r) => !r.held && r.status !== 'not_commissionable' && r.status !== 'cancelled');
    if (l.status === 'paid') {
      /* Already paid: anything taken back since is an offset, and an open dispute only sits in the quiet list. */
      for (const r of taken) {
        if (r.status === 'paid') continue;
        const left = round2(r.commission - (r.paidAmount ?? 0));
        if (Math.abs(left) < 0.005) continue;
        const day = r.payoutDate;
        push(r, { key: r.id, bucket: 'now', amount: left, payableOn: day, label: `Offset: ${r.label.toLowerCase()} after it was paid`, parts: [{ lineId: r.id, part: nextPart(r.id), amount: left }] });
      }
      for (const r of held) push(r, { key: r.id, bucket: 'held', amount: r.commission, payableOn: null, label: 'Already paid, dispute open', parts: [] });
      continue;
    }
    /* Not paid yet: a partial refund comes off this same payment. */
    const net = round2(l.commission + taken.reduce((s, r) => s + r.commission, 0));
    if (net <= 0) continue;
    const parts: OwedPart[] = [{ lineId: l.id, part: nextPart(l.id), amount: l.commission }, ...taken.map((r) => ({ lineId: r.id, part: nextPart(r.id), amount: r.commission }))];
    const name = whatItIs(l) + (taken.length ? ' (part refunded)' : '');
    if (held.length) { push(l, { key: l.id, bucket: 'held', amount: net, payableOn: null, label: `${name}, dispute open`, parts: [] }); continue; }
    const hasDate = !!l.payoutDate && !l.waitingForResults && !(l.status === 'pending' && !l.approvalDay);
    if (!hasDate) { push(l, { key: l.id, bucket: 'waiting', amount: net, payableOn: null, label: name, parts: [] }); continue; }
    const payableOn = l.payoutDate;
    push(l, { key: l.id, bucket: payableOn <= today ? 'now' : 'soon', amount: net, payableOn, label: name, parts });
  }

  const sellers = new Set<string>([...items.map((i) => i.sellerId), ...live.map((p) => p.user_id), ...(input.monthlyPayouts ?? []).map((p) => p.user_id)]);
  const people: OwedPerson[] = [...sellers].map((sellerId) => {
    const mine = items.filter((i) => i.sellerId === sellerId);
    const sum = (b: OwedBucket) => round2(mine.filter((i) => i.bucket === b).reduce((s, i) => s + i.amount, 0));
    const net = sum('now');
    const paidLines = live.filter((p) => p.user_id === sellerId).reduce((s, p) => s + Number(p.amount_gbp), 0);
    const paidMonths = (input.monthlyPayouts ?? []).filter((p) => p.user_id === sellerId).reduce((s, p) => s + Number(p.amount_gbp), 0);
    return {
      sellerId, owedNow: Math.max(0, net), carriedOffset: Math.min(0, net), comingSoon: sum('soon'), waiting: sum('waiting'),
      paidSoFar: round2(paidLines + paidMonths), nowKeys: mine.filter((i) => i.bucket === 'now').map((i) => i.key),
    };
  }).sort((a, b) => b.owedNow - a.owedNow || b.comingSoon - a.comingSoon || a.sellerId.localeCompare(b.sellerId));

  const byDate = (a: OwedItem, b: OwedItem) => (a.payableOn ?? '9999').localeCompare(b.payableOn ?? '9999') || a.collectedAt.localeCompare(b.collectedAt) || a.key.localeCompare(b.key);
  return {
    today,
    totalOwedNow: round2(people.reduce((s, p) => s + p.owedNow, 0)),
    people,
    next: items.filter((i) => i.bucket === 'now' || i.bucket === 'soon').sort(byDate),
    quiet: items.filter((i) => i.bucket === 'waiting' || i.bucket === 'held').sort(byDate),
    sales: saleProgress({ lines, businessOf: input.businessOf, planOf: input.planOf }),
  };
}

export type MarkPaidRefusal = 'nothing_due' | 'not_payable' | 'changed' | 'offset_only';

/** What a "Mark as paid" settles, worked out from the fresh view. ⛔ The browser sends what it saw; a different total is refused.
 *  - A person: every item due now, offsets included, only when the net is above zero.
 *  - One line: only a positive item with a date (paying a line a little early is allowed). An offset cannot be marked on its own. */
export function planMarkPaid(view: OwedView, req: { person?: string | null; itemKey?: string | null; expectedTotal: number }): { ok: true; items: OwedItem[]; total: number } | { ok: false; error: MarkPaidRefusal } {
  let chosen: OwedItem[];
  if (req.itemKey) {
    const it = view.next.find((i) => i.key === req.itemKey);
    if (!it) return { ok: false, error: 'not_payable' };
    if (it.amount <= 0) return { ok: false, error: 'offset_only' };
    chosen = [it];
  } else if (req.person) {
    chosen = view.next.filter((i) => i.sellerId === req.person && i.bucket === 'now');
    if (!chosen.length) return { ok: false, error: 'nothing_due' };
  } else return { ok: false, error: 'nothing_due' };
  const total = round2(chosen.reduce((s, i) => s + i.amount, 0));
  if (total <= 0) return { ok: false, error: 'nothing_due' };
  if (Math.abs(total - req.expectedTotal) >= 0.005) return { ok: false, error: 'changed' };
  return { ok: true, items: chosen, total };
}

export const MARK_PAID_REFUSAL_WORDS: Record<MarkPaidRefusal, string> = {
  nothing_due: 'Nothing is due to pay right now.',
  not_payable: 'That line cannot be marked paid yet.',
  offset_only: 'An offset comes off this person’s next payment. Use Mark as paid on the person.',
  changed: 'The amount has changed since this screen loaded. Check the new figure and try again.',
};

/** One row per line a person was paid, for the history they can be shown. Newest first. */
export function paidHistory(payments: readonly LinePaymentRow[]): (LinePaymentRow & { planWords: string })[] {
  return payments.filter((p) => !p.undone_at).map((p) => ({ ...p, amount_gbp: Number(p.amount_gbp), planWords: salePlanParts(p.plan).words }))
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || a.line_key.localeCompare(b.line_key));
}
