// THE PAYMENT LEDGER WRITER (Sales Experience, 2026-09-28; migration 20260929130000).
//
// ⛔ RECORDING ONLY. Nothing here charges, refunds, cancels or changes what a customer pays. It writes a
// row describing money that ALREADY moved in Stripe, and it NEVER throws: a ledger failure is recorded
// to client_error_reports and the caller carries on — the payment path must never fail because the
// ledger did.
// ⛔ IDEMPOTENT: unique (kind, stripe_object_id). A payment row is inserted once (a retry is ignored);
// a refund row carries the charge's CUMULATIVE refunded amount and only ever grows; a chargeback row
// takes the dispute's latest status.

import { commissionLines, type LedgerRow } from "../../../src/lib/commission.ts";
import { approvalDay } from "../../../src/lib/clientTimeline.ts";
import { isServiceRoute } from "../../../src/lib/findableOffer.ts";
import { loadAttributionHolds } from "./earnings.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface LedgerWrite {
  lead_id: string | null;
  kind: "initial" | "recurring" | "refund" | "chargeback";
  status?: string;
  amount_gbp: number;
  currency?: string | null;
  occurred_at: string;
  stripe_object_id: string;
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_event_id?: string | null;
  source?: "webhook" | "backfill";
  note?: string | null;
}

export type LedgerOutcome = "inserted" | "exists" | "updated" | "failed";

async function report(service: Service, context: Record<string, unknown>) {
  try {
    await service.from("client_error_reports").insert({ error_id: "payment_ledger_write_failed", context: { ...context, at: new Date().toISOString() } });
  } catch { /* the report is best-effort; the console line below is the last resort */ }
  console.error("[payment-ledger] write failed", JSON.stringify(context).slice(0, 500));
}

export async function recordLedger(service: Service, w: LedgerWrite): Promise<LedgerOutcome> {
  try {
    if (!w.stripe_object_id || !(w.amount_gbp >= 0) || !w.occurred_at) return "failed";
    let soldBy: string | null = null;
    if (w.lead_id) {
      const { data } = await service.from("outreach_leads").select("sold_by_user_id").eq("id", w.lead_id).maybeSingle();
      soldBy = (data as { sold_by_user_id?: string | null } | null)?.sold_by_user_id ?? null;
    }
    const row = {
      lead_id: w.lead_id, kind: w.kind, status: w.status ?? "succeeded",
      amount_gbp: Math.round(w.amount_gbp * 100) / 100, currency: (w.currency ?? "gbp").toLowerCase(),
      occurred_at: w.occurred_at, stripe_object_id: w.stripe_object_id,
      stripe_payment_intent_id: w.stripe_payment_intent_id ?? null, stripe_charge_id: w.stripe_charge_id ?? null,
      stripe_invoice_id: w.stripe_invoice_id ?? null, stripe_customer_id: w.stripe_customer_id ?? null,
      stripe_event_id: w.stripe_event_id ?? null, sold_by_user_id: soldBy, source: w.source ?? "webhook", note: w.note ?? null,
    };
    const { data: existing, error: readErr } = await service.from("payment_ledger")
      .select("id, amount_gbp, status, lead_id").eq("kind", w.kind).eq("stripe_object_id", w.stripe_object_id).maybeSingle();
    if (readErr) { await report(service, { step: "read", kind: w.kind, object: w.stripe_object_id, error: readErr.message }); return "failed"; }
    if (!existing) {
      const { error } = await service.from("payment_ledger").insert(row);
      if (!error) {
        // A backfill records HISTORY: it never announces an old payment as news.
        if (row.source !== "backfill") await notifyMoney(service, row.lead_id, w.kind, w.stripe_object_id);
        return "inserted";
      }
      // A concurrent delivery won the insert: that is the idempotency working, not a failure.
      if (String(error.code) === "23505") return "exists";
      await report(service, { step: "insert", kind: w.kind, object: w.stripe_object_id, error: error.message });
      return "failed";
    }
    const e = existing as { id: string; amount_gbp: number | string; status: string; lead_id: string | null };
    const patch: Record<string, unknown> = {};
    if (w.kind === "refund" && row.amount_gbp > Number(e.amount_gbp)) patch.amount_gbp = row.amount_gbp;
    if (w.kind === "chargeback" && row.status !== e.status) { patch.status = row.status; patch.amount_gbp = row.amount_gbp; }
    if (!e.lead_id && row.lead_id) { patch.lead_id = row.lead_id; patch.sold_by_user_id = soldBy; }
    if (Object.keys(patch).length === 0) return "exists";
    const { error: upErr } = await service.from("payment_ledger").update(patch).eq("id", e.id);
    if (upErr) { await report(service, { step: "update", kind: w.kind, object: w.stripe_object_id, error: upErr.message }); return "failed"; }
    return "updated";
  } catch (err) {
    await report(service, { step: "exception", kind: w.kind, object: w.stripe_object_id, error: err instanceof Error ? err.message : String(err) });
    return "failed";
  }
}

