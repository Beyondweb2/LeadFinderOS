import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[TRIAL-REMINDER] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    logStep("ERROR", "RESEND_API_KEY not set");
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    logStep("ERROR", "STRIPE_SECRET_KEY not set");
    return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  try {
     logStep("Finding trialing subscriptions created ~68 hours ago");

     // Find subscriptions that started between 67-69 hours ago (window to catch on hourly cron)
     // Trial is 3 days (72h), reminder fires ~4 hours before expiry
     const now = Date.now();
     const windowStart = new Date(now - 69 * 60 * 60 * 1000);
     const windowEnd = new Date(now - 67 * 60 * 60 * 1000);

    // Query subscriptions table for trialing users in the window
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, stripe_customer_id, stripe_subscription_id")
      .eq("status", "trialing")
      .gte("created_at", windowStart.toISOString())
      .lte("created_at", windowEnd.toISOString());

    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) {
      logStep("No trialing users in reminder window");
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep(`Found ${subs.length} trialing user(s) to remind`);

    let sentCount = 0;

    for (const sub of subs) {
      try {
        // Get user email from auth
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(sub.user_id);
        const email = userData?.user?.email;
        if (!email) {
          logStep("No email for user", { userId: sub.user_id });
          continue;
        }

        // Create billing portal link for easy cancellation
        let portalUrl = "";
        try {
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: `${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || "https://leadfinderapp.lovable.app"}/`,
          });
          portalUrl = portalSession.url;
        } catch (e) {
          logStep("Failed to create portal session", { error: String(e) });
          portalUrl = "https://leadfinderapp.lovable.app/";
        }

        // Send reminder email via Resend
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "LeadFinder Pro <onboarding@resend.dev>",
            to: [email],
            subject: "Your full access ends soon",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 20px;">
                <h2 style="margin: 0 0 16px; font-size: 20px; color: #111;">Your full access ends in 4 hours</h2>
                <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
                  Just a quick reminder — your 3-day full access to LeadFinder Pro ends soon.
                </p>
                <p style="color: #555; line-height: 1.6; margin: 0 0 16px;">
                  After your trial ends, your subscription will automatically continue at <strong>£19.99/month</strong>.
                </p>
                <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
                  If you'd like to cancel before renewal, you can do so anytime from your billing dashboard:
                </p>
                <a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                  Manage Subscription
                </a>
                <p style="color: #999; font-size: 12px; margin-top: 24px; line-height: 1.5;">
                  No action needed if you'd like to continue — your access will seamlessly continue.
                </p>
              </div>
            `,
          }),
        });

        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          logStep("Resend error", { email, status: emailRes.status, body: errBody });
        } else {
          sentCount++;
          logStep("Reminder sent", { email });
        }
      } catch (userErr) {
        logStep("Error processing user", { userId: sub.user_id, error: String(userErr) });
      }
    }

    logStep(`Done. Sent ${sentCount} reminder(s)`);
    return new Response(JSON.stringify({ sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
