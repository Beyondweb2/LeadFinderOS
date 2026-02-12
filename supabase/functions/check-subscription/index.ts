 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import Stripe from "https://esm.sh/stripe@18.5.0";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 const logStep = (step: string, details?: unknown) => {
   const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
   console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
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
 
      // Validate the token using a service-role client (do NOT rely on cookie-based sessions)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        logStep("No authorization header provided, returning unsubscribed state");
        return new Response(JSON.stringify({ subscribed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      logStep("Authorization header found");

      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        logStep("Empty bearer token, returning unsubscribed state");
        return new Response(JSON.stringify({ subscribed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError) {
        logStep("Authentication failed, returning unsubscribed state", { message: userError.message });
        return new Response(JSON.stringify({ subscribed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const user = userData.user;
      if (!user?.email) {
        logStep("No user email, returning unsubscribed state");
        return new Response(JSON.stringify({ subscribed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      logStep("User authenticated", { userId: user.id, email: user.email });
 
     const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
     
     // Find customer by email
     const customers = await stripe.customers.list({ email: user.email, limit: 1 });
     
     if (customers.data.length === 0) {
       logStep("No customer found, returning unsubscribed state");
       return new Response(JSON.stringify({ subscribed: false }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 200,
       });
     }
 
     const customerId = customers.data[0].id;
     logStep("Found Stripe customer", { customerId });
 
      // Check for active subscriptions
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      });

       // Grant access for active, trialing, or past_due — even if cancel_at_period_end is true
       // Cancelled trials keep full access until the trial period naturally expires
       const validStatuses = ['active', 'trialing', 'past_due'];
       const validSubscription = subscriptions.data.find((sub: { status: string }) => validStatuses.includes(sub.status));
      
      const hasActiveSub = !!validSubscription;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;
      let subscriptionStatus: string | null = null;
      let trialEnd: string | null = null;
 
      if (hasActiveSub && validSubscription) {
        // Safely handle the timestamp conversion
        const periodEnd = validSubscription.current_period_end;
        if (periodEnd && typeof periodEnd === 'number') {
          subscriptionEnd = new Date(periodEnd * 1000).toISOString();
        }
        subscriptionStatus = validSubscription.status;

        // Extract trial_end from Stripe (source of truth)
        const stripeTrialEnd = validSubscription.trial_end;
        if (stripeTrialEnd && typeof stripeTrialEnd === 'number') {
          trialEnd = new Date(stripeTrialEnd * 1000).toISOString();
        }
       
        const priceProduct = validSubscription.items.data[0]?.price?.product;
        if (priceProduct) {
          productId = typeof priceProduct === 'string' ? priceProduct : priceProduct.id;
        }
       
        logStep("Active subscription found", { 
          subscriptionId: validSubscription.id, 
          endDate: subscriptionEnd,
          trialEnd,
          productId,
          status: subscriptionStatus
        });
      } else {
        logStep("No active subscription found");
      }
 
    return new Response(JSON.stringify({
       subscribed: hasActiveSub,
       product_id: productId,
        subscription_end: subscriptionEnd,
        subscription_status: subscriptionStatus,
        trial_end: trialEnd
     }), {
       headers: { ...corsHeaders, "Content-Type": "application/json" },
       status: 200,
     });
    } catch (error) {
      // Log detailed error server-side only
      const errorMessage = error instanceof Error ? error.message : String(error);
      logStep("ERROR", { message: errorMessage });
      // Return generic error to client
      return new Response(JSON.stringify({ error: "Unable to check subscription status. Please try again." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
 });