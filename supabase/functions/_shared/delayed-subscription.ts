/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DELAYED MONTHLY — created ONLY when the four-week results have actually gone out (2026-09-13).

   ⛔ NOTHING RECURRING EXISTS UNTIL THE OBLIGATION DOES. The checkout takes £99 in payment mode and
   retains the card; it creates no subscription. This module creates one, by API, at the moment the
   results email is sent and stamped — and at no other moment. A client who claims their refund, or
   whose replay holds for ever, or who is archived, has no subscription to cancel because none was
   ever made. The alternative considered and rejected was creating it at checkout with a placeholder
   trial and moving `trial_end` later: that makes the safety depend on an update landing, and leaves
   a live timer on every client including the ones who leave.

   ⛔ trial_end IS THE CLAIM WINDOW CLOSE, FROM THE SAME FUNCTION. monthlyStartIso IS
   claimWindowCloseIso — not a copy of it — so the first charge cannot land while the client is
   still entitled to claim. See remeasureResults.ts.

   ⛔ EVERY FAILURE HERE IS NON-FATAL TO THE SEND. The results have already gone out and the stamp is
   already written when this runs. Clearing the stamp or throwing would un-send a document the
   client is reading. A failure means Paul is flagged and the client is simply not billed — the
   direction that costs us money rather than costing them trust.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { FINDABLE_MONTHLY_GBP } from "../../../src/lib/findableOffer.ts";
import { monthlyStartIso } from "../../../src/lib/remeasureResults.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

/** Stripe Price ids look like `price_…`; a `prod_…` paste is the recorded mistake (CLAUDE.md §11). */
const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;

export interface DelayedSubscriptionLead {
  id: string;
  business_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export type DelayedSubscriptionOutcome =
  | { kind: "created"; subscriptionId: string; startsAt: string }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

const form = (pairs: Record<string, string>) => new URLSearchParams(pairs).toString();

async function stripe(secret: string, path: string, body?: string): Promise<{ ok: boolean; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    ...(body === undefined ? {} : { body }),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* text carries it */ }
  return { ok: res.ok, json, text };
}

/**
 * Create the client's monthly subscription, starting the day their claim window closes.
 *
 * @param sentAtIso  the value written to outreach_leads.remeasure_results_sent_at, this instant
 * @param wantsHosting  whether the onboarding row's website tick was set — the record of what they
 *                      bought. Hosting rides the SAME anchor and the SAME invoice by Paul's call.
 */
export async function createDelayedSubscription(
  service: Client,
  lead: DelayedSubscriptionLead,
  sentAtIso: string,
  wantsHosting: boolean,
): Promise<DelayedSubscriptionOutcome> {
  /* ⛔ IDEMPOTENT ON THE STORED ID. The results send is once-only by its own claim, but this must
     survive a hand-run resend or a replayed tick: one subscription per lead, ever. */
  if (lead.stripe_subscription_id) return { kind: "skipped", reason: `already subscribed (${lead.stripe_subscription_id})` };

  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };

  /* ⛔ NO CUSTOMER MEANS NO CARD. Every client who paid through the 2026-09-13 checkout has one
     (customer_creation: always). Anyone who paid BEFORE it does not, and must not be quietly
     skipped — they bought under the old one-off offer and their monthly, if any, is a conversation
     Paul has by hand. */
  const customerId = (lead.stripe_customer_id ?? "").trim();
  if (!customerId) return { kind: "failed", reason: "no stripe_customer_id on the lead — paid before the card was retained, or the webhook never stored it" };

  const startsAt = monthlyStartIso(sentAtIso);
  if (!startsAt) return { kind: "failed", reason: `could not derive the billing anchor from ${JSON.stringify(sentAtIso)}` };
  const trialEnd = Math.floor(new Date(startsAt).getTime() / 1000);

  /* ⛔ A RETAINED CARD IS NOT AUTOMATICALLY THE INVOICE DEFAULT. setup_future_usage attaches the
     PaymentMethod to the Customer; it does not set invoice_settings.default_payment_method. A
     subscription created without naming one would reach its first invoice with nothing to charge
     and fail on day 42 in silence. So the card is looked up and named on the subscription itself. */
  const pm = await stripe(secret, `payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=1`);
  if (!pm.ok) return { kind: "failed", reason: `could not read the customer's cards: ${pm.text.slice(0, 200)}` };
  const methods = (pm.json.data ?? []) as Array<{ id?: string }>;
  const paymentMethodId = methods[0]?.id ?? "";
  if (!paymentMethodId) return { kind: "failed", reason: "the customer has no saved card — nothing to bill when the trial ends" };

  const rawHosting = (Deno.env.get("FINDABLE_HOSTING_PRICE_ID") ?? "").trim();
  const hostingPriceId = PRICE_ID_RE.test(rawHosting) ? rawHosting : "";
  const hostingOn = wantsHosting && !!hostingPriceId;

  const fields: Record<string, string> = {
    customer: customerId,
    default_payment_method: paymentMethodId,
    trial_end: String(trialEnd),
    /* ⛔ WHAT HAPPENS IF THE CARD FAILS AT trial_end. `cancel` is deliberate and it is the honest
       end state: Stripe retries for days first (Smart Retries), and if it still cannot collect the
       subscription ends rather than sitting in `unpaid` accruing invoices the client never agreed
       to. A client whose card died should stop being a client, not quietly build a debt. */
    "trial_settings[end_behavior][missing_payment_method]": "cancel",
    "items[0][price_data][currency]": "gbp",
    "items[0][price_data][unit_amount]": String(Math.round(FINDABLE_MONTHLY_GBP * 100)),
    "items[0][price_data][recurring][interval]": "month",
    "items[0][price_data][product_data][name]": "Findable — monthly",
    "metadata[lead_id]": lead.id,
    "metadata[product]": "findable_monthly",
    "metadata[results_sent_at]": sentAtIso,
  };
  /* Hosting rides the same anchor and the same invoice (Paul, 2026-09-13): one charge to explain,
     and nothing inside the refund window. It keeps its Stripe Price — it carries no guarantee. */
  if (hostingOn) fields["items[1][price]"] = hostingPriceId;

  const created = await stripe(secret, "subscriptions", form(fields));
  if (!created.ok) return { kind: "failed", reason: `Stripe refused the subscription: ${created.text.slice(0, 300)}` };

  const subId = String(created.json.id ?? "");
  const status = String(created.json.status ?? "");
  if (!subId) return { kind: "failed", reason: "Stripe returned no subscription id" };

  /* Non-fatal: the subscription exists at Stripe whatever happens here, and the webhook's
     invoice.paid / subscription.updated branches will re-assert these columns. */
  const { error: upErr } = await service.from("outreach_leads").update({
    stripe_subscription_id: subId,
    subscription_status: status || "trialing",
    subscription_renews_at: startsAt,
  }).eq("id", lead.id);
  if (upErr) console.error(`[delayed-subscription] created ${subId} but could not store it on lead ${lead.id}: ${upErr.message}`);

  return { kind: "created", subscriptionId: subId, startsAt };
}
