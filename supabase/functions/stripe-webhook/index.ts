import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { preparePaidBaselineQuestions, startPaidBaseline } from "../_shared/audit-baseline.ts";
import { createDelayedSubscription } from "../_shared/delayed-subscription.ts";
import { questionnaireComplete } from "../../../src/lib/questionnaireComplete.ts";
import { FINDABLE_SETUP_PRICE_GBP, REPORT_PUBLIC_ORIGIN, monthlyStartingSoonEmail, paymentFailedEmail, subscriptionEndedEmail } from "../../../src/lib/findableOffer.ts";
/* The customer payment confirmation goes through the SHARED module, in-process — not an HTTP call
   to send-whatsapp-message. That function authenticates an OPERATOR user JWT and has no cron or
   service branch, so a webhook cannot call it; and giving the function that sends WhatsApp a new
   auth branch to suit a webhook is the blast-radius decision instantly-push already refused
   (CLAUDE.md §6). This is the same mechanism process-ai-audit-queue's automated audit_reply send
   uses: resolve env, build the payload from the template registry, POST to Graph. */
import {
  claimTemplatePayload, renderTemplateBody, resolveWhatsAppEnv, sendViaGraph, toWhatsAppNumber,
} from "../_shared/whatsapp-send.ts";

// stripe-webhook — flips generated_sites.is_paid from Stripe subscription events.
//
// Mapping: the create-barber-checkout function stamps `metadata.generated_site_id`
// on BOTH the Checkout Session and the Subscription, so every event below can be
// mapped back to exactly one barber site. No DB columns / migration needed.
//
//   checkout.session.completed          → is_paid = true   (first payment landed)
//   customer.subscription.updated       → is_paid = true/false by status
//   customer.subscription.deleted       → is_paid = false   (ended)
//
// Idempotent: each handler sets is_paid to a FIXED value, so Stripe re-deliveries
// and out-of-order events converge to the right state (no event-dedup table).
//
// Signature is verified with STRIPE_WEBHOOK_SECRET (never trust an unverified
// body). Keys come ONLY from Supabase function secrets — nothing is hardcoded.
// verify_jwt = false in config.toml (Stripe can't send a Supabase JWT; we verify
// the Stripe signature instead).

type PaidSite = {
  id: string;
  site_name: string | null;
  content: Record<string, unknown> | null;
  booking_only: boolean | null;
  owner_id: string | null;
  lead_id: string | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Posts to Resend and RETURNS the outcome (2026-09-13). It used to return void, so the PAID email's
 *  success or failure lived only in a console log nobody can read — which is why "was the payment
 *  email ever sent?" could not be answered for the 12 Sep payment. */
async function postResend(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; id: string | null; error: string | null }> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.warn("[stripe-webhook] RESEND_API_KEY not set; skipping email"); return { ok: false, status: 0, id: null, error: "RESEND_API_KEY not set" }; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[stripe-webhook] Resend non-OK:", res.status, body.slice(0, 200));
    return { ok: false, status: res.status, id: null, error: body.slice(0, 300) };
  }
  let id: string | null = null;
  try { id = (JSON.parse(body) as { id?: string }).id ?? null; } catch { /* id stays null */ }
  return { ok: true, status: res.status, id, error: null };
}

/** Resolve a REAL inbox for the barber: the owner's auth email, unless it's a synthetic
 *  phone-signup account (@claimed.yoursites.uk, no inbox) — then fall back to the lead's
 *  captured email. Returns null if neither is a real address. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveBarberEmail(service: any, site: PaidSite): Promise<string | null> {
  let email: string | null = null;
  if (site.owner_id) {
    try {
      const { data } = await service.auth.admin.getUserById(site.owner_id);
      email = data?.user?.email ?? null;
    } catch (e) { console.error("[stripe-webhook] getUserById failed:", (e as Error).message); }
  }
  const synthetic = !email || email.toLowerCase().endsWith("@claimed.yoursites.uk");
  if (synthetic && site.lead_id) {
    try {
      const { data: lead } = await service.from("outreach_leads").select("email").eq("id", site.lead_id).maybeSingle();
      const le = (lead as { email?: string | null } | null)?.email;
      if (le && le.includes("@") && !le.toLowerCase().endsWith("@claimed.yoursites.uk")) email = le;
    } catch (e) { console.error("[stripe-webhook] lead email lookup failed:", (e as Error).message); }
  }
  if (!email || !email.includes("@") || email.toLowerCase().endsWith("@claimed.yoursites.uk")) return null;
  return email;
}

/** ONE address for anything this system tells the operator, matching notify-onboarding-submit.
 *  The barber notifier below keeps its own paul@yoursites.uk deliberately — it is a working,
 *  money-verified path and changing where its mail lands is not worth the risk today. */
/* Stripe expands-or-not: a reference field is either the id string or the whole object. The
   checkout case has its own local copy of this; this one is module scope so every case can use it
   without each inventing its own reading of the same shape. */
const idOfRef = (v: unknown): string | null =>
  typeof v === "string" ? v
    : (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);

const ADMIN_EMAIL = "paul@move37.fun";
/* 🔴 THE SENDER, AND IT COST THE "PAID £99" EMAIL ON 2026-09-13. Every operator notification from
   this function went out as `noreply@lead-finder-app.com` — the OLD barber product's domain, which
   is not verified on the Resend account RESEND_API_KEY belongs to. Resend does not degrade on an
   unverified sender, it REFUSES: HTTP 403 "The lead-finder-app.com domain is not verified", every
   time, for ever. So Paul was told a paying customer had not paid (a separate fault, corrected
   below) and never received the email that would have contradicted it.

   ⛔ THIS IS THE SECOND TIME, AND THE FIRST FIX MISSED THIS FILE. free-check-result.ts carries the
   whole record of the same fault on 2026-09-02, three operator notifications lost; that file moved
   to findable.live and stripe-webhook was left behind, because nobody swept for the domain. The
   address below is the one that demonstrably delivered on the night this was found.
   ⚠️ The two BARBER sends further down still use the old domain and are deliberately untouched —
   dead product, and changing what they claim to be is not a deliverability fix. */
const FROM_OPERATOR = "Findable alerts <alerts@findable.live>";
/** Written to notify_error once a late payment has been corrected, so it is corrected exactly once. */
const CORRECTED_MARK = "corrected:";

/* ⛔ "recieved", i BEFORE e — THE TYPO IS THE REGISTERED NAME AT META AND IS THEREFORE CORRECT.
   Meta matches the template name exactly; the correctly-spelled "payment_received" would fail
   template-not-found. Named as a constant so the misspelling appears ONCE and cannot be silently
   auto-corrected by a later reader or an editor. Registered in WA_TEMPLATES (and the queue's mirror)
   as one variable: {{1}} = business name. */
const TEMPLATE_PAYMENT_CONFIRM = "payment_recieved";

