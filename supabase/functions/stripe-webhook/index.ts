import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startPaidBaseline } from "../_shared/audit-baseline.ts";
import { FINDABLE_SETUP_PRICE_GBP } from "../../../src/lib/findableOffer.ts";

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

async function postResend(payload: Record<string, unknown>): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.warn("[stripe-webhook] RESEND_API_KEY not set; skipping email"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => "");
    console.error("[stripe-webhook] Resend non-OK:", res.status, b.slice(0, 200));
  }
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
const ADMIN_EMAIL = "paul@move37.fun";

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
}): Promise<void> {
  try {
    const name = opts.businessName.trim() || "A client";
    const amount = `£${opts.amountGbp.toFixed(2)}`;
    /* contact_email has NEVER been populated in this table, so "(not given)" is the expected
       reading rather than a fault — the questionnaire only began asking recently. Every optional
       line is omitted entirely when absent, so the email never shows a dangling empty label. */
    const line = (k: string, v: string | null) => (v && v.trim() ? `  ${k.padEnd(8)}${v.trim()}\n` : "");
    const text =
      `${name} has paid.\n\n` +
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
      row("Amount:", amount) + row("For:", opts.paidFor) +
      row("Trade:", opts.trade) + row("Town:", opts.town) +
      row("Phone:", opts.phone) + row("Email:", opts.email ?? "(not given)") +
      (opts.note ? `<p style="margin:10px 0 0;color:#b45309"><strong>${esc(opts.note)}</strong></p>` : "") +
      `<p style="margin:10px 0 0;color:#475569">Setup is promised within two working days.</p>` +
      `</div>`;
    await postResend({
      from: "LeadFinder Pro <noreply@lead-finder-app.com>",
      to: [ADMIN_EMAIL],
      subject: `PAID ${amount} — ${name}${opts.note ? " (NOT LINKED)" : ""}`,
      text, html,
    });
    console.log(`[stripe-webhook] findable payment email sent for ${name}`);
  } catch (e) {
    // NEVER affects the webhook's 200. The money is already written by the time this runs.
    console.error("[stripe-webhook] notifyOfFindablePayment failed (non-blocking):", (e as Error).message);
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
               and a retry would re-run the write below and email again. Mirrors the barber branch's
               own `paid && !wasPaid` idiom: if the lead already carried money before this event, the
               payment is not new and no second email goes out. This adds a SELECT and changes
               nothing about the write that follows — same fields, same order, same behaviour. */
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
            if (findableLeadId) {
              await mustWrite(
                "outreach_leads",
                {
                  status: "payment_received",
                  amount_paid: amountGbp,
                  payment_date: new Date().toISOString(),
                  paid_for: "Findable - Setup + first 2 months",
                },
                findableLeadId,
                "findable lead -> payment_received",
              );
            } else {
              // No lead id on the session: the payment lands on the onboarding row but nothing
              // links it to the CRM. Worth recording rather than shrugging at.
              console.warn(`[stripe-webhook] findable payment without lead_id (onboarding=${onboardingId})`);
              await recordPaymentFailure("stripe_findable_no_lead", { onboarding_id: onboardingId, amount_gbp: amountGbp });
            }
            console.log(`[stripe-webhook] findable payment recorded: onboarding=${onboardingId} lead=${findableLeadId || "(none)"} amount=${amountGbp} (${event.id})`);

            /* Email AFTER the payment is written and logged — the money landing can never depend on
               Resend being up. Skipped when the lead already had money against it, which is what
               makes a Stripe retry silent. */
            if (!alreadyPaid) {
              await notifyOfFindablePayment({
                businessName: ((leadForEmail?.business_name as string) ?? "").trim(),
                amountGbp,
                paidFor: "Findable - Setup + first 2 months",
                trade: (((leadForEmail?.category as string) || (leadForEmail?.search_keyword as string) || "").trim()) || null,
                town: ((leadForEmail?.search_location as string) ?? "").trim() || null,
                phone: ((leadForEmail?.phone as string) ?? "").trim() || null,
                email: ((leadForEmail?.email as string) ?? "").trim() || null,
                /* A payment with no lead_id is the one you most need to see: the money landed but
                   nothing in the CRM points at it, so it will not appear in Paid Clients and no
                   baseline starts. recordPaymentFailure already logs it; this makes it arrive. */
                note: findableLeadId
                  ? null
                  : `No CRM lead is linked to this payment (onboarding ${onboardingId}). It will not show in Paid Clients and no baseline has started — link it by hand.`,
              });
            } else {
              console.log(`[stripe-webhook] findable payment email skipped: lead ${findableLeadId} already had a payment (retry?)`);
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
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const siteId = (sub.metadata?.generated_site_id as string) || "";
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
        await setPaid((sub.metadata?.generated_site_id as string) || "", false);
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
