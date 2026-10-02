// LOAD A PERSON'S EARNINGS (Sales Experience, 2026-09-28). The one server path from the payment ledger
// to commission: fn sales-earnings (the Earnings page, payouts) and fn sales-performance (the dashboard's
// milestone and commission target) both call it, so the two can never disagree.
// ⛔ Service role, and SCOPED HERE: personId null = everyone (the caller must be the admin — the callers
// decide that before calling); a person = the clients THEY sold (ledger snapshot, else the lead's stamp).
// 🔴 WHO EARNS (2026-10-02): a salesperson, OR a former one — a team member whose engagement ENDED
// (team_members.status 'disabled'; disabling removes the sales role). Keying this on the sales role alone
// would zero every penny an ended salesperson had already earned. WHEN they were engaged comes from the
// append-only, server-timed engagement log (team_engagement_events; engagementTimelines below), and each
// payment is judged at its own time (src/lib/commission.ts engagedAt) — a re-enable never reaches back.
// A first payment after an end still earns when the seller closed the sale while engaged: a payment link
// they generated (quick_close_events link_generated / link_reused). The admin never earns.
import {
  commissionForecast, commissionLines, commissionOn, earningsTotals, engagementEndedNow, COMMISSION_RECURRING_RATE, ENGAGEMENT_END_UNKNOWN,
  type CommissionForecast, type EngagementEvent, type SaleClosing, type CommissionLine, type ClientEarnings, type EarningsTotals, type LedgerRow, type PayoutRow, type ProjectionInput,
} from "../../../src/lib/commission.ts";
import { FINDABLE_MONTHLY_GBP, SERVICE_ROUTE_NAME, serviceRouteForTotal } from "../../../src/lib/findableOffer.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface Engagement { status: "active" | "ended"; endedAt: string | null }

export interface Earnings {
  lines: CommissionLine[];
  clients: (ClientEarnings & { remainingPotential: number; subscriptionStatus: string | null; package: string | null })[];
  totals: EarningsTotals;
  /** Whether this person earns commission at all (a salesperson, current or former). False for the admin's own sales. */
  commissionable: boolean;
  bySeller: { sellerId: string; earned: number; due: number; offset: number; paidOut: number }[];
  /** The next six London months (2026-10-02): earned so far + expected from clients already sold. */
  forecast: CommissionForecast;
  /** The viewed person's engagement (null for "everyone"): ended = no new trailing commission from endedAt. */
  engagement: Engagement | null;
}

const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due"]);
/** The forecast expects a payment only from a subscription in good standing: past due is a payment that
 *  has already failed, so it expects nothing until Stripe collects it (and the ledger then shows it). */
const FORECAST_LIVE = new Set(["active", "trialing"]);
const round2 = (n: number) => Math.round(n * 100) / 100;

export type TeamRow = { user_id: string; status: string | null; disabled_at: string | null; is_book_owner: boolean | null };

export type EngagementRow = { user_id: string; kind: string; at: string };

/** Each member's engagement history, oldest first, from the log. ⛔ A member who is DISABLED now but whose
 *  history does not end in an 'ended' (a disable from before the log, or a failed log write) gets one at
 *  disabled_at — or ENGAGEMENT_END_UNKNOWN (not engaged at any time) — never "still engaged". The book owner
 *  has no history (and never earns). */
export function engagementTimelines(team: TeamRow[], log: EngagementRow[]): Map<string, EngagementEvent[]> {
  const out = new Map<string, EngagementEvent[]>();
  for (const r of [...log].sort((a, b) => a.at.localeCompare(b.at))) {
    if (r.kind !== "ended" && r.kind !== "resumed") continue;
    const a = out.get(r.user_id) ?? []; a.push({ kind: r.kind, at: r.at }); out.set(r.user_id, a);
  }
  for (const t of team) {
    if (t.is_book_owner) { out.delete(t.user_id); continue; }
    if (t.status !== "disabled") continue;
    const a = out.get(t.user_id) ?? [];
    if (!a.length || a[a.length - 1].kind !== "ended") {
      const last = a.length ? a[a.length - 1].at : null;
      const at = t.disabled_at && (!last || t.disabled_at > last) ? t.disabled_at : (last ?? ENGAGEMENT_END_UNKNOWN);
      a.push({ kind: "ended", at });
    }
    out.set(t.user_id, a);
  }
  return out;
}

/** "ended" while the newest event is an end (endedAt = its time), else "active". */
export function engagementOf(events: EngagementEvent[] | undefined): Engagement {
  return engagementEndedNow(events) ? { status: "ended", endedAt: events![events!.length - 1].at } : { status: "active", endedAt: null };
}

