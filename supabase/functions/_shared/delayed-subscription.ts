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
import { FINDABLE_MONTHLY_GBP, FINDABLE_NEW_SITE_MONTHLY_GBP, FINDABLE_NEW_SITE_TERM_MONTHS } from "../../../src/lib/findableOffer.ts";
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

/** Which pricing tier the client bought (onboarding_responses.plan_tier). `null` is a LEGACY row —
 *  a client who paid before the tier existed, billed the old way (£29.99, plus £9.99 hosting if their
 *  website tick was set). */
export type PlanTier = "keep" | "new_site";

/** The Stripe subscription-schedule fields for the new-site tier, as a PURE function so the phase
 *  shape can be tested without Stripe (Paul's (d): prove there is no month-13 switcher). Phase 0 is a
 *  £0 trial to `trialEndUnix`; phase 1 is `newSitePriceId` for `termMonths` iterations; phase 2 is
 *  `monthlyPriceId`, open-ended — Stripe transitions phase 1 → 2 itself. */
export function newSiteScheduleFields(a: {
  customerId: string; paymentMethodId: string; trialEndUnix: number;
  newSitePriceId: string; monthlyPriceId: string; termMonths: number;
  leadId: string; sentAtIso: string;
}): Record<string, string> {
  return {
    customer: a.customerId,
    start_date: "now",
    end_behavior: "release",
    "default_settings[default_payment_method]": a.paymentMethodId,
    // Phase 0 — the delay: a trial until the claim window closes, £0.
    "phases[0][items][0][price]": a.newSitePriceId,
    "phases[0][items][0][quantity]": "1",
    "phases[0][trial]": "true",
    "phases[0][end_date]": String(a.trialEndUnix),
    // Phase 1 — the new-site monthly for the term.
    "phases[1][items][0][price]": a.newSitePriceId,
    "phases[1][items][0][quantity]": "1",
    "phases[1][iterations]": String(a.termMonths),
    // Phase 2 — drops to the standard monthly, open-ended (no iterations / end_date → runs for ever).
    "phases[2][items][0][price]": a.monthlyPriceId,
    "phases[2][items][0][quantity]": "1",
    "metadata[lead_id]": a.leadId,
    "metadata[product]": "findable_new_site",
    "metadata[results_sent_at]": a.sentAtIso,
    "default_settings[metadata][lead_id]": a.leadId,
    "default_settings[metadata][product]": "findable_new_site",
  };
}

export interface DelayedSubscriptionPlan {
  /** The tier from the onboarding row. null = legacy row (pre-tier). */
  tier: PlanTier | null;
  /** LEGACY hosting only: the old website_addon tick. Ignored for a new_site row (hosting is inside
   *  the £99) and for a keep row (they keep their own site). Honoured only when tier is null. */
  wantsHostingLegacy: boolean;
}

/**
 * Create the client's monthly billing, starting the day their claim window closes.
 *
 * KEEP tier (and legacy): a plain subscription at FINDABLE_MONTHLY_GBP, trialing until the claim
 * window closes, plus the £9.99 hosting line for a legacy website-tick row.
 *
 * NEW-SITE tier: a Stripe SUBSCRIPTION SCHEDULE — phase 0 a £0 trial until the claim window closes,
 * phase 1 FINDABLE_NEW_SITE_MONTHLY_GBP for FINDABLE_NEW_SITE_TERM_MONTHS iterations, phase 2
 * FINDABLE_MONTHLY_GBP open-ended. Stripe transitions phase 1 → phase 2 itself, so there is NO
 * month-13 switcher to fail (Paul, 2026-09-17). If THIS creation fails the client is simply not
 * billed and Paul is flagged — the same safe direction as the keep flow, never an overcharge.
 *
 * @param sentAtIso  the value written to outreach_leads.remeasure_results_sent_at, this instant
 * @param plan  the tier bought, read off the onboarding row by the caller.
 */
