 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import Stripe from "https://esm.sh/stripe@18.5.0";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
 
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) throw new Error("No authorization header provided");
     logStep("Authorization header found");
 
     const token = authHeader.replace("Bearer ", "");
     const { data } = await supabaseClient.auth.getUser(token);
     const user = data.user;
     if (!user?.email) throw new Error("User not authenticated or email not available");
     logStep("User authenticated", { userId: user.id, email: user.email });
 
     const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
     
     // Check for existing customer
     const customers = await stripe.customers.list({ email: user.email, limit: 1 });
     let customerId: string | undefined;
     let hasHadSubscription = false;
     
     if (customers.data.length > 0) {
       customerId = customers.data[0].id;
       logStep("Found existing Stripe customer", { customerId });
       
       // Check if this customer has ever had a subscription (trial abuse prevention)
       const allSubscriptions = await stripe.subscriptions.list({
         customer: customerId,
         limit: 10,
       });
       
       if (allSubscriptions.data.length > 0) {
         hasHadSubscription = true;
         logStep("Customer has subscription history", { 
           count: allSubscriptions.data.length,
           statuses: allSubscriptions.data.map((s: { status: string }) => s.status)
         });
       }
     }

      // Get affiliate code from user_trials if present
      const { data: trialData } = await supabaseClient
        .from('user_trials')
        .select('affiliate_code')
        .eq('user_id', user.id)
        .single();
      
      const affiliateCode = trialData?.affiliate_code || null;
      logStep("Affiliate code check", { affiliateCode });

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
        success_url: `${req.headers.get("origin")}/app?checkout=success`,
        cancel_url: `${req.headers.get("origin")}/app?checkout=cancel`,
      };
      
      // Add affiliate code to metadata if present
      if (affiliateCode) {
        sessionConfig.metadata = { affiliate_code: affiliateCode };
      }
      
      // Only add trial for new customers who haven't had a subscription
      if (!hasHadSubscription) {
        sessionConfig.subscription_data = { 
          trial_period_days: 7,
          metadata: affiliateCode ? { affiliate_code: affiliateCode } : undefined
        };
        logStep("Adding 7-day trial to checkout");
      } else {
        logStep("Skipping trial - customer has previous subscription");
      }
      
      const session = await stripe.checkout.sessions.create(sessionConfig);
 
     logStep("Checkout session created", { sessionId: session.id });
 
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