import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[COMPLETE-SIGNUP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { session_id, password, language, affiliate_code, ref_source, utm_source, utm_campaign, utm_adset, utm_ad, fbclid, traffic_source } = await req.json();
    if (!session_id) throw new Error("Missing session_id");
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    const userLanguage = language || 'en';
    let finalAffiliateCode = typeof affiliate_code === 'string' ? affiliate_code.trim() : null;
    let finalRefSource = typeof ref_source === 'string' ? ref_source.trim() : null;
    if (finalAffiliateCode) logStep("Affiliate code received", { code: finalAffiliateCode });

    // Clean UTM fields
    const cleanUtm = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
    const utmFields: Record<string, string | null> = {
      utm_source: cleanUtm(utm_source),
      utm_campaign: cleanUtm(utm_campaign),
      utm_adset: cleanUtm(utm_adset),
      utm_ad: cleanUtm(utm_ad),
      fbclid: cleanUtm(fbclid),
      traffic_source: cleanUtm(traffic_source),
    };
    // Remove null entries
    const utmData: Record<string, string> = {};
    for (const [k, v] of Object.entries(utmFields)) { if (v) utmData[k] = v; }
    if (Object.keys(utmData).length > 0) logStep("UTM data from request body", utmData);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Retrieve checkout session to get email and subscription
    const checkoutSession = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer'],
    });

    if (checkoutSession.status !== 'complete') {
      throw new Error("Checkout session is not complete");
    }

    const customer = checkoutSession.customer as Stripe.Customer;
    const subscription = checkoutSession.subscription as Stripe.Subscription;
    const email = customer?.email || checkoutSession.customer_details?.email;

    if (!email) throw new Error("No email found in checkout session");
    if (!subscription) throw new Error("No subscription found");

    const planStatus = subscription.status === 'trialing' ? 'trial' : 'active';
    logStep("Checkout verified", { email, subscriptionId: subscription.id, status: subscription.status, planStatus });

    // Fallback: if no UTM data from request body, try to pull from checkout_attempts
    if (Object.keys(utmData).length === 0 || !finalAffiliateCode || !finalRefSource) {
      const { data: attemptRow } = await supabaseAdmin
        .from('checkout_attempts')
        .select('utm_source, utm_campaign, utm_adset, utm_ad, fbclid, traffic_source, ref_source, affiliate_code')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptRow) {
        for (const key of ['utm_source', 'utm_campaign', 'utm_adset', 'utm_ad', 'fbclid', 'traffic_source'] as const) {
          if (!utmData[key] && attemptRow[key]) utmData[key] = attemptRow[key];
        }
        if (!finalAffiliateCode && attemptRow.affiliate_code) {
          finalAffiliateCode = attemptRow.affiliate_code;
        }
        if (!finalRefSource && attemptRow.ref_source) {
          finalRefSource = attemptRow.ref_source;
        }
        if (Object.keys(utmData).length > 0) logStep("UTM data recovered from checkout_attempts", utmData);
      }
    }

    // Check if a user with this email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);

    let userId: string;

    if (existingUser) {
      // User exists — update their password and sign them in
      userId = existingUser.id;
      logStep("Existing user found, updating password", { userId });

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    } else {
      // Create new user
      logStep("Creating new user", { email });
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) throw new Error(`Failed to create user: ${createError.message}`);
      userId = newUser.user.id;
      logStep("User created", { userId });
    }

    // Ensure user_trials row exists (trigger may have created it)
    const { data: existingTrial } = await supabaseAdmin
      .from('user_trials')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingTrial) {
      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin.from('user_trials').insert({
        user_id: userId,
        trial_started_at: new Date().toISOString(),
        trial_days: 5,
        trial_end_date: trialEnd,
        plan_status: planStatus,
        trial_used: true,
        lifecycle_stage: 99,
        preferred_language: userLanguage,
        setup_completed: true,
        ...(finalAffiliateCode ? { affiliate_code: finalAffiliateCode } : {}),
        ...(finalRefSource ? { ref_source: finalRefSource } : {}),
        ...utmData,
      });
      logStep("Created user_trials row", { affiliateCode: finalAffiliateCode, refSource: finalRefSource, utmData });
    } else {
      await supabaseAdmin.from('user_trials').update({
        plan_status: planStatus,
        trial_used: true,
        lifecycle_stage: 99,
        checkout_started_at: null,
        preferred_language: userLanguage,
        setup_completed: true,
        ...(finalAffiliateCode ? { affiliate_code: finalAffiliateCode } : {}),
        ...(finalRefSource ? { ref_source: finalRefSource } : {}),
        ...utmData,
      }).eq('user_id', userId);
      logStep("Updated user_trials row", { affiliateCode: finalAffiliateCode, refSource: finalRefSource, utmData });
    }

    // Upsert subscription record
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    await supabaseAdmin.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: trialEnd || currentPeriodEnd,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    logStep("Subscription record saved");

    // Log funnel events
    await supabaseAdmin.from('funnel_events').insert([
      { user_id: userId, event_type: 'signup_with_trial' },
      { user_id: userId, event_type: 'trial_started' },
    ]);
    logStep("Funnel events logged: signup_with_trial + trial_started");

    // Mark checkout_attempts as converted
    await supabaseAdmin
      .from('checkout_attempts')
      .update({ converted: true })
      .eq('email', email);
    logStep("Checkout attempt marked converted", { email });

    // Sign in the user to get a session token
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    // We can't generate a direct session from admin, so we'll return the user info
    // and let the client sign in with email/password
    logStep("Signup complete", { userId, email });

    return new Response(JSON.stringify({
      success: true,
      email,
      user_id: userId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage.includes('Password') || errorMessage.includes('session')
        ? errorMessage
        : "Failed to complete signup. Please try again.",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
