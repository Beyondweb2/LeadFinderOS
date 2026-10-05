import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { slugifyBusinessName } from "../../../src/lib/reportSlug.ts";
import { FINDABLE_GUARANTEE, cardSavedNoticeFor, checkoutLineNameFor, serviceRouteFromRow, totalPaymentsFor } from "../../../src/lib/findableOffer.ts";
import { mayGenerateLink, quickCloseClosedRefusal, type QuickCloseRecord } from "../../../src/lib/quickClose.ts";
import { offerPrice } from "../_shared/offer-price.ts";
import { agreementUrl, CLIENT_AGREEMENT_VERSION, sha256Hex } from "../../../src/lib/clientAgreement.ts";
import { checkoutAgreementGate, type GateAcceptance } from "../../../src/lib/signupGate.ts";
import { SIGNUP_LINK_LIFETIME_MS } from "../../../src/lib/quickClose.ts";
import { COMMERCIAL_TERMS_V3, OPTION_B_TIMING } from "../../../src/lib/clientTimeline.ts";
import { openHoldFor } from "../_shared/payment-hold.ts";
/* ⚠️ IMPORTED FROM onboarding-followup.ts ON PURPOSE, despite the module name. That file is where
   "where does the public site live" was settled after the pages.dev incident, and it applies the
   host filter that keeps a preview domain out of a customer-facing URL. A second copy of that
   decision here is exactly the drift that put 27 of 47 onboarding links on the wrong host. */
import { resolveSiteOrigin } from "../_shared/onboarding-followup.ts";
import { serveDecision, serveInputFromRow, type ServeGateRow } from "../../../src/lib/serveGate.ts";
import { DOMAIN_ROW_COLUMNS, domainAuthority, domainInputFromRow, type DomainRow } from "../../../src/lib/domainAuthority.ts";

