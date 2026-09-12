import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { slugifyBusinessName } from "../../../src/lib/reportSlug.ts";
import { FINDABLE_SETUP_PRICE_GBP, FINDABLE_GUARANTEE } from "../../../src/lib/findableOffer.ts";
import { offerPrice } from "../_shared/offer-price.ts";
/* ⚠️ IMPORTED FROM onboarding-followup.ts ON PURPOSE, despite the module name. That file is where
   "where does the public site live" was settled after the pages.dev incident, and it applies the
   host filter that keeps a preview domain out of a customer-facing URL. A second copy of that
   decision here is exactly the drift that put 27 of 47 onboarding links on the wrong host. */
import { resolveSiteOrigin } from "../_shared/onboarding-followup.ts";
import { serveDecision, serveInputFromRow, type ServeGateRow } from "../../../src/lib/serveGate.ts";

// findable-checkout — Stripe Checkout for the Findable onboarding plan (verify_jwt = false;
// called by the public findable-site with the anon apikey — the visitor has no app account).
//
// ONE plan: the four-week cycle, ONE-OFF at FINDABLE_SETUP_PRICE_GBP (findableOffer.ts), with a
// refund if the measured number has not gone up. mode=payment — UNLESS the customer asked us to
// build their site, which adds the £9.99/month hosting line and makes it mode=subscription. Either
// way this is deliberately NOT the barber subscription function (that one needs an operator JWT,
// bills £29.99/month and redirects to /barber).
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
      .select("id, lead_id, status, website_platform, website_platform_other, website_manager, willing_to_migrate, website_addon")
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

    /* Hoisted so the back-URL below can read it. `lead` itself is block-scoped to the check that
       follows and MUST stay that way — it carries status and amount_paid, which have no business
       being live further down. Only the display name escapes, and only as a string. */
    let leadBusinessName: string | null = null;
    if (effectiveLeadId) {
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, business_name, status, amount_paid, category, search_keyword")
        .eq("id", effectiveLeadId).maybeSingle();
      leadBusinessName = (lead?.business_name as string | null) ?? null;
      if (lead && (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0)) {
        await recordRefusal("checkout_refused_already_client", {
          lead_id: effectiveLeadId, lead_status: lead.status, amount_paid: lead.amount_paid,
        });
        return json({ ok: false, error: "already_client" }, 403);
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
    form.set("mode", addOnReady ? "subscription" : "payment");
    /* Metadata rides on the SUBSCRIPTION too, not just the session: customer.subscription.* and
       invoice.* events carry the subscription, and without this a churn event could not be traced
       back to a lead. The session metadata below covers checkout.session.completed. */
    if (addOnReady) {
      form.set("subscription_data[metadata][onboarding_id]", onboardingId);
      if (effectiveLeadId) form.set("subscription_data[metadata][lead_id]", effectiveLeadId);
      form.set("subscription_data[metadata][product]", "findable_hosting");
    }
    form.set("success_url", `${back}${back.includes("?") ? "&" : "?"}paid=1`);
    // The cancel URL carries the onboarding row, the success URL deliberately does not.
    //
    // A payer who backs out has to be able to try again, and the plan screen's button is dead
    // without this id. The client also keeps it in sessionStorage, but storage is unavailable in
    // private mode and gone if the tab was replaced - and that customer must not be the one who
    // cannot buy. Re-answering is not a fallback: the questionnaire refuses a second submit inside
    // ten minutes.
    //
    // Safe to expose: this endpoint already accepts onboarding_id from the client, checks the row
    // exists, and takes the lead FROM THE ROW rather than from the caller, so a substituted id
    // cannot attach a payment to someone else's lead. Kept off success_url so a paid receipt does
    // not carry a live retry token.
    form.set(
      "cancel_url",
      `${back}${back.includes("?") ? "&" : "?"}cancelled=1&onboarding=${onboardingId}`,
    );
    form.set("metadata[onboarding_id]", onboardingId);
    if (effectiveLeadId) form.set("metadata[lead_id]", effectiveLeadId);
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
      /* ⚠️ THE CUSTOMER READS THIS ON THEIR STRIPE RECEIPT, so it moved with the cycle (2026-09-03). */
      form.set("line_items[0][price_data][product_data][name]", "Findable — 4-week AI visibility cycle");
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
       ⚠️ IF THE REFUND IS CLAIMED: refund the setup fee and cancel the hosting subscription.
       Monthly payments already taken are not refunded, and findable.live/refunds says so in those
       words. Written here because this is the file that decides what the customer agreed to. */
    if (addOnReady) {
      form.set("line_items[1][price]", hostingPriceId);
      form.set("line_items[1][quantity]", "1");
    }

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
        mode: addOnReady ? "subscription" : "payment",
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
          addon_charged: addOnReady,
          ai_line_gbp: offer.gbp,
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
