import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60000;

const ALLOWED_ORIGINS = [
  'https://lead-finder-app.com',
  'https://www.lead-finder-app.com',
  'https://leadfinderapp.lovable.app',
];
const DEFAULT_ORIGIN = 'https://lead-finder-app.com';

const resolveOrigin = (raw: string | null): string => {
  return raw && ALLOWED_ORIGINS.includes(raw) ? raw : DEFAULT_ORIGIN;
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = resolveOrigin(req.headers.get("origin"));

    // Authentication is REQUIRED — signup before Stripe
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer undefined") {
      logStep("No auth header — rejecting");
      return new Response(
        JSON.stringify({ error: "Authentication required. Please create an account first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    let user: { id: string; email: string };
    try {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (!data.user?.email) throw new Error("No email");
      user = { id: data.user.id, email: data.user.email };
      logStep("Authenticated user", { userId: user.id, email: user.email });
    } catch {
      logStep("Auth failed — rejecting");
      return new Response(
        JSON.stringify({ error: "Invalid authentication. Please sign in again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Rate limit by user ID or IP
    const rateLimitKey = user ? `checkout:${user.id}` : `checkout:${req.headers.get("x-forwarded-for") || "anon"}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { key: rateLimitKey });
      return new Response(
        JSON.stringify({ error: "Too many checkout attempts. Please wait a moment and try again." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rateLimitResult, RATE_LIMIT) },
          status: 429,
        }
      );
    }

    // Check for existing active subscription
    const { data: existingSub } = await supabaseClient
      .from('subscriptions')
      .select('id, status, stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .in('status', ['trialing', 'active', 'past_due', 'unpaid'])
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      logStep("GUARD: User already has active subscription, redirecting to portal", {
        userId: user.id,
        existingStatus: existingSub.status,
      });

      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: existingSub.stripe_customer_id,
          return_url: `${origin}/`,
        });
        return new Response(JSON.stringify({ url: portalSession.url, redirectedToPortal: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (portalError) {
        const msg = portalError instanceof Error ? portalError.message : String(portalError);
        logStep("GUARD: Billing portal failed, cleaning stale subscription", { error: msg });
        await supabaseClient.from('subscriptions').delete().eq('id', existingSub.id);
        logStep("GUARD: Deleted stale subscription record, proceeding with new checkout");
      }
    }

    // Check for existing Stripe customer
    let customerId: string | undefined;
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    // Check if user has already used a trial
    let trialUsed = false;
    const { data: trialRow } = await supabaseClient
      .from('user_trials')
      .select('trial_used')
      .eq('user_id', user.id)
      .single();
    trialUsed = trialRow?.trial_used === true;

    // Get tracking metadata
    const trackingMetadata: Record<string, string> = {};
    const { data: trialData } = await supabaseClient
      .from('user_trials')
      .select('affiliate_code, ref_source')
      .eq('user_id', user.id)
      .single();
    if (trialData?.affiliate_code) trackingMetadata.affiliate_code = trialData.affiliate_code;
    if (trialData?.ref_source) trackingMetadata.ref_source = trialData.ref_source;

    // Build checkout session config
    const sessionConfig: Record<string, unknown> = {
      line_items: [{ price: "price_1SxN38Gi4ps7kJ7R8UE1kYGS", quantity: 1 }],
      mode: "subscription",
      payment_method_types: ['card'],
      success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/landing?checkout=cancelled`,
      client_reference_id: user.id,
    };

    if (customerId) {
      sessionConfig.customer = customerId;
    } else {
      sessionConfig.customer_email = user.email;
    }

    // Always include userId and email in metadata
    const metadata: Record<string, string> = {
      userId: user.id,
      email: user.email,
      ...trackingMetadata,
    };
    sessionConfig.metadata = metadata;

    // Offer 5-day trial for users who haven't used one
    if (!trialUsed) {
      logStep("Creating checkout with 5-day free trial");
      sessionConfig.subscription_data = {
        trial_period_days: 5,
        metadata,
      };
    } else {
      logStep("Creating checkout without trial (trial already used)");
    }

    logStep("Creating checkout session", { hasCustomer: !!customerId, userId: user.id, trialUsed });
    const session = await stripe.checkout.sessions.create(sessionConfig as Stripe.Checkout.SessionCreateParams);

    logStep("Checkout session created", { sessionId: session.id });

    // Record checkout attempt for funnel tracking
    await supabaseClient
      .from('checkout_attempts')
      .insert({
        email: user.email,
        user_id: user.id,
        converted: false,
      });
    logStep("Checkout attempt recorded", { email: user.email });

    // Record checkout start for lifecycle email tracking
    await supabaseClient
      .from('user_trials')
      .update({ checkout_started_at: new Date().toISOString() })
      .eq('user_id', user.id);
    logStep("Set checkout_started_at", { userId: user.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to create checkout session. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
