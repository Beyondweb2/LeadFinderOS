// THE PAYMENT LEDGER WRITER (Sales Experience, 2026-09-28; migration 20260929130000).
//
// ⛔ RECORDING ONLY. Nothing here charges, refunds, cancels or changes what a customer pays. It writes a
// row describing money that ALREADY moved in Stripe, and it NEVER throws: a ledger failure is recorded
// to client_error_reports and the caller carries on — the payment path must never fail because the
// ledger did.
// ⛔ IDEMPOTENT: unique (kind, stripe_object_id). A payment row is inserted once (a retry is ignored);
// a refund row carries the charge's CUMULATIVE refunded amount and only ever grows; a chargeback row
// takes the dispute's latest status.

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
      if (!error) return "inserted";
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
