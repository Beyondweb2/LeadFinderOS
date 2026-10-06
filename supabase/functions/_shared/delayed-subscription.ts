import {
  FINDABLE_BUILD_TOTAL_PAYMENTS, FINDABLE_MONTHLY_GBP, firstRecurringPaymentIso, isServiceRoute, recurringPaymentsFor,
  serviceRouteForTotal, totalPaymentsFor, type ServiceRoute,
} from "../../../src/lib/findableOffer.ts";
import { FIRST_PAYMENT_FILTERS, subscriptionRefusal } from "../../../src/lib/paymentState.ts";
import { OPTION_B_TIMING, PAYMENT_START_HOLD_DAYS, isOptionBTerms } from "../../../src/lib/clientTimeline.ts";

/** The provisional first-charge instant for a v3 subscription: PAYMENT_START_HOLD_DAYS after sign-up. */
export function paymentStartHoldIso(signupIso: string | null | undefined): string | null {
  if (!signupIso) return null;
  const t = new Date(signupIso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + PAYMENT_START_HOLD_DAYS * 86_400_000).toISOString();
}

// deno-lint-ignore no-explicit-any
type Client = any;

const PRICE_ID_RE = /^price_[A-Za-z0-9_]+$/;

export interface DelayedSubscriptionLead {
  id: string;
  business_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** Read so a closed client (ended / refunded) is never subscribed (paymentState.subscriptionRefusal). */
  status?: string | null;
  service_terminated_at?: string | null;
}

export type DelayedSubscriptionOutcome =
  | { kind: "created"; subscriptionId: string; startsAt: string }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; reason: string };

/** The Stripe Idempotency-Key for the monthly subscription of ONE checkout: every delivery of that
 *  checkout sends the same key, so Stripe itself returns the first subscription instead of making a
 *  second (M-017). ⛔ The request parameters must be identical on every delivery for the key to work —
 *  which is why the sign-up instant passed in is the EVENT's time, never "now". */
export const subscriptionIdempotencyKey = (checkoutSessionId: string) => `findable-monthly-${checkoutSessionId}`;

const form = (pairs: Record<string, string>) => new URLSearchParams(pairs).toString();

async function stripe(secret: string, path: string, body?: string, extraHeaders: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "Content-Type": "application/x-www-form-urlencoded" }), ...extraHeaders },
    ...(body === undefined ? {} : { body }),
  });
  const text = await res.text().catch(() => "");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* Stripe error text is returned below. */ }
  return { ok: res.ok, status: res.status, json, text };
}

/* ══ THE CLAIM (M-017) ═══════════════════════════════════════════════════════════════════════════════
   One checkout → at most one monthly subscription, even when Stripe delivers the same event twice at
   once. Two locks, either sufficient on its own for the common case:
     1. A CONDITIONAL WRITE on the lead (subscription_claim = the checkout session id, only while the
        claim and the subscription id are both blank and the client is not closed). Only one checkout can
        ever own a lead's subscription; a SECOND checkout for the same lead is refused here.
     2. Stripe's Idempotency-Key, keyed by the same checkout session. A re-entry by the SAME checkout (a
        concurrent duplicate delivery, or a retry after a crash between the Stripe call and our write) is
        allowed through the claim and gets the SAME subscription back from Stripe — that is what lets a
        crashed first delivery complete instead of leaving the client with no schedule for ever.
   ⛔ FAILS CLOSED: a claim that cannot be written (an error, or the column not migrated yet) creates
   nothing and reports a failure — the PAID email then tells Paul to set the schedule up by hand. A
   missing subscription is fixed in a minute; a duplicate bills a customer twice. */
export type ClaimOutcome = { kind: "proceed" } | { kind: "skipped"; reason: string } | { kind: "failed"; reason: string };

