import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// findable-checkout — Stripe Checkout for the Findable onboarding plan (verify_jwt = false;
// called by the public findable-site with the anon apikey — the visitor has no app account).
//
// ONE plan: £49.99 ONE-OFF (setup + first 2 months, money-back guarantee). mode=payment —
// deliberately NOT the barber subscription function (that one needs an operator JWT, bills
// £29.99/month and redirects to /barber).
//
// KEY SAFETY: STRIPE_SECRET_KEY lives ONLY in this function's server-side secrets. The
// session is created HERE via the Stripe REST API; the browser only ever receives the
// session's redirect URL. Nothing secret ships in findable-site's bundle.
//
// Price: FINDABLE_SETUP_PRICE_ID (a Stripe dashboard Price) wins when set; otherwise the
// inline price_data below charges exactly £49.99. Keep the constant in sync with the
// onboarding page's plan card.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FINDABLE_SETUP_PRICE_GBP = 49.99;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID_OR_BEYOND = new Set(["payment_received", "in_delivery", "completed"]);
// Only findable-site (and local dev) may be bounced back to — never an attacker-supplied origin.
const ALLOWED_ORIGINS = new Set(["https://findable.uk", "https://www.findable.uk", "http://localhost:4321"]);

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
      .from("onboarding_responses").select("id, lead_id, status").eq("id", onboardingId).maybeSingle();
    if (!ob) return json({ ok: false, error: "unknown_onboarding" }, 404);
    const effectiveLeadId = (ob.lead_id as string | null) ?? leadId;
    if (effectiveLeadId) {
      const { data: lead } = await service
        .from("outreach_leads").select("id, status, amount_paid").eq("id", effectiveLeadId).maybeSingle();
      if (lead && (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0)) {
        return json({ ok: false, error: "already_client" }, 403);
      }
    }

    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : "https://findable.uk";
    const back = `${origin}/onboarding${effectiveLeadId ? `?lead=${effectiveLeadId}` : ""}`;

    const form = new URLSearchParams();
    form.set("mode", "payment"); // ONE-OFF — not a subscription
    form.set("success_url", `${back}${back.includes("?") ? "&" : "?"}paid=1`);
    form.set("cancel_url", `${back}${back.includes("?") ? "&" : "?"}cancelled=1`);
    form.set("metadata[onboarding_id]", onboardingId);
    if (effectiveLeadId) form.set("metadata[lead_id]", effectiveLeadId);
    const priceId = Deno.env.get("FINDABLE_SETUP_PRICE_ID") ?? "";
    if (priceId) {
      form.set("line_items[0][price]", priceId);
      form.set("line_items[0][quantity]", "1");
    } else {
      form.set("line_items[0][price_data][currency]", "gbp");
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(FINDABLE_SETUP_PRICE_GBP * 100)));
      form.set("line_items[0][price_data][product_data][name]", "Findable — Setup + first 2 months");
      form.set("line_items[0][price_data][product_data][description]", "AI-visibility setup. Money-back guarantee: named in more AI answers within 8 weeks or a full refund.");
      form.set("line_items[0][quantity]", "1");
    }

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeSecret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const session = await res.json();
    if (!res.ok) {
      console.error("[findable-checkout] Stripe error:", session?.error?.message ?? session);
      return json({ ok: false, error: "checkout_failed" }, 502);
    }
    return json({ ok: true, url: session.url });
  } catch (e) {
    console.error("[findable-checkout] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
