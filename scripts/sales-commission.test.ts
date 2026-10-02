/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES COMMISSION + THE PAYMENT LEDGER (Sales Experience release 2, docs/sales-experience.md §4).
   Pins Paul's rules (src/lib/commission.ts): 30% initial, 20% × the next SIX recurring (three until 2026-10-02), always of the
   REAL amount; earned on payment; refund / chargeback reverse (an offset once paid out); payout on the
   first working day of the following month; projected never in earned; the admin's own sales earn £0.
   And the ledger's shape: idempotent by the Stripe object, recording-only in the webhook, never throws,
   Sales sees only their own, admin-only modes refused.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import {
  commissionLines, commissionOn, earningsTotals, nextPayoutDate, payoutDateFor,
  COMMISSION_INITIAL_RATE, COMMISSION_RECURRING_RATE, COMMISSION_RECURRING_COUNT, type LedgerRow, type PayoutRow,
} from "../src/lib/commission.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const REP = "rep-1", ADMIN = "admin-1";
let n = 0;
const row = (lead: string, kind: string, amount: number, at: string, extra: Partial<LedgerRow> = {}): LedgerRow => ({
  id: `r${++n}`, lead_id: lead, kind, status: "succeeded", amount_gbp: amount, occurred_at: at, stripe_object_id: `obj${n}`,
  stripe_payment_intent_id: `pi${n}`, stripe_charge_id: `ch${n}`, stripe_invoice_id: kind === "recurring" ? `in${n}` : null, sold_by_user_id: REP, ...extra,
});
const run = (ledger: LedgerRow[], payouts: PayoutRow[] = [], sellers = new Set([REP])) =>
  commissionLines({ ledger, payouts, isCommissionable: (u) => !!u && sellers.has(u) });

console.log("\n── the rates ──");
ok(COMMISSION_INITIAL_RATE === 0.3 && COMMISSION_RECURRING_RATE === 0.2 && COMMISSION_RECURRING_COUNT === 6, "30% initial, 20% × 6 recurring");
ok(commissionOn(99, 0.3) === 29.7 && commissionOn(99, 0.2) === 19.8 && commissionOn(29.99, 0.2) === 6 && commissionOn(0, 0.3) === 0, "£29.70 / £19.80 / £29.99 → £6.00 (5.998 rounds half-up)");
{
  const L = [row("a", "initial", 99, "2026-09-17T13:00:00Z"), row("a", "recurring", 99, "2026-10-29T10:00:00Z"), row("a", "recurring", 99, "2026-11-29T10:00:00Z"), row("a", "recurring", 99, "2026-12-29T10:00:00Z"), row("a", "recurring", 99, "2027-01-29T10:00:00Z"), row("a", "recurring", 99, "2027-02-28T10:00:00Z"), row("a", "recurring", 99, "2027-03-29T10:00:00Z"), row("a", "recurring", 99, "2027-04-29T10:00:00Z")];
  const { lines, clients } = run(L);
  const pays = lines.filter((l) => l.kind === "payment").sort((a, b) => a.paymentNumber - b.paymentNumber);
  ok(pays.map((l) => l.commission).join(",") === "29.7,19.8,19.8,19.8,19.8,19.8,19.8,0", "the £99 offer: 29.70, 19.80 ×6, then nothing");
  ok(Math.round(pays.reduce((s, l) => s + l.commission, 0) * 100) / 100 === 148.5, "…£148.50 maximum per client at a 30% sale");
  ok(pays[7].label === "Month 7" && pays[7].rate === 0, "the 8th payment (month 7) is shown for history at 0%");
  ok(clients[0].commissionablePaymentsLeft === 0, "no commissionable payments left after six recurring");
  const cheap = run([row("b", "initial", 99, "2026-09-17T13:00:00Z"), row("b", "recurring", 29.99, "2026-10-29T10:00:00Z")]).lines.find((l) => l.paymentNumber === 2)!;
  ok(cheap.commission === 6 && cheap.clientAmount === 29.99, "commission is 20% of the ACTUAL monthly (£29.99 → £6.00), never a fixed £19.80");
}

