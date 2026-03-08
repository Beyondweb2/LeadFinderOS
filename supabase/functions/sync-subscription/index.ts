import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-SUBSCRIPTION] ${step}${detailsStr}`);
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

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Get session_id from request body
    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");
    logStep("Session ID received", { session_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Retrieve the checkout session from Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer'],
    });
    logStep("Checkout session retrieved", { 
      status: checkoutSession.status,
      customer: checkoutSession.customer,
      subscription: checkoutSession.subscription 
    });

    // Verify this checkout belongs to the authenticated user
    if (checkoutSession.client_reference_id !== user.id) {
      logStep("Client reference ID mismatch", { 
        expected: user.id, 
        got: checkoutSession.client_reference_id 
      });
      throw new Error("Checkout session does not belong to this user");
    }

    if (checkoutSession.status !== 'complete') {
      throw new Error("Checkout session is not complete");
    }

    // Extract subscription details
    const subscription = checkoutSession.subscription as Stripe.Subscription;
    const customer = checkoutSession.customer as Stripe.Customer;
    
    if (!subscription || !customer) {
      throw new Error("Missing subscription or customer data");
    }

    const subscriptionStatus = subscription.status;
    
    // Safely handle timestamps - they might be null/undefined for trialing subscriptions
    let currentPeriodEnd: string | null = null;
    if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
      currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
    }
    
    let trialEnd: string | null = null;
    if (subscription.trial_end && typeof subscription.trial_end === 'number') {
      trialEnd = new Date(subscription.trial_end * 1000).toISOString();
    }

    logStep("Subscription details extracted", {
      subscriptionId: subscription.id,
      customerId: customer.id,
      status: subscriptionStatus,
      currentPeriodEnd,
      trialEnd
    });

    // Upsert subscription record
    const { error: upsertError } = await supabaseClient
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        status: subscriptionStatus,
        current_period_end: trialEnd || currentPeriodEnd,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) {
      logStep("Upsert error", { error: upsertError });
      throw new Error("Failed to save subscription");
    }
    logStep("Subscription saved successfully");

    // Update user_trials to mark as paid/setup-complete after successful checkout return
    const hasPaidAccess = subscriptionStatus === 'trialing' || subscriptionStatus === 'active';
    const { error: trialUpdateError } = await supabaseClient
      .from('user_trials')
      .update({
        plan_status: subscriptionStatus === 'trialing' ? 'trial' : 'active',
        paid_at: subscriptionStatus === 'active' ? new Date().toISOString() : null,
        ...(hasPaidAccess ? { setup_completed: true, lifecycle_stage: 99, checkout_started_at: null } : {}),
      })
      .eq('user_id', user.id);

    if (trialUpdateError) {
      logStep("Trial update warning", { error: trialUpdateError });
      // Don't throw - this is not critical
    }

    logStep("Sync completed successfully");

    return new Response(
      JSON.stringify({ 
        success: true,
        subscription: {
          status: subscriptionStatus,
          current_period_end: currentPeriodEnd,
          trial_end: trialEnd,
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ success: false, error: "Failed to sync subscription. Please try again." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
