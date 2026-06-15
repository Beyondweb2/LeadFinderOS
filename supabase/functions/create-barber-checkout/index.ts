import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// create-barber-checkout — Stripe Checkout for the Barber Pro tier. SCAFFOLD.
//
// INACTIVE BY DESIGN: returns 503 until STRIPE_SECRET_KEY is provided as a
// Supabase function secret. NO keys are hardcoded. When a secret is set it
// creates a Stripe Checkout Session (subscription) via the Stripe REST API and
// returns its URL. Auth mirrors the in-handler Bearer pattern used by the other
// functions (verify_jwt = false in config.toml).
//
// To activate later (do NOT do this until you're ready to go live):
//   npx supabase secrets set STRIPE_SECRET_KEY=sk_live_or_test_...
//   (optional) STRIPE_BARBER_PRO_PRICE_ID=price_...   else priced inline below.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Keep in sync with src/config/pricing.ts (BARBER_PRO_PRICE_GBP).
const BARBER_PRO_PRICE_GBP = 19.99;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── INACTIVE GUARD: no secret key → payments are not live yet ──────────────
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeSecret) {
      return json(
        { success: false, configured: false, error: "Payments are not configured yet." },
        503,
      );
    }

    // --- Auth (same pattern as the other edge functions) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ success: false, error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ success: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const generatedSiteId: string | null =
      typeof body.generated_site_id === "string" ? body.generated_site_id : null;

    const origin = req.headers.get("origin") ?? "";
    const priceId = Deno.env.get("STRIPE_BARBER_PRO_PRICE_ID") ?? "";

    // --- Create a Stripe Checkout Session (subscription) via the REST API ---
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("success_url", `${origin}/barber?checkout=success`);
    form.set("cancel_url", `${origin}/barber?checkout=cancelled`);
    form.set("client_reference_id", userId);
    if (generatedSiteId) form.set("metadata[generated_site_id]", generatedSiteId);

    if (priceId) {
      form.set("line_items[0][price]", priceId);
      form.set("line_items[0][quantity]", "1");
    } else {
      // Inline price fallback until a Stripe Price is created in the dashboard.
      form.set("line_items[0][price_data][currency]", "gbp");
      form.set("line_items[0][price_data][recurring][interval]", "month");
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(BARBER_PRO_PRICE_GBP * 100)));
      form.set("line_items[0][price_data][product_data][name]", "Barber Pro");
      form.set("line_items[0][quantity]", "1");
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const session = await res.json();
    if (!res.ok) {
      console.error("create-barber-checkout: Stripe error:", session);
      return json({ success: false, error: "Could not create checkout session" }, 502);
    }

    return json({ success: true, url: session.url, id: session.id });
  } catch (e) {
    console.error("create-barber-checkout error:", e);
    return json({ success: false, error: "Internal error" }, 500);
  }
});