console.log("\n── who earns ──");
{
  const { lines } = run([row("c", "initial", 99, "2026-09-17T13:00:00Z", { sold_by_user_id: ADMIN })]);
  ok(lines[0].status === "not_commissionable" && lines[0].commission === 0, "a client sold by the admin earns £0");
  const t = earningsTotals(lines, [], [], "2026-09-28");
  ok(t.earned === 0 && t.due === 0, "…and adds nothing to earned or due");
  const none = run([row("d", "initial", 99, "2026-09-17T13:00:00Z", { sold_by_user_id: null })]);
  ok(none.lines[0].status === "not_commissionable", "no seller recorded = not commissionable (absent is never a salesperson)");
  const fallback = commissionLines({ ledger: [row("e", "initial", 99, "2026-09-17T13:00:00Z", { sold_by_user_id: null })], payouts: [], isCommissionable: (u) => u === REP, sellerOfLead: new Map([["e", REP]]) });
  ok(fallback.lines[0].commission === 29.7 && fallback.lines[0].sellerId === REP, "the lead's sold_by stamp is the fallback seller");
  const failed = run([row("f", "initial", 99, "2026-09-17T13:00:00Z", { status: "failed" })]);
  ok(failed.lines.length === 0, "a failed payment is not commissionable (only money received counts)");
}

console.log("\n── refunds, chargebacks, offsets ──");
{
  const pay = row("g", "initial", 99, "2026-09-17T13:00:00Z");
  const full = run([pay, row("g", "refund", 99, "2026-09-20T10:00:00Z", { stripe_payment_intent_id: pay.stripe_payment_intent_id, stripe_charge_id: pay.stripe_charge_id })]);
  const rev = full.lines.find((l) => l.kind === "reversal")!;
  ok(rev.commission === -29.7 && rev.label === "Refunded", "a full refund reverses the £29.70");
  ok(full.lines.find((l) => l.kind === "payment")!.status === "reversed", "…the payment line reads Reversed");
  ok(earningsTotals(full.lines, [], [], "2026-09-28").earned === 0, "…net earned is £0");
  const pay2 = row("h", "initial", 99, "2026-09-17T13:00:00Z");
  const part = run([pay2, row("h", "refund", 49.5, "2026-09-20T10:00:00Z", { stripe_charge_id: pay2.stripe_charge_id, stripe_payment_intent_id: null })]);
  ok(part.lines.find((l) => l.kind === "reversal")!.commission === -14.85 && part.lines.find((l) => l.kind === "payment")!.status === "due", "a partial refund reverses only that share (£49.50 → -£14.85); the payment stays due");
  const pay3 = row("i", "initial", 99, "2026-09-17T13:00:00Z");
  const cbOpen = run([pay3, row("i", "chargeback", 99, "2026-09-25T10:00:00Z", { kind: "chargeback", status: "needs_response", stripe_charge_id: pay3.stripe_charge_id, stripe_payment_intent_id: null })]);
  ok(cbOpen.lines.some((l) => l.kind === "reversal" && l.commission === -29.7 && l.held === true && l.label === "Held — dispute open"), "an open chargeback HOLDS the commission (Paul, 2026-09-29 — was: reversed)");
  const cbWon = run([pay3, row("i", "chargeback", 99, "2026-09-25T10:00:00Z", { kind: "chargeback", status: "won", stripe_charge_id: pay3.stripe_charge_id, stripe_payment_intent_id: null })]);
  ok(!cbWon.lines.some((l) => l.kind === "reversal"), "a WON chargeback reverses nothing");
  // Paul, 2026-09-29: open = HELD, won / inquiry closed = RELEASED, lost = REVERSED.
  const cb = (status: string) => run([pay3, row("i", "chargeback", 99, "2026-09-25T10:00:00Z", { kind: "chargeback", status, stripe_charge_id: pay3.stripe_charge_id, stripe_payment_intent_id: null })]);
  for (const s of ["warning_needs_response", "warning_under_review", "needs_response", "under_review", "some_new_status"]) {
    const x = cb(s); const l = x.lines.find((y) => y.kind === "reversal");
    const t = earningsTotals(x.lines, [], [], "2026-09-28");
    ok(!!l?.held && l.commission === -29.7 && l.label === "Held — dispute open" && x.lines.find((y) => y.kind === "payment")!.status === "due" && t.held === 29.7 && t.reversed === 0 && t.due === 0 && x.clients[0].reversed === 0, `dispute ${s}: commission HELD (off what is due, not a permanent reversal)`);
  }
  const inq = cb("warning_closed");
  ok(!inq.lines.some((l) => l.kind === "reversal") && earningsTotals(inq.lines, [], [], "2026-09-28").due === 29.7, "an inquiry that closed with no money lost RELEASES the commission");
  ok(earningsTotals(cbWon.lines, [], [], "2026-09-28").due === 29.7, "a won dispute RELEASES it (due again)");
  const lost = cb("lost"); const ll = lost.lines.find((y) => y.kind === "reversal")!;
  const tl = earningsTotals(lost.lines, [], [], "2026-09-28");
  ok(!ll.held && ll.label === "Chargeback" && lost.lines.find((y) => y.kind === "payment")!.status === "reversed" && tl.reversed === 29.7 && tl.held === 0 && lost.clients[0].reversed === 29.7, "a LOST dispute reverses the commission permanently");
  const heldAfterPayout = run([pay3, row("i", "chargeback", 99, "2026-10-05T10:00:00Z", { kind: "chargeback", status: "needs_response", stripe_charge_id: pay3.stripe_charge_id, stripe_payment_intent_id: null })], [{ user_id: REP, period_month: "2026-09-01", amount_gbp: 29.7, paid_at: "2026-10-01" }]);
  const th = earningsTotals(heldAfterPayout.lines, [{ user_id: REP, period_month: "2026-09-01", amount_gbp: 29.7, paid_at: "2026-10-01" }], [], "2026-10-06");
  ok(th.offset === -29.7 && th.held === 29.7 && th.reversed === 0, "a hold after payout sits as an offset (the existing offset logic), still not a reversal");
  const stray = run([row("j", "initial", 99, "2026-09-17T13:00:00Z"), row("j", "refund", 99, "2026-09-20T10:00:00Z", { stripe_payment_intent_id: "pi_other", stripe_charge_id: "ch_other" })]);
  ok(!stray.lines.some((l) => l.kind === "reversal"), "a refund tied to no counted payment reverses nothing we counted");
  // Paid out in September, refunded in October → an offset against the next payout.
  const pay4 = row("k", "initial", 99, "2026-09-17T13:00:00Z");
  const payouts: PayoutRow[] = [{ user_id: REP, period_month: "2026-09-01", amount_gbp: 29.7, paid_at: "2026-10-01" }];
  const off = run([pay4, row("k", "refund", 99, "2026-10-05T10:00:00Z", { stripe_payment_intent_id: pay4.stripe_payment_intent_id })], payouts);
  ok(off.lines.find((l) => l.kind === "payment")!.status === "paid", "September's commission is marked paid");
  const t = earningsTotals(off.lines, payouts, [], "2026-10-06");
  ok(t.offset === -29.7 && t.due === 0 && t.paidOut === 29.7 && t.earned === 0, "the reversal after payout is an OFFSET (-£29.70) against future commission; due never negative");
}

