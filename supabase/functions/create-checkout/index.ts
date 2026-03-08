import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
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
const DEFAULT_ORIGIN = 'https://leadfinderapp.lovable.app';
const DEFAULT_RETURN_PATH = '/find-leads';

const isTrustedOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return (
      ALLOWED_ORIGINS.includes(origin) ||
      hostname.endsWith('.lovable.app') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    );
  } catch {
    return false;
  }
};

const resolveOrigin = (raw: string | null): string => {
  if (!raw) return DEFAULT_ORIGIN;
  return isTrustedOrigin(raw) ? raw : DEFAULT_ORIGIN;
};

const sanitizeReturnPath = (rawPath?: string | null): string => {
  if (!rawPath) return DEFAULT_RETURN_PATH;
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) return DEFAULT_RETURN_PATH;

  const blockedPrefixes = ['/billing/success', '/complete-setup', '/billing/cancel', '/landing', '/auth'];
  if (blockedPrefixes.some((prefix) => rawPath.startsWith(prefix))) return DEFAULT_RETURN_PATH;

  return rawPath;
};

const resolveReturnPath = (bodyReturnTo?: string | null, referer?: string | null): string => {
  const fromBody = sanitizeReturnPath(bodyReturnTo);
  if (fromBody !== DEFAULT_RETURN_PATH) return fromBody;

  if (!referer) return fromBody;
  try {
    const refererUrl = new URL(referer);
    return sanitizeReturnPath(refererUrl.pathname);
  } catch {
    return fromBody;
  }
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
    logStep("Resolved origin", { requestOrigin: req.headers.get("origin"), checkoutOrigin: origin });

    // Parse body for customer_email and affiliate tracking (email-first flow)
    let bodyEmail: string | null = null;
    let bodyAffiliateCode: string | null = null;
    let bodyRefSource: string | null = null;
    let bodyReturnTo: string | null = null;
    try {
      const body = await req.json();
      if (body?.customer_email && typeof body.customer_email === "string") {
        bodyEmail = body.customer_email.trim().toLowerCase();
        logStep("Email-first flow", { email: bodyEmail });
      }
      if (body?.affiliate_code && typeof body.affiliate_code === "string") {
        bodyAffiliateCode = body.affiliate_code.trim();
      }
      if (body?.ref_source && typeof body.ref_source === "string") {
        bodyRefSource = body.ref_source.trim();
      }
      if (body?.return_to && typeof body.return_to === "string") {
        bodyReturnTo = body.return_to.trim();
      }
      if (bodyAffiliateCode) logStep("Affiliate code from body", { code: bodyAffiliateCode });
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Check if there's an authenticated user (existing user re-subscribing)
    const authHeader = req.headers.get("Authorization");
    let user: { id: string; email: string } | null = null;

    if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer undefined") {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data } = await supabaseClient.auth.getUser(token);
        if (data.user?.email) {
          user = { id: data.user.id, email: data.user.email };
          logStep("Authenticated user", { userId: user.id, email: user.email });
        }
      } catch {
        logStep("Auth header present but invalid, proceeding as anonymous");
      }
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

    // If authenticated user, check for existing active subscription
    if (user) {
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
    }

    // Check for existing Stripe customer
    let customerId: string | undefined;
    if (user) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });
      }
    }

    // Check if user has already used a trial
    let trialUsed = false;
    if (user) {
      const { data: trialRow } = await supabaseClient
        .from('user_trials')
        .select('trial_used')
        .eq('user_id', user.id)
        .single();
      trialUsed = trialRow?.trial_used === true;
    }

    // Get tracking metadata if authenticated
    const trackingMetadata: Record<string, string> = {};
    if (user) {
      const { data: trialData } = await supabaseClient
        .from('user_trials')
        .select('affiliate_code, ref_source')
        .eq('user_id', user.id)
        .single();
      if (trialData?.affiliate_code) trackingMetadata.affiliate_code = trialData.affiliate_code;
      if (trialData?.ref_source) trackingMetadata.ref_source = trialData.ref_source;
    }

    // Build checkout session config
    const sessionConfig: Record<string, unknown> = {
      line_items: [{ price: "price_1SxN38Gi4ps7kJ7R8UE1kYGS", quantity: 1 }],
      mode: "subscription",
      payment_method_types: ['card'],
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel`,
    };

    if (customerId) {
      sessionConfig.customer = customerId;
    } else if (user) {
      sessionConfig.customer_email = user.email;
    } else if (bodyEmail) {
      sessionConfig.customer_email = bodyEmail;
    }
    // For anonymous users without bodyEmail, Stripe collects email automatically

    if (user) {
      sessionConfig.client_reference_id = user.id;
    }

    // Add affiliate/ref from body (anonymous flow) if not already set from user data
    if (bodyAffiliateCode && !trackingMetadata.affiliate_code) {
      trackingMetadata.affiliate_code = bodyAffiliateCode;
    }
    if (bodyRefSource && !trackingMetadata.ref_source) {
      trackingMetadata.ref_source = bodyRefSource;
    }

    if (Object.keys(trackingMetadata).length > 0) {
      sessionConfig.metadata = trackingMetadata;
    }

    // Offer 5-day trial for new users (anonymous always get trial)
    if (!trialUsed) {
      logStep("Creating checkout with 5-day free trial");
      sessionConfig.subscription_data = {
        trial_period_days: 5,
        ...(Object.keys(trackingMetadata).length > 0 ? { metadata: trackingMetadata } : {}),
      };
    } else {
      logStep("Creating checkout without trial (trial already used)");
    }

    logStep("Creating checkout session", { hasCustomer: !!customerId, hasUser: !!user, trialUsed });
    const session = await stripe.checkout.sessions.create(sessionConfig as Stripe.Checkout.SessionCreateParams);

    logStep("Checkout session created", { sessionId: session.id });

    // Record checkout attempt for funnel tracking (captures every email that starts checkout)
    const attemptEmail = user?.email || bodyEmail;
    if (attemptEmail) {
      await supabaseClient
        .from('checkout_attempts')
        .insert({
          email: attemptEmail,
          user_id: user?.id || null,
          converted: false,
        });
      logStep("Checkout attempt recorded", { email: attemptEmail });
    }

    // Record checkout start for lifecycle email tracking
    if (user) {
      await supabaseClient
        .from('user_trials')
        .update({ checkout_started_at: new Date().toISOString() })
        .eq('user_id', user.id);
      logStep("Set checkout_started_at", { userId: user.id });
    }

    // Fire-and-forget: notify owner via email
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const checkoutEmail = user?.email || bodyEmail || "Unknown";
      const userType = user ? "Existing user" : "New visitor";
      const trialInfo = trialUsed ? "Trial already used" : "Eligible for trial";
      const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });

      await resend.emails.send({
        from: "LeadFinder Pro <noreply@lead-finder-app.com>",
        to: ["beyondwebcraft@outlook.com"],
        subject: "[LeadFinder] 🔔 New Checkout Started",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #f59e0b, #ef4444); padding: 16px 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: white; margin: 0;">🔔 Checkout Started</h2>
            </div>
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px;"><strong>Email:</strong> ${checkoutEmail}</p>
              <p style="margin: 0 0 8px;"><strong>Type:</strong> ${userType}</p>
              <p style="margin: 0 0 8px;"><strong>Trial:</strong> ${trialInfo}</p>
              <p style="margin: 0; color: #64748b; font-size: 13px;">${now}</p>
            </div>
          </div>
        `,
      });
      logStep("Owner notification email sent", { email: checkoutEmail });
    } catch (notifyErr) {
      logStep("Owner notification email failed (non-blocking)", {
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

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
