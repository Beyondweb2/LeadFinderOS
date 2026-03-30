import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit by IP to prevent abuse
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`checkout-email:${clientIP}`, 5, 60000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 429,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== 'string') {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Validate session_id format (Stripe checkout sessions start with cs_)
    if (!session_id.startsWith('cs_')) {
      return new Response(JSON.stringify({ error: "Invalid session_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['customer'],
    });

    if (checkoutSession.status !== 'complete') {
      return new Response(JSON.stringify({ error: "Checkout session is not complete" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const customer = checkoutSession.customer as Stripe.Customer;
    const email = customer?.email || checkoutSession.customer_details?.email;

    if (!email) {
      return new Response(JSON.stringify({ error: "No email found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    return new Response(JSON.stringify({ email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    // Return generic error to avoid leaking internal details
    return new Response(JSON.stringify({ error: "Failed to retrieve checkout info" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