console.log("\n── payout dates ──");
ok(payoutDateFor("2026-09-17") === "2026-10-01", "September receipts → Thu 1 Oct");
ok(payoutDateFor("2026-07-10") === "2026-08-03", "July receipts → Mon 3 Aug (1 Aug is a Saturday)");
ok(payoutDateFor("2026-12-03") === "2027-01-04", "December receipts → Mon 4 Jan 2027 (1 Jan is a bank holiday)");
ok(payoutDateFor("2027-04-20") === "2027-05-04", "April 2027 receipts → Tue 4 May (1 May a Saturday, 3 May a bank holiday)");
ok(nextPayoutDate("2026-09-28") === "2026-10-01" && nextPayoutDate("2026-10-01") === "2026-10-01" && nextPayoutDate("2026-10-02") === "2026-11-02", "the next payout: 1 Oct; on the day itself; then Mon 2 Nov");
ok(run([row("l", "initial", 99, "2026-09-30T23:30:00Z")]).lines[0].periodMonth === "2026-10-01", "a receipt at 00:30 London on 1 Oct is October's (UK calendar), paid in November");

console.log("\n── projected is never earned ──");
{
  const { lines } = run([row("m", "initial", 99, "2026-09-17T13:00:00Z")]);
  const t = earningsTotals(lines, [], [{ leadId: "m", paymentsLeft: 3, monthlyGbp: 99, active: true }], "2026-09-28");
  ok(t.earned === 29.7 && t.projected === 59.4, "earned £29.70; projected £59.40 kept apart");
  ok(earningsTotals(lines, [], [{ leadId: "m", paymentsLeft: 3, monthlyGbp: 99, active: false }], "2026-09-28").projected === 0, "no live subscription = nothing projected");
  ok(t.earnedToday === 0 && earningsTotals(lines, [], [], "2026-09-17").earnedToday === 29.7 && t.earnedThisMonth === 29.7, "earned today / this month");
}

