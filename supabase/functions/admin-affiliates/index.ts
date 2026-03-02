import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-AFFILIATES] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { action, ...params } = await req.json();

    // record_click is public (no auth needed)
    if (action === 'record_click') {
      const { code } = params;
      if (!code || typeof code !== 'string') {
        return new Response(JSON.stringify({ error: "Invalid code" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const rl = checkRateLimit(`click:${code}`, 30, RATE_WINDOW_MS);
      if (!rl.allowed) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      const { data: aff } = await supabaseAdmin
        .from('affiliates')
        .select('click_count')
        .eq('code', code.toLowerCase().trim())
        .eq('is_active', true)
        .single();

      if (aff) {
        await supabaseAdmin
          .from('affiliates')
          .update({ click_count: (aff.click_count || 0) + 1 })
          .eq('code', code.toLowerCase().trim());
      }

      logStep("Click recorded", { code });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // All other actions require admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized - Admin access required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const rateLimitResult = checkRateLimit(`admin:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json", ...rateLimitHeaders(rateLimitResult, RATE_LIMIT) },
          status: 429,
        }
      );
    }

    switch (action) {
      case 'list': {
        const { data: affiliates, error } = await supabaseAdmin
          .from('affiliates')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const affiliateStats = await Promise.all(
          (affiliates || []).map(async (affiliate) => {
            const [conversionsResult, trialsResult] = await Promise.all([
              supabaseAdmin
                .from('affiliate_conversions')
                .select('commission_amount, status, first_payment_amount')
                .eq('affiliate_id', affiliate.id),
              supabaseAdmin
                .from('user_trials')
                .select('id, plan_status, trial_end_date')
                .eq('affiliate_code', affiliate.code),
            ]);

            const conversions = conversionsResult.data || [];
            const trials = trialsResult.data || [];

            // Paid conversions = actual payments after trial (from affiliate_conversions)
            const totalConversions = conversions.length;
            const pendingCommission = conversions
              .filter(c => c.status === 'pending')
              .reduce((sum, c) => sum + c.commission_amount, 0);
            const paidCommission = conversions
              .filter(c => c.status === 'paid')
              .reduce((sum, c) => sum + c.commission_amount, 0);
            // Revenue only from paid invoices (affiliate_conversions)
            const totalRevenue = conversions
              .reduce((sum, c) => sum + c.first_payment_amount, 0);

            // Trial metrics
            const trialSignups = trials.length; // all who started a trial via this code
            const now = new Date();
            const trialing = trials.filter(t => {
              // Currently in trial: plan_status is 'trial' and trial hasn't ended
              return t.plan_status === 'trial' && new Date(t.trial_end_date) > now;
            }).length;

            const clickCount = affiliate.click_count || 0;
            const clickToTrial = clickCount > 0 ? ((trialSignups / clickCount) * 100).toFixed(1) : '0.0';
            const trialToPaid = trialSignups > 0 ? ((totalConversions / trialSignups) * 100).toFixed(1) : '0.0';

            return {
              ...affiliate,
              total_conversions: totalConversions,
              pending_commission: pendingCommission,
              paid_commission: paidCommission,
              trial_signups: trialSignups,
              trialing,
              total_revenue: totalRevenue,
              paid_subscriptions: totalConversions,
              click_to_trial: clickToTrial,
              trial_to_paid: trialToPaid,
            };
          })
        );

        return new Response(JSON.stringify({ affiliates: affiliateStats }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'create': {
        const { code, name, email, commission_rate } = params;
        if (!code || !name || !email) throw new Error("code, name, and email are required");

        const { data, error } = await supabaseAdmin
          .from('affiliates')
          .insert({
            code: code.toLowerCase().trim(),
            name,
            email,
            commission_rate: commission_rate || 0.30,
          })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ affiliate: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'update': {
        const { id, ...updates } = params;
        if (!id) throw new Error("id is required");

        const { data, error } = await supabaseAdmin
          .from('affiliates')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ affiliate: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'list_conversions': {
        const { affiliate_id } = params;
        let query = supabaseAdmin
          .from('affiliate_conversions')
          .select('*')
          .order('created_at', { ascending: false });

        if (affiliate_id) query = query.eq('affiliate_id', affiliate_id);

        const { data: conversions, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ conversions }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'mark_paid': {
        const { conversion_ids } = params;
        if (!conversion_ids || !Array.isArray(conversion_ids)) throw new Error("conversion_ids array is required");

        const { error } = await supabaseAdmin
          .from('affiliate_conversions')
          .update({ status: 'paid' })
          .in('id', conversion_ids)
          .eq('status', 'pending');

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'delete': {
        const { id } = params;
        if (!id) throw new Error("id is required");

        const { error } = await supabaseAdmin
          .from('affiliates')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to process request. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
