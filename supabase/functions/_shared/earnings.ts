// LOAD A PERSON'S EARNINGS (Sales Experience, 2026-09-28). The one server path from the payment ledger
// to commission: fn sales-earnings (the Earnings page, payouts) and fn sales-performance (the dashboard's
// milestone and commission target) both call it, so the two can never disagree.
// ⛔ Service role, and SCOPED HERE: personId null = everyone (the caller must be the admin — the callers
// decide that before calling); a person = the clients THEY sold (ledger snapshot, else the lead's stamp).
import {
  commissionLines, commissionOn, earningsTotals, COMMISSION_RECURRING_RATE,
  type CommissionLine, type ClientEarnings, type EarningsTotals, type LedgerRow, type PayoutRow, type ProjectionInput,
} from "../../../src/lib/commission.ts";
import { FINDABLE_MONTHLY_GBP } from "../../../src/lib/findableOffer.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface Earnings {
  lines: CommissionLine[];
  clients: (ClientEarnings & { remainingPotential: number; subscriptionStatus: string | null })[];
  totals: EarningsTotals;
  /** Whether this person earns commission at all (a salesperson). False for the admin's own sales. */
  commissionable: boolean;
  bySeller: { sellerId: string; earned: number; due: number; offset: number; paidOut: number }[];
}

const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function loadEarnings(service: Service, personId: string | null, todayIso: string): Promise<Earnings> {
  const [ledgerRes, rolesRes, payoutsRes] = await Promise.all([
    service.from("payment_ledger").select("id, lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id, sold_by_user_id").order("occurred_at").limit(10000),
    service.from("user_roles").select("user_id, role"),
    service.from("commission_payouts").select("user_id, period_month, amount_gbp, paid_at"),
  ]);
  for (const r of [ledgerRes, rolesRes, payoutsRes]) if (r.error) throw new Error(r.error.message);
  const ledger = ((ledgerRes.data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount_gbp: Number(r.amount_gbp) }));
  const sales = new Set(((rolesRes.data ?? []) as { user_id: string; role: string }[]).filter((r) => r.role === "sales").map((r) => r.user_id));
  const leadIds = [...new Set(ledger.map((r) => r.lead_id).filter((x): x is string => !!x))];
  const leads = new Map<string, { business_name: string | null; sold_by_user_id: string | null; subscription_status: string | null }>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data, error } = await service.from("outreach_leads").select("id, business_name, sold_by_user_id, subscription_status").in("id", leadIds.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const l of (data ?? []) as { id: string; business_name: string | null; sold_by_user_id: string | null; subscription_status: string | null }[]) leads.set(l.id, l);
  }
  const sellerOfLead = new Map([...leads].map(([id, l]) => [id, l.sold_by_user_id]));
  const all = commissionLines({
    ledger, payouts: ((payoutsRes.data ?? []) as PayoutRow[]).map((p) => ({ ...p, amount_gbp: Number(p.amount_gbp) })),
    isCommissionable: (u) => !!u && sales.has(u),
    sellerOfLead, businessName: new Map([...leads].map(([id, l]) => [id, l.business_name ?? "Client"])),
  });
  const mine = (seller: string | null) => personId === null || seller === personId;
  const lines = all.lines.filter((l) => mine(l.sellerId));
  const payouts = ((payoutsRes.data ?? []) as PayoutRow[]).map((p) => ({ ...p, amount_gbp: Number(p.amount_gbp) })).filter((p) => personId === null || p.user_id === personId);
  const lastRecurring = new Map<string, number>();
  for (const r of ledger) if (r.lead_id && r.kind === "recurring" && r.status === "succeeded") lastRecurring.set(r.lead_id, r.amount_gbp);
  const clients = all.clients.filter((c) => mine(c.sellerId)).map((c) => {
    const status = leads.get(c.leadId)?.subscription_status ?? null;
    const monthly = lastRecurring.get(c.leadId) ?? FINDABLE_MONTHLY_GBP;
    const active = !!status && LIVE_SUBSCRIPTION.has(status);
    return { ...c, subscriptionStatus: status, remainingPotential: active ? round2(c.commissionablePaymentsLeft * commissionOn(monthly, COMMISSION_RECURRING_RATE)) : 0, _proj: { leadId: c.leadId, paymentsLeft: c.commissionablePaymentsLeft, monthlyGbp: monthly, active } as ProjectionInput };
  });
  const totals = earningsTotals(lines, payouts, clients.map((c) => c._proj), todayIso);
  const sellers = [...new Set(lines.map((l) => l.sellerId).filter((s): s is string => !!s && sales.has(s)))];
  const bySeller = sellers.map((s) => {
    const t = earningsTotals(lines.filter((l) => l.sellerId === s), payouts.filter((p) => p.user_id === s), [], todayIso);
    return { sellerId: s, earned: t.earned, due: t.due, offset: t.offset, paidOut: t.paidOut };
  });
  return {
    lines, totals, bySeller,
    clients: clients.map(({ _proj: _p, ...c }) => c),
    commissionable: personId === null ? true : sales.has(personId),
  };
}
