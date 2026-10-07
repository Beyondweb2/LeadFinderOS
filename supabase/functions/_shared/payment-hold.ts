// _shared/payment-hold.ts — the webhook BACKSTOP behind the v3 payment gate (2026-10-05).
//
// ⛔ THE GATE IS findable-checkout (no Stripe session without a v3 signature). This is defence in depth:
//    if Stripe still reports a completed Findable payment that is NOT a valid v3 sale — a session opened
//    before the cutover, a hand-made Payment Link, anything forged — the money is RECORDED HERE and
//    nothing else happens: no Paid Client lifecycle (the lead is not marked paid), no subscription, no
//    payment_ledger row (so no commission), no baseline, no client emails. Paul is told loudly and
//    resolves it by hand (refund in Stripe, or have them sign and migrate).
// ⛔ HISTORICAL PAYMENTS ARE NEVER HELD: a replay of a payment the ledger already recorded is not re-judged.
import { CLIENT_AGREEMENT_VERSION, sha256Hex } from "../../../src/lib/clientAgreement.ts";
import { commercialTermsFor } from "../../../src/lib/clientTimeline.ts";
import { webhookV3Verdict, type GateAcceptance, type WebhookVerdict } from "../../../src/lib/signupGate.ts";
import { sendOperatorAlert } from "./operator-alert.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface HoldSession {
  id: string;
  payment_intent?: unknown;
  payment_link?: unknown;
  amount_total?: number | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string | undefined> | null;
}

const idOf = (v: unknown): string | null => typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

/** Was this payment already recorded before (a replay of history)? A read error THROWS (Stripe retries). */
export async function paymentAlreadyRecorded(service: Service, paymentIntentId: string | null, sessionId: string): Promise<boolean> {
  const keys = [paymentIntentId, sessionId].filter((x): x is string => !!x);
  const { data, error } = await service.from("payment_ledger").select("id").eq("kind", "initial").in("stripe_object_id", keys).limit(1);
  if (error) throw new Error(`could not read the ledger: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** Is this completed checkout a VALID v3 sale? Reads the named acceptance back and re-runs the gate. */
export async function verifyV3Checkout(service: Service, s: HoldSession, leadId: string | null, onboardingId: string): Promise<WebhookVerdict> {
  const accId = s.metadata?.agreement_acceptance_id ?? null;
  let acceptance: (GateAcceptance & { agreed_text: string }) | null = null;
  if (accId) {
    const { data, error } = await service.from("client_agreement_acceptances")
      .select("id, lead_id, onboarding_id, agreement_version, service_route, method, authority_confirmed, agreed_text, agreed_text_sha256")
      .eq("id", accId).maybeSingle();
    if (error) throw new Error(`could not read the acceptance: ${error.message}`);
    acceptance = data ?? null;
  }
  return webhookV3Verdict({
    metadata: s.metadata, acceptance, leadId, onboardingId, currentVersion: CLIENT_AGREEMENT_VERSION,
    recomputedSha: acceptance ? await sha256Hex(acceptance.agreed_text) : null, expectedTerms: commercialTermsFor(CLIENT_AGREEMENT_VERSION),
  });
}

/** Record the held payment (once per session), tell Paul (email + notification + error log). Never throws
 *  after the hold row exists; a failed hold write THROWS so Stripe retries (money must leave a trace). */
export async function holdPayment(service: Service, s: HoldSession, args: { leadId: string | null; onboardingId: string | null; reason: string; eventId: string | null }, alert = sendOperatorAlert): Promise<void> {
  const pi = idOf(s.payment_intent);
  const link = idOf(s.payment_link);
  const amount = typeof s.amount_total === "number" ? s.amount_total / 100 : null;
  const { error } = await service.from("client_payment_holds").upsert({
    checkout_session_id: s.id, payment_intent_id: pi, payment_link_id: link, lead_id: args.leadId, onboarding_id: args.onboardingId,
    amount_gbp: amount, customer_email: s.customer_details?.email ?? null, reason: args.reason.slice(0, 500), stripe_event_id: args.eventId,
  }, { onConflict: "checkout_session_id", ignoreDuplicates: true });
  if (error) throw new Error(`could not record the held payment: ${error.message}`);
  try { await service.from("client_error_reports").insert({ error_id: "payment_held_no_v3_agreement", context: { session: s.id, payment_intent: pi, payment_link: link, lead_id: args.leadId, onboarding_id: args.onboardingId, amount_gbp: amount, reason: args.reason } }); } catch { /* logged below */ }
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
    const ownerId = (owner as { user_id?: string } | null)?.user_id;
    if (ownerId) {
      await service.from("notifications").upsert([{
        user_id: ownerId, kind: "team_task", title: `PAYMENT HELD: £${amount ?? "?"} taken without the v3 agreement`,
        body: `Stripe took a payment (${link ? "Payment Link " + link : "session " + s.id}) that is not a signed v3 sale: ${args.reason}. Nothing was started. Refund it in Stripe, or have them sign and migrate.`,
        link: args.leadId ? `/paid-clients/${args.leadId}` : "/paid-clients", lead_id: args.leadId, priority: 3, dedupe_key: `hold:${s.id}`,
      }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    }
  } catch (e) { console.error("[payment-hold] notification failed:", (e as Error).message); }
  try {
    await alert(`PAYMENT HELD — £${amount ?? "?"} taken WITHOUT the v3 agreement`, [
      `Stripe completed a payment that is not a signed v3 sale, so it was HELD: ${args.reason}`,
      `Checkout session: ${s.id}${link ? ` · Payment Link: ${link}` : ""}${pi ? ` · Payment: ${pi}` : ""}`,
      `Lead: ${args.leadId ?? "(none)"} · Sign-up: ${args.onboardingId ?? "(none)"} · Payer: ${s.customer_details?.email ?? "(unknown)"}`,
      "",
      "Nothing was started: the lead is NOT marked paid, no subscription, no commission, no baseline, no client email.",
      "Refund it in Stripe, or have the client sign the current agreement and migrate them by hand.",
    ]);
  } catch (e) { console.error("[payment-hold] alert failed:", (e as Error).message); }
}

/** Is there an unresolved hold for this client? (findable-checkout refuses a second payment while one is open.) */
export async function openHoldFor(service: Service, leadId: string): Promise<boolean> {
  const { data, error } = await service.from("client_payment_holds").select("id").eq("lead_id", leadId).is("resolved_at", null).limit(1);
  if (error) throw new Error(`could not read payment holds: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}
