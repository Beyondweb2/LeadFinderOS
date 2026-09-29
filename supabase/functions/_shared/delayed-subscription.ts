import {
  FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_MONTHLY_GBP, firstRecurringPaymentIso, isServiceRoute, recurringPaymentsFor,
  serviceRouteForTotal, totalPaymentsFor, type ServiceRoute,
} from "../../../src/lib/findableOffer.ts";

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
 * When the subscription ends: exactly N calendar months after the first monthly charge (the trial
 * end), in UTC, where N = recurringPaymentsFor(route) — the same anchor Stripe bills from, so the
 * periods charged are trial_end + 0 … + (N-1) months: N recurring payments, then it stops. With the
 * sign-up £99 that is totalPaymentsFor(route) in total: 12 on Build (11 recurring), 6 on Optimise
 * (5 recurring) — Paul, 2026-09-23 / 2026-09-29: the sign-up is payment 1.
 * ⛔ The first version used 12 here, which made 13 payments with the sign-up; before that the
 * subscription was open-ended.
 */
export function minimumTermCancelAt(trialEndSec: number, recurringPayments: number): number {
  if (!Number.isInteger(recurringPayments) || recurringPayments < 1) throw new Error(`bad recurring payment count ${recurringPayments}`);
  const d = new Date(trialEndSec * 1000);
  /* Clamp the day to the target month's last day (29 Feb → 28 Feb), as Stripe's own anchor does —
     rolling into March would open an extra period and charge it. */
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + recurringPayments;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  return Math.floor(end.getTime() / 1000);
}

/**
 * Did this subscription end because the fixed term was COMPLETED (Stripe reached our cancel_at),
 * rather than being cancelled early or dying on a card? Stripe reports both with reason
 * `cancellation_requested`, so this is decided from the subscription's own dates.
 * ⛔ POSITIVE, EVERY PART REQUIRED: the subscription's own payment count is known
 * (subscriptionTotalPayments), cancel_at is exactly minimumTermCancelAt(its own trial_end, that count
 * minus the sign-up) — our fixed-term subscription, not a date set by hand — it ended at or after that
 * moment, and it was not in arrears ("once the term is complete and all amounts due are paid").
 * Absent fields → false.
 */
export function subscriptionEndedByTerm(
  s: { cancel_at?: unknown; trial_end?: unknown; ended_at?: unknown; metadata?: unknown },
  inArrears: boolean,
): boolean {
  if (inArrears) return false;
  if (typeof s.cancel_at !== "number" || typeof s.trial_end !== "number" || typeof s.ended_at !== "number") return false;
  const total = subscriptionTotalPayments(s);
  if (!total) return false;
  return s.cancel_at === minimumTermCancelAt(s.trial_end, total - 1) && s.ended_at >= s.cancel_at - 60;
}

/** The payment count a subscription was CREATED for, from its own metadata (`total_payments`, written
 *  by createDelayedSubscription). ⛔ A subscription with no such metadata but our product tag predates
 *  the two routes and was created for the one 12-payment plan. Anything else unrecognised → null. */
export function subscriptionTotalPayments(s: { metadata?: unknown }): number | null {
  const m = (s.metadata && typeof s.metadata === "object" ? s.metadata : {}) as Record<string, unknown>;
  if (m.total_payments === undefined || m.total_payments === null || m.total_payments === "") {
    return m.product === "findable_standard_monthly" ? FINDABLE_BUILD_TOTAL_PAYMENTS : null;
  }
  const route = serviceRouteForTotal(m.total_payments);
  return route ? totalPaymentsFor(route) : null;
}

/** The route a subscription was created for (its metadata), or null. */
export function subscriptionRoute(s: { metadata?: unknown }): ServiceRoute | null {
  const m = (s.metadata && typeof s.metadata === "object" ? s.metadata : {}) as Record<string, unknown>;
  if (isServiceRoute(m.service_route)) return m.service_route;
  return serviceRouteForTotal(subscriptionTotalPayments(s));
}

/** THE ROUTE A COMPLETED CHECKOUT WAS PAID ON. ⛔ The session's metadata (set by findable-checkout from
 *  the row, and named on the Stripe page) decides; its payment count must agree with the route; the
 *  row's route — when it could be read (`undefined` = not read) — must not contradict it. Anything else
 *  is `route: null` with the reason, and no schedule is created. Pure. */
export function resolvePaidRoute(
  metadata: Record<string, unknown> | null | undefined,
  rowRoute: ServiceRoute | null | undefined,
): { route: ServiceRoute | null; problem: string | null; sessionRoute: string | null; rowRoute: ServiceRoute | null } {
  const m = metadata ?? {};
  const raw = typeof m.service_route === "string" ? m.service_route : null;
  const base = { sessionRoute: raw, rowRoute: rowRoute ?? null };
  if (!isServiceRoute(raw)) {
    return { ...base, route: null, problem: raw ? `the checkout carried an unknown route "${raw}".` : "the checkout session carries no Build / Optimise route (it was created before routes existed)." };
  }
  if (Number(m.total_payments) !== totalPaymentsFor(raw)) {
    return { ...base, route: null, problem: `the checkout's payment count (${String(m.total_payments ?? "none")}) does not match ${raw}.` };
  }
  if (rowRoute !== undefined && rowRoute !== raw) {
    return { ...base, route: null, problem: `the customer paid on ${raw} but the onboarding record now says ${rowRoute ?? "no route"}.` };
  }
  return { ...base, route: raw, problem: null };
}

/** Creates the £99/month subscription immediately after the £99 signup payment, for the ROUTE the
 * customer paid on (Build: recurringPaymentsFor('build') more; Optimise: recurringPaymentsFor('optimise')
 * more). Stripe owns the six-week delay as a trial, so a delayed worker cannot move the first charge.
 * ⛔ NO ROUTE, NO SUBSCRIPTION: an undecided route is a failure reported to Paul, never a default. */
export async function createDelayedSubscription(
  service: Client,
  lead: DelayedSubscriptionLead,
  signupAtIso: string,
  route: ServiceRoute | null,
): Promise<DelayedSubscriptionOutcome> {
  if (lead.stripe_subscription_id) return { kind: "skipped", reason: `already subscribed (${lead.stripe_subscription_id})` };
  if (!isServiceRoute(route)) return { kind: "failed", reason: "the service route (Build / Optimise) is not decided, so no payment schedule was created" };
  const recurring = recurringPaymentsFor(route);

  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };
  const customerId = (lead.stripe_customer_id ?? "").trim();
  if (!customerId) return { kind: "failed", reason: "no stripe_customer_id on the lead" };

  /* The one calculation (findableOffer.ts) — the same function the customer-facing dates use. */
  const startsAt = firstRecurringPaymentIso(signupAtIso);
  if (!startsAt) return { kind: "failed", reason: `invalid signup timestamp ${JSON.stringify(signupAtIso)}` };
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
    /* recurringPaymentsFor(route) charges after the sign-up, then nothing: cancel_at on the period
       boundary after the last one, no proration. */
    cancel_at: String(minimumTermCancelAt(trialEnd, recurring)),
    proration_behavior: "none",
    "trial_settings[end_behavior][missing_payment_method]": "cancel",
    "items[0][price]": priceId,
    "items[0][quantity]": "1",
    "metadata[lead_id]": lead.id,
    "metadata[product]": "findable_standard_monthly",
    "metadata[signup_at]": signupAtIso,
    /* The contract this subscription was created for — read back by the term-complete and
       starting-soon emails, so the count a client is told is the count Stripe bills. */
    "metadata[service_route]": route,
    "metadata[total_payments]": String(totalPaymentsFor(route)),
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
