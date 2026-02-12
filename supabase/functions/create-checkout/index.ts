import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limit: 5 requests per minute (prevents checkout spam)
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60000;

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
 
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) throw new Error("No authorization header provided");
     logStep("Authorization header found");
 
     const token = authHeader.replace("Bearer ", "");
     const { data } = await supabaseClient.auth.getUser(token);
     const user = data.user;
      if (!user?.email) throw new Error("User not authenticated or email not available");
      logStep("User authenticated", { userId: user.id, email: user.email });

      // Apply rate limiting (5 requests/minute per user)
      const rateLimitResult = checkRateLimit(`checkout:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
      if (!rateLimitResult.allowed) {
        logStep("Rate limit exceeded", { userId: user.id });
        return new Response(
          JSON.stringify({ error: "Too many checkout attempts. Please wait a moment and try again." }),
          {
            headers: { 
              ...corsHeaders, 
              "Content-Type": "application/json",
              ...rateLimitHeaders(rateLimitResult, RATE_LIMIT)
            },
            status: 429,
          }
        );
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      // ─── SUBSCRIPTION GUARD: check DB for existing active subscription ───
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
          subscriptionId: existingSub.stripe_subscription_id,
        });

        // Redirect to billing portal instead of creating a new checkout
        const origin = req.headers.get("origin") || "https://leadfinderapp.lovable.app";
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: existingSub.stripe_customer_id,
          return_url: `${origin}/`,
        });

        return new Response(JSON.stringify({ url: portalSession.url, redirectedToPortal: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      logStep("GUARD: No active subscription found, proceeding with checkout");
      // ─── END GUARD ───

      // ─── Mark checkout_abandoned so user gets 1 post-abandon search ───
      await supabaseClient
        .from('user_trials')
        .update({ checkout_abandoned: true })
        .eq('user_id', user.id);
      logStep("Set checkout_abandoned = true", { userId: user.id });
     
      // Check trial_used flag from user_trials (single source of truth)
      const { data: trialRow } = await supabaseClient
        .from('user_trials')
        .select('trial_used')
        .eq('user_id', user.id)
        .single();
      
      const trialUsed = trialRow?.trial_used === true;
      logStep("Trial used check", { userId: user.id, trialUsed });

      // Check for existing customer
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      let customerId: string | undefined;
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });
      }

      // Get affiliate code and ref_source from user_trials if present
      const { data: trialData } = await supabaseClient
        .from('user_trials')
        .select('affiliate_code, ref_source')
        .eq('user_id', user.id)
        .single();
      
      const affiliateCode = trialData?.affiliate_code || null;
      const refSource = trialData?.ref_source || null;
      logStep("Tracking data check", { affiliateCode, refSource });

      // Create checkout session
      // Only offer trial if user has never had a subscription before
      const sessionConfig: {
        customer?: string;
        customer_email?: string;
        client_reference_id: string;
        metadata?: { affiliate_code?: string };
        line_items: Array<{ price: string; quantity: number }>;
        mode: "subscription";
        subscription_data?: { trial_period_days: number; metadata?: { affiliate_code?: string } };
        payment_method_collection: "always";
        success_url: string;
        cancel_url: string;
      } = {
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        client_reference_id: user.id,
        line_items: [
          {
            price: "price_1SxN38Gi4ps7kJ7R8UE1kYGS",
            quantity: 1,
          },
        ],
        mode: "subscription",
        payment_method_collection: "always",
        success_url: `${req.headers.get("origin")}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.get("origin")}/billing/cancel`,
      };
      
      // Add tracking metadata if present (affiliate_code and/or ref_source)
      const trackingMetadata: Record<string, string> = {};
      if (affiliateCode) trackingMetadata.affiliate_code = affiliateCode;
      if (refSource) trackingMetadata.ref_source = refSource;
      
      if (Object.keys(trackingMetadata).length > 0) {
        sessionConfig.metadata = trackingMetadata;
      }
      
      // Only add trial if trial_used is false
      const branchTaken = trialUsed ? 'no_trial' : 'trial';
      if (!trialUsed) {
        sessionConfig.subscription_data = { 
          trial_period_days: 1,
          metadata: Object.keys(trackingMetadata).length > 0 ? trackingMetadata : undefined
        };
        logStep("Adding 1-day trial to checkout", { branchTaken });
      } else {
        logStep("Skipping trial - trial_used is true", { branchTaken });
      }
      
      const session = await stripe.checkout.sessions.create(sessionConfig);
 
     logStep("Checkout session created", { sessionId: session.id, userId: user.id, trialUsed, branchTaken });
 
     return new Response(JSON.stringify({ url: session.url }), {
       headers: { ...corsHeaders, "Content-Type": "application/json" },
       status: 200,
     });
    } catch (error) {
      // Log detailed error server-side only
      const errorMessage = error instanceof Error ? error.message : String(error);
      logStep("ERROR", { message: errorMessage });
      // Return generic error to client - don't expose internal details
      return new Response(JSON.stringify({ error: "Unable to create checkout session. Please try again." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
 });