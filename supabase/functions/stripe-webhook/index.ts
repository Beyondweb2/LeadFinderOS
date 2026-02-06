 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import Stripe from "https://esm.sh/stripe@18.5.0";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
 };
 
 const logStep = (step: string, details?: unknown) => {
   const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
   console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
 };
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     logStep("Webhook received");
 
     const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
     const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
     
     if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
     if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
 
     const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
 
     // Verify webhook signature
     const signature = req.headers.get("stripe-signature");
     if (!signature) throw new Error("No stripe-signature header");
 
     const body = await req.text();
     let event: Stripe.Event;
 
     try {
       event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
     } catch (err) {
       logStep("Signature verification failed", { error: err instanceof Error ? err.message : err });
       return new Response(JSON.stringify({ error: "Invalid signature" }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 400,
       });
     }
 
     logStep("Event verified", { type: event.type, id: event.id });
 
     // Initialize Supabase with service role (bypasses RLS for system updates)
     const supabaseAdmin = createClient(
       Deno.env.get("SUPABASE_URL") ?? "",
       Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
       { auth: { persistSession: false } }
     );
 
     // Handle subscription events
     if (event.type.startsWith("customer.subscription.") || event.type === "invoice.payment_failed") {
       let subscription: Stripe.Subscription;
       let customerId: string;
 
       if (event.type === "invoice.payment_failed") {
         const invoice = event.data.object as Stripe.Invoice;
         customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? '';
         
         // Get the subscription from the invoice
         if (invoice.subscription) {
           const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
           subscription = await stripe.subscriptions.retrieve(subId);
         } else {
           logStep("Invoice has no subscription, skipping");
           return new Response(JSON.stringify({ received: true }), {
             headers: { ...corsHeaders, "Content-Type": "application/json" },
             status: 200,
           });
         }
       } else {
         subscription = event.data.object as Stripe.Subscription;
         customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
       }
 
       logStep("Processing subscription", { 
         subscriptionId: subscription.id, 
         status: subscription.status,
         customerId 
       });
 
       // Get customer email to find user
       const customer = await stripe.customers.retrieve(customerId);
       if (customer.deleted || !customer.email) {
         logStep("Customer deleted or no email", { customerId });
         return new Response(JSON.stringify({ received: true }), {
           headers: { ...corsHeaders, "Content-Type": "application/json" },
           status: 200,
         });
       }
 
       logStep("Found customer", { email: customer.email });
 
       // Find user by email
       const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
       if (userError) throw new Error(`Failed to list users: ${userError.message}`);
 
       const user = users.users.find(u => u.email === customer.email);
       if (!user) {
         logStep("No user found for email", { email: customer.email });
         return new Response(JSON.stringify({ received: true }), {
           headers: { ...corsHeaders, "Content-Type": "application/json" },
           status: 200,
         });
       }
 
       logStep("Found user", { userId: user.id });
 
        // Determine the status to store
        let status = subscription.status;
        if (event.type === "invoice.payment_failed") {
          status = "past_due";
        } else if (event.type === "customer.subscription.deleted") {
          status = "canceled";
        }

        // Upsert subscription record
        const { error: upsertError } = await supabaseAdmin
          .from("subscriptions")
          .upsert({
            user_id: user.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            status: status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "stripe_subscription_id",
          });

        if (upsertError) {
          logStep("Failed to upsert subscription", { error: upsertError.message });
          throw new Error(`Database error: ${upsertError.message}`);
        }

        // Update user_trials.plan_status based on subscription status
        const validStatuses = ['active', 'trialing'];
        const newPlanStatus = validStatuses.includes(status) ? 'active' : 
                             (status === 'canceled' ? 'cancelled' : 'expired');
        
        const { error: trialUpdateError } = await supabaseAdmin
          .from("user_trials")
          .update({ plan_status: newPlanStatus })
          .eq('user_id', user.id);

        if (trialUpdateError) {
          logStep("Failed to update user_trials plan_status", { error: trialUpdateError.message });
          // Don't throw - subscription record was saved successfully
        } else {
          logStep("Updated user_trials plan_status", { userId: user.id, planStatus: newPlanStatus });
        }
 
       logStep("Subscription record updated", { userId: user.id, status });
     }
 
     return new Response(JSON.stringify({ received: true }), {
       headers: { ...corsHeaders, "Content-Type": "application/json" },
       status: 200,
     });
   } catch (error) {
     const errorMessage = error instanceof Error ? error.message : String(error);
     logStep("ERROR", { message: errorMessage });
     return new Response(JSON.stringify({ error: errorMessage }), {
       headers: { ...corsHeaders, "Content-Type": "application/json" },
       status: 500,
     });
   }
 });