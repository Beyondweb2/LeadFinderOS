// payment-state — THE WRITES A PAYMENT EVENT MAY MAKE TO A CLIENT'S STATE (pre-sales fix 03, 2026-10-04).
//
// The rule is src/lib/paymentState.ts; this is its database half, kept in one place so stripe-webhook's
// checkout path and the tests exercise the SAME code.
//
// ⛔ CONDITIONAL WRITES, NEVER READ-THEN-WRITE. The first-payment patch carries the rule's conditions as
//   filters on the UPDATE itself: exactly one delivery of an event can establish the payment, and a lead
//   that is already paid, refunded or ended matches nothing and is left exactly as it is.
// ⛔ "MATCHED NOTHING" IS NOT AUTOMATICALLY FINE. It is a replay only when the row EXISTS; a row that does
//   not exist is money taken with nowhere to record it, and that throws (the caller's mustWrite contract:
//   recorded to client_error_reports by the caller, then a 500 so Stripe retries).
import {
  FIRST_PAYMENT_FILTERS, ONBOARDING_NOT_PAID_FILTER, firstPaymentPatch, stripeIdFillPatch,
  type PaymentFacts, type PaymentStateLead,
} from "../../../src/lib/paymentState.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export type EstablishOutcome =
  | { kind: "first" }
  | { kind: "replay"; lead: PaymentStateLead & { payment_date?: string | null } };

const READ_COLUMNS = "id,amount_paid,status,payment_date,service_terminated_at,stripe_customer_id,stripe_payment_intent_id";

/** Establish the paid state on the lead — or recognise a replay and leave the state alone. */
export async function establishLeadPayment(service: Service, leadId: string, facts: PaymentFacts): Promise<EstablishOutcome> {
  const { data: won, error } = await service.from("outreach_leads")
    .update(firstPaymentPatch(facts))
    .eq("id", leadId)
    .or(FIRST_PAYMENT_FILTERS.amountUnpaid)
    .or(FIRST_PAYMENT_FILTERS.notRefunded)
    .is(FIRST_PAYMENT_FILTERS.notEnded, null)
    .select("id");
  if (error) throw new Error(`findable lead -> payment_received failed: ${error.message}`);
  const first = Array.isArray(won) && won.length > 0;

  /* The Stripe ids: filled where blank, on the first delivery and on any later one (a first delivery
     that died before this line is completed by its retry). Never over a stored id. Non-fatal by
     design, as before: these columns must never be the reason a recorded payment is retried. */
  const { data: now, error: readErr } = await service.from("outreach_leads").select(READ_COLUMNS).eq("id", leadId).maybeSingle();
  if (readErr) throw new Error(`findable lead read-back failed: ${readErr.message}`);
  if (!now) throw new Error(`findable lead -> payment_received matched no row (outreach_leads ${leadId})`);
  const ids = stripeIdFillPatch(now as PaymentStateLead, facts);
  if (Object.keys(ids).length) {
    const { error: idErr } = await service.from("outreach_leads").update(ids).eq("id", leadId);
    if (idErr) console.error(`[payment-state] could not store the Stripe ids for lead ${leadId}: ${idErr.message} - the payment IS recorded`);
  }
  return first ? { kind: "first" } : { kind: "replay", lead: now as PaymentStateLead & { payment_date?: string | null } };
}

/** Move the paid-for onboarding row to `paid` — once. A row already in a paid-family status (paid,
 *  in delivery, completed, refunded …) is never moved back. Throws when the row does not exist. */
export async function markOnboardingPaid(service: Service, onboardingId: string, nowIso: string): Promise<"moved" | "kept"> {
  const { data: moved, error } = await service.from("onboarding_responses")
    .update({ status: "paid", updated_at: nowIso })
    .eq("id", onboardingId)
    .or(ONBOARDING_NOT_PAID_FILTER)
    .select("id");
  if (error) throw new Error(`findable onboarding -> paid failed: ${error.message}`);
  if (Array.isArray(moved) && moved.length > 0) return "moved";
  const { data: row, error: readErr } = await service.from("onboarding_responses").select("id,status").eq("id", onboardingId).maybeSingle();
  if (readErr) throw new Error(`findable onboarding read-back failed: ${readErr.message}`);
  if (!row) throw new Error(`findable onboarding -> paid matched no row (onboarding_responses ${onboardingId})`);
  return "kept";
}