export async function loadEarnings(service: Service, personId: string | null, todayIso: string): Promise<Earnings> {
  const [ledgerRes, rolesRes, payoutsRes, teamRes, logRes] = await Promise.all([
    service.from("payment_ledger").select("id, lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id, sold_by_user_id, commission_rule, commission_month_start, commission_month_seq, commission_rate").order("occurred_at").limit(10000),
    service.from("user_roles").select("user_id, role"),
    service.from("commission_payouts").select("user_id, period_month, amount_gbp, paid_at"),
    service.from("team_members").select("user_id, status, disabled_at, is_book_owner"),
    service.from("team_engagement_events").select("user_id, kind, at").order("at").limit(10000),
  ]);
  for (const r of [ledgerRes, rolesRes, payoutsRes, teamRes, logRes]) if (r.error) throw new Error(r.error.message);
  const ledger = ((ledgerRes.data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount_gbp: Number(r.amount_gbp) }));
  const roles = (rolesRes.data ?? []) as { user_id: string; role: string }[];
  const admins = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
  const team = (teamRes.data ?? []) as TeamRow[];
  const timelines = engagementTimelines(team, (logRes.data ?? []) as EngagementRow[]);
  for (const a of admins) timelines.delete(a);
  /* A salesperson now, or a member whose engagement is ended (Disable removed the role; what they earned
     stays theirs). */
  const disabledNow = team.filter((t) => t.status === "disabled" && !t.is_book_owner).map((t) => t.user_id);
  const sales = new Set([...roles.filter((r) => r.role === "sales").map((r) => r.user_id), ...disabledNow]);
  for (const a of admins) sales.delete(a);
  const leadIds = [...new Set(ledger.map((r) => r.lead_id).filter((x): x is string => !!x))];
  type LeadBits = { business_name: string | null; sold_by_user_id: string | null; subscription_status: string | null; contract_total_payments: number | null; subscription_renews_at: string | null };
  const leads = new Map<string, LeadBits>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data, error } = await service.from("outreach_leads").select("id, business_name, sold_by_user_id, subscription_status, contract_total_payments, subscription_renews_at").in("id", leadIds.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const l of (data ?? []) as (LeadBits & { id: string })[]) leads.set(l.id, l);
  }
  /* The proof a sale was closed: the payment links generated for each lead (server-written, server-timed). */
  const closings = new Map<string, SaleClosing[]>();
  for (let i = 0; i < leadIds.length; i += 150) {
    const { data, error } = await service.from("quick_close_events").select("lead_id, actor_user_id, created_at")
      .in("kind", ["link_generated", "link_reused"]).in("lead_id", leadIds.slice(i, i + 150)).limit(10000);
    if (error) throw new Error(error.message);
    for (const e of (data ?? []) as { lead_id: string; actor_user_id: string | null; created_at: string }[]) {
      const a = closings.get(e.lead_id) ?? []; a.push({ actorUserId: e.actor_user_id, at: e.created_at }); closings.set(e.lead_id, a);
    }
  }
  const sellerOfLead = new Map([...leads].map(([id, l]) => [id, l.sold_by_user_id]));
  const all = commissionLines({
    ledger, payouts: ((payoutsRes.data ?? []) as PayoutRow[]).map((p) => ({ ...p, amount_gbp: Number(p.amount_gbp) })),
    isCommissionable: (u) => !!u && sales.has(u),
    sellerOfLead, businessName: new Map([...leads].map(([id, l]) => [id, l.business_name ?? "Client"])),
    contractTotalOf: new Map([...leads].map(([id, l]) => [id, l.contract_total_payments ?? null])),
    engagement: timelines, closings,
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
    const route = serviceRouteForTotal(leads.get(c.leadId)?.contract_total_payments ?? null);
    return { ...c, subscriptionStatus: status, package: route ? SERVICE_ROUTE_NAME[route] : null, remainingPotential: active ? round2(c.commissionablePaymentsLeft * commissionOn(monthly, COMMISSION_RECURRING_RATE)) : 0, _proj: { leadId: c.leadId, paymentsLeft: c.commissionablePaymentsLeft, monthlyGbp: monthly, active } as ProjectionInput };
  });
  const totals = earningsTotals(lines, payouts, clients.map((c) => c._proj), todayIso);
  const sellers = [...new Set(lines.map((l) => l.sellerId).filter((s): s is string => !!s && sales.has(s)))];
  const bySeller = sellers.map((s) => {
    const t = earningsTotals(lines.filter((l) => l.sellerId === s), payouts.filter((p) => p.user_id === s), [], todayIso);
    return { sellerId: s, earned: t.earned, due: t.due, offset: t.offset, paidOut: t.paidOut };
  });
  /* Expected only from a salesperson's own commissionable clients — commissionablePaymentsLeft is 0 for
     anything else (the admin's own sales, an ended seller's clients), so those forecast nothing. */
  const forecast = commissionForecast(lines, clients.map((c) => {
    const l = leads.get(c.leadId);
    return {
      leadId: c.leadId, business: l?.business_name ?? "Client", nextPaymentAt: l?.subscription_renews_at ?? null,
      paymentsLeft: c.commissionablePaymentsLeft, monthlyGbp: c._proj.monthlyGbp, live: !!l?.subscription_status && FORECAST_LIVE.has(l.subscription_status),
    };
  }), todayIso);
  return {
    lines, totals, bySeller, forecast,
    clients: clients.map(({ _proj: _p, ...c }) => c),
    commissionable: personId === null ? true : sales.has(personId),
    engagement: personId === null ? null : engagementOf(timelines.get(personId)),
  };
}
