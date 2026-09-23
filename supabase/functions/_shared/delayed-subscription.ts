import { FINDABLE_MONTHLY_DELAY_DAYS, FINDABLE_MONTHLY_GBP, FINDABLE_RECURRING_PAYMENTS } from "../../../src/lib/findableOffer.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

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
    headers: { Authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" }) },
    ...(body === undefined ? {} : { body }),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* Stripe error text is returned below. */ }
  return { ok: res.ok, json, text };
}

/**
 * When the subscription ends: exactly FINDABLE_RECURRING_PAYMENTS calendar months after the first
 * monthly charge (the trial end), in UTC — the same anchor Stripe bills from, so the periods charged
 * are trial_end + 0 … + (N-1) months: N recurring payments, then it stops. With the sign-up £99 that
 * is FINDABLE_TOTAL_PAYMENTS in total (Paul, 2026-09-23: "12 total payments, not £99 plus 12").
 * ⛔ The first version used 12 here, which made 13 payments with the sign-up; before that the
 * subscription was open-ended.
 */
export function minimumTermCancelAt(trialEndSec: number): number {
  const d = new Date(trialEndSec * 1000);
  /* Clamp the day to the target month's last day (29 Feb → 28 Feb), as Stripe's own anchor does —
     rolling into March would open a 13th period and charge it. */
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + FINDABLE_RECURRING_PAYMENTS;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  return Math.floor(end.getTime() / 1000);
}

/** Creates the one standard £99/month subscription immediately after the £99 signup payment.
 * Stripe owns the six-week delay as a trial, so a delayed worker cannot move the first charge. */
export async function createDelayedSubscription(
  service: Client,
  lead: DelayedSubscriptionLead,
  signupAtIso: string,
): Promise<DelayedSubscriptionOutcome> {
  if (lead.stripe_subscription_id) return { kind: "skipped", reason: `already subscribed (${lead.stripe_subscription_id})` };

  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };
  const customerId = (lead.stripe_customer_id ?? "").trim();
  if (!customerId) return { kind: "failed", reason: "no stripe_customer_id on the lead" };

  const started = new Date(signupAtIso);
  if (Number.isNaN(started.getTime())) return { kind: "failed", reason: `invalid signup timestamp ${JSON.stringify(signupAtIso)}` };
  const startsAt = new Date(started.getTime() + FINDABLE_MONTHLY_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const trialEnd = Math.floor(new Date(startsAt).getTime() / 1000);

  const pm = await stripe(secret, `payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=1`);
  if (!pm.ok) return { kind: "failed", reason: `could not read the customer's cards: ${pm.text.slice(0, 200)}` };
  const paymentMethodId = ((pm.json.data ?? []) as Array<{ id?: string }>)[0]?.id ?? "";
  if (!paymentMethodId) return { kind: "failed", reason: "the customer has no saved card" };

  // The old new-site Price is already the verified £99/month recurring Price. Prefer an explicitly
  // named standard-price secret when configured, without requiring an unrelated secret migration.
  const priceId = (Deno.env.get("FINDABLE_STANDARD_MONTHLY_PRICE_ID") ?? Deno.env.get("FINDABLE_NEW_SITE_PRICE_ID") ?? "").trim();
  if (!PRICE_ID_RE.test(priceId)) return { kind: "failed", reason: "no usable £99 monthly Stripe Price id is configured" };
  const price = await stripe(secret, `prices/${encodeURIComponent(priceId)}`);
  const amount = Number(price.json.unit_amount);
  const interval = ((price.json.recurring ?? {}) as { interval?: string }).interval ?? "";
  if (!price.ok || amount !== Math.round(FINDABLE_MONTHLY_GBP * 100) || interval !== "month") {
    return { kind: "failed", reason: `the configured monthly Stripe price is not £${FINDABLE_MONTHLY_GBP}/month` };
  }

  const created = await stripe(secret, "subscriptions", form({
    customer: customerId,
    default_payment_method: paymentMethodId,
    trial_end: String(trialEnd),
    /* FINDABLE_RECURRING_PAYMENTS charges after the sign-up, then nothing: cancel_at on the period
       boundary after the last one, no proration. */
    cancel_at: String(minimumTermCancelAt(trialEnd)),
    proration_behavior: "none",
    "trial_settings[end_behavior][missing_payment_method]": "cancel",
    "items[0][price]": priceId,
    "items[0][quantity]": "1",
    "metadata[lead_id]": lead.id,
    "metadata[product]": "findable_standard_monthly",
    "metadata[signup_at]": signupAtIso,
  }));
  if (!created.ok) return { kind: "failed", reason: `Stripe refused the subscription: ${created.text.slice(0, 300)}` };
  const subscriptionId = String(created.json.id ?? "");
  if (!subscriptionId) return { kind: "failed", reason: "Stripe returned no subscription id" };

  const { error } = await service.from("outreach_leads").update({
    stripe_subscription_id: subscriptionId,
    subscription_status: String(created.json.status ?? "trialing") || "trialing",
    subscription_renews_at: startsAt,
  }).eq("id", lead.id);
  if (error) console.error(`[delayed-subscription] created ${subscriptionId} but could not store it: ${error.message}`);
  return { kind: "created", subscriptionId, startsAt };
}