export async function claimSubscription(service: Client, leadId: string, claimKey: string, nowIso: string): Promise<ClaimOutcome> {
  if (!claimKey.trim()) return { kind: "failed", reason: "no checkout session id to claim the subscription with" };
  const { data: won, error } = await service.from("outreach_leads")
    .update({ subscription_claim: claimKey, subscription_claimed_at: nowIso })
    .eq("id", leadId)
    .is("subscription_claim", null)
    .is("stripe_subscription_id", null)
    .is(FIRST_PAYMENT_FILTERS.notEnded, null)
    .or(FIRST_PAYMENT_FILTERS.notRefunded)
    .select("id");
  if (error) return { kind: "failed", reason: `could not claim the monthly subscription (${error.message}), so none was created` };
  if (Array.isArray(won) && won.length > 0) return { kind: "proceed" };
  const { data: row, error: readErr } = await service.from("outreach_leads")
    .select("id,subscription_claim,stripe_subscription_id,status,service_terminated_at").eq("id", leadId).maybeSingle();
  if (readErr || !row) return { kind: "failed", reason: `could not read the subscription claim back (${readErr?.message ?? "no row"}), so none was created` };
  const r = row as { subscription_claim?: string | null; stripe_subscription_id?: string | null; status?: string | null; service_terminated_at?: string | null };
  if (r.stripe_subscription_id) return { kind: "skipped", reason: `already subscribed (${r.stripe_subscription_id})` };
  const refusal = subscriptionRefusal(r);
  if (refusal) return { kind: "skipped", reason: refusal };
  if (r.subscription_claim === claimKey) return { kind: "proceed" };
  return { kind: "skipped", reason: `the monthly subscription for this client was already claimed by another checkout (${r.subscription_claim ?? "unknown"})` };
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
  /* v4 Optimise (2026-10-06): when the sixth payment succeeded late, finaliseFixedTerm moved cancel_at to the
     ACTUAL Optimise End Date and wrote that exact second to metadata[fixed_term_cancel_at] — still our date. */
  const m = (s.metadata && typeof s.metadata === "object" ? s.metadata : {}) as Record<string, unknown>;
  const moved = Number(m.fixed_term_cancel_at);
  if (Number.isInteger(moved) && moved > 0 && s.cancel_at === moved) return s.ended_at >= s.cancel_at - 60;
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
 * ⛔ NO ROUTE, NO SUBSCRIPTION: an undecided route is a failure reported to Paul, never a default.
 * ⛔ A CLOSED CLIENT (ended / refunded) IS NEVER SUBSCRIBED — checked on what was read AND on the claim.
 * ⛔ AT MOST ONE PER CHECKOUT: claimed on the lead, then created with an Idempotency-Key keyed by the
 *   checkout session (claimKey). `signupAtIso` must be the EVENT's time so every delivery sends Stripe
 *   identical parameters. */
/**
 * 🔴 v3 / OPTION B (2026-10-05): `timing === "option_b"` creates the subscription on a HOLD — its trial
 * ends PAYMENT_START_HOLD_DAYS after sign-up, far past any Refund Window the contract allows — because the
 * real Payment Start Date (the day after the Refund Window, clause 5.6) is not knowable at sign-up. LeadFinder
 * then sets the real date with _shared/client-terms.ts schedulePaymentStart, which READS STRIPE BACK before
 * recording it. Stripe moves the billing anchor to the new trial_end (API: "The billing_cycle_anchor will
 * be updated to the trial_end value"), so every later payment falls on the same date each month (3.1).
 * ⛔ Failing to set the date can only ever charge LATER, never inside the Refund Window.
 * Absent = legacy timing (six weeks from sign-up) for a checkout made before v3.
 */
export type SubscriptionTiming = "legacy" | typeof OPTION_B_TIMING;

export async function createDelayedSubscription(
  service: Client,
  lead: DelayedSubscriptionLead,
  signupAtIso: string,
  route: ServiceRoute | null,
  claimKey: string,
  timing: SubscriptionTiming = "legacy",
  /** v4 on: the sale's commercial terms (csa_v3_option_b / csa_v4_option_b), written to the subscription so
   *  the webhook can tell from the subscription alone whether a Continuing Service follows its last payment
   *  (clientTimeline.subscriptionContinuesAfterTerm). Anything else is not written. */
  commercialTerms: string | null = null,
): Promise<DelayedSubscriptionOutcome> {
  if (lead.stripe_subscription_id) return { kind: "skipped", reason: `already subscribed (${lead.stripe_subscription_id})` };
  const refusal = subscriptionRefusal(lead);
  if (refusal) return { kind: "skipped", reason: refusal };
  if (!isServiceRoute(route)) return { kind: "failed", reason: "the service route (Build / Optimise) is not decided, so no payment schedule was created" };
  const recurring = recurringPaymentsFor(route);

  const secret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!secret) return { kind: "failed", reason: "STRIPE_SECRET_KEY is not set" };
  const customerId = (lead.stripe_customer_id ?? "").trim();
  if (!customerId) return { kind: "failed", reason: "no stripe_customer_id on the lead" };

  /* The one calculation (findableOffer.ts) — the same function the customer-facing dates use. */
  const startsAt = timing === OPTION_B_TIMING ? paymentStartHoldIso(signupAtIso) : firstRecurringPaymentIso(signupAtIso);
  if (!startsAt) return { kind: "failed", reason: `invalid signup timestamp ${JSON.stringify(signupAtIso)}` };
  const trialEnd = Math.floor(new Date(startsAt).getTime() / 1000);

  /* The claim comes AFTER every cheap refusal (so a refused payment never holds a claim) and BEFORE any
     Stripe call. */
  const claim = await claimSubscription(service, lead.id, claimKey, new Date().toISOString());
  if (claim.kind !== "proceed") return claim;

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
    "metadata[checkout_session]": claimKey,
    /* v3: the marker the Payment Start scheduler requires before it will move this subscription. */
    ...(timing === OPTION_B_TIMING ? { "metadata[payment_timing]": OPTION_B_TIMING, "metadata[payment_start]": "on_hold_until_set" } : {}),
    ...(timing === OPTION_B_TIMING && isOptionBTerms(commercialTerms) ? { "metadata[commercial_terms]": commercialTerms } : {}),
  }), { "Idempotency-Key": subscriptionIdempotencyKey(claimKey) });
  /* 409 = another delivery of this same checkout is creating it with the same key right now. It is not a
     failure: that delivery stores the id. Reported as skipped so no false "no schedule" alarm goes out. */
  if (created.status === 409) return { kind: "skipped", reason: "another delivery of this checkout is creating the subscription right now" };
  if (!created.ok) return { kind: "failed", reason: `Stripe refused the subscription: ${created.text.slice(0, 300)}` };
  const subscriptionId = String(created.json.id ?? "");
  if (!subscriptionId) return { kind: "failed", reason: "Stripe returned no subscription id" };

  /* Stored only over a blank (or the same) id: a stored subscription is never replaced by this write. */
  const { error } = await service.from("outreach_leads").update({
    stripe_subscription_id: subscriptionId,
    subscription_status: String(created.json.status ?? "trialing") || "trialing",
    subscription_renews_at: startsAt,
  }).eq("id", lead.id).or(`stripe_subscription_id.is.null,stripe_subscription_id.eq.${subscriptionId}`);
  if (error) console.error(`[delayed-subscription] created ${subscriptionId} but could not store it: ${error.message}`);
  return { kind: "created", subscriptionId, startsAt };
}