/**
 * Best-effort: tell the operator a FINDABLE payment landed.
 *
 * Deliberately SEPARATE from notifyOfPayment rather than an adaptation of it. That function takes a
 * PaidSite, builds bookmybarber/yoursites URLs and a barber dashboard link, and emails the CUSTOMER
 * as well as the admin. None of that applies here, and bending it would put findable logic inside
 * the one notification path already verified with real money. This reuses the mechanism that matters
 * — postResend, and the "every step guarded, never affects the 200" contract — and nothing else.
 *
 * Admin only. No customer email is sent on this path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyOfFindablePayment(opts: {
  businessName: string; amountGbp: number; paidFor: string;
  trade: string | null; town: string | null; phone: string | null; email: string | null;
  note?: string | null;
  /* 🔴 THE SUBJECT TAG HAS ITS OWN FACT NOW (2026-09-14). It used to read `opts.note ? " (NOT
     LINKED)" : ""` — one tag inferred from whether ANY note existed, while `note` carries two
     unrelated things: a payment with no CRM lead, and a linked payment whose post-payment details
     are still outstanding. The second is the normal state of every first payment, so every real
     customer's PAID email was subject-tagged as unlinked when it was linked perfectly well — the
     first thing Paul reads, at the worst moment, sending him after a fault that does not exist.
     A tag that describes a DIFFERENT condition from the one that produced it is worse than no tag. */
  noLead?: boolean;
  /* THE TRACE (2026-09-13). The outcome is written to client_error_reports as `payment_email_sent`
     or `payment_email_failed`, so "did the PAID email go?" is answerable from a row rather than
     from the operator's inbox. `record` is the webhook's own recorder (event id attached). */
  onboardingId?: string | null; leadId?: string | null;
  record?: (errorId: string, ctx: Record<string, unknown>) => Promise<void>;
}): Promise<void> {
  const trace = async (errorId: string, ctx: Record<string, unknown>) => {
    try { await opts.record?.(errorId, { onboarding_id: opts.onboardingId ?? null, lead_id: opts.leadId ?? null, amount_gbp: opts.amountGbp, ...ctx }); } catch { /* never affects the 200 */ }
  };
  try {
    const name = opts.businessName.trim() || "A client";
    const amount = `£${opts.amountGbp.toFixed(2)}`;
    /* contact_email has NEVER been populated in this table, so "(not given)" is the expected
       reading rather than a fault — the questionnaire only began asking recently. Every optional
       line is omitted entirely when absent, so the email never shows a dangling empty label. */
    const line = (k: string, v: string | null) => (v && v.trim() ? `  ${k.padEnd(8)}${v.trim()}\n` : "");
    const text =
      `${name} has paid.\n\n` +
      /* The job first: it is what decides whether there is anything you can do today. */
      (opts.job ? `  ${opts.job}\n\n` : "") +
      `  Amount: ${amount}\n` +
      `  For:    ${opts.paidFor}\n` +
      line("Trade:", opts.trade) + line("Town:", opts.town) +
      line("Phone:", opts.phone) + line("Email:", opts.email ?? "(not given)") +
      (opts.note ? `\n${opts.note}\n` : "") +
      `\nSetup is promised within two working days.\n`;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const row = (k: string, v: string | null) =>
      v && v.trim() ? `<p style="margin:0 0 2px"><strong>${k}</strong> ${esc(v.trim())}</p>` : "";
    const html =
      `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
      `<h2 style="margin:0 0 12px">${esc(name)} has paid</h2>` +
      (opts.job ? `<p style="margin:0 0 12px;padding:8px 10px;background:#f1f5f9;border-left:3px solid #0f172a;font-weight:700">${esc(opts.job)}</p>` : "") +
      row("Amount:", amount) + row("For:", opts.paidFor) +
      row("Trade:", opts.trade) + row("Town:", opts.town) +
      row("Phone:", opts.phone) + row("Email:", opts.email ?? "(not given)") +
      (opts.note ? `<p style="margin:10px 0 0;color:#b45309"><strong>${esc(opts.note)}</strong></p>` : "") +
      `<p style="margin:10px 0 0;color:#475569">Setup is promised within two working days.</p>` +
      `</div>`;
    const out = await postResend({
      from: FROM_OPERATOR,
      to: [ADMIN_EMAIL],
      /* Only the genuinely unattributed payment earns a tag: it is the one that needs a hand.
         Outstanding details are normal and are explained in the BODY, where the sentence already is. */
      subject: `PAID ${amount} — ${name}${opts.noLead ? " (NO LEAD)" : ""}`,
      text, html,
    });
    if (out.ok) {
      console.log(`[stripe-webhook] findable payment email sent for ${name} (${out.id ?? "no id"})`);
      await trace("payment_email_sent", { to: ADMIN_EMAIL, subject: `PAID ${amount} — ${name}`, provider_message_id: out.id });
    } else {
      await trace("payment_email_failed", { to: ADMIN_EMAIL, http_status: out.status, error: out.error });
    }
  } catch (e) {
    // NEVER affects the webhook's 200. The money is already written by the time this runs.
    console.error("[stripe-webhook] notifyOfFindablePayment failed (non-blocking):", (e as Error).message);
    await trace("payment_email_failed", { error: (e as Error).message });
  }
}

/* ══ THE CUSTOMER'S PAYMENT CONFIRMATION (WhatsApp) ═══════════════════════════════════════════
   Until now a Findable payer received NOTHING: the webhook emailed the operator and started the
   baseline, and the only confirmation was an on-screen panel they lose by closing the tab.

   ⛔ PAYMENT RECORDING IS SACRED AND THIS IS BEST-EFFORT ON TOP. Every path returns rather than
   throws, the whole body is wrapped, and it deliberately does NOT use mustWrite — mustWrite exists
   to fail the webhook so Stripe retries, which is right for money and wrong for a greeting. A
   failure here must never re-run the money writes. Same contract as notifyOfFindablePayment.

   ⛔ A TEMPLATE BYPASSES THE 24-HOUR WINDOW, AND THAT IS WHY IT MUST BE ONE. The payer just used a
   web checkout, which is not a WhatsApp inbound, so the customer-service window is almost always
   CLOSED at this moment. The window check lives only in send-whatsapp-message's FREE-TEXT branch
   (`if (env.live && !windowOpen) return "window_closed"`); a template payload posted to Graph has no
   such gate anywhere in this codebase. Sending free text here would fail for nearly every customer.

   ⚠️ TEST-MODE GATED like every other send path: nothing reaches Meta unless WHATSAPP_TEST_MODE is
   "off" AND both secrets exist. Until then it logs WOULD SEND with the resolved variable.

   ⚠️ SUPPRESSION IS NOT CHECKED, deliberately. This is transactional and customer-initiated — they
   have just paid us — not outreach. `is_archived` IS checked, because it is a field on the row we
   already read and it is the operator's explicit "stop contacting this business"; a paid+archived
   lead is a contradiction worth surfacing rather than messaging through. */
async function sendFindablePaymentConfirmation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  opts: { leadId: string; onboardingId: string; fallbackBusinessName: string },
): Promise<void> {
  const tag = `[findable-confirm] onboarding=${opts.onboardingId} lead=${opts.leadId}`;
  try {
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, country, user_id, is_archived")
      .eq("id", opts.leadId)
      .maybeSingle();
    if (!lead) { console.warn(`${tag}: lead row not found — confirmation skipped`); return; }

    if (lead.is_archived === true) {
      console.warn(`${tag}: lead is ARCHIVED yet has just paid — confirmation skipped, message them by hand`);
      return;
    }

    /* 🔴 GUARD 2 — AND THIS COMMENT WAS THE BUG REPORT. It read: "no phone is a clean skip, not an
       error. The questionnaire never asks for one, so a lead without one is a normal state." That
       stopped being true when the pre-pay panel began asking for the phone (2026-09-13), and while
       it was true it was doing real damage: White Sparks Electrical paid £99 as a cold signup with
       phone = null, this branch skipped, and the only trace was a console.warn — which the CLI
       cannot read. Paul found out because no WhatsApp arrived.
       ⛔ SO IT IS RECORDED NOW, NOT LOGGED. A paying customer we cannot reach on the channel that
       carries the business is not a normal state and must never again be invisible. It is still a
       skip rather than an error: the payment succeeded and the operator email goes either way. */
    const to = toWhatsAppNumber((lead.phone as string) ?? "", (lead.country as string) ?? null);
    if (!to) {
      console.warn(`${tag}: no usable WhatsApp number on the lead — confirmation skipped`);
      try {
        await service.from("client_error_reports").insert({
          error_id: "payment_confirmation_unreachable",
          context: {
            lead_id: opts.leadId,
            business_name: (lead.business_name as string) ?? null,
            stored_phone: (lead.phone as string) ?? null,
            why: "no usable WhatsApp number on the lead when the payment confirmation fired",
          },
        });
      } catch (e) {
        console.error(`${tag}: could not record the unreachable payer:`, e instanceof Error ? e.message : String(e));
      }
      return;
    }

    /* {{1}} — the same business name the report and the onboarding flow use, with the onboarding
       row's own name as the fallback. Blank SKIPS rather than sending the "your business" default
       templateBodyParams would otherwise substitute: a greeting-shaped template addressed to a
       placeholder, sent to somebody who has just paid, is worse than no message. The operator email
       fires either way, so a skip is never silent. */
    const businessName = ((lead.business_name as string) ?? "").trim() || opts.fallbackBusinessName.trim();
    if (!businessName) {
      console.warn(`${tag}: no business name for {{1}} — confirmation skipped rather than sent to a placeholder`);
      return;
    }

    /* Built from the template REGISTRY, never hand-rolled: claimTemplatePayload throws on a name
       that is not in WA_TEMPLATES rather than guessing a variable shape, which is what turned a
       one-variable guess into Meta rejection #132000 on re_engage. The claimUrl argument is unused
       because this template's vars are ["name"] only. */
    const payload = claimTemplatePayload(TEMPLATE_PAYMENT_CONFIRM, "en", businessName, "");

    const env = resolveWhatsAppEnv();
    if (!env.live) {
      console.log(`${tag}: WOULD SEND ${TEMPLATE_PAYMENT_CONFIRM} → ${to} | {{1}}="${businessName}" (test mode / secrets missing — not sent)`);
      return;
    }

    const res = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);
    const status = res.ok ? "sent" : "failed";
    if (res.ok) console.log(`${tag}: sent ${TEMPLATE_PAYMENT_CONFIRM} to ${to} (msg ${res.messageId})`);
    else console.error(`${tag}: send FAILED: ${res.error}`);

    /* Both logs, and both non-blocking — the message is already gone by this point.
       whatsapp_messages.user_id is the LEAD'S OWNER, not null: the Inbox groups a conversation by
       (user_id, phone), so a null here would strand the confirmation in a separate "unassigned"
       thread instead of appearing in the customer's own. whatsapp_sends.user_id IS null, which is
       the convention for an automated send and matches both queue writes.
       ⚠️ whatsapp_sends is what the daily cap counts, so this confirmation spends one send of
       DAILY_CAP — correct, because it is a real message to Meta. */
    try {
      await service.from("whatsapp_messages").insert({
        direction: "outbound",
        user_id: (lead.user_id as string | null) ?? null,
        lead_id: lead.id,
        phone: to,
        body: renderTemplateBody(TEMPLATE_PAYMENT_CONFIRM, businessName, ""),
        message_type: "template",
        template_name: TEMPLATE_PAYMENT_CONFIRM,
        wa_message_id: res.messageId,
        status,
        test_mode: env.testMode,
        error: res.error,
      });
    } catch (e) {
      console.error(`${tag}: message-log insert threw (non-blocking):`, (e as Error).message);
    }
    try {
      await service.from("whatsapp_sends").insert({
        lead_id: lead.id,
        user_id: null,
        template: TEMPLATE_PAYMENT_CONFIRM,
        phone: to,
        business_name: businessName,
        claim_url: null,
        test_mode: env.testMode,
        message_id: res.messageId,
        delivery_status: status,
        error: res.error,
      });
    } catch (e) {
      console.error(`${tag}: send-audit insert threw (non-blocking):`, (e as Error).message);
    }
  } catch (e) {
    /* GUARD 1 — the outermost net. Nothing in here may reach the caller: the money is already
       written and a thrown error would 500 the webhook and make Stripe replay the whole event. */
    console.error(`${tag}: confirmation threw (non-blocking, payment is unaffected):`, (e as Error).message);
  }
}

/** Best-effort: on the FIRST upgrade to paid, email the admin + (if a real inbox) the
 *  barber, with wording branched on booking_only. Every step is guarded so a Resend or
 *  lookup failure NEVER affects the webhook's 200 response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyOfPayment(service: any, site: PaidSite): Promise<void> {
  try {
    const content = (site.content ?? {}) as Record<string, unknown>;
    const slug = typeof site.site_name === "string" ? site.site_name : "";
    const shopName = (typeof content.businessName === "string" && content.businessName.trim())
      ? content.businessName.trim() : (slug || "A barber");
    const bookingOnly = site.booking_only === true;
    const product = bookingOnly ? "Booking page (bookmybarber.uk)" : "Full marketing site (yoursites.uk)";
    const liveUrl = bookingOnly ? `https://bookmybarber.uk/${slug}` : `https://yoursites.uk/p/${slug}`;
    const dashUrl = "https://yoursites.uk/barber";
    const barberEmail = await resolveBarberEmail(service, site);

    // (a) Admin — always.
    try {
      await postResend({
        from: "LeadFinder Pro <noreply@lead-finder-app.com>",
        to: ["paul@yoursites.uk"],
        subject: `💰 ${shopName} upgraded to paid`,
        text:
          `A barber just upgraded to paid.\n\n` +
          `Shop:    ${shopName}\n` +
          `Product: ${product}\n` +
          `Contact: ${barberEmail ?? "(no real email on file)"}\n` +
          `Site:    ${liveUrl}\n`,
        html:
          `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
          `<h2 style="margin:0 0 12px">Barber upgraded to paid 💰</h2>` +
          `<p style="margin:0 0 4px"><strong>Shop:</strong> ${esc(shopName)}</p>` +
          `<p style="margin:0 0 4px"><strong>Product:</strong> ${esc(product)}</p>` +
          `<p style="margin:0 0 4px"><strong>Contact:</strong> ${esc(barberEmail ?? "(no real email on file)")}</p>` +
          `<p style="margin:0 0 4px"><strong>Site:</strong> <a href="${esc(liveUrl)}">${esc(liveUrl)}</a></p>` +
          `</div>`,
      });
    } catch (e) { console.error("[stripe-webhook] admin payment email failed:", (e as Error).message); }

    // (b) Barber — only if we resolved a real inbox.
    if (barberEmail) {
      const productNoun = bookingOnly ? "booking page" : "site";
      const unlocked = bookingOnly
        ? `Online bookings are now live on your booking page, and SMS booking reminders are switched on.`
        : `Online bookings, SMS reminders, staff management, and your custom web address are now unlocked.`;
      try {
        await postResend({
          from: "Paul <noreply@lead-finder-app.com>",
          reply_to: "paul@move37.fun",
          to: [barberEmail],
          subject: `Payment received - your ${productNoun} is upgraded`,
          text:
            `Hi ${shopName},\n\n` +
            `Thanks - your payment went through and your ${productNoun} is upgraded.\n\n` +
            `What's unlocked:\n${unlocked}\n\n` +
            `Manage everything from your dashboard:\n${dashUrl}\n\n` +
            `Any questions, just reply to this email.\n\nPaul`,
          html:
            `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;max-width:560px">` +
            `<p style="margin:0 0 12px">Hi ${esc(shopName)},</p>` +
            `<p style="margin:0 0 16px">Thanks — your payment went through and your ${esc(productNoun)} is upgraded. 🎉</p>` +
            `<p style="margin:0 0 2px"><strong>What's unlocked</strong></p>` +
            `<p style="margin:0 0 16px">${esc(unlocked)}</p>` +
            `<p style="margin:0 0 2px"><strong>Manage everything from your dashboard</strong></p>` +
            `<p style="margin:0 0 16px"><a href="${dashUrl}">${dashUrl}</a></p>` +
            `<p style="margin:0 0 12px">Any questions, just reply to this email.</p>` +
            `<p style="margin:0">Paul</p>` +
            `</div>`,
        });
      } catch (e) { console.error("[stripe-webhook] barber payment email failed:", (e as Error).message); }
    } else {
      console.warn(`[stripe-webhook] no real barber inbox for site ${site.id}; sent admin only`);
    }
  } catch (e) {
    console.error("[stripe-webhook] notifyOfPayment failed (non-blocking):", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!stripeSecret || !webhookSecret) {
    // WAS: a silent 200. That made a rotated or mistyped secret indistinguishable from "no
    // sales" - Stripe treats 200 as delivered, never retries, and the payment is gone with no
    // trace anywhere. Now: shout, and return 500 so Stripe RETRIES (it keeps trying for ~3 days,
    // long enough to notice and fix a secret) and the failure shows in the Stripe dashboard.
    console.error(
      `[stripe-webhook] REFUSING EVENT - secrets missing (STRIPE_SECRET_KEY:${stripeSecret ? "set" : "MISSING"}, ` +
      `STRIPE_WEBHOOK_SECRET:${webhookSecret ? "set" : "MISSING"}). Returning 500 so Stripe retries rather than dropping the payment.`,
    );
    return new Response(JSON.stringify({ received: false, error: "webhook_not_configured" }), { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(stripeSecret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });

  // Verify the signature (async + SubtleCrypto: required on Deno/Edge).
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed:", (e as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // Idempotent write: set is_paid to a fixed value on the one mapped site. On a
  // paid=true event we read the row first so we can email EXACTLY ONCE on the real
  // false→true upgrade (renewals/re-deliveries set true again but won't re-email).
  /* Durable record of a payment write that did not land. client_error_reports is a generic
     jsonb error sink (error_id + context), so this needs no migration and is queryable now:
       select * from client_error_reports where error_id like 'stripe_%' order by created_at desc;
     Best-effort by design: if even this insert fails we still log, because the caller is about to
     throw and Stripe will retry regardless. */
  const recordPaymentFailure = async (errorId: string, context: Record<string, unknown>) => {
    try {
      const { error } = await service.from("client_error_reports").insert({
        error_id: errorId,
        context: { ...context, event_id: event.id, event_type: event.type, at: new Date().toISOString() },
      });
      if (error) console.error(`[stripe-webhook] could not record ${errorId}:`, error.message);
    } catch (e) {
      console.error(`[stripe-webhook] could not record ${errorId}:`, (e as Error).message);
    }
  };

  /* A write in the payment path that CANNOT fail quietly.
     supabase-js resolves with { error } rather than throwing, so the try/catch that used to wrap
     these updates could never fire: a rejected write still printed the success line and returned
     200. This checks the error AND that a row actually matched (.select()), records the failure,
     then throws - the handler's outer catch turns that into a 500, so Stripe retries. The updates
     set a terminal state, so a retry is safe. */
  const mustWrite = async (
    table: string,
    patch: Record<string, unknown>,
    id: string,
    what: string,
  ): Promise<void> => {
    const { data, error } = await service.from(table).update(patch).eq("id", id).select("id");
    if (error) {
      console.error(`[stripe-webhook] ${what} FAILED (${table} ${id}):`, error.message);
      await recordPaymentFailure("stripe_write_failed", { what, table, row_id: id, reason: error.message, patch });
      throw new Error(`${what} failed: ${error.message}`);
    }
    if (!Array.isArray(data) || data.length === 0) {
      console.error(`[stripe-webhook] ${what} MATCHED NO ROW (${table} ${id}) - money taken, nothing updated`);
      await recordPaymentFailure("stripe_write_no_row", { what, table, row_id: id, patch });
      throw new Error(`${what} matched no row (${table} ${id})`);
    }
    console.log(`[stripe-webhook] ${what} ok (${table} ${id})`);
  };

  /** A lead id has to look like one before it is used as a filter: metadata is free text set at
   *  checkout, and a malformed value would otherwise become a PostgREST error at event time. */
  const SUB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* ══ FINDABLE HOSTING SUBSCRIPTIONS ═══════════════════════════════════════════════════════
     🔴 BEFORE 2026-09-03 A FINDABLE SUBSCRIPTION EVENT WAS INVISIBLE. This function handled three
     events, and the two subscription ones read `metadata.generated_site_id` and wrote
     generated_sites.is_paid - the BARBER product. A Findable event arrives without that id, so
     setPaid's own empty-id guard logged "skipped" and nothing happened: a renewal, a failed card
     and a cancellation were all silent, and `paid = amount_paid > 0` kept reading a churned
     customer as paying forever.

     ⛔ THE LEAD IS RESOLVED BY stripe_subscription_id, NOT BY METADATA. Metadata is set on the
     subscription at checkout, but an INVOICE does not inherit it - so keying on metadata would work
     for customer.subscription.* and silently fail for the renewals, which are the events that
     matter most. The stored id is the one identifier every event carries.
     ⚠️ Falls back to metadata.lead_id when the id lookup finds nothing, which covers the window
     between a checkout and its own id-storing write, and any subscription created by hand. */
  /* ⛔ ONE PLACE THAT EMAILS A CLIENT FROM THIS WEBHOOK, and it resolves the address the same way
     the results email does — the onboarding contact first, the lead second. Two different lookups
     would let the reminder and the failure notice land in different inboxes for one person.
     ⚠️ Every send here is non-fatal and recorded: a message that cannot go must never 500 back to
     Stripe, which would retry an event that changes no state. */
  /* ⛔ A ONE-TAP CANCEL LINK, AND IT FAILS SOFT (2026-09-13). Paul activated the Customer portal
     with cancel and update-payment-method ticked, so a real link is better than "reply to this
     email" — somebody who wants to stop should not have to ask a human for permission.
     ⛔ BUT A BROKEN LINK IS WORSE THAN NO LINK. If Stripe refuses (portal deactivated later, no
     default configuration, a customer id that no longer exists) this returns null and the caller
     falls back to the reply-to wording. It must never send a reminder whose only escape route is a
     URL that errors, and it must never fail the reminder itself.
     ⚠️ Sessions are short-lived by design; this is created at send time, per email, never stored. */
  const portalCancelUrl = async (customerId: string | null | undefined): Promise<string | null> => {
    const id = (customerId ?? "").trim();
    if (!id || !stripeSecret) return null;
    try {
      const body = new URLSearchParams({ customer: id, return_url: REPORT_PUBLIC_ORIGIN }).toString();
      const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        await recordPaymentFailure("portal_session_failed", { customer: id, status: res.status, error: text.slice(0, 300) });
        return null;
      }
      const url = String((JSON.parse(text) as { url?: unknown }).url ?? "").trim();
      return url || null;
    } catch (e) {
      console.error("[stripe-webhook] portal session failed:", e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  const emailClientForLead = async (
    leadId: string,
    what: string,
    mail: { subject: string; paragraphs: string[] },
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    try {
      const { data: leadRow } = await service.from("outreach_leads").select("email").eq("id", leadId).maybeSingle();
      const { data: obRows } = await service.from("onboarding_responses")
        .select("contact_email, status, created_at").eq("lead_id", leadId).not("contact_email", "is", null)
        .order("created_at", { ascending: false }).limit(10);
      const rows = (obRows ?? []) as Array<{ contact_email: string | null; status: string | null }>;
      const paidRow = rows.find((r) => ["paid", "payment_received", "in_delivery", "completed"].includes(String(r.status ?? "")));
      const leadEmail = ((leadRow as { email?: string | null } | null)?.email ?? "").trim().toLowerCase();
      const to = ((paidRow ?? rows[0])?.contact_email ?? "").trim().toLowerCase() || leadEmail;
      if (!to || !to.includes("@")) { await recordPaymentFailure(`${what}_skipped`, { lead_id: leadId, reason: "no address", ...extra }); return; }
      const sent = await postResend({
        from: "Findable <reports@findable.live>", to: [to], reply_to: ADMIN_EMAIL,
        subject: mail.subject,
        text: mail.paragraphs.join(String.fromCharCode(10, 10)),
        html: mail.paragraphs.map((para) => `<p>${para}</p>`).join(""),
      });
      await recordPaymentFailure(sent.ok ? `${what}_sent` : `${what}_failed`, {
        lead_id: leadId, to, provider_message_id: sent.id, error: sent.error, ...extra,
      });
    } catch (e) {
      console.error(`[stripe-webhook] ${what} email failed:`, e instanceof Error ? e.message : String(e));
    }
  };

  const findableLeadForSubscription = async (
    subscriptionId: string | null,
    metaLeadId: string | null,
  ): Promise<string | null> => {
    if (subscriptionId) {
      try {
        const { data } = await service
          .from("outreach_leads").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
        const id = (data as { id?: string } | null)?.id ?? null;
        if (id) return id;
      } catch (e) {
        console.error(`[stripe-webhook] lead lookup by subscription ${subscriptionId} failed:`, (e as Error).message);
      }
    }
    return metaLeadId && SUB_UUID_RE.test(metaLeadId) ? metaLeadId : null;
  };

  /** Record the hosting subscription's state on the lead. Never fatal: a status we failed to write
   *  is a reporting gap, and throwing would make Stripe retry an event that already succeeded. */
  const setFindableSubscription = async (
    leadId: string,
    patch: { subscription_status?: string; subscription_renews_at?: string | null; stripe_customer_id?: string },
    why: string,
  ) => {
    const { error } = await service.from("outreach_leads").update(patch).eq("id", leadId);
    if (error) {
      console.error(`[stripe-webhook] ${why}: could not update lead ${leadId}: ${error.message}`);
    } else {
      console.log(`[stripe-webhook] ${why}: lead ${leadId} -> ${JSON.stringify(patch)}`);
    }
  };

  /** Stripe's subscription statuses, passed through as-is rather than mapped to our own words: the
   *  vocabulary is Stripe's and inventing a parallel one guarantees they drift. `past_due` and
   *  `unpaid` are the two that mean "the money stopped" without the customer having cancelled. */
  const idFrom = (v: unknown): string | null =>
    typeof v === "string" ? v : (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);

  const setPaid = async (siteId: string, paid: boolean, ownerId?: string | null) => {
    if (!siteId) {
      console.warn(`[stripe-webhook] ${event.type} (${event.id}) had no generated_site_id — skipped`);
      return;
    }
    let wasPaid = true; // default true → suppress email unless we confirm a transition
    let siteRow: PaidSite | null = null;
    if (paid) {
      const { data } = await service
        .from("generated_sites")
        .select("id, is_paid, site_name, content, booking_only, owner_id, lead_id")
        .eq("id", siteId)
        .maybeSingle();
      const row = data as (PaidSite & { is_paid: boolean | null }) | null;
      siteRow = row;
      wasPaid = row?.is_paid === true;
    }
    let q = service.from("generated_sites").update({ is_paid: paid }).eq("id", siteId);
    if (ownerId) q = q.eq("owner_id", ownerId); // defence-in-depth on the paid flip
    const { error } = await q;
    if (error) { console.error(`[stripe-webhook] is_paid update failed (${siteId}):`, error.message); return; }
    console.log(`[stripe-webhook] is_paid=${paid} site=${siteId} via ${event.type} (${event.id})`);
    // First upgrade only → notify admin + barber (best-effort; never throws).
    if (paid && !wasPaid && siteRow) {
      await notifyOfPayment(service, siteRow);
      // Move the linked CRM lead to 'payment_received' (pipeline terminal "Paid").
      // Only on the real false→true upgrade (this block) — renewals/re-deliveries
      // don't re-fire it. Payment is terminal, so overwrite unconditionally.
      // Best-effort — its own try, never breaks the webhook.
      if (siteRow.lead_id) {
        try {
          await service
            .from("outreach_leads")
            .update({ status: "payment_received" })
            .eq("id", siteRow.lead_id);
        } catch (e) {
          console.error(`[stripe-webhook] lead status→payment_received failed (${siteRow.lead_id}):`, (e as Error).message);
        }
      }
    }
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        // FINDABLE onboarding payment (mode=payment, one-off sprint price from
        // findable-checkout / findableOffer.ts): identified by metadata.onboarding_id — a
        // different product from the barber
        // subscription, handled first so it never falls into the site-paid path's
        // "no generated_site_id" warning. Idempotent: payment is terminal, so re-deliveries
        // just re-write the same values.
        const onboardingId = (s.metadata?.onboarding_id as string) || "";
        if (onboardingId) {
          if (s.status === "complete") {
            const findableLeadId = (s.metadata?.lead_id as string) || "";
            const amountGbp = typeof s.amount_total === "number" ? s.amount_total / 100 : FINDABLE_SETUP_PRICE_GBP;
            // Every write checked. A failure records to client_error_reports and throws, so the
            // handler returns 500 and Stripe retries. The one thing that must never happen is
            // taking the money and leaving no trace that we did.
            await mustWrite(
              "onboarding_responses",
              { status: "paid", updated_at: new Date().toISOString() },
              onboardingId,
              "findable onboarding -> paid",
            );
            /* Payment prepares fulfilment but never starts the paid audit. Preserve any later
               operator state on webhook retries; only initialise an untouched row. */
            await service.from("onboarding_responses")
              .update({ baseline_status: "needs_questions", updated_at: new Date().toISOString() })
              .eq("id", onboardingId).is("baseline_status", null);
            /* Draft generation is preview-only: it creates no ai_audits row and queues no AI
               answers. A failure remains visible to the operator as Needs Baseline, where the
               explicit Generate action can retry it. */
            const draft = await preparePaidBaselineQuestions(service, onboardingId);
            if (!draft.ok) console.warn(`[stripe-webhook] baseline draft deferred for ${onboardingId}: ${draft.error}`);
            /* ⛔ RETIRE THE SAME PERSON'S OTHER UNPAID SUBMISSIONS (2026-09-13). A restarted form
               leaves an older row behind, and notify-onboarding-submit judged rows one at a time —
               so on 12 Sep the 12:35 attempt was reported "not paid" one minute before the 12:54
               attempt paid. The notifier now judges the family too (belt), and this is the braces:
               the moment money lands, every unpaid non-free-check row sharing this row's contact
               email or lead is marked covered, so the PAID email is the one notification. Non-fatal
               and after the money write — it must never be the reason a payment is retried. */
            try {
              const { data: paidRow } = await service.from("onboarding_responses")
                .select("contact_email, lead_id, business_name").eq("id", onboardingId).maybeSingle();
              const pr = paidRow as { contact_email?: string | null; lead_id?: string | null; business_name?: string | null } | null;
              const em = (pr?.contact_email ?? "").trim().toLowerCase().replace(/[,()]/g, "");
              const ors: string[] = [];
              if (em) ors.push(`contact_email.ilike.${em}`);
              if (pr?.lead_id || findableLeadId) ors.push(`lead_id.eq.${pr?.lead_id || findableLeadId}`);
              if (ors.length) {
                const { data: retired } = await service.from("onboarding_responses")
                  .update({ notify_attempts: 3, notify_error: `not sent: the same person paid on submission ${onboardingId}, so the payment notification covers them` })
                  .or(ors.join(","))
                  .neq("id", onboardingId)
                  .is("notify_sent_at", null)
                  .not("status", "in", "(paid,payment_received,in_delivery,completed)")
                  // A NULL source is a sign-up row too: `neq` alone would drop NULLs (SQL three-valued logic).
                  .or("source.is.null,source.neq.free_check")
                  .select("id");
                if (Array.isArray(retired) && retired.length) console.log(`[stripe-webhook] retired ${retired.length} unpaid sibling submission(s) for ${onboardingId}`);

                /* 🔴 AND THE ROWS THAT WERE ALREADY EMAILED GET A CORRECTION (2026-09-13).
                   The retirement above carries `.is("notify_sent_at", null)` — deliberately, because
                   an email cannot be unsent — so a row already reported "not paid" is skipped and
                   nothing has ever contradicted it. On 13 Sep White Sparks Electrical was reported
                   as having reached the payment screen and stopped, 52 MINUTES BEFORE the £99
                   landed, and the record stood. Paul's words: he would have chased a real locksmith
                   for money the man had already sent.
                   ⛔ NO AMOUNT OF FAMILY LOGIC COULD HAVE PREVENTED THAT ONE. The notifier judged
                   the whole family correctly and found no payment, because at 20:09 there was no
                   payment to find. A claim about the future is not wrong when it is made; it goes
                   wrong later. The only honest repair is to say so afterwards, which is what this
                   does — the inverted twin of the query above, same family, opposite side of the
                   `notify_sent_at` test, so the two together cover every sibling exactly once. */
                const { data: misreported } = await service.from("onboarding_responses")
                  .select("id, created_at, notify_sent_at")
                  .or(ors.join(","))
                  .neq("id", onboardingId)
                  .not("notify_sent_at", "is", null)
                  .or("source.is.null,source.neq.free_check")
                  /* ONCE PER ROW, EVER. Stripe redelivers a webhook on any non-2xx and on its own
                     retry schedule, and every write above this is idempotent by construction - a
                     correction email is not, so it needs its own mark. The stamp is written after a
                     SUCCESSFUL send rather than before it: there is no loop to guard against here,
                     and a correction that Resend refused must be free to go on the next delivery
                     rather than being silently marked done. */
                  .or(`notify_error.is.null,notify_error.not.ilike.*${CORRECTED_MARK}*`);
                const wrong = (misreported ?? []) as Array<{ id: string; notify_sent_at: string | null }>;
                if (wrong.length) {
                  const payerName = (pr?.business_name ?? "").trim() || "A client";
                  const when = wrong
                    .map((w) => String(w.notify_sent_at ?? "").replace("T", " ").slice(0, 16) + " UTC")
                    .join(", ");
                  const lines = [
                    `${payerName} HAS paid - ignore the earlier "not paid" email.`,
                    ``,
                    `  Sent in error: ${when}`,
                    `  They paid:     GBP ${amountGbp.toFixed(2)}`,
                    ``,
                    `They restarted the form, so an earlier attempt was reported as abandoned before this`,
                    `payment arrived. Nothing is wrong with their account - do not chase them.`,
                  ];
                  const esc2 = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                  const corr = await postResend({
                    from: FROM_OPERATOR,
                    to: [ADMIN_EMAIL],
                    /* THE SUBJECT MUST NOT MATCH THE ONE IT CORRECTS. Gmail threads identical
                       subjects from one sender, so a correction can collapse under the very message
                       it contradicts and read as never arriving - the recorded Gmail trap. */
                    subject: `CORRECTION - ${payerName} HAS paid (ignore the earlier email)`,
                    text: lines.join("\n") + "\n",
                    html:
                      `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
                      lines.map((l) => `<p style="margin:0 0 4px">${esc2(l) || "&nbsp;"}</p>`).join("") +
                      `</div>`,
                  });
                  /* Recorded either way, like the PAID email itself: a correction that silently
                     failed would leave the false report standing with nothing to show for it. */
                  if (corr.ok) {
                    await service.from("onboarding_responses")
                      .update({ notify_error: `${CORRECTED_MARK} they paid on submission ${onboardingId} after this was sent` })
                      .in("id", wrong.map((w) => w.id));
                  }
                  await recordPaymentFailure(corr.ok ? "payment_correction_sent" : "payment_correction_failed", {
                    onboarding_id: onboardingId, lead_id: findableLeadId ?? null,
                    corrected_rows: wrong.map((w) => w.id), sent_in_error_at: when,
                    ...(corr.ok ? { provider_message_id: corr.id } : { http_status: corr.status, error: corr.error }),
                  });
                }
              }
            } catch (e) {
              console.error("[stripe-webhook] sibling retirement failed (non-fatal):", (e as Error).message);
            }

            /* THE PAYER'S EMAIL, FOR FREE. Checkout collects an address for the receipt, so a
               completed session always carries one — and it is verified in the only sense that
               matters: the receipt reached it. We were discarding it.
               Written as a FALLBACK only, never over the top of an answer: the form asks for a
               contact email and that is the address they chose for their documents, which may
               deliberately differ from the card's billing address. So this fills a gap and nothing
               more, and it means a payer's address is never lost even if the form was escaped.
               Separate from the payment writes above and non-fatal by design: this must never be
               the reason a recorded payment gets retried. */
            const payerEmail = (s.customer_details?.email ?? "").trim().toLowerCase();
            if (payerEmail && payerEmail.includes("@")) {
              try {
                // .is(null) rather than an or() that also tests for "": every writer of these two
                // columns normalises a blank to NULL, and both columns were checked for empty
                // strings before this shipped (none). A single unambiguous filter beats an or()
                // whose empty-value syntax could be rejected and turn the whole thing into a
                // silent no-op — the one failure mode nothing here would surface.
                await service.from("onboarding_responses")
                  .update({ contact_email: payerEmail })
                  .eq("id", onboardingId)
                  .is("contact_email", null);
                if (findableLeadId) {
                  await service.from("outreach_leads")
                    .update({
                      email: payerEmail,
                      email_method: "stripe",
                      email_status: "found",
                      email_last_checked_at: new Date().toISOString(),
                    })
                    .eq("id", findableLeadId)
                    .is("email", null);
                }
              } catch (e) {
                console.error(`[stripe-webhook] payer email capture failed (non-fatal, onboarding=${onboardingId}):`, (e as Error).message);
              }
            }
            /* Read-only pre-check, purely so the email can be sent once. Stripe RETRIES webhooks,
               and a retry would re-run the write below and email again.

               🔴 THE MONEY IS NOT THE RIGHT KEY, AND KEYING ON IT LOST THE EMAIL SILENTLY
               (2026-09-14). This flag used to decide the email on its own: "the lead already
               carried money, so this payment is not new". But the money is written BEFORE the email
               is sent, so the two are not the same fact. Anything that kills the handler between
               those two lines — a timeout, a cold-start kill, a slow Resend that outlives the
               request — leaves the lead paid and the email unsent, and then the retry reads the
               money, calls the payment old, and suppresses the one notification for ever. Nothing
               would have said so: the skip only ever reached console.log, and the CLI cannot read
               edge logs.

               ⛔ SO THE MONEY ONLY NARROWS; THE EMAIL'S OWN TRACE DECIDES (below). `alreadyPaid`
               stays because it is the cheap test and it is true for every duplicate — it just no
               longer gets to answer the question by itself. */
            let alreadyPaid = false;
            let leadForEmail: Record<string, unknown> | null = null;
            if (findableLeadId) {
              try {
                const { data: pre } = await service
                  .from("outreach_leads")
                  .select("business_name, amount_paid, status, phone, category, search_keyword, search_location, email")
                  .eq("id", findableLeadId).maybeSingle();
                leadForEmail = (pre as Record<string, unknown> | null) ?? null;
                alreadyPaid = Number(leadForEmail?.amount_paid ?? 0) > 0;
              } catch (e) {
                // A failed pre-read must not touch the payment. Worst case: a retry emails twice.
                console.error("[stripe-webhook] pre-payment read failed (non-blocking):", (e as Error).message);
              }
            }

            /* ⛔ DID THE PAID EMAIL ACTUALLY GO FOR THIS ONBOARDING ROW? That is the only question
               worth suppressing on, and `payment_email_sent` is the record of it — written on the
               Resend 2xx with the provider id, by the same recorder the rest of this branch uses.
               Asked ONLY when the lead already carries money, so the first payment never pays for
               this read.
               ⛔ IT FAILS OPEN, DELIBERATELY, AND THE DIRECTION IS THE WHOLE POINT. If the read
               errors we cannot tell whether the email went, and the two wrong answers are not equal:
               a duplicate "PAID £99" to Paul is an inbox annoyance, while a missed one means a
               customer paid and nobody was told. The guard exists to stop noise, never to risk
               silence, so an unknown answer sends. */
            let paidEmailAlreadySent = false;
            if (alreadyPaid) {
              try {
                const { data: prior } = await service
                  .from("client_error_reports")
                  .select("id")
                  .eq("error_id", "payment_email_sent")
                  .contains("context", { onboarding_id: onboardingId })
                  .limit(1);
                paidEmailAlreadySent = Array.isArray(prior) && prior.length > 0;
              } catch (e) {
                console.error("[stripe-webhook] could not check for a prior PAID email — sending rather than risking silence:", (e as Error).message);
              }
            }
            /* ══ THE WEBSITE ADD-ON ═══════════════════════════════════════════════════════════
               A session in `subscription` mode carries a subscription id; a one-off does not. That
               is the only reliable tell that the add-on was bought, and it comes from STRIPE rather
               than from our own row - so it records what was actually charged, which is what a
               receipt has to agree with months later.
               ⚠️ `customer` and `subscription` are id-or-object depending on expansion. Read both
               shapes rather than assuming: an unexpanded string is what this endpoint gets today,
               and an expanded object would silently stringify to "[object Object]". */
            const idOf = (v: unknown): string | null =>
              typeof v === "string" ? v : (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);
            const stripeCustomerId = idOf(s.customer);
            const stripeSubscriptionId = idOf(s.subscription);
            /* ⛔ THE PAYMENT INTENT IS STORED SO A LATER REFUND MAPS TO THIS PAYMENT EXACTLY.
               `charge.refunded` carries a customer, and resolving by customer is what the fallback
               does — but a customer who pays twice has two charges and the customer id cannot tell
               them apart, so the refund would land on whichever lead the lookup happened to find.
               The intent is the only identifier that is one-to-one with the money that moved. */
            const stripePaymentIntentId = idOf(s.payment_intent);
            /* 🔴 THIS READ `!!stripeSubscriptionId` AND WAS WRONG ON EVERY PAYMENT (fixed
               2026-09-14). The comment above is the reasoning as it stood on 2026-09-03, when a
               ticked checkout really was `mode: "subscription"`. On 2026-09-13 the hosting line
               MOVED OFF the checkout session so nothing sits inside the refund window —
               findable-checkout now has exactly one `mode:` in the file and it is hardcoded
               "payment". No session has created a subscription since, so `stripeSubscriptionId` is
               always null, `boughtWebsite` was always false, and every customer was recorded as
               "AI visibility, first cycle" whatever they chose — in the operator email AND in
               `outreach_leads.paid_for`, which is the record of what they bought.
               ⛔ THE LESSON IS THE ONE THIS FILE KEEPS RE-LEARNING: that was an INFERENCE from a
               billing side-effect, not a reading of the customer's answer. When the billing shape
               changed the inference silently inverted and nothing threw. `website_addon` is the
               column findable-checkout itself trusts to decide what to charge — the standing rule
               on that endpoint being that the browser never decides money and the ROW is the
               record — so it is the same fact, read from the place that owns it.
               ⚠️ ABSENT IS NOT A PURCHASE. A missing row, a failed read or a null column all mean
               "no add-on": charging-direction safety, exactly as findable-checkout reads it. */
            let boughtWebsite = false;
            let siteManager: string | null = null;
            try {
              const { data: obJob } = await service.from("onboarding_responses")
                .select("website_addon, website_manager").eq("id", onboardingId).maybeSingle();
              const j = obJob as { website_addon?: unknown; website_manager?: unknown } | null;
              boughtWebsite = j?.website_addon === true;
              siteManager = typeof j?.website_manager === "string" ? j.website_manager : null;
            } catch (e) {
              console.error("[stripe-webhook] could not read the website answer — recording the audit-only label:", (e as Error).message);
            }
            /* ⛔ THREE JOBS, NOT TWO, AND THE MIDDLE ONE IS THE POINT. "Add pages to their site"
               splits on who holds the keys: when an agency manages it the first move is not ours,
               and that is the only one of the three where the work cannot start on our say-so.
               ⚠️ NO COLUMN RECORDS *WHY* A BUILD IS NEEDED (refused access / wanted a new one / no
               site at all), deliberately — they are the same job and the reason is not actionable. */
            const paidForLabel = boughtWebsite
              ? "Findable - AI visibility (first cycle) + website build + hosting"
              : "Findable - AI visibility, first cycle";
            const jobLine = boughtWebsite
              ? "BUILD AND HOST A NEW SITE — they have no site we can publish to."
              : siteManager === "web_company"
                ? "ADD PAGES — but AN AGENCY HOLDS THE KEYS. You cannot start until they let you in."
                : siteManager === "direct_access"
                  ? "ADD PAGES to their existing site — they can let you in themselves."
                  : "ADD PAGES to their existing site — who controls it was not recorded.";

            if (findableLeadId) {
              await mustWrite(
                "outreach_leads",
                {
                  status: "payment_received",
                  amount_paid: amountGbp,
                  payment_date: new Date().toISOString(),
                  paid_for: paidForLabel,
                },
                findableLeadId,
                "findable lead -> payment_received",
              );
              /* ⛔ THE STRIPE IDS GO IN A SEPARATE, NON-FATAL WRITE, AND THAT SPLIT IS DELIBERATE.
                 mustWrite above is the one that must not fail - it is the money landing. These
                 columns are newer than some rows and newer than this function's own history, so a
                 PostgREST 400 on a pre-migration database must not be able to lose a payment.
                 Without them we cannot cancel a subscription or answer "is this customer still
                 paying", so they are worth writing - just never at the payment's expense. */
              if (stripeCustomerId || stripeSubscriptionId || stripePaymentIntentId) {
                const subPatch: Record<string, unknown> = {};
                if (stripeCustomerId) subPatch.stripe_customer_id = stripeCustomerId;
                if (stripePaymentIntentId) subPatch.stripe_payment_intent_id = stripePaymentIntentId;
                if (stripeSubscriptionId) {
                  subPatch.stripe_subscription_id = stripeSubscriptionId;
                  subPatch.subscription_status = "active";
                }
                const { error: subErr } = await service
                  .from("outreach_leads").update(subPatch).eq("id", findableLeadId);
                if (subErr) {
                  console.error(`[stripe-webhook] could not store the Stripe ids for lead ${findableLeadId}: ${subErr.message} - the payment IS recorded; hosting will be untrackable until this is fixed`);
                } else {
                  console.log(`[stripe-webhook] stored stripe ids for lead ${findableLeadId}: customer=${stripeCustomerId ?? "(none)"} subscription=${stripeSubscriptionId ?? "(none)"}`);
                }
              }
              /* The standard recurring plan is created at successful signup, with Stripe holding a
                 42-day trial. This makes the promised six-week start independent of when the
                 four-week measurement email happens to be sent. A replayed webhook reads the
                 stored subscription id and therefore cannot create a duplicate. */
              if (stripeCustomerId) {
                const { data: billingLead } = await service.from("outreach_leads")
                  .select("id, business_name, stripe_customer_id, stripe_subscription_id")
                  .eq("id", findableLeadId).maybeSingle();
                const subscription = await createDelayedSubscription(
                  service,
                  (billingLead as { id: string; business_name: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null }) ?? {
                    id: findableLeadId, business_name: null, stripe_customer_id: stripeCustomerId, stripe_subscription_id: null,
                  },
                  new Date().toISOString(),
                );
                if (subscription.kind === "failed") {
                  await recordPaymentFailure("monthly_subscription_create_failed", {
                    onboarding_id: onboardingId, lead_id: findableLeadId, reason: subscription.reason,
                  });
                }
              }
            } else {
              // No lead id on the session: the payment lands on the onboarding row but nothing
              // links it to the CRM. Worth recording rather than shrugging at.
              console.warn(`[stripe-webhook] findable payment without lead_id (onboarding=${onboardingId})`);
              await recordPaymentFailure("stripe_findable_no_lead", { onboarding_id: onboardingId, amount_gbp: amountGbp });
            }
            console.log(`[stripe-webhook] findable payment recorded: onboarding=${onboardingId} lead=${findableLeadId || "(none)"} amount=${amountGbp} (${event.id})`);

            /* Email AFTER the payment is written and logged — the money landing can never depend on
               Resend being up. Suppressed ONLY when this onboarding row already has a
               `payment_email_sent` trace, which is what makes a Stripe retry quiet without letting a
               crash between the write and the send lose the notification for ever. */
            if (!paidEmailAlreadySent) {
              await notifyOfFindablePayment({
                onboardingId, leadId: findableLeadId || null, record: recordPaymentFailure,
                /* The subject's own fact — never inferred from whether a note exists. */
                noLead: !findableLeadId,
                businessName: ((leadForEmail?.business_name as string) ?? "").trim(),
                amountGbp,
                paidFor: paidForLabel,
                job: jobLine,
                trade: (((leadForEmail?.category as string) || (leadForEmail?.search_keyword as string) || "").trim()) || null,
                town: ((leadForEmail?.search_location as string) ?? "").trim() || null,
                phone: ((leadForEmail?.phone as string) ?? "").trim() || null,
                email: ((leadForEmail?.email as string) ?? "").trim() || null,
                /* A payment with no lead_id is the one you most need to see: the money landed but
                   nothing in the CRM points at it, so it will not appear in Paid Clients and no
                   baseline starts. recordPaymentFailure already logs it; this makes it arrive.
                   ⛔ AND SINCE THE QUESTIONNAIRE SPLIT (2026-08-13) A NORMAL PAYMENT ARRIVES WITH NO
                   DELIVERY DETAILS AT ALL. Pre-payment asks two things; services, town and address
                   come in the post-payment form. Until that lands there is nothing to deliver from
                   AND NO BASELINE — startPaidBaseline defers with awaiting_questionnaire_2 until
                   confirmed_location and services exist. That is expected, not a fault, but it is
                   the state Paul needs to see the moment money lands rather than discover later, so
                   the email says it out loud. The dashboard's "N awaiting details" card is the
                   ongoing view; this is the alert.
                   ⚠️ Read from the row that was just paid, with the SAME three fields needsQ2()
                   uses, so the email and the dashboard cannot disagree about who is outstanding. */
                note: !findableLeadId
                  ? `No CRM lead is linked to this payment (onboarding ${onboardingId}). It will not show in Paid Clients and no baseline has started — link it by hand.`
                  : (await (async () => {
                      try {
                        const { data: ob } = await service
                          .from("onboarding_responses")
                          .select("confirmed_location, services")
                          .eq("id", onboardingId).maybeSingle();
                        /* 🔴 THIS TESTED `business_address` TOO UNTIL 2026-09-14 — a field REMOVED
                           from the questionnaire on 2026-08-22, because a paying customer was
                           trapped on mobile hand-typing a full address. It is collected at delivery
                           now, so it is null at the moment of every payment BY DESIGN, and this test
                           therefore fired on every real first payment: "details not yet collected"
                           for a customer who had given everything that matters, plus the subject tag
                           that rode on it.
                           ⛔ THE RULE IS AN IMPORT NOW, not a fourth restatement of it. A claim
                           about whether a client is complete must agree with the rule that decides
                           whether the baseline can run, or this email contradicts the dashboard and
                           the measurement about the same customer. */
                        const outstanding = !questionnaireComplete(ob);
                        return outstanding
                          ? "Details not yet collected — they still have the post-payment form to fill in (town and services). Draft questions and the paid baseline wait until it lands."
                          : null;
                      } catch {
                        /* Never block the email over this: a failed read means we simply do not add
                           the line, not that the payment notification is withheld. */
                        return null;
                      }
                    })()),
              });
            } else {
              /* 🔴 THE SKIP IS RECORDED NOW. It used to reach console.log alone — and the CLI has no
                 `functions logs`, so "no PAID email and no trace" had two readings that could not be
                 told apart: the webhook never arrived, or it arrived and chose not to send. That
                 ambiguity is what cost an evening on 2026-09-14. Four outcomes, four rows: sent,
                 failed, skipped, and nothing-at-all (which now means only that nothing arrived). */
              console.log(`[stripe-webhook] findable payment email skipped: onboarding ${onboardingId} already has a payment_email_sent trace`);
              await recordPaymentFailure("payment_email_skipped", {
                onboarding_id: onboardingId,
                lead_id: findableLeadId || null,
                reason: "a PAID email was already sent for this onboarding row",
                amount_on_lead_gbp: Number(leadForEmail?.amount_paid ?? 0) || null,
                amount_gbp: amountGbp,
                at: new Date().toISOString(),
              });
            }

            /* THE CUSTOMER'S CONFIRMATION — WhatsApp template, best-effort, after the paid write.
               ⛔ GUARD 4, IDEMPOTENCY: gated on the SAME `alreadyPaid` flag as the operator email
               above, and for the same reason. Stripe retries webhooks; `alreadyPaid` is read from
               the lead's amount_paid BEFORE the write, so on a replay it is true and the customer
               is not messaged twice. The two notifications are kept as separate `if` blocks rather
               than merged so that a change to one can never silently re-gate the other.
               ⚠️ Requires findableLeadId: the phone lives on the lead and nowhere else (the
               questionnaire never asks for one). A payment with no lead is already reported to the
               operator by the note above, which is the route to fixing it by hand.
               ⚠️ Ordered BEFORE baseline preparation deliberately — the customer's confirmation should
               not queue behind question drafting. Neither can throw. */
            if (!alreadyPaid && findableLeadId) {
              await sendFindablePaymentConfirmation(service, {
                leadId: findableLeadId,
                onboardingId,
                fallbackBusinessName: ((leadForEmail?.business_name as string) ?? "").trim(),
              });
            } else if (alreadyPaid) {
              console.log(`[stripe-webhook] findable confirmation skipped: lead ${findableLeadId} already had a payment (retry?)`);
            }

            // START THE PAID BASELINE. This is the moment the customer becomes a client, and the
            // 3-run averaged baseline the money-back guarantee is measured against starts HERE
            // rather than while they waited in front of the payment button.
            //
            // Deliberately NOT allowed to fail the webhook: the payment is already recorded, and
            // throwing would make Stripe retry an event whose money-writes have landed. Instead the
            // outcome is recorded, and process-ai-audit-queue's ensureBaselinesForPaidOnboardings
            // re-attempts every tick for any paid row whose lead still has no baseline. So a failed
            // start here delays the baseline by ~1 minute; it cannot lose it.
            const baseline = await startPaidBaseline(service, onboardingId, "stripe-webhook");
            if (!baseline.ok) {
              console.error(`[stripe-webhook] baseline start failed for onboarding ${onboardingId}: ${baseline.error ?? baseline.skipped}`);
              await recordPaymentFailure("baseline_start_failed", {
                onboarding_id: onboardingId, lead_id: findableLeadId || null,
                reason: baseline.error ?? baseline.skipped, note: "queue backstop will retry",
              });
            }
          }
          break;
        }
        // subscription mode → the session is 'complete' once the first invoice paid.
        if (s.status === "complete") {
          await setPaid(
            (s.metadata?.generated_site_id as string) || "",
            true,
            (s.client_reference_id as string) || null,
          );
        }
        break;
      }
      /* ══ THE HOSTING RENEWALS ═════════════════════════════════════════════════════════════
         Added 2026-09-03 with the £9.99/mo website hosting. Stripe already handled the MONEY -
         invoicing, Smart Retries, dunning emails - so none of this is needed for a payment to
         arrive. What it is for is VISIBILITY: without it a churn or a dead card is invisible to us
         and `paid = amount_paid > 0` keeps reading a cancelled customer as paying.
         ⚠️ An invoice carries no subscription METADATA, so the lead is resolved from the stored
         stripe_subscription_id. See findableLeadForSubscription. */
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = idFrom((inv as { subscription?: unknown }).subscription);
        /* ⛔ ONLY SUBSCRIPTION INVOICES. A one-off Findable payment produces no subscription, and
           the FIRST invoice of a new subscription is also handled by checkout.session.completed -
           writing "active" twice is harmless and idempotent, which is why this needs no dedupe. */
        if (!subId) break;
        const leadId = await findableLeadForSubscription(subId, null);
        if (!leadId) {
          console.log(`[stripe-webhook] invoice.paid for subscription ${subId} matched no Findable lead - ignored (likely the barber product or a hand-made subscription)`);
          break;
        }
        const periodEnd = (inv as { period_end?: number }).period_end;
        await setFindableSubscription(leadId, {
          subscription_status: "active",
          subscription_renews_at: typeof periodEnd === "number" ? new Date(periodEnd * 1000).toISOString() : null,
        }, "invoice.paid");
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = idFrom((inv as { subscription?: unknown }).subscription);
        if (!subId) break;
        const leadId = await findableLeadForSubscription(subId, null);
        if (!leadId) break;
        /* ⛔ `past_due` IS NOT CANCELLED, AND THE DIFFERENCE MATTERS. Stripe is still retrying at
           this point (Smart Retries runs for days), so the customer has not left - they have a card
           problem. Writing "canceled" here would cut off a customer who is about to pay, and it is
           customer.subscription.deleted that says they are actually gone. */
        await setFindableSubscription(leadId, { subscription_status: "past_due" }, "invoice.payment_failed");
        /* ⛔ AND THE CLIENT IS TOLD, BY US. Stripe can send its own failed-payment email, but that
           is a Dashboard toggle nobody here can read, and silence is how somebody concludes they
           have been cancelled when Stripe is still retrying.
           ⛔ THE LINK IS THE INVOICE'S OWN hosted_invoice_url, NOT a billing-portal session: Stripe
           generates it per invoice, it needs no Dashboard configuration at all, and it lets them
           pay and replace the card in one page. A portal session would need the portal activated
           first and would fail here if it were not. */
        const payUrl = String((inv as { hosted_invoice_url?: unknown }).hosted_invoice_url ?? "").trim() || null;
        await emailClientForLead(leadId, "monthly_payment_failed", paymentFailedEmail({ payUrl }), { subscription: subId, invoice: String(inv.id ?? "") });
        break;
      }
      /* ⛔ THE THREE-DAY REMINDER, BUILT AND NOT ASSUMED (2026-09-13). Stripe can send a
         trial-ending email of its own, but that is a Dashboard setting nobody here can read, and a
         first charge forty-two days after paying is exactly the shape that produces a chargeback.
         This fires from the event, which always fires, three days before trial_end.
         ⚠️ IT IS THE SECOND NOTICE. The four-week results email named the date and the amount
         fourteen days earlier, at the moment the clock started — Stripe's three days cannot be
         moved, so the early warning had to come from our side.
         ⚠️ Non-fatal throughout: a reminder that fails must never 500 the webhook back to Stripe
         and cause a retry storm on an event that changes no state. */
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object as Stripe.Subscription;
        if ((sub.metadata?.generated_site_id as string) || "") break;   // barber product, not ours
        const leadId = await findableLeadForSubscription(sub.id ?? null, (sub.metadata?.lead_id as string) || null);
        if (!leadId) { console.log(`[stripe-webhook] trial_will_end for ${sub.id} matched no Findable lead - ignored`); break; }
        try {
          const { data: leadRow } = await service.from("outreach_leads")
            .select("business_name, email").eq("id", leadId).maybeSingle();
          const lead = leadRow as { business_name?: string | null; email?: string | null } | null;
          /* The billing address is the onboarding contact first, exactly as the results email
             resolves it — the two must reach the same person or the reminder lands nowhere. */
          const { data: obRows } = await service.from("onboarding_responses")
            .select("contact_email, status, created_at").eq("lead_id", leadId).not("contact_email", "is", null)
            .order("created_at", { ascending: false }).limit(10);
          const rows = (obRows ?? []) as Array<{ contact_email: string | null; status: string | null }>;
          const paidRow = rows.find((r) => ["paid", "payment_received", "in_delivery", "completed"].includes(String(r.status ?? "")));
          const to = ((paidRow ?? rows[0])?.contact_email ?? "").trim().toLowerCase() || ((lead?.email ?? "").trim().toLowerCase() || "");
          const endTs = typeof sub.trial_end === "number" ? sub.trial_end * 1000 : NaN;
          const startsOn = Number.isFinite(endTs)
            ? new Date(endTs).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
            : "";
          if (!to || !to.includes("@") || !startsOn) {
            await recordPaymentFailure("monthly_reminder_skipped", { lead_id: leadId, subscription: sub.id, to, starts_on: startsOn });
            break;
          }
          const cancelUrl = await portalCancelUrl(idFrom((sub as { customer?: unknown }).customer));
          const mail = monthlyStartingSoonEmail({ businessName: (lead?.business_name ?? "").trim(), startsOn, cancelUrl });
          const sent = await postResend({
            from: "Findable <reports@findable.live>", to: [to], reply_to: ADMIN_EMAIL,
            subject: mail.subject,
            text: mail.paragraphs.join(String.fromCharCode(10,10)),
            html: mail.paragraphs.map((p) => `<p>${p}</p>`).join(""),
          });
          await recordPaymentFailure(sent.ok ? "monthly_reminder_sent" : "monthly_reminder_failed", {
            lead_id: leadId, subscription: sub.id, to, starts_on: startsOn, provider_message_id: sent.id, error: sent.error,
          });
        } catch (e) {
          console.error("[stripe-webhook] trial_will_end reminder failed:", e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const siteId = (sub.metadata?.generated_site_id as string) || "";
        /* ⛔ FINDABLE FIRST, AND ONLY WHEN THIS IS NOT A BARBER SUBSCRIPTION. The barber path below
           is untouched: it keys on generated_site_id, and a Findable subscription never has one.
           Two products share this endpoint and the discriminator is which metadata is present. */
        if (!siteId) {
          const leadId = await findableLeadForSubscription(sub.id, (sub.metadata?.lead_id as string) ?? null);
          if (leadId) {
            const renews = (sub as { current_period_end?: number }).current_period_end;
            await setFindableSubscription(leadId, {
              subscription_status: sub.status,
              subscription_renews_at: typeof renews === "number" ? new Date(renews * 1000).toISOString() : null,
            }, `customer.subscription.updated (${sub.status})`);
          } else {
            console.log(`[stripe-webhook] customer.subscription.updated ${sub.id} matched neither a site nor a Findable lead - ignored`);
          }
          break;
        }
        if (sub.status === "active" || sub.status === "trialing") {
          await setPaid(siteId, true);
        } else if (
          sub.status === "canceled" ||
          sub.status === "unpaid" ||
          sub.status === "incomplete_expired"
        ) {
          await setPaid(siteId, false);
        }
        // past_due / incomplete / paused → leave is_paid as-is (grace period).
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const siteId = (sub.metadata?.generated_site_id as string) || "";
        if (!siteId) {
          /* THE CUSTOMER IS GONE. This is the event that ends the hosting - not
             invoice.payment_failed, which is only a card that needs replacing. */
          const leadId = await findableLeadForSubscription(sub.id, (sub.metadata?.lead_id as string) ?? null);
          if (leadId) {
            /* ⛔ READ THE PRIOR STATUS BEFORE OVERWRITING IT. The update below sets `canceled`, so
               a read taken afterwards can never see the `past_due` that says this was a payment
               failure — it would report "cancelled on purpose" for every card death. */
            const { data: before } = await service.from("outreach_leads").select("subscription_status").eq("id", leadId).maybeSingle();
            const wasPastDue = String((before as { subscription_status?: string | null } | null)?.subscription_status ?? "") === "past_due";
            await setFindableSubscription(leadId, {
              subscription_status: "canceled",
              subscription_renews_at: null,
            }, "customer.subscription.deleted");
            /* ⛔ AND THEY ARE TOLD THEY HAVE STOPPED BEING A CLIENT. Paul's rule, 2026-09-13:
               nobody should find out by noticing that nothing happened.
               ⛔ TWO REASONS REACH THIS EVENT AND THEY ARE DIFFERENT MESSAGES. Stripe sets
               cancellation_details.reason — `payment_failure` when the retries gave up,
               `cancellation_requested` when the client chose to go. Sending the wrong one either
               insults somebody who left deliberately or lies to somebody whose card died.
               ⚠️ ABSENT READS AS "NOT A PAYMENT FAILURE": an unknown reason gets the neutral
               cancellation wording, which is true either way, rather than asserting a card problem
               nobody has evidence of. */
            /* ⛔ THE BRANCH DOES NOT RELY ON STRIPE'S REASON ALONE, AND THAT IS DELIBERATE.
               `cancellation_details.reason` should be `payment_failure` when the retries give up —
               but it could not be verified from here without a real failed subscription, and the
               field decides which of two emails a real client receives. Telling somebody whose card
               died that they asked to cancel is the failure that must not happen on an unverified
               assumption (CLAUDE.md §4: verify the claim, do not inherit it).
               ⛔ SO OUR OWN RECORD IS THE SECOND WITNESS. invoice.payment_failed wrote `past_due`
               to this lead when the first retry failed, days earlier. A cancel that follows a
               past_due IS a payment failure whatever Stripe calls it, and a cancel-after-retries
               cannot happen without at least one failed invoice — so the two together cover the
               case the reason field was supposed to cover on its own.
               ⚠️ AND THE REAL VALUE IS RECORDED EITHER WAY. The first live cancellation writes what
               Stripe actually sent into client_error_reports, which is how this note gets corrected
               from evidence rather than re-argued. */
            const reason = String(((sub as { cancellation_details?: { reason?: unknown } }).cancellation_details?.reason) ?? "");
            const becauseOfPayment = reason === "payment_failure" || wasPastDue;
            await emailClientForLead(leadId, "monthly_ended", subscriptionEndedEmail({ becauseOfPayment }), {
              subscription: sub.id,
              cancellation_reason: reason || "(none given)",
              was_past_due: wasPastDue,
              branched_as: becauseOfPayment ? "payment_failure" : "cancelled_on_purpose",
            });
          }
          break;
        }
        await setPaid(siteId, false);
        break;
      }
      /* ══ THE REFUND PAUL MADE IN STRIPE ═══════════════════════════════════════════════════════
         ⛔ THE APP NEVER MOVES THE MONEY — Paul's call, 2026-09-13: "a button that moves £99 on a
         click is a button I will eventually hit by accident", and he wants the Stripe record to be
         the thing he did deliberately. So the refund action in the app is bookkeeping only and THIS
         is the other half: the moment he refunds in Stripe, the app finds out. Before this a refund
         updated nothing at all, which is worse than either extreme — the lead went on reading as a
         paying customer, the day-28 replay would still have fired, and the tab would still have
         been asking him to confirm a baseline for someone he had already paid back.

         ⛔ RESOLVED BY PAYMENT INTENT FIRST, CUSTOMER ONLY AS A FALLBACK. The intent is one-to-one
         with the money that moved; a customer who has paid twice has two charges and one customer
         id, so resolving by customer alone could land the refund on the wrong payment. The fallback
         exists for anyone who paid before the intent was stored, and it takes the OLDEST matching
         lead deterministically rather than whichever row came back first.

         ⚠️ PARTIAL REFUNDS ARE RECORDED, NOT ASSUMED TO BE FULL. Stripe sends this event for a
         partial refund too. The amount actually returned is written, and the status only moves to
         `refunded` when the whole charge went back — a £20 goodwill refund must not delete a client
         from every revenue figure and cancel their re-measure. */
      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const intentId = idOfRef(ch.payment_intent);
        const customerId = idOfRef(ch.customer);
        const refundedMinor = Number(ch.amount_refunded ?? 0);
        const chargedMinor = Number(ch.amount ?? 0);
        const fullyRefunded = refundedMinor > 0 && refundedMinor >= chargedMinor;

        let lead: { id: string; business_name: string | null; status: string | null; refund_reason: string | null } | null = null;
        if (intentId) {
          const { data } = await service.from("outreach_leads")
            .select("id, business_name, status, refund_reason").eq("stripe_payment_intent_id", intentId).maybeSingle();
          lead = (data as typeof lead) ?? null;
        }
        if (!lead && customerId) {
          const { data } = await service.from("outreach_leads")
            .select("id, business_name, status, refund_reason").eq("stripe_customer_id", customerId)
            .order("created_at", { ascending: true }).limit(1);
          lead = ((data ?? [])[0] as typeof lead) ?? null;
        }
        if (!lead) {
          /* ⛔ A REFUND WE CANNOT PLACE IS REPORTED, NEVER SWALLOWED. Money left the account and no
             row in the CRM knows: that is exactly the state this whole event exists to end. */
          await recordPaymentFailure("refund_lead_unresolved", {
            charge_id: ch.id, payment_intent: intentId, customer: customerId,
            amount_refunded_minor: refundedMinor, at: new Date().toISOString(),
          });
          break;
        }

        const patch: Record<string, unknown> = {
          refunded_at: new Date().toISOString(),
          refund_amount_gbp: refundedMinor / 100,
          stripe_refund_id: idOfRef((ch.refunds as { data?: Array<{ id?: string }> } | null)?.data?.[0]) ?? null,
        };
        /* The status is the thing five readers act on (isPaidLead, the funnel, the Inbox exemption,
           the tasks list and the replay gate), so only a FULL refund moves it. */
        if (fullyRefunded) patch.status = "refunded";
        /* ⚠️ NEVER OVERWRITE A REASON PAUL ALREADY TYPED. If he used the app's refund action first
           and then refunded in Stripe, his words are the better record — this only fills a blank. */
        if (!String(lead.refund_reason ?? "").trim()) {
          patch.refund_reason = fullyRefunded
            ? "Refunded in Stripe"
            : `Partially refunded in Stripe (GBP ${(refundedMinor / 100).toFixed(2)} of ${(chargedMinor / 100).toFixed(2)})`;
        }
        const { error: refErr } = await service.from("outreach_leads").update(patch).eq("id", lead.id);
        if (refErr) {
          await recordPaymentFailure("refund_write_failed", {
            lead_id: lead.id, charge_id: ch.id, error: refErr.message,
          });
        } else {
          await recordPaymentFailure("refund_recorded", {
            lead_id: lead.id, charge_id: ch.id, payment_intent: intentId,
            amount_refunded_minor: refundedMinor, fully_refunded: fullyRefunded,
            resolved_by: intentId ? "payment_intent" : "customer",
          });
          console.log(`[stripe-webhook] refund recorded for lead ${lead.id} (${fullyRefunded ? "full" : "partial"})`);
        }
        break;
      }
      default:
        // Acknowledge everything else so Stripe stops retrying.
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", (e as Error).message);
    // 500 → Stripe retries (good for a transient DB blip).
    return new Response(JSON.stringify({ received: true, error: "handler_error" }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