console.log("\n── source: the ledger and its writers ──");
{
  const mig = read("supabase/migrations/20260929130000_payment_ledger.sql");
  ok(/constraint payment_ledger_object_uq unique \(kind, stripe_object_id\)/.test(mig), "idempotent: one row per (kind, Stripe object)");
  ok(/revoke all on public\.payment_ledger from anon, authenticated/.test(mig) && /revoke all on public\.commission_payouts from anon, authenticated/.test(mig) && !/create policy/.test(mig), "service-role only: RLS on, no policies, no grants");
  const w = read("supabase/functions/_shared/payment-ledger.ts");
  ok(/export async function recordLedger[\s\S]*catch \(err\)[\s\S]*return "failed";/.test(w) && !/throw /.test(w), "the writer never throws — a ledger failure is reported, the payment path carries on");
  ok(/String\(error\.code\) === "23505"\) return "exists"/.test(w), "a concurrent duplicate insert is the idempotency working, not a failure");
  ok(/if \(w\.kind === "refund" && row\.amount_gbp > Number\(e\.amount_gbp\)\)/.test(w), "a refund row only grows (cumulative, out-of-order safe)");
  const hook = read("supabase/functions/stripe-webhook/index.ts");
  const i = hook.indexOf('"findable lead -> payment_received",'), j = hook.indexOf('kind: "initial"');
  ok(i > 0 && j > i, "the initial payment is recorded AFTER the payment write (so the seller is already stamped)");
  ok(/if \(paidMinor > 0\)[\s\S]{0,400}kind: "recurring"/.test(hook), "a £0 trial invoice is never a payment");
  ok(/case "charge\.dispute\.created":\s*\n\s*case "charge\.dispute\.updated":\s*\n\s*case "charge\.dispute\.closed":/.test(hook), "chargebacks are recorded from the dispute events");
  ok((hook.match(/await recordLedger\(/g) ?? []).length === 4, "four recording points: initial, recurring, refund, chargeback");
  const fn = read("supabase/functions/sales-earnings/index.ts");
  ok(/if \(actor\.role === "sales"\) personId = actor\.id;/.test(fn), "a salesperson always gets their own earnings");
  ok(/if \(actor\.role !== "admin"\) return await adminOnly\(\);/.test(fn) && fn.indexOf('mode === "record_payout"') > fn.indexOf('actor.role !== "admin"'), "payouts, backfill and webhook config are admin-only, checked before any of them");
  ok(/body\.apply === true/.test(fn), "backfill only writes when asked (apply: true); the default reports");
  ok(!/method: "POST"/.test(fn.slice(fn.indexOf("async function stripeGet"), fn.indexOf("export const DISPUTE_EVENTS"))), "Stripe is only READ (GET) by the backfill");
  const add = fn.slice(fn.indexOf('if (mode === "webhook_enable_disputes")'), fn.indexOf('if (mode === "webhook_config")'));
  ok(/\[\.\.\.new Set\(\[\.\.\.before, \.\.\.DISPUTE_EVENTS\]\)\]/.test(add) && /eps\.length !== 1/.test(add), "enabling disputes only ADDS the three events to the one stripe-webhook endpoint, keeping the rest");
  ok((fn.match(/method: "POST"/g) ?? []).length === 1 && fn.indexOf('method: "POST"') > fn.indexOf("async function stripeAddEvents"), "the only Stripe write is that event list");
  ok(/if \(!leadId\) \{ unmatched\.push/.test(fn), "a charge it cannot place is reported, never invented");
  const cfg = read("supabase/config.toml");
  ok(/\[functions\.sales-earnings\]\nverify_jwt = true/.test(cfg), "the new function has its config.toml entry");
}

console.log("\n── the one-time celebration ──");
{
  const c = read("src/components/salesDash/EarnedCelebration.tsx");
  const claim = c.indexOf("commission_seen_at: newest"), show = c.indexOf("setShow({ amount");
  ok(claim > 0 && show > claim, "the newest commission is CLAIMED before it is shown — a reload or second tab never replays it");
  ok(/l\.kind === 'payment' && l\.commission > 0 && \(l\.status === 'due' \|\| l\.status === 'paid'\)/.test(c), "only real earned commission celebrates — never a reversal, projected or £0 line");
  ok(/prefers-reduced-motion: reduce/.test(c), "reduced motion: no count-up");
  /* 2026-10-01: Earnings is part of the Sales page (one page, one celebration, one earnings read). */
  const dash = read("src/pages/SalesDashboard.tsx");
  ok(/<EarnedCelebration lines=\{e\?\.lines\} enabled=\{viewingSelf && !!e\?\.commissionable\} \/>/.test(dash) && (dash.match(/<EarnedCelebration/g) ?? []).length === 1, "once, and only on your own numbers (never the admin viewing a rep)");
  ok(/useEarnings\(isAdmin \? person : 'me'\)/.test(dash) && (dash.match(/useEarnings\(/g) ?? []).length === 1, "the page's commission comes from one earnings read (one function, one rule)");
  ok(/<Route path="\/earnings" element=\{<Navigate to="\/sales-dashboard" replace \/>\} \/>/.test(read("src/App.tsx")), "/earnings (old links, notifications) opens the Sales page");
}

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
