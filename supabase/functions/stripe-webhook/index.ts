import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  if (!stripeSecret || !webhookSecret) {
    // Not wired up yet — acknowledge so Stripe doesn't hammer retries pre-launch.
    return new Response(JSON.stringify({ received: true, configured: false }), { status: 200 });
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

  // Idempotent write: set is_paid to a fixed value on the one mapped site.
  const setPaid = async (siteId: string, paid: boolean, ownerId?: string | null) => {
    if (!siteId) {
      console.warn(`[stripe-webhook] ${event.type} (${event.id}) had no generated_site_id — skipped`);
      return;
    }
    let q = service.from("generated_sites").update({ is_paid: paid }).eq("id", siteId);
    if (ownerId) q = q.eq("owner_id", ownerId); // defence-in-depth on the paid flip
    const { error } = await q;
    if (error) console.error(`[stripe-webhook] is_paid update failed (${siteId}):`, error.message);
    else console.log(`[stripe-webhook] is_paid=${paid} site=${siteId} via ${event.type} (${event.id})`);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
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
