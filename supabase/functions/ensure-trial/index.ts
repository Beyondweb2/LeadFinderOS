import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ENSURE-TRIAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Parse optional body
    let affiliateCode: string | null = null;
    let refSource: string | null = null;
    let action: string | null = null;
    let language: string | null = null;
    const utmFields: Record<string, string | null> = {};
    try {
      const body = await req.json();
      affiliateCode = body?.affiliate_code || null;
      refSource = body?.ref_source || null;
      action = body?.action || null;
      language = body?.language || null;
      // Capture UTM/attribution fields
      const cleanUtm = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
      for (const key of ['utm_source', 'utm_campaign', 'utm_adset', 'utm_ad', 'fbclid', 'traffic_source']) {
        utmFields[key] = cleanUtm(body?.[key]);
      }
    } catch {
      // No body or invalid JSON - that's fine
    }

    // Handle mark_walkthrough_prompt_seen action
    if (action === 'mark_walkthrough_prompt_seen') {
      const { error: updateErr } = await supabaseClient
        .from('user_trials')
        .update({ has_seen_walkthrough_prompt: true })
        .eq('user_id', user.id);
      if (updateErr) {
        logStep("Error marking walkthrough prompt seen", { error: updateErr.message });
        throw new Error(`Failed to update: ${updateErr.message}`);
      }
      logStep("Walkthrough prompt marked as seen", { userId: user.id });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle reset_walkthrough_prompt action (admin simulate new user)
    if (action === 'reset_walkthrough_prompt') {
      const { error: updateErr } = await supabaseClient
        .from('user_trials')
        .update({ has_seen_walkthrough_prompt: false })
        .eq('user_id', user.id);
      if (updateErr) {
        logStep("Error resetting walkthrough prompt", { error: updateErr.message });
        throw new Error(`Failed to update: ${updateErr.message}`);
      }
      logStep("Walkthrough prompt reset", { userId: user.id });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle set_language action
    if (action === 'set_language' && language) {
      const allowedLangs = ['en', 'hi', 'ur'];
      if (!allowedLangs.includes(language)) {
        throw new Error(`Invalid language: ${language}`);
      }
      const { error: updateErr } = await supabaseClient
        .from('user_trials')
        .update({ preferred_language: language })
        .eq('user_id', user.id);
      if (updateErr) {
        logStep("Error setting language", { error: updateErr.message });
        throw new Error(`Failed to update language: ${updateErr.message}`);
      }
      logStep("Language set", { userId: user.id, language });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle mark_setup_completed action
    if (action === 'mark_setup_completed') {
      const { data: existingTrial, error: trialCheckErr } = await supabaseClient
        .from('user_trials')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (trialCheckErr) {
        logStep("Error checking user_trials before setup completion", { error: trialCheckErr.message });
        throw new Error(`Failed to check setup state: ${trialCheckErr.message}`);
      }

      if (!existingTrial) {
        const now = new Date();
        const trialEndDate = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        const { error: insertErr } = await supabaseClient
          .from('user_trials')
          .insert({
            user_id: user.id,
            trial_started_at: now.toISOString(),
            trial_days: 1,
            searches_used: 0,
            plan_status: 'trial',
            trial_end_date: trialEndDate.toISOString(),
            searches_today: 0,
            last_search_date: now.toISOString().split('T')[0],
            setup_completed: true,
          });

        if (insertErr) {
          logStep("Error creating user_trials while marking setup completed", { error: insertErr.message });
          throw new Error(`Failed to create setup state: ${insertErr.message}`);
        }
      } else {
        const { error: updateErr } = await supabaseClient
          .from('user_trials')
          .update({ setup_completed: true })
          .eq('user_id', user.id);

        if (updateErr) {
          logStep("Error updating setup_completed", { error: updateErr.message });
          throw new Error(`Failed to mark setup complete: ${updateErr.message}`);
        }
      }

      logStep("Setup marked complete", { userId: user.id });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Tracking params", { affiliateCode, refSource });

    // Check if trial record exists
    const { data: existingTrial, error: checkError } = await supabaseClient
      .from('user_trials')
      .select('id, plan_status, trial_end_date')
      .eq('user_id', user.id)
      .maybeSingle();

    if (checkError) {
      logStep("Error checking trial", { error: checkError.message });
      throw new Error(`Failed to check trial: ${checkError.message}`);
    }

    if (existingTrial) {
      logStep("Trial record already exists", { trialId: existingTrial.id, status: existingTrial.plan_status });
      return new Response(JSON.stringify({ 
        created: false, 
        trial: existingTrial 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Create trial record for user
    const trialDays = 1;
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      trial_started_at: now.toISOString(),
      trial_days: trialDays,
      searches_used: 0,
      plan_status: 'trial',
      trial_end_date: trialEndDate.toISOString(),
      searches_today: 0,
      last_search_date: now.toISOString().split('T')[0],
    };

    if (affiliateCode) {
      insertPayload.affiliate_code = affiliateCode;
    }
    if (refSource) {
      insertPayload.ref_source = refSource;
    }

    const { data: newTrial, error: insertError } = await supabaseClient
      .from('user_trials')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      logStep("Error creating trial", { error: insertError.message });
      throw new Error(`Failed to create trial: ${insertError.message}`);
    }

    logStep("Trial record created successfully", { trialId: newTrial.id });

    // Log funnel event: demo_started (fire-and-forget, never blocks)
    supabaseClient
      .from('funnel_events')
      .insert({ user_id: user.id, event_type: 'demo_started' })
      .then(({ error }) => {
        if (error) console.log('[FUNNEL] demo_started insert failed', error.message);
        else console.log('[FUNNEL] demo_started logged', { userId: user.id });
      });

    return new Response(JSON.stringify({ 
      created: true, 
      trial: newTrial 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to set up your account. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
