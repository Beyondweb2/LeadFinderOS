import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limit: 20 requests per minute for admin operations
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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Check if user is admin
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

    logStep("Admin access confirmed");

    // Apply rate limiting for admin operations
    const rateLimitResult = checkRateLimit(`admin:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rateLimitResult.allowed) {
      logStep("Rate limit exceeded", { userId });
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
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

    const { action, ...params } = await req.json();

    switch (action) {
      case 'list': {
        // Get all affiliates with their stats
        const { data: affiliates, error } = await supabaseAdmin
          .from('affiliates')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Get conversion stats for each affiliate
        const affiliateStats = await Promise.all(
          (affiliates || []).map(async (affiliate) => {
            const { data: conversions } = await supabaseAdmin
              .from('affiliate_conversions')
              .select('commission_amount, status')
              .eq('affiliate_id', affiliate.id);

            const totalConversions = conversions?.length || 0;
            const pendingCommission = conversions
              ?.filter(c => c.status === 'pending')
              .reduce((sum, c) => sum + c.commission_amount, 0) || 0;
            const paidCommission = conversions
              ?.filter(c => c.status === 'paid')
              .reduce((sum, c) => sum + c.commission_amount, 0) || 0;

            return {
              ...affiliate,
              total_conversions: totalConversions,
              pending_commission: pendingCommission,
              paid_commission: paidCommission,
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
        if (!code || !name || !email) {
          throw new Error("code, name, and email are required");
        }

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
        logStep("Affiliate created", { id: data.id, code: data.code });

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
        logStep("Affiliate updated", { id });

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

        if (affiliate_id) {
          query = query.eq('affiliate_id', affiliate_id);
        }

        const { data: conversions, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ conversions }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'mark_paid': {
        const { conversion_ids } = params;
        if (!conversion_ids || !Array.isArray(conversion_ids)) {
          throw new Error("conversion_ids array is required");
        }

        const { error } = await supabaseAdmin
          .from('affiliate_conversions')
          .update({ status: 'paid' })
          .in('id', conversion_ids)
          .eq('status', 'pending');

        if (error) throw error;
        logStep("Conversions marked as paid", { count: conversion_ids.length });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'delete': {
        const { id } = params;
        if (!id) throw new Error("id is required");

        // Only delete the affiliate, keep conversions for record-keeping
        const { error } = await supabaseAdmin
          .from('affiliates')
          .delete()
          .eq('id', id);

        if (error) throw error;
        logStep("Affiliate deleted", { id });

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    // Log detailed error server-side only
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Return generic error to client - don't expose internal details
    return new Response(JSON.stringify({ error: "Unable to process request. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
