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
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
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

      // Handle invoice.paid for affiliate tracking (first payment after trial)
      if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        
        // Only process if this is a subscription invoice with actual payment
        if (invoice.subscription && invoice.amount_paid && invoice.amount_paid > 0) {
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
          
          if (customerId) {
            // Get customer email to find user
            const customer = await stripe.customers.retrieve(customerId);
            if (!customer.deleted && customer.email) {
              // Find user by email
              const { data: users } = await supabaseAdmin.auth.admin.listUsers();
              const user = users?.users.find(u => u.email === customer.email);
              
              if (user) {
                logStep("Processing invoice.paid for affiliate", { userId: user.id, amount: invoice.amount_paid });
                
                // Check if this user already has an affiliate conversion
                const { data: existingConversion } = await supabaseAdmin
                  .from('affiliate_conversions')
                  .select('id')
                  .eq('user_id', user.id)
                  .limit(1);
                
                if (!existingConversion || existingConversion.length === 0) {
                  // Get affiliate code from user_trials
                  const { data: trialData } = await supabaseAdmin
                    .from('user_trials')
                    .select('affiliate_code')
                    .eq('user_id', user.id)
                    .single();
                  
                  const affiliateCode = trialData?.affiliate_code;
                  
                  if (affiliateCode) {
                    // Find the affiliate by code
                    const { data: affiliate } = await supabaseAdmin
                      .from('affiliates')
                      .select('id, commission_rate')
                      .eq('code', affiliateCode)
                      .eq('is_active', true)
                      .single();
                    
                    if (affiliate) {
                      const commissionAmount = Math.floor(invoice.amount_paid * Number(affiliate.commission_rate));
                      
                      // Create affiliate conversion
                      const { error: conversionError } = await supabaseAdmin
                        .from('affiliate_conversions')
                        .insert({
                          affiliate_id: affiliate.id,
                          user_id: user.id,
                          first_payment_amount: invoice.amount_paid,
                          commission_amount: commissionAmount,
                          currency: invoice.currency || 'gbp',
                          status: 'pending',
                          stripe_payment_intent_id: typeof invoice.payment_intent === 'string' 
                            ? invoice.payment_intent 
                            : invoice.payment_intent?.id,
                        });
                      
                      if (conversionError) {
                        logStep("Failed to create affiliate conversion", { error: conversionError.message });
                      } else {
                        logStep("Affiliate conversion created", { 
                          affiliateId: affiliate.id, 
                          amount: invoice.amount_paid,
                          commission: commissionAmount
                        });
                      }
                      
                      // Update user_trials.paid_at
                      await supabaseAdmin
                        .from('user_trials')
                        .update({ paid_at: new Date().toISOString() })
                        .eq('user_id', user.id);
                    } else {
                      logStep("Affiliate not found or inactive", { affiliateCode });
                    }
                  } else {
                    logStep("No affiliate code for user", { userId: user.id });
                  }
                } else {
                  logStep("User already has affiliate conversion, skipping", { userId: user.id });
                }
              }
            }
          }
        }
      }

      // Handle charge.refunded for voiding affiliate conversions
      if (event.type === "charge.refunded") {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === 'string' 
          ? charge.payment_intent 
          : charge.payment_intent?.id;
        
        if (paymentIntentId) {
          logStep("Processing refund for affiliate voiding", { paymentIntentId });
          
          const { error: voidError } = await supabaseAdmin
            .from('affiliate_conversions')
            .update({ status: 'void' })
            .eq('stripe_payment_intent_id', paymentIntentId)
            .eq('status', 'pending');
          
          if (voidError) {
            logStep("Failed to void affiliate conversion", { error: voidError.message });
          } else {
            logStep("Affiliate conversion voided due to refund");
          }
        }
      }

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

         // ─── DUPLICATE GUARD: check for existing active sub before upserting ───
         const { data: existingSubs } = await supabaseAdmin
           .from("subscriptions")
           .select("id, stripe_subscription_id, status, created_at")
           .eq("user_id", user.id)
           .in("status", ["active", "trialing"]);

         const isNewSub = event.type === "customer.subscription.created";
         const hasExistingActive = existingSubs && existingSubs.length > 0;

         if (isNewSub && hasExistingActive) {
           // Another active/trialing sub already exists for this user
           const existingIds = existingSubs.map(s => s.stripe_subscription_id);
           const isAlreadyTracked = existingIds.includes(subscription.id);

           if (!isAlreadyTracked) {
             logStep("DUPLICATE DETECTED: user already has active subscription", {
               userId: user.id,
               existingSubscriptions: existingSubs.map(s => ({
                 id: s.stripe_subscription_id,
                 status: s.status,
                 created_at: s.created_at,
               })),
               incomingSubscription: { id: subscription.id, status },
             });
             // Insert the duplicate record but flag it so it can be reviewed
             const { error: dupInsertError } = await supabaseAdmin
               .from("subscriptions")
               .upsert({
                 user_id: user.id,
                 stripe_customer_id: customerId,
                 stripe_subscription_id: subscription.id,
                 status: `duplicate_${status}`,
                 current_period_end: subscription.current_period_end
                   ? new Date(subscription.current_period_end * 1000).toISOString()
                   : (subscription.trial_end
                     ? new Date(subscription.trial_end * 1000).toISOString()
                     : null),
                 updated_at: new Date().toISOString(),
               }, {
                 onConflict: "stripe_subscription_id",
               });

             if (dupInsertError) {
               logStep("Failed to insert duplicate subscription record", { error: dupInsertError.message });
             } else {
               logStep("Duplicate subscription saved with 'duplicate_' prefix for manual review");
             }

             // Skip further processing — don't overwrite the primary sub's plan_status
             return new Response(JSON.stringify({ received: true, duplicate: true }), {
               headers: { ...corsHeaders, "Content-Type": "application/json" },
               status: 200,
             });
           }
         }
         // ─── END DUPLICATE GUARD ───

         // Upsert subscription record (normal path)
         const { error: upsertError } = await supabaseAdmin
           .from("subscriptions")
           .upsert({
             user_id: user.id,
             stripe_customer_id: customerId,
             stripe_subscription_id: subscription.id,
             status: status,
            current_period_end: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : (subscription.trial_end
                ? new Date(subscription.trial_end * 1000).toISOString()
                : null),
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
      // Log detailed error server-side only
      const errorMessage = error instanceof Error ? error.message : String(error);
      logStep("ERROR", { message: errorMessage });
      // Return generic error to client
      return new Response(JSON.stringify({ error: "An error occurred processing the webhook" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
 });