export async function createDelayedSubscription(
  service: Client,
  lead: DelayedSubscriptionLead,
  sentAtIso: string,
  plan: DelayedSubscriptionPlan,
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

  /* ⛔ THE MONTHLY IS A REAL STRIPE PRICE, AND ITS AMOUNT IS CHECKED AGAINST OUR COPY BEFORE ANY
     SUBSCRIPTION IS MADE. The Price id lives in a secret, so check-cross-repo-sync.mjs cannot read
     it — this would be the fourth hand-kept copy of a price (CLAUDE.md §11) and the one that
     decides what a card is actually charged. One GET closes that gap: if Stripe's amount or
     interval disagrees with FINDABLE_MONTHLY_GBP, which is the number our emails and the website
     state, nothing is created and Paul is told. Billing a figure we never quoted is worse than not
     billing at all. */
  const rawMonthly = (Deno.env.get("FINDABLE_MONTHLY_PRICE_ID") ?? "").trim();
  if (!PRICE_ID_RE.test(rawMonthly)) {
    return { kind: "failed", reason: `FINDABLE_MONTHLY_PRICE_ID is not a usable Price id (${rawMonthly ? "wrong shape — a prod_ id is the recorded paste error" : "not set"})` };
  }
  const price = await stripe(secret, `prices/${encodeURIComponent(rawMonthly)}`);
  if (!price.ok) return { kind: "failed", reason: `could not read the monthly price: ${price.text.slice(0, 200)}` };
  const expectedPence = Math.round(FINDABLE_MONTHLY_GBP * 100);
  const actualPence = Number(price.json.unit_amount);
  const interval = ((price.json.recurring ?? {}) as { interval?: string }).interval ?? "";
  if (actualPence !== expectedPence || interval !== "month") {
    return {
      kind: "failed",
      reason: `the Stripe price disagrees with our copy: Stripe says ${actualPence} pence / ${interval || "no"} interval, we tell clients £${FINDABLE_MONTHLY_GBP} a month`,
    };
  }

  /* ══ NEW-SITE TIER: A SUBSCRIPTION SCHEDULE, NOT A PLAIN SUBSCRIPTION (2026-09-17) ═══════════════
     £99/month for 12 months, then £29.99/month, and STRIPE does the drop — phase 1 → phase 2 is a
     native schedule transition, so there is no month-13 switcher that could fail and leave a client
     stuck at £99. The £99 price is verified against our constant the same way the £29.99 one just was;
     if it disagrees, nothing is created and Paul is flagged. */
  if (plan.tier === "new_site") {
    const rawNewSite = (Deno.env.get("FINDABLE_NEW_SITE_PRICE_ID") ?? "").trim();
    if (!PRICE_ID_RE.test(rawNewSite)) {
      return { kind: "failed", reason: `FINDABLE_NEW_SITE_PRICE_ID is not a usable Price id (${rawNewSite ? "wrong shape — a prod_ id is the recorded paste error" : "not set"})` };
    }
    const nsPrice = await stripe(secret, `prices/${encodeURIComponent(rawNewSite)}`);
    if (!nsPrice.ok) return { kind: "failed", reason: `could not read the new-site price: ${nsPrice.text.slice(0, 200)}` };
    const nsExpected = Math.round(FINDABLE_NEW_SITE_MONTHLY_GBP * 100);
    const nsActual = Number(nsPrice.json.unit_amount);
    const nsInterval = ((nsPrice.json.recurring ?? {}) as { interval?: string }).interval ?? "";
    if (nsActual !== nsExpected || nsInterval !== "month") {
      return {
        kind: "failed",
        reason: `the new-site Stripe price disagrees with our copy: Stripe says ${nsActual} pence / ${nsInterval || "no"} interval, we tell clients £${FINDABLE_NEW_SITE_MONTHLY_GBP} a month`,
      };
    }
    /* Three phases. Phase 0 is a £0 trial to the claim-window close, so nothing is billed inside the
       refund window — the same anchor trial_end gives the keep tier. Phase 1 is £99 for the term.
       Phase 2 (the £29.99 price) is open-ended, so the subscription simply continues at that price
       for ever. start_date=now creates the subscription immediately, so its id is available to store
       and the webhook keys on it exactly as it does for the keep tier. */
    const scheduleFields = newSiteScheduleFields({
      customerId, paymentMethodId, trialEndUnix: trialEnd,
      newSitePriceId: rawNewSite, monthlyPriceId: rawMonthly,
      termMonths: FINDABLE_NEW_SITE_TERM_MONTHS, leadId: lead.id, sentAtIso,
    });
    const sched = await stripe(secret, "subscription_schedules", form(scheduleFields));
    if (!sched.ok) return { kind: "failed", reason: `Stripe refused the subscription schedule: ${sched.text.slice(0, 300)}` };
    /* start_date=now means the subscription exists already; `subscription` is its id (a string when
       unexpanded). Store THAT — the webhook resolves renewals by stripe_subscription_id. */
    const nsSubId = typeof sched.json.subscription === "string" ? sched.json.subscription : "";
    if (!nsSubId) return { kind: "failed", reason: `the schedule was created (${String(sched.json.id ?? "?")}) but carries no subscription id yet` };
    const { error: nsUpErr } = await service.from("outreach_leads").update({
      stripe_subscription_id: nsSubId,
      subscription_status: "trialing",
      subscription_renews_at: startsAt,
    }).eq("id", lead.id);
    if (nsUpErr) console.error(`[delayed-subscription] created new-site schedule sub ${nsSubId} but could not store it on lead ${lead.id}: ${nsUpErr.message}`);
    return { kind: "created", subscriptionId: nsSubId, startsAt };
  }

  /* ══ KEEP TIER (and legacy rows): a plain £29.99 subscription ════════════════════════════════════ */
  const rawHosting = (Deno.env.get("FINDABLE_HOSTING_PRICE_ID") ?? "").trim();
  const hostingPriceId = PRICE_ID_RE.test(rawHosting) ? rawHosting : "";
  /* ⛔ HOSTING IS LEGACY-ONLY NOW. The £9.99 add-on was retired for new sign-ups when the new-site
     tier arrived (Paul, 2026-09-17): a new_site client gets hosting inside the £99, a keep client
     keeps their own site. So it rides the invoice ONLY for a LEGACY row — tier null AND the old
     website tick — preserving what those clients actually bought. */
  const hostingOn = plan.tier === null && plan.wantsHostingLegacy && !!hostingPriceId;

  const fields: Record<string, string> = {
    customer: customerId,
    default_payment_method: paymentMethodId,
    trial_end: String(trialEnd),
    /* ⛔ WHAT HAPPENS IF THE CARD FAILS AT trial_end. `cancel` is deliberate and it is the honest
       end state: Stripe retries for days first (Smart Retries), and if it still cannot collect the
       subscription ends rather than sitting in `unpaid` accruing invoices the client never agreed
       to. A client whose card died should stop being a client, not quietly build a debt. */
    "trial_settings[end_behavior][missing_payment_method]": "cancel",
    /* The Price object, not inline price_data: this one is real in Stripe and its amount has just
       been verified against the figure we publish. */
    "items[0][price]": rawMonthly,
    "items[0][quantity]": "1",
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