/* ══ MONEY NOTIFICATIONS (Sales Experience release 3) ══════════════════════════════════════════════
   Written here, beside the ledger, because the amount is the COMMISSION RULE's (src/lib/commission.ts)
   and that rule must never be re-implemented in SQL. Only on a NEW ledger row — a retried webhook
   inserts nothing and so notifies nothing; the unique dedupe key is the second lock. Never throws.
   - the seller (a salesperson): "+£29.70 commission earned" (or reversed), deep-linked to the Sales page (/sales-dashboard; /earnings redirects there);
   - the book owner (admin): "Client paid", deep-linked to the client hub. */
/** The label as part of a sentence: only its first letter lowered (month names keep their capital). */
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

async function notifyMoney(service: Service, leadId: string | null, kind: string, objectId: string) {
  try {
    if (!leadId) return;
    const [{ data: rows }, { data: lead }, { data: owner }] = await Promise.all([
      service.from("payment_ledger").select("id, lead_id, kind, status, amount_gbp, occurred_at, stripe_object_id, stripe_payment_intent_id, stripe_charge_id, stripe_invoice_id, sold_by_user_id, commission_rule, commission_month_start, commission_month_seq, commission_rate").eq("lead_id", leadId),
      service.from("outreach_leads").select("business_name, sold_by_user_id, service_terminated_at, status, remeasure_results_sent_at").eq("id", leadId).maybeSingle(),
      service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle(),
    ]);
    const ledger = ((rows ?? []) as LedgerRow[]).map((r) => ({ ...r, amount_gbp: Number(r.amount_gbp) }));
    const seller = ledger.find((r) => r.sold_by_user_id)?.sold_by_user_id ?? (lead as { sold_by_user_id?: string | null } | null)?.sold_by_user_id ?? null;
    let sellerIsSales = false;
    if (seller) { const { data: r } = await service.from("user_roles").select("role").eq("user_id", seller).eq("role", "sales").maybeSingle(); sellerIsSales = !!r; }
    /* The client's end decides too (pre-sales fix 03): a payment after it never announces commission. */
    const L = lead as { service_terminated_at?: string | null; status?: string | null; remeasure_results_sent_at?: string | null } | null;
    /* 🔴 v3 (2026-10-05): a client on the v3 terms has their initial commission PENDING until the Approval
       Date — the notice must say so, never "earned". Read the same facts the earnings page reads. */
    const termsOf = new Map<string, { terms: string | null; approvalDay: string | null }>();
    {
      const { data: tr, error: tErr } = await service.from("client_service_terms").select("commercial_terms, service_route, initial_paid_at, access_date, guarantee_ceased_at").eq("lead_id", leadId).maybeSingle();
      /* Unreadable terms → no commission notice at all (never a wrong "earned"); the ledger row stands. */
      if (tErr && (tErr as { code?: string }).code !== "42P01") { console.error("[payment-ledger] terms unreadable, notice skipped:", tErr.message); return; }
      const r = tr as { commercial_terms: string; service_route: string | null; initial_paid_at: string | null; access_date: string | null; guarantee_ceased_at: string | null } | null;
      if (r) termsOf.set(leadId, { terms: r.commercial_terms, approvalDay: approvalDay({ terms: r.commercial_terms, route: isServiceRoute(r.service_route) ? r.service_route : null, initialPaidAt: r.initial_paid_at, accessDate: r.access_date, resultsSentAt: L?.remeasure_results_sent_at ?? null, guaranteeCeasedAt: r.guarantee_ceased_at }) });
    }
    /* ⛔ The attribution hold (F + H integration): a sale under review announces NO commission to anyone.
       Unreadable → no notice at all (never a wrong "earned"); the ledger row stands. */
    let attributionOf: Map<string, { status: string; resolvedAt: string | null }>;
    try { attributionOf = await loadAttributionHolds(service, leadId); }
    catch (e) { console.error("[payment-ledger] attribution unreadable, notice skipped:", e instanceof Error ? e.message : String(e)); return; }
    const { lines } = commissionLines({
      ledger, payouts: [], isCommissionable: (u) => !!u && u === seller && sellerIsSales,
      clientStateOf: new Map([[leadId, { endedAt: L?.service_terminated_at ?? null, refunded: L?.status === "refunded" }]]),
      termsOf, attributionOf,
    });
    const me = ledger.find((r) => r.kind === kind && r.stripe_object_id === objectId);
    if (!me) return;
    const line = lines.find((l) => l.id === (kind === "refund" || kind === "chargeback" ? `rev:${me.id}` : `pay:${me.id}`));
    const biz = String((lead as { business_name?: string | null } | null)?.business_name ?? "A client").trim() || "A client";
    const out: Record<string, unknown>[] = [];
    if (sellerIsSales && seller && line && line.commission !== 0 && line.status === "pending") {
      out.push({ user_id: seller, kind: "commission_earned", title: `+£${line.commission.toFixed(2)} commission pending`, body: `${biz} paid £${line.clientAmount.toFixed(2)} (${Math.round(line.rate * 100)}%, provisional). It is approved the day after the client's refund window closes${line.approvalDay ? ` (${line.approvalDay})` : ""}.`, link: "/sales-dashboard", lead_id: leadId, priority: 2, dedupe_key: `commission:${me.id}` });
    } else if (sellerIsSales && seller && line && line.commission !== 0 && line.status !== "cancelled") {
      out.push(line.commission > 0
        ? { user_id: seller, kind: "commission_earned", title: `+£${line.commission.toFixed(2)} commission earned`, body: `${biz} paid £${line.clientAmount.toFixed(2)} (${lower(line.label)}, ${Math.round(line.rate * 100)}%).`, link: "/sales-dashboard", lead_id: leadId, priority: 2, dedupe_key: `commission:${me.id}` }
        : { user_id: seller, kind: "commission_reversed", title: `−£${(-line.commission).toFixed(2)} commission reversed`, body: `${biz}: ${lower(line.label)}.`, link: "/sales-dashboard", lead_id: leadId, priority: 2, dedupe_key: `commission:${me.id}` });
    }
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (ownerId && (kind === "initial" || kind === "recurring")) {
      out.push({ user_id: ownerId, kind: "client_paid", title: "Client paid", body: `${biz} paid £${me.amount_gbp.toFixed(2)} (${kind === "initial" ? "sign-up" : "monthly"}).`, link: `/paid-clients/${leadId}`, lead_id: leadId, priority: 2, dedupe_key: `paid:${me.id}` });
    }
    if (out.length) await service.from("notifications").upsert(out, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  } catch (err) {
    console.error("[payment-ledger] notify failed", err instanceof Error ? err.message : String(err));
  }
}

/** A Stripe id from a string or an expanded object. */
export const stripeIdOf = (v: unknown): string | null =>
  typeof v === "string" ? v : (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);

/** The lead a Stripe payment belongs to, from what the ledger and the CRM already hold — never a guess. */
export async function leadForPayment(service: Service, ids: { paymentIntent?: string | null; charge?: string | null; invoice?: string | null; customer?: string | null }): Promise<string | null> {
  for (const [col, v] of [["stripe_payment_intent_id", ids.paymentIntent], ["stripe_charge_id", ids.charge], ["stripe_invoice_id", ids.invoice]] as const) {
    if (!v) continue;
    const { data } = await service.from("payment_ledger").select("lead_id").eq(col, v).not("lead_id", "is", null).limit(1);
    const id = ((data ?? [])[0] as { lead_id?: string } | undefined)?.lead_id;
    if (id) return id;
  }
  if (ids.paymentIntent) {
    const { data } = await service.from("outreach_leads").select("id").eq("stripe_payment_intent_id", ids.paymentIntent).limit(2);
    if ((data ?? []).length === 1) return (data as { id: string }[])[0].id;
  }
  return null;
}