// findable-checkout — Stripe Checkout for the Findable onboarding plan (verify_jwt = false;
// called by the public findable-site with the anon apikey — the visitor has no app account).
//
// ONE plan: the four-week cycle, ONE-OFF at FINDABLE_SETUP_PRICE_GBP (findableOffer.ts), with a
// refund if the measured number has not gone up. mode=payment — UNLESS the customer asked us to
// build their site, which adds the £9.99/month hosting line and makes it mode=subscription. Either
// way this is deliberately NOT the barber subscription function (that one needs an operator JWT,
// bills the dead barber product monthly and redirects to /barber).
//
// ⚠️ THIS HEADER WAS THREE THINGS WRONG AT ONCE UNTIL 2026-09-12, which is worth recording because
// none of them broke anything and all of them would have misled someone reading in a hurry: it said
// "eight-week sprint" (the cycle has been four weeks since 2026-09-04), "£99 since 2026-08-04" (the
// price had been £49.99 since 2026-09-03 and is £99 again today, so the figure was right by
// coincidence and the date was wrong), and "work-based guarantee" (the refund is conditional on the
// measurement now). Prose next to a constant rots silently — name the constant, not the value.
//
// KEY SAFETY: STRIPE_SECRET_KEY lives ONLY in this function's server-side secrets. The
// session is created HERE via the Stripe REST API; the browser only ever receives the
// session's redirect URL. Nothing secret ships in findable-site's bundle.
//
// Price: FINDABLE_SETUP_PRICE_ID (a Stripe dashboard Price) wins when set — still NOT set as of
// 2026-09-12, re-checked against the live secret list — otherwise the inline price_data below
// charges exactly FINDABLE_SETUP_PRICE_GBP. Keep it unset: a dashboard Price carries no description
// field of ours, so setting it would silently drop the guarantee text from the Stripe page.
// The price findable-site DISPLAYS is that repo's own copy, pinned to this one by
// scripts/check-cross-repo-sync.mjs, which now also asserts the guarantee names the same figure.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID_OR_BEYOND = new Set(["payment_received", "in_delivery", "completed"]);
// Origins a payer may be bounced back to. Never an attacker-supplied origin.
//
// ⛔ FINDABLE_ALLOWED_ORIGINS IS A PERMISSION LIST, NOT AN ADDRESS BOOK. It answers "may a payer be
// returned here", and nothing else. The comment that stood here said its FIRST ENTRY "becomes
// canonical" — that sentence was the bug, not a description of one, and it is the same belief that
// sent 27 onboarding links to a preview domain. Where the site LIVES is FINDABLE_SITE_ORIGIN; see
// CONFIGURED_ORIGIN below.
//
// To move the production domain: set FINDABLE_SITE_ORIGIN (the address) and add the new host to
// FINDABLE_ALLOWED_ORIGINS (the permission). Both, and in that order — a new address that is not
// yet permitted still works here, because CONFIGURED_ORIGIN is folded into the allowlist.
//
// The Pages project URL and local dev are always allowed so the flow works before the domain
// lands. Per-commit preview subdomains (<hash>.findable-site.pages.dev) are deliberately NOT
// allowed: a payment should only ever return to a stable address.
const BUILT_IN_ORIGINS = ["https://findable-site.pages.dev", "http://localhost:4321"];
const ENV_ORIGINS = (Deno.env.get("FINDABLE_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
/* 🔴 THE SAME CATEGORY ERROR THAT PUT PROSPECTS ON pages.dev, IN THE ONE PLACE IT WAS NOT FIXED
   (found 2026-09-03 by sweeping every onboarding link in the product). This used to read
   `CANONICAL_ORIGIN = ENV_ORIGINS[0]`, i.e. it took the FIRST ENTRY OF THE CORS ALLOWLIST as "where
   the site lives" — the exact mistake onboarding-followup.ts documents at length: the order of an
   allowlist is nobody's deliberate decision, and that list legitimately contains preview hosts.
   Here the stakes are higher than a link in a message, because this origin becomes Stripe's
   success_url and cancel_url — so a PAYING CUSTOMER could be returned to a preview domain the
   moment they finished paying.

   ⛔ AND CORS DOES NOT PROTECT US FROM IT. `Access-Control-Allow-Origin` above is `*`, so the
   browser POST succeeds whatever the origin — which means "payments work from findable.live" was
   never evidence that findable.live is in FINDABLE_ALLOWED_ORIGINS. If it is absent from that list,
   `ALLOWED_ORIGINS.has(reqOrigin)` was false for every real payer and EVERY ONE of them fell through
   to this constant. The secret's value cannot be read (the CLI returns hashes), so that was
   unfalsifiable from here — which is itself the reason not to depend on it.

   ⛔ SO THE CONFIGURED ORIGIN IS NOW THE ANSWER, AND THE ALLOWLIST IS ONLY A PERMISSION.
   FINDABLE_SITE_ORIGIN is the variable whose one job is to say where the site lives (proven
   https://findable.live, 2026-09-03, by hashing candidates against the stored digest), and
   resolveSiteOrigin applies the non-preview host filter to anything it infers. It is also folded
   into ALLOWED_ORIGINS, so a findable.live payer now matches at the first test regardless of what
   the CORS list happens to contain.

   ⚠️ THE REQUEST ORIGIN STILL WINS WHEN IT IS TRUSTED. That is what lets a payer testing on
   localhost:4321 or the Pages URL return to where they actually are; the fallback is only for a
   request that arrives with no origin, or one we do not trust. BUILT_IN_ORIGINS[0] survives as the
   last resort for the case where nothing at all is configured — and then pages.dev genuinely is the
   only place the site is. */
const CONFIGURED_ORIGIN = resolveSiteOrigin();
const ALLOWED_ORIGINS = new Set([
  ...(CONFIGURED_ORIGIN ? [CONFIGURED_ORIGIN] : []),
  ...ENV_ORIGINS,
  ...BUILT_IN_ORIGINS,
]);
const CANONICAL_ORIGIN = CONFIGURED_ORIGIN ?? ENV_ORIGINS[0] ?? BUILT_IN_ORIGINS[0];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeSecret) return json({ ok: false, error: "payments_not_configured" }, 503);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const leadId: string | null =
      typeof body.lead_id === "string" && UUID_RE.test(body.lead_id.trim()) ? body.lead_id.trim() : null;
    const onboardingId: string | null =
      typeof body.onboarding_id === "string" && UUID_RE.test(body.onboarding_id.trim()) ? body.onboarding_id.trim() : null;
    if (!onboardingId) return json({ ok: false, error: "bad_request" }, 400);

    // The onboarding row must exist (it's the receipt of a completed questionnaire) and,
    // when a lead is attached, the lead must not already be a paying client.
    const { data: ob } = await service
      .from("onboarding_responses")
      // The three website answers come back too: they decide whether we can serve this customer at
      // all, and that has to be settled BEFORE a Stripe session exists. See the gate below.
      .select("id, lead_id, status, website_platform, website_platform_other, website_manager, willing_to_migrate, quick_close, " + DOMAIN_ROW_COLUMNS)
      .eq("id", onboardingId).maybeSingle();
    if (!ob) return json({ ok: false, error: "unknown_onboarding" }, 404);

    /* One place to record a refusal, mirroring stripe-webhook's recordPaymentFailure so both ends of
       the payment path land in the same table. Never throws: a logging failure must not turn a
       correct refusal into a 500 that the customer sees as a broken page. */
    const recordRefusal = async (errorId: string, context: Record<string, unknown>) => {
      try {
        const { error } = await service.from("client_error_reports").insert({
          error_id: errorId,
          context: { ...context, onboarding_id: onboardingId, at: new Date().toISOString() },
        });
        if (error) console.error(`[findable-checkout] could not record ${errorId}:`, error.message);
      } catch (e) {
        console.error(`[findable-checkout] could not record ${errorId}:`, (e as Error).message);
      }
    };

    const effectiveLeadId = (ob.lead_id as string | null) ?? leadId;

    /* ALREADY PAID — checked on the ROW first, which needs no lead attribution at all.
       The lead-level check below can only run when we know which lead this is, so it was blind
       exactly when it mattered: an existing client whose prefill failed lost their attribution, got
       a fresh generic onboarding row, and reached a Stripe session with nothing to check them
       against. The row's own status closes that: a row that has already been paid for can never
       start another session, however the visitor arrived. */
    if ((ob.status as string) === "paid") {
      await recordRefusal("checkout_refused_row_already_paid", {
        lead_id: effectiveLeadId, row_status: ob.status,
      });
      return json({ ok: false, error: "already_client" }, 403);
    }
    /* ══ CAN WE ACTUALLY SERVE THEM? ═══════════════════════════════════════════════════════════
       THIS IS THE REAL BLOCK. The questionnaire also hides the checkout button for a blocked
       answer, but that is presentation: anyone with devtools, a saved URL or a replayed request
       walks straight past it. Nothing but this refusal stops a Stripe session being created.

       Delivery works two ways and there is no third — WordPress we can publish to, or a site we
       are allowed to move to our hosting. Hand-editing a Wix page is ~15 minutes a page forever
       and does not work at a £99 one-off, so taking the money would mean doing half a job.

       DELIBERATELY AFTER THE ALREADY-PAID CHECKS. An existing client can never be re-gated by a
       rule that did not exist when they bought, and the gate itself never blocks on uncertainty —
       a skipped platform question or an unrecognised value degrades to "we don't know", which
       serves. See src/lib/serveGate.ts; every route to yes is decided before anything can block. */
    const gate = serveDecision(serveInputFromRow(ob as ServeGateRow));
    if (gate.verdict === "block") {
      await recordRefusal("checkout_refused_cannot_serve", {
        lead_id: effectiveLeadId,
        gate_code: gate.code,
        gate_reason: gate.reason,
        website_platform: ob.website_platform,
        website_platform_other: ob.website_platform_other,
        website_manager: ob.website_manager,
        willing_to_migrate: ob.willing_to_migrate,
      });
      console.log(`[findable-checkout] refused ${onboardingId}: ${gate.reason}`);
      return json({ ok: false, error: "cannot_serve", reason: gate.code }, 403);
    }

    /* ══ THE DOMAIN RULE (Paul, 2026-09-28, src/lib/domainAuthority.ts) ══════════════════════════
       We only build / connect the standard NEW site where the client confirms they own or control
       the domain and may authorise the change. Re-derived from the ROW (never the request), after the
       already-paid checks, so an existing client is never re-gated. Optimising their own site is not
       affected (the rule does not apply). The onboarding page shows the same verdict and a route to
       Paul; this refusal is the thing that actually stops a Stripe session. */
    /* ══ THE ROUTE (Paul, 2026-09-29): Findable Build = 12 payments, Findable Optimise = 6 ══════════════
       Read from the ROW (plan_tier, written by the questionnaire or Quick Close), never the request. An
       undecided or contradictory route is REFUSED here — no Stripe session may exist without the
       schedule it will create, and neither 12 nor 6 is ever a default (serviceRouteFromRow). */
    const route = serviceRouteFromRow(ob as { plan_tier?: unknown; website_addon?: unknown });
    if (!route) {
      await recordRefusal("checkout_refused_route_undecided", {
        lead_id: effectiveLeadId, plan_tier: (ob as { plan_tier?: unknown }).plan_tier ?? null, website_addon: (ob as { website_addon?: unknown }).website_addon ?? null,
      });
      return json({ ok: false, error: "route_undecided" }, 409);
    }

    /* ⚠️ QUICK CLOSE KEEPS ITS OWN DOMAIN GATE (2026-09-29). A Quick Close answers the domain questions
       on the phone (owns / controls the domain, who manages the site, authority) and sends ANY doubt to
       Paul, whose release is required before a link exists (quickClose.ts). It does not collect the
       self-service consents (DNS permission, supplied material), which Paul gathers after payment —
       and Paid Clients is never READY for a build without them. Before routes existed a Quick Close row
       never carried a build flag, so this rule never reached it; recording Build on it must not turn
       that into a refusal of every Quick Close build. The self-service path is unchanged. */
    const quickCloseCleared = mayGenerateLink((ob as { status?: string }).status, ((ob as { quick_close?: unknown }).quick_close ?? null) as QuickCloseRecord | null);
    const domain = domainAuthority(domainInputFromRow(ob as DomainRow));
    if (domain.applies && !domain.ready && !quickCloseCleared) {
      await recordRefusal("checkout_refused_domain_authority", { lead_id: effectiveLeadId, reasons: domain.reasons });
      console.log(`[findable-checkout] refused ${onboardingId}: domain ${domain.reasons.join(",")}`);
      return json({ ok: false, error: "domain_unresolved", reasons: domain.reasons }, 403);
    }

    /* Hoisted so the back-URL below can read it. `lead` itself is block-scoped to the check that
       follows and MUST stay that way — it carries status and amount_paid, which have no business
       being live further down. Only the display name escapes, and only as a string. */
    let leadBusinessName: string | null = null;
    if (effectiveLeadId) {
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, business_name, status, amount_paid, category, search_keyword, service_terminated_at")
        .eq("id", effectiveLeadId).maybeSingle();
      leadBusinessName = (lead?.business_name as string | null) ?? null;
      /* ⛔ ONE RULE WITH QUICK CLOSE (2026-10-05, pre-sales final): money on the lead, a paid-or-beyond
         status, REFUNDED, or an ENDED engagement (service_terminated_at) — quickCloseClosedRefusal. The
         old test here read only the money and three statuses, so an ended or refunded client whose amount
         was ever cleared could start a new session. PAID_OR_BEYOND stays as a second signal. */
      if (lead && (quickCloseClosedRefusal(lead as { amount_paid?: number | null; status?: string | null; service_terminated_at?: string | null }) || PAID_OR_BEYOND.has(lead.status as string))) {
        await recordRefusal("checkout_refused_already_client", {
          lead_id: effectiveLeadId, lead_status: lead.status, amount_paid: lead.amount_paid,
          ended: !!lead.service_terminated_at,
        });
        return json({ ok: false, error: "already_client" }, 403);
      }
      /* ⛔ A HELD PAYMENT IS OPEN (v3 backstop, _shared/payment-hold.ts): money was already taken outside the
         signed sign-up and Paul has not resolved it. A second payment would charge them twice — refuse until
         he refunds or migrates it. An unreadable hold table refuses too (fails closed). */
      try {
        if (await openHoldFor(service, effectiveLeadId)) {
          await recordRefusal("checkout_refused_payment_held", { lead_id: effectiveLeadId });
          return json({ ok: false, error: "payment_held" }, 409);
        }
      } catch (e) {
        await recordRefusal("checkout_refused_hold_unreadable", { lead_id: effectiveLeadId, error: (e as Error).message });
        return json({ ok: false, error: "agreement_unavailable" }, 503);
      }
      /* NO TRADE — the last line of defence, and the reason this check lives HERE rather than only
         in the senders. Every route to a Stripe session for this product passes through this
         function: the two WhatsApp templates, the copy-link button, a link pasted by hand, and a
         bare visit. Guarding the senders closes some of those; guarding this closes all of them.

         Without a trade on the LEAD, startPaidBaseline returns skipped:"no_business_type" and no
         baseline is ever created — so the four-week re-measurement this payment guarantees has
         nothing to measure against, and that only surfaces at week four in front of the customer. Refusing
         a payment is recoverable in a minute; selling an unmeasurable guarantee is not.

         MIRRORS audit-baseline.ts's own bizType line character for character, deliberately:
           ((lead.category) || (lead.search_keyword) || "").trim()
         Nominally the trade is `category`, but that column has never once been populated across 628
         leads, so a check on `category` alone would refuse every payment. If the baseline's
         expression changes, this must change with it.

         NOTHING is inferred. A business name that obviously implies a trade still refuses: a wrong
         trade would measure the guarantee against searches the customer never chose, which is worse
         than a refusal an operator fixes by hand. */
      const bizType = ((lead?.category as string) || (lead?.search_keyword as string) || "").trim();
      if (!bizType) {
        await recordRefusal("checkout_refused_no_trade", {
          lead_id: effectiveLeadId, business_name: (lead?.business_name as string | null) ?? null,  // so the log names who to fix
        });
        return json({ ok: false, error: "needs_trade" }, 403);
      }
    } else {
      /* NO ATTRIBUTION — refuse rather than take the money.
         Without a lead there is no baseline (startPaidBaseline returns skipped:no_lead_id) and
         therefore no way to measure the four-week re-measurement this payment guarantees. Taking
         the money for a promise that cannot be assessed is the wrong side of the trade, so the session is not
         created. The site turns this into an instruction to use their own link, never an error.
         Safe to enforce now that the client falls back to the URL's ?lead=, so a failed prefill no
         longer strips attribution from a real link - a missing lead here means there genuinely
         wasn't one. */
      await recordRefusal("checkout_refused_no_lead", { client_sent_lead_id: leadId });
      return json({ ok: false, error: "no_lead_attribution" }, 403);
    }

    /* Derived after the lead checks above, so `effectiveLeadId` is the one that passed them. */
    /* ONE PRICE FOR EVERYONE since 2026-09-03 - no lead lookup, nothing per-customer. Still the
       same function the plan card calls, so display and charge cannot diverge. */
    const offer = offerPrice();
    console.log(`[findable-checkout] price for lead ${effectiveLeadId}: £${offer.gbp} (${offer.reason})`);

    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : CANONICAL_ORIGIN;
    // Trailing slash on purpose: the built site serves /onboarding/ and 308-redirects
    // /onboarding to it. Returning a payer straight to the canonical path avoids an
    // extra hop on the most important redirect in the product.
    /* Cosmetic name segment, matching the links we send. The lead param is unchanged; the segment is
       dropped when there is no name, which also keeps the no-lead case identical to before. */
    /* Reads the hoisted name, NOT `lead` — which is not in scope here. It never was: this line
       shipped referencing a binding declared inside the block above, and optional chaining does not
       save an UNDECLARED name the way it saves a null one, so every call threw ReferenceError
       before the Stripe session was created. That took checkout down completely. */
    const backSlug = slugifyBusinessName(leadBusinessName ?? "");
    const backSegment = effectiveLeadId && backSlug !== "business" ? `${backSlug}/` : "";
    const back = `${origin}/onboarding/${effectiveLeadId ? `${backSegment}?lead=${effectiveLeadId}` : ""}`;

    const form = new URLSearchParams();
    /* ══ THE WEBSITE TICK ════════════════════════════════════════════════════════════════════
       🔴 THE BUILD IS NO LONGER A LINE ITEM (Paul, 2026-09-12). Until today the tick added TWO
       Stripe prices: a £49.99 one-off build and the £9.99/month hosting. The build is now included
       in FINDABLE_SETUP_PRICE_GBP, so the tick adds HOSTING ONLY and FINDABLE_WEBSITE_PRICE_ID is
       no longer read by this function at all.
       ⚠️ THE SECRET IS DELIBERATELY NOT DELETED, only unread. It is the Stripe account's record of
       what past customers were charged, and removing it from the dashboard would orphan their
       invoices. Nothing here will ever add it to a session again.
       ⛔ READ FROM THE ROW, NEVER FROM THE REQUEST. `body` is not consulted for this and must not
       be: the standing rule on this endpoint is that the browser never decides money — there is no
       parameter through which a discount can be asked for, and there must be none through which a
       recurring charge can be either. The tick was saved server-side at submit; this reads it back.
       ⚠️ STRICTLY `=== true`. Absent (a pre-migration row, or a submit that predates the field),
       null, "false", 0 - every one of them means NOT ticked. Absence is never a purchase.
       ⚠️ AND IT DEGRADES IF THE PRICE ID IS MISSING. The hosting price lives in a secret; if it is
       unset we charge the setup line ALONE rather than guessing an amount or refusing the payment
       outright. A customer who ticked the box and got no hosting line is a phone call; a customer
       charged for a subscription we cannot name a price for is a refund and a chargeback. */
    const wantsWebsite = (ob as { website_addon?: unknown }).website_addon === true;
    /* ⛔ THE TIER, READ FROM THE ROW (2026-09-17). It decides ONLY the copy on this page — the money
       taken today is £99 in payment mode either way; the recurring shape is built later by
       _shared/delayed-subscription.ts, which reads plan_tier itself. Browser never decides money, so
       this is read off the onboarding row, never from `body`.
       🔴 SINCE 2026-09-29 THE TIER IS THE ROUTE (serviceRouteFromRow, above): the price is the same on
       both, the NUMBER of payments is not — Build 12, Optimise 6 — and it is named on this page. */
    /* ⛔ IT MUST BE A PRICE ID, NOT A PRODUCT ID, AND THAT IS NOT A THEORETICAL MISTAKE — IT IS THE
       ONE THAT ACTUALLY HAPPENED (2026-09-03, first live test). A *_PRICE_ID secret was set to
       `prod_VBse8QguSes2Zr` and Stripe answered
         400 resource_missing on line_items[1][price]: No such price: 'prod_...'
       so the whole checkout failed. The dashboard shows a product's id far more prominently than
       its price's, and the two look alike, so a paste error here is the expected failure — and
       without this guard it lands as a dead Buy button at the exact moment someone decides to pay.
       ⚠️ AN UNUSABLE ID IS TREATED AS AN UNSET ONE, deliberately: the hosting line drops and the
       setup line still sells. Recorded with the reason either way. */
    const PRICE_ID_RE = /^price_[A-Za-z0-9]+$/;
    const rawHostingPriceId = (Deno.env.get("FINDABLE_HOSTING_PRICE_ID") ?? "").trim();
    const hostingPriceId = PRICE_ID_RE.test(rawHostingPriceId) ? rawHostingPriceId : "";
    const addOnReady = wantsWebsite && !!hostingPriceId;
    if (wantsWebsite && !addOnReady) {
      /* Names the offending value's SHAPE, never the value: a secret's contents do not belong in an
         error table, but "you pasted a prod_ id" is exactly what the operator needs to read. */
      const shapeOf = (v: string) => !v ? "unset" : (v.startsWith("prod_") ? "a PRODUCT id (prod_) - needs the PRICE id (price_)" : `unrecognised (starts "${v.slice(0, 6)}")`);
      console.error(`[findable-checkout] ${onboardingId} ticked the website option but the hosting price id is unusable - ${shapeOf(rawHostingPriceId)} - charging the setup line only`);
      await recordRefusal("checkout_addon_unconfigured", {
        onboarding_id: onboardingId, lead_id: effectiveLeadId,
        hosting_price_id: shapeOf(rawHostingPriceId),
      });
    }

    /* ⛔ THE MODE IS DECIDED BY THE ADD-ON, AND `payment` CANNOT CARRY A RECURRING PRICE - that is
       the whole reason this is not just an extra line item. In `subscription` mode Stripe bills the
       one-time lines on the FIRST INVOICE alongside the first month, so the customer enters a card
       once and pays £109.97 today, then £9.99 a month.
       ⚠️ Subscription mode always creates a Stripe CUSTOMER; payment mode may not. That id is new
       durable state and the webhook stores it - without it we could never cancel or answer "is this
       customer still paying". */
    /* 🔴 ALWAYS `payment` SINCE 2026-09-13 — THE SUBSCRIPTION IS NOT CREATED HERE ANY MORE.
       (HISTORY — superseded 2026-09-18: the webhook now creates the subscription at signup with a
       FINDABLE_MONTHLY_DELAY_DAYS trial.) Under the old delayed-monthly model the first charge started 14 days after the four-week results
       were SENT, and that date is unknowable at checkout: the replay lands on day 28 normally,
       later whenever it holds, and day 56 for RG by contract. A Checkout Session fixes its trial
       length at creation, so no number put here could express the offer.
       ⛔ SUPERSEDED TOO: the subscription is NOT created when the results go out any more. Since
       2026-09-18 stripe-webhook creates it on the successful £99 (_shared/delayed-subscription.ts),
       trial_end = firstRecurringPaymentIso(sign-up), cancel_at after recurringPaymentsFor(route).
       The results sender only reads it. A valid guarantee claim therefore has a subscription to cancel.
       ⛔ WHAT THIS SESSION DOES: takes the £99 and RETAINS THE CARD. Both settings below
       are payment-mode only and both are required — without the customer there is nobody to bill
       later, and without setup_future_usage the card is not kept, so the monthly could never start
       and the failure would surface four weeks later as silence. */
    form.set("mode", "payment");
    form.set("customer_creation", "always");
    form.set("payment_intent_data[setup_future_usage]", "off_session");
    /* ⛔ AND THE CUSTOMER IS TOLD, ON THE PAGE WHERE THE CARD IS ENTERED. Saving a card without
       saying so is the indefensible part of this, and Stripe's submit message is the only place
       the words sit beside the card field itself. */
    form.set("custom_text[submit][message]", cardSavedNoticeFor(route));
    /* ══ THE CLIENT SERVICE AGREEMENT v3 — SIGNED BEFORE ANY STRIPE SESSION EXISTS (Paul, 2026-10-05) ══
       Clause 1.2: the client accepts by clicking "I agree and sign" on their agreement page BEFORE the
       initial payment. This is the block that makes that true: nothing below creates a session unless a
       v3 acceptance exists for THIS lead, THIS sign-up (onboarding row) and THIS route
       (src/lib/signupGate.ts). There is no checkout tick any more — v3 has no such route to acceptance.
       ⛔ THE ONE SIGN-UP LINK. The client's agreement page (findable.live/agree/<token>) is where every
          path lands first: Quick Close asks for it outright (purpose "signup_link" — it never gets a
          Stripe URL), the self-service questionnaire's pay button is answered with it while unsigned
          (the site already navigates to whatever `url` comes back), and the page's own "Continue to
          secure payment" comes back here once signed.
       ⛔ FAILS CLOSED: no link row, no token, an unreadable acceptance → no session. */
    const purpose = body.purpose === "signup_link" ? "signup_link" : "pay";
    let signupUrl: string;
    try {
      const { data: link, error: linkErr } = await service.from("client_agreement_links")
        .upsert({ lead_id: effectiveLeadId, service_route: route }, { onConflict: "lead_id" })
        .select("token").single();
      if (linkErr) throw linkErr;
      if (!link?.token) throw new Error("no agreement token returned");
      signupUrl = agreementUrl(String(link.token));
    } catch (e) {
      await recordRefusal("checkout_agreement_link_failed", {
        onboarding_id: onboardingId, lead_id: effectiveLeadId,
        error: (e as { message?: string })?.message ?? String(e),
      });
      return json({ ok: false, error: "agreement_unavailable" }, 503);
    }
    if (purpose === "signup_link") {
      /* Every refusal above has run; the link is ready to hand to the client. No Stripe session. */
      return json({ ok: true, kind: "signup_link", url: signupUrl, session_id: null, expires_at: Math.floor((Date.now() + SIGNUP_LINK_LIFETIME_MS) / 1000) });
    }
    let acceptance: (GateAcceptance & { agreed_text: string }) | null = null;
    {
      const { data: acc, error: accErr } = await service.from("client_agreement_acceptances")
        .select("id, lead_id, onboarding_id, agreement_version, service_route, method, authority_confirmed, agreed_text, agreed_text_sha256")
        .eq("lead_id", effectiveLeadId).eq("onboarding_id", onboardingId).eq("agreement_version", CLIENT_AGREEMENT_VERSION)
        .order("accepted_at", { ascending: false }).limit(1).maybeSingle();
      if (accErr) {
        await recordRefusal("checkout_agreement_unreadable", { lead_id: effectiveLeadId, error: accErr.message });
        return json({ ok: false, error: "agreement_unavailable" }, 503);
      }
      acceptance = acc ?? null;
    }
    const gateResult = checkoutAgreementGate({
      acceptance, leadId: effectiveLeadId, onboardingId, route, currentVersion: CLIENT_AGREEMENT_VERSION,
      recomputedSha: acceptance ? await sha256Hex(acceptance.agreed_text) : null,
    });
    if (!gateResult.ok) {
      await recordRefusal("checkout_needs_signed_agreement", { lead_id: effectiveLeadId, refusal: gateResult.refusal });
      /* Not an error to the visitor: they are sent to sign. The site navigates to `url`; no session exists. */
      return json({ ok: true, kind: "agreement_required", url: signupUrl, refusal: gateResult.refusal });
    }
    /* ⛔ The binding facts, carried to the webhook: which signature this payment rests on, the terms it
       put the sale on, and the timing the monthly must follow (the webhook creates the subscription on a
       hold and LeadFinder sets the real Payment Start Date later — _shared/client-terms.ts). */
    form.set("metadata[agreement_version]", CLIENT_AGREEMENT_VERSION);
    form.set("metadata[agreement_acceptance_id]", gateResult.acceptanceId);
    form.set("metadata[commercial_terms]", COMMERCIAL_TERMS_V3);
    form.set("metadata[payment_timing]", OPTION_B_TIMING);
    /* ⛔ THE SALE CREATOR, FOR TRACING ONLY (F + H integration, 2026-10-05). Stripe session → onboarding_id (THE
       sign-up) → agreement_acceptance_id → the person who CREATED that sign-up (sale_creations, append-only).
       The seller is decided by the DATABASE from sale_creations when the payment lands (migration
       20261010130000) — never from this value, never from who owns the lead, never from whoever opened this
       session. Recorded here so the Stripe object alone names the chain. "multiple" / "none" / "unknown" are
       honest answers, never a guess; an unreadable table never blocks a signed client from paying. */
    {
      let creator = "unknown";
      try {
        const { data: cr, error: crErr } = await service.from("sale_creations").select("creator_user_id").eq("onboarding_id", onboardingId).limit(50);
        if (!crErr) {
          const ids = [...new Set(((cr ?? []) as { creator_user_id: string }[]).map((r) => r.creator_user_id))];
          creator = ids.length === 1 ? ids[0] : ids.length > 1 ? "multiple" : "none";
        }
      } catch { /* "unknown" */ }
      form.set("metadata[signup_creator]", creator);
    }
    /* Metadata rides on the SUBSCRIPTION too, not just the session: customer.subscription.* and
       invoice.* events carry the subscription, and without this a churn event could not be traced
       back to a lead. The session metadata below covers checkout.session.completed. */
    /* The subscription's own metadata is set where the subscription is created, in
       _shared/delayed-subscription.ts (from stripe-webhook). Nothing recurring exists here. */
    form.set("success_url", `${back}${back.includes("?") ? "&" : "?"}paid=1`);
    /* 🔴 v3 (2026-10-05): a payer who backs out returns to THEIR agreement page, which shows they have
       signed and offers "Continue to secure payment" again — the sign-up link is the one place to retry
       from. (Until v3 the cancel URL carried ?onboarding=<id> back to the questionnaire's plan screen; that
       screen now only ever forwards to the agreement page, so the id is no longer needed there.) The
       success URL still carries no retry token. */
    form.set("cancel_url", signupUrl);
    form.set("metadata[onboarding_id]", onboardingId);
    if (effectiveLeadId) form.set("metadata[lead_id]", effectiveLeadId);
    /* ⛔ THE ROUTE THE CUSTOMER IS SHOWN, CARRIED TO THE WEBHOOK. stripe-webhook creates the schedule
       from THIS (the words on this Stripe page), and refuses if the row's route has since changed. */
    form.set("metadata[service_route]", route);
    form.set("metadata[total_payments]", String(totalPaymentsFor(route)));
    const priceId = Deno.env.get("FINDABLE_SETUP_PRICE_ID") ?? "";
    if (priceId) {
      form.set("line_items[0][price]", priceId);
      form.set("line_items[0][quantity]", "1");
    } else {
      form.set("line_items[0][price_data][currency]", "gbp");
      /* ⛔ THE PRICE IS DERIVED HERE, FROM THE LEAD, AND NEVER FROM THE REQUEST. offerPriceForLead
         reads whether this lead has a completed audit and has not paid — neither of which a browser
         can fabricate — and the plan card that displayed the price called the same function. There
         is no parameter on this endpoint through which a discount can be asked for.
         ⚠️ IT FAILS CLOSED: every error path inside returns the standard price. A transient database
         error must never hand out an 80% discount.
         ⚠️ FINDABLE_SETUP_PRICE_GBP IS STILL THE FLOOR for anyone not eligible, which is the path
         that carries almost all the revenue and the one most worth regression-testing. */
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(offer.gbp * 100)));
      // The name is what the payer sees on their Stripe receipt; the description carries
      // the guarantee VERBATIM from findableOffer.ts — the wording the sale is made on.
      /* ⚠️ THE CUSTOMER READS THIS ON THEIR STRIPE RECEIPT, so it moved with the cycle (2026-09-03).
         🔴 AND IT NAMES BOTH FIGURES SINCE 2026-09-14. "4-week AI visibility cycle" described a
         finite piece of work on the receipt for a product that continues at FINDABLE_MONTHLY_GBP a
         month — the receipt is the document somebody digs out when they query the second charge,
         so it is the last place that should describe only the first one.
         ⚠️ Both figures are interpolated from the constants, never typed: this string is read by
         a customer and a price move must not be able to leave a stale number on a receipt. */
      /* 🔴 PER ROUTE (2026-09-29): "Findable Build … 12 payments" or "Findable Optimise … 6 payments". */
      form.set("line_items[0][price_data][product_data][name]", checkoutLineNameFor(route));
      form.set("line_items[0][price_data][product_data][description]", FINDABLE_GUARANTEE);
      form.set("line_items[0][quantity]", "1");
    }

    /* ══ THE HOSTING LINE ═════════════════════════════════════════════════════════════════════
       🔴 ONE ADD-ON LINE NOW, NOT TWO (2026-09-12). The £49.99 build line is gone — the build is
       included in the setup price — so the tick adds hosting and nothing else.
       ⛔ THE GUARANTEE IS ON THE SETUP LINE AND NOWHERE ELSE. Hosting is an ongoing service they
       can cancel at any time; attaching a refund promise to it would promise something we never
       agreed. This line carries its own description from its Stripe Price, and FINDABLE_GUARANTEE
       is deliberately not referenced here.
       ⛔ AND THE SETUP LINE MUST STAY INLINE price_data. A dashboard Price ID has no description
       field of ours, so moving it would DROP the guarantee text from the Stripe page silently -
       the FINDABLE_SETUP_PRICE_ID trap CLAUDE.md §11 records. Hosting uses a Price ID precisely
       because it carries no guarantee to lose.
       ⚠️ IF THE REFUND IS CLAIMED (Paul, 2026-09-23): refund the setup fee, cancel the subscription,
       and refund payment 2 as well if it was already taken inside the claim window
       (GUARANTEE_PAYMENT_TWO_SENTENCE; findable.live/refunds says so). Written here because this is the file that decides what the customer agreed to. */
    /* 🔴 THE HOSTING LINE HAS MOVED OFF THIS SESSION (2026-09-13). It was billed from day one,
       which put a charge inside the refund window; it now starts on the SAME anchor as the monthly,
       on one invoice, so a client deciding whether to claim has paid exactly £99 and nothing else.
       The tick is still read and recorded above — it is the record of what they bought, and the
       subscription builder reads it when the results go out.
       ⚠️ `hostingPriceId` is validated HERE and used THERE, deliberately: a bad price id is worth
       discovering while somebody is watching a checkout, not four weeks later in a background tick. */

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await res.json();
    if (!res.ok) {
      console.error("[findable-checkout] Stripe error:", session?.error?.message ?? session);
      /* ⛔ RECORDED, NOT JUST LOGGED. A refused Stripe session used to leave a single console line
         in the edge logs and a bare "checkout_failed" at the client - so a payment that Stripe
         rejected was undiagnosable after the fact, which is CLAUDE.md §4's "a catch-all error
         message is worse than no message" on the one path that carries all the revenue. It now
         lands in client_error_reports beside every other refusal on this endpoint.
         ⚠️ THE MESSAGE IS STORED, NEVER RETURNED. Stripe's text names parameters and ids; the
         client still gets the opaque code it always got. */
      const se = (session as { error?: { message?: string; code?: string; param?: string; type?: string } })?.error;
      await recordRefusal("checkout_stripe_rejected", {
        lead_id: effectiveLeadId,
        stripe_message: se?.message ?? null,
        stripe_code: se?.code ?? null,
        stripe_param: se?.param ?? null,
        stripe_type: se?.type ?? null,
        http_status: res.status,
        mode: "payment",
        website_addon: wantsWebsite,
      });
      return json({ ok: false, error: "checkout_failed" }, 502);
    }

    /* ⛔ WHAT STRIPE SAYS IT WILL CHARGE, RECORDED. The create-session RESPONSE carries
       amount_total, and until now it was thrown away - the function read `url` and nothing else.
       So there was no record anywhere of what a session was created for: only a completed payment
       ever produced a number, and a session that was never paid left nothing at all.
       ⚠️ THIS IS ALSO THE ONLY WAY TO VERIFY AN ITEMISATION FROM HERE. The hosted page is a
       JS-rendered shell - fetching it yields no amount_total, no line_items, not even the product
       name (CLAUDE.md §6 records the same finding when the guarantee length was checked). Stripe
       is the only source, and this is its answer.
       Non-fatal and after the session exists: a failed audit write must never lose a checkout. */
    try {
      const created = session as { amount_total?: number; currency?: string; mode?: string; subscription?: unknown; id?: string };
      await service.from("client_error_reports").insert({
        error_id: "checkout_session_created",
        context: {
          onboarding_id: onboardingId,
          lead_id: effectiveLeadId,
          session_id: created.id ?? null,
          mode: created.mode ?? null,
          amount_total_minor: created.amount_total ?? null,
          currency: created.currency ?? null,
          website_addon: wantsWebsite,
          addon_deferred_to_results: addOnReady,
          ai_line_gbp: offer.gbp,
          service_route: route,
          total_payments: totalPaymentsFor(route),
          quick_close_domain_gate: quickCloseCleared && domain.applies && !domain.ready,
        },
      });
    } catch (e) {
      console.error("[findable-checkout] could not record the created session:", (e as Error).message);
    }    return json({ ok: true, url: session.url });
  } catch (e) {
    console.error("[findable-checkout] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